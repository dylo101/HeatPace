import test from "node:test";
import assert from "node:assert/strict";
import { normalizeActivity, createWeatherService, enrichRuns, listActivities, getAccessToken, requestJSON } from "../backend/integrations.js";

const now = () => Date.parse("2026-10-04T12:00:00Z");
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const activity = overrides => ({ id: 12, type: "Run", name: "A run", distance: 5000, moving_time: 1500, elapsed_time: 1550,
  start_date: "2026-08-04T14:37:00Z", start_latlng: [0, 0], total_elevation_gain: 30, average_heartrate: 145, ...overrides });

test("Strava conversion uses miles and accepts zero latitude and longitude", () => {
  const run = normalizeActivity(activity());
  assert.ok(Math.abs(run.pace - 482.8032) < 1e-8);
  assert.deepEqual(run.coordinates, [0, 0]);
  for (const patch of [{ type: "Ride" }, { sport_type: "TrailRun" }, { distance: 0 }, { moving_time: 0 }, { distance: Infinity }, { start_date: "bad" }]) assert.equal(normalizeActivity(activity(patch)), null);
});
test("historical weather matches the run's UTC date and start hour", async () => {
  let called;
  const weather = createWeatherService(async url => {
    called = new URL(url);
    return json({ hourly: { time: ["2026-08-04T13:00", "2026-08-04T14:00"], temperature_2m: [65, 81], relative_humidity_2m: [50, 60] } });
  }, now);
  const result = await weather(normalizeActivity(activity()));
  assert.equal(called.hostname, "archive-api.open-meteo.com");
  assert.equal(called.searchParams.get("models"), "era5");
  assert.equal(called.searchParams.get("start_date"), "2026-08-04");
  assert.equal(called.searchParams.get("timezone"), "GMT");
  assert.equal(result.temp, 81);
  assert.equal(result.humidity, 60);
  assert.equal(result.weatherSource, "reanalysis");
});
test("recent days use the forecast API's historical time range", async () => {
  const weather = createWeatherService(async url => {
    assert.equal(new URL(url).hostname, "api.open-meteo.com");
    assert.equal(new URL(url).searchParams.get("start_date"), "2026-10-03");
    return json({ hourly: { time: ["2026-10-03T14:00"], temperature_2m: [70], relative_humidity_2m: [50] } });
  }, now);
  assert.equal((await weather(normalizeActivity(activity({ start_date: "2026-10-03T14:37:00Z" })))).weatherSource, "recent-model");
});
test("weather cache coalesces requests by approximate location and date", async () => {
  let calls = 0;
  const weather = createWeatherService(async () => { calls++; return json({ hourly: { time: ["2026-08-04T14:00"], temperature_2m: [0], relative_humidity_2m: [0] } }); }, now);
  const run = normalizeActivity(activity());
  const results = await Promise.all([weather(run), weather(run), weather(run)]);
  assert.equal(calls, 1);
  assert.equal(results[0].temp, 0);
  assert.equal(results[0].humidity, 0);
});
test("different historical dates require different weather requests", async () => {
  const dates = [];
  const weather = createWeatherService(async url => {
    const date = new URL(url).searchParams.get("start_date"); dates.push(date);
    return json({ hourly: { time: [`${date}T14:00`], temperature_2m: [70], relative_humidity_2m: [50] } });
  }, now);
  await weather(normalizeActivity(activity()));
  await weather(normalizeActivity(activity({ start_date: "2026-04-04T14:37:00Z" })));
  assert.deepEqual(dates, ["2026-08-04", "2026-04-04"]);
});
test("missing weather remains missing; indoor and missing-location runs bypass providers", async () => {
  const weather = createWeatherService(async () => { throw new Error("must not be called"); }, now);
  assert.equal((await weather(normalizeActivity(activity({ trainer: true })))).weatherStatus, "indoor");
  assert.equal((await weather(normalizeActivity(activity({ start_latlng: [] })))).weatherStatus, "no-location");
  const result = await enrichRuns([activity()], async () => { throw new Error("offline"); });
  assert.equal(result.runs[0].temp, null);
  assert.equal(result.runs[0].weatherStatus, "unavailable");
  assert.equal("coordinates" in result.runs[0], false);
});
test("null hourly values are rejected rather than converted to zero", async () => {
  const weather = createWeatherService(async () => json({ hourly: { time: ["2026-08-04T14:00"], temperature_2m: [null] } }), now);
  await assert.rejects(weather(normalizeActivity(activity())), /not available/);
});
test("weather enrichment caps the run count and simultaneous provider calls", async () => {
  let active = 0, maximum = 0;
  const result = await enrichRuns(Array.from({ length: 70 }, (_, i) => activity({ id: i })), async () => {
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setImmediate(resolve)); active--;
    return { temp: 80, humidity: 60, weatherSource: "reanalysis", weatherStatus: "available" };
  });
  assert.equal(result.runs.length, 60); assert.equal(result.truncated, true); assert.equal(maximum, 3);
  assert.ok(result.runs.every(r => !("coordinates" in r)));
});
test("Strava history is paginated and authorization never appears in its URL", async () => {
  const pages = [];
  const result = await listActivities(async (url, options) => {
    const query = new URL(url).searchParams; pages.push(query.get("page"));
    assert.equal(query.has("token"), false); assert.equal(options.headers.Authorization, "Bearer test-access");
    assert.equal(query.get("after"), String(Math.floor((now() - 180 * 86400000) / 1000)));
    return json(Array(query.get("page") === "1" ? 100 : 1).fill(activity()));
  }, "test-access", now);
  assert.deepEqual(pages, ["1", "2"]); assert.equal(result.activities.length, 101);
});
test("provider failures and malformed responses produce actionable errors", async () => {
  await assert.rejects(requestJSON(async () => json({}, 429), "https://example.test"), error => error.status === 429);
  await assert.rejects(requestJSON(async () => json({}, 401), "https://example.test"), error => error.status === 401);
  await assert.rejects(requestJSON(async () => new Response("not json"), "https://example.test"), /unreadable/);
  await assert.rejects(requestJSON(async () => { throw new Error("secret internal details"); }, "https://example.test"), /could not be reached/);
});
test("concurrent refresh uses one request and saves the rotated refresh token", async () => {
  const session = { tokens: { accessToken: "old", refreshToken: "old-refresh", expiresAt: 0 } };
  let calls = 0;
  const upstream = async (url, options) => {
    calls++; assert.equal(JSON.parse(options.body).refresh_token, "old-refresh");
    return json({ access_token: "new", refresh_token: "new-refresh", expires_at: now() / 1000 + 3600 });
  };
  const tokens = await Promise.all([getAccessToken(session, upstream, {}, now), getAccessToken(session, upstream, {}, now)]);
  assert.deepEqual(tokens, ["new", "new"]); assert.equal(calls, 1); assert.equal(session.tokens.refreshToken, "new-refresh");
  assert.equal(await getAccessToken(session, upstream, {}, now), "new"); assert.equal(calls, 1);
});
test("failed refresh releases its lock so a later attempt can succeed", async () => {
  const session = { tokens: { refreshToken: "old", expiresAt: 0 } };
  await assert.rejects(getAccessToken(session, async () => json({}, 503), {}, now));
  assert.equal(session.refreshing, null);
  assert.equal(await getAccessToken(session, async () => json({ access_token: "new", refresh_token: "new-refresh", expires_at: now()/1000 + 3600 }), {}, now), "new");
});
