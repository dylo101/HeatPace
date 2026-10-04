import express from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { HttpError } from "./errors.js";
import { exchangeToken, getAccessToken, listActivities, createWeatherService, enrichRuns } from "./integrations.js";

const WEEK = 7 * 86400000;
const COOKIE = "hp_session";
const random = () => randomBytes(32).toString("hex");
function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createApp({ config = {}, fetchImpl = fetch, now = Date.now } = {}) {
  const settings = { origin: "http://localhost:3001", production: false, ...config };
  const origin = new URL(settings.origin).origin;
  if (settings.production && !origin.startsWith("https://")) throw new Error("APP_ORIGIN must use HTTPS in production.");
  const sessions = new Map(), limits = new Map();
  const configured = Boolean(settings.clientId && settings.clientSecret);
  const weatherForRun = createWeatherService(fetchImpl, now);
  const app = express();
  app.disable("x-powered-by");
  if (settings.production) app.set("trust proxy", 1);
  app.use((req, res, next) => {
    res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" });
    if (settings.production) res.set("Strict-Transport-Security", "max-age=31536000");
    next();
  });
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    for (const [id, session] of sessions) if (session.expires <= now()) sessions.delete(id);
    for (const [ip, entry] of limits) if (entry.until <= now()) limits.delete(ip);
    const ip = req.ip;
    const entry = limits.get(ip) || { count: 0, until: now() + 60000 };
    if (limits.size >= 5000 && !limits.has(ip)) return next(new HttpError(503, "The app is busy. Try again shortly."));
    limits.set(ip, entry);
    if (++entry.count > 60) { res.set("Retry-After", "60"); return next(new HttpError(429, "Too many requests. Try again in a minute.")); }
    const cookie = req.headers.cookie?.split(";").map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`));
    req.sessionId = cookie?.slice(COOKIE.length + 1);
    req.session = sessions.get(req.sessionId);
    next();
  });
  app.use(express.json({ limit: "4kb" }));
  const cookieOptions = { httpOnly: true, secure: settings.production, sameSite: "lax", path: "/", maxAge: WEEK };
  function setSession(res, session) {
    if (sessions.size >= 1000) throw new HttpError(503, "The app is busy. Try connecting again later.");
    const id = random();
    sessions.set(id, session);
    res.cookie(COOKIE, id, cookieOptions);
  }
  function requireSession(req, res, next) {
    if (!req.session?.tokens) return next(new HttpError(401, "Connect Strava to load your run history."));
    next();
  }
  function sameOrigin(req, res, next) {
    if (req.get("origin") !== origin) return next(new HttpError(403, "This request must come from HeatPace."));
    next();
  }

  app.get("/api/health", (req, res) => res.json({ status: "ok" }));
  app.get("/api/session", (req, res) => res.json({ configured, connected: Boolean(req.session?.tokens) }));
  app.get("/api/auth", (req, res) => {
    if (!configured) throw new HttpError(503, "Strava is not configured on this installation. You can still try the demo.");
    if (req.sessionId) sessions.delete(req.sessionId);
    const state = random();
    setSession(res, { state, expires: now() + 10 * 60000 });
    const url = new URL("https://www.strava.com/oauth/authorize");
    url.search = new URLSearchParams({ client_id: settings.clientId, response_type: "code", redirect_uri: `${origin}/api/auth/callback`, scope: "activity:read", state });
    res.redirect(url.toString());
  });
  app.get("/api/auth/callback", async (req, res) => {
    if (!req.session || !same(req.query.state, req.session.state)) throw new HttpError(400, "The connection request expired or could not be verified. Start again from HeatPace.");
    req.session.state = null;
    const fail = reason => {
      sessions.delete(req.sessionId);
      res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined });
      res.redirect(`${origin}/?connection=${reason}`);
    };
    if (req.query.error) return fail("denied");
    if (typeof req.query.code !== "string" || !req.query.code) return fail("failed");
    const scopes = String(req.query.scope || "").split(",");
    if (!scopes.includes("activity:read") && !scopes.includes("activity:read_all")) return fail("scope");
    try {
      const tokens = await exchangeToken(fetchImpl, settings, { code: req.query.code, grant_type: "authorization_code" });
      sessions.delete(req.sessionId);
      setSession(res, { tokens, expires: now() + WEEK, cache: null });
      res.redirect(`${origin}/?connection=success`);
    } catch { fail("failed"); }
  });
  app.get("/api/activities", requireSession, async (req, res) => {
    const session = req.session;
    if (session.cache && session.cache.expires > now()) return res.json(session.cache.data);
    if (!session.loading) {
      session.loading = (async () => {
        const token = await getAccessToken(session, fetchImpl, settings, now);
        const listed = await listActivities(fetchImpl, token, now);
        const enriched = await enrichRuns(listed.activities, weatherForRun);
        const data = { ...enriched, truncated: listed.truncated || enriched.truncated, syncedAt: new Date(now()).toISOString() };
        session.cache = { data, expires: now() + 15 * 60000 };
        return data;
      })().finally(() => { session.loading = null; });
    }
    try { res.json(await session.loading); }
    catch (error) {
      if (error.status === 401) { sessions.delete(req.sessionId); res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined }); }
      throw error;
    }
  });
  app.post("/api/disconnect", sameOrigin, (req, res) => {
    // End the local connection. Revocation at Strava is a separate athlete action.
    sessions.delete(req.sessionId);
    res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined });
    res.json({ connected: false });
  });
  app.use("/api", (req, res) => res.status(404).json({ error: "This API route does not exist." }));
  app.use(express.static(fileURLToPath(new URL("../frontend", import.meta.url)), { etag: true, maxAge: 0 }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof HttpError ? error.status : error.type === "entity.parse.failed" ? 400 : error.type === "entity.too.large" ? 413 : 500;
    res.status(status).json({ error: error instanceof HttpError ? error.message : status === 400 ? "The request could not be read." : status === 413 ? "The request is too large." : "Something went wrong. Please try again." });
  });
  return app;
}
