import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../backend/app.js";

const now = () => Date.parse("2026-10-04T12:00:00Z");
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const config = { origin: "http://localhost:3001", clientId: "test-id", clientSecret: "test-secret" };
async function serverFor(t, options = {}) {
  const app = createApp({ config, now, fetchImpl: async () => { throw new Error("unexpected provider call"); }, ...options });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return (path, options = {}) => fetch(base + path, { redirect: "manual", ...options });
}
const cookie = response => response.headers.get("set-cookie")?.split(";")[0];
async function login(request) {
  const auth = await request("/api/auth");
  const state = new URL(auth.headers.get("location")).searchParams.get("state");
  const initialCookie = cookie(auth);
  const callback = await request(`/api/auth/callback?state=${state}&code=test-code&scope=activity:read`, { headers: { Cookie: initialCookie } });
  assert.equal(callback.status, 302);
  return { sessionCookie: cookie(callback), initialCookie, state, callback };
}
const tokens = () => json({ access_token: "private-access", refresh_token: "private-refresh", expires_at: now()/1000 + 3600 });

test("calculator assets work without credentials, and the API reports configuration", async t => {
  const request = await serverFor(t, { config: { origin: config.origin } });
  const page = await request("/");
  assert.equal(page.status, 200); assert.match(await page.text(), /Same effort/);
  assert.match(page.headers.get("content-security-policy"), /script-src 'self'/);
  assert.equal((await request("/js/app.js")).status, 200);
  const response = await request("/api/session");
  assert.deepEqual(await response.json(), { configured: false, connected: false });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await request("/api/auth")).status, 503);
});
test("bearer tokens in URLs do not authorize access", async t => {
  const request = await serverFor(t);
  assert.equal((await request("/api/activities?token=legacy-token")).status, 401);
});
test("authorization sets an HTTP-only same-site cookie and an unpredictable state", async t => {
  const request = await serverFor(t);
  const response = await request("/api/auth");
  const url = new URL(response.headers.get("location"));
  assert.equal(url.origin, "https://www.strava.com");
  assert.equal(url.searchParams.get("redirect_uri"), `${config.origin}/api/auth/callback`);
  assert.equal(url.searchParams.get("scope"), "activity:read");
  assert.match(url.searchParams.get("state"), /^[a-f0-9]{64}$/);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  assert.match(response.headers.get("set-cookie"), /SameSite=Lax/);
});
test("callback rejects absent, incorrect, and multibyte state safely", async t => {
  const request = await serverFor(t);
  assert.equal((await request("/api/auth/callback?code=test-code")).status, 400);
  const auth = await request("/api/auth");
  for (const state of ["wrong", "é".repeat(64)]) {
    assert.equal((await request(`/api/auth/callback?state=${encodeURIComponent(state)}&code=test-code`, { headers: { Cookie: cookie(auth) } })).status, 400);
  }
});
test("successful callback rotates the session and never exposes tokens", async t => {
  const request = await serverFor(t, { fetchImpl: async () => tokens() });
  const connected = await login(request);
  assert.notEqual(connected.sessionCookie, connected.initialCookie);
  assert.equal(connected.callback.headers.get("location"), `${config.origin}/?connection=success`);
  assert.doesNotMatch(connected.callback.headers.get("set-cookie"), /private-access|private-refresh/);
  const session = await request("/api/session", { headers: { Cookie: connected.sessionCookie } });
  assert.deepEqual(await session.json(), { configured: true, connected: true });
  assert.equal((await request(`/api/auth/callback?state=${connected.state}&code=test-code&scope=activity:read`, { headers: { Cookie: connected.initialCookie } })).status, 400);
});
test("denied authorization and missing scope never exchange a token", async t => {
  const request = await serverFor(t);
  for (const [query, reason] of [["error=access_denied", "denied"], ["code=test-code&scope=read", "scope"]]) {
    const auth = await request("/api/auth");
    const state = new URL(auth.headers.get("location")).searchParams.get("state");
    const response = await request(`/api/auth/callback?state=${state}&${query}`, { headers: { Cookie: cookie(auth) } });
    assert.equal(response.headers.get("location"), `${config.origin}/?connection=${reason}`);
    assert.match(response.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970/);
  }
});
test("expired authorization state cannot complete a connection", async t => {
  let time = now();
  const request = await serverFor(t, { now: () => time });
  const auth = await request("/api/auth");
  const state = new URL(auth.headers.get("location")).searchParams.get("state");
  time += 11 * 60000;
  assert.equal((await request(`/api/auth/callback?state=${state}&code=test-code`, { headers: { Cookie: cookie(auth) } })).status, 400);
});
test("activity responses cache enrichment and strip precise locations", async t => {
  let stravaCalls = 0, weatherCalls = 0;
  const request = await serverFor(t, { fetchImpl: async url => {
    const parsed = new URL(url);
    if (parsed.pathname === "/oauth/token") return tokens();
    if (parsed.hostname === "www.strava.com") {
      stravaCalls++;
      return json([{ id: 1, name: "Morning run", type: "Run", distance: 5000, moving_time: 1500, elapsed_time: 1550,
        start_date: "2026-08-04T14:37:00Z", start_latlng: [37.773, -122.431], total_elevation_gain: 30, average_heartrate: 145 }]);
    }
    weatherCalls++;
    return json({ hourly: { time: ["2026-08-04T14:00"], temperature_2m: [75], relative_humidity_2m: [60] } });
  } });
  const { sessionCookie } = await login(request);
  const options = { headers: { Cookie: sessionCookie } };
  const responses = await Promise.all([request("/api/activities", options), request("/api/activities", options)]);
  const results = await Promise.all(responses.map(r => r.json()));
  assert.deepEqual(results[0], results[1]); assert.equal(stravaCalls, 1); assert.equal(weatherCalls, 1);
  assert.equal(results[0].runs[0].temp, 75);
  assert.equal("coordinates" in results[0].runs[0], false);
  assert.doesNotMatch(JSON.stringify(results), /private-access|private-refresh|122\.431/);
  assert.equal((await request("/api/activities", options)).status, 200); assert.equal(stravaCalls, 1);
});
test("upstream authentication failure ends the session with a useful response", async t => {
  const request = await serverFor(t, { fetchImpl: async url => new URL(url).pathname === "/oauth/token" ? tokens() : json({}, 401) });
  const { sessionCookie } = await login(request);
  const response = await request("/api/activities", { headers: { Cookie: sessionCookie } });
  assert.equal(response.status, 401); assert.match((await response.json()).error, /reconnect/);
  assert.deepEqual(await (await request("/api/session", { headers: { Cookie: sessionCookie } })).json(), { configured: true, connected: false });
});
test("disconnect requires the app origin and deletes the session", async t => {
  const request = await serverFor(t, { fetchImpl: async () => tokens() });
  const { sessionCookie } = await login(request);
  const headers = { Cookie: sessionCookie };
  assert.equal((await request("/api/disconnect", { method: "POST", headers })).status, 403);
  assert.equal((await request("/api/disconnect", { method: "POST", headers: { ...headers, Origin: "https://other.test" } })).status, 403);
  assert.equal((await request("/api/disconnect", { method: "POST", headers: { ...headers, Origin: config.origin } })).status, 200);
  assert.equal((await request("/api/activities", { headers })).status, 401);
});
test("production requires HTTPS and uses secure cookies", async t => {
  assert.throws(() => createApp({ config: { production: true, origin: "http://localhost" } }), /HTTPS/);
  const request = await serverFor(t, { config: { ...config, origin: "https://heatpace.example", production: true } });
  const response = await request("/api/auth");
  assert.match(response.headers.get("set-cookie"), /Secure/);
  assert.match(response.headers.get("strict-transport-security"), /31536000/);
});
test("API request limits return a retry hint and unknown routes return JSON", async t => {
  const request = await serverFor(t);
  assert.equal((await request("/api/unknown")).status, 404);
  for (let i = 0; i < 59; i++) assert.equal((await request("/api/session")).status, 200);
  const response = await request("/api/session");
  assert.equal(response.status, 429); assert.equal(response.headers.get("retry-after"), "60");
});
