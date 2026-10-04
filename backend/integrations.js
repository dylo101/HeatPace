import { HttpError } from "./errors.js";
import { METERS_PER_MILE } from "../frontend/js/heatScore.js";

export async function requestJSON(fetchImpl, url, options = {}) {
  let response;
  try { response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(12000) }); }
  catch { throw new HttpError(502, "The data provider could not be reached. Try again in a moment."); }
  if (!response.ok) {
    if (response.status === 429) throw new HttpError(429, "The data provider is busy. Please try again later.");
    if (response.status === 401) throw new HttpError(401, "Your Strava connection has expired. Please reconnect.");
    throw new HttpError(502, "The data provider could not complete this request.");
  }
  try { return await response.json(); }
  catch { throw new HttpError(502, "The data provider returned an unreadable response."); }
}

export async function exchangeToken(fetchImpl, config, fields) {
  const data = await requestJSON(fetchImpl, "https://www.strava.com/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, ...fields }),
  });
  if (!data.access_token || !data.refresh_token || !Number.isFinite(data.expires_at)) throw new HttpError(502, "Strava did not return a valid connection.");
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at };
}

export async function getAccessToken(session, fetchImpl, config, now) {
  if (session.tokens.expiresAt * 1000 > now() + 60000) return session.tokens.accessToken;
  // Rotating refresh tokens require one shared request per session.
  if (!session.refreshing) {
    session.refreshing = exchangeToken(fetchImpl, config, { grant_type: "refresh_token", refresh_token: session.tokens.refreshToken })
      .then(tokens => { session.tokens = tokens; return tokens.accessToken; })
      .finally(() => { session.refreshing = null; });
  }
  return session.refreshing;
}

export async function listActivities(fetchImpl, accessToken, now) {
  const activities = [];
  const after = Math.floor((now() - 180 * 86400000) / 1000);
  // Bound both Strava requests and weather enrichment cost.
  for (let page = 1; page <= 3; page++) {
    const url = new URL("https://www.strava.com/api/v3/athlete/activities");
    url.search = new URLSearchParams({ after, per_page: 100, page });
    const rows = await requestJSON(fetchImpl, url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!Array.isArray(rows)) throw new HttpError(502, "Strava returned an unexpected activity list.");
    activities.push(...rows);
    if (rows.length < 100) break;
  }
  return { activities, truncated: activities.length >= 300 };
}

export function normalizeActivity(activity) {
  if ((activity.sport_type || activity.type) !== "Run" || !Number.isFinite(activity.distance) || !(activity.distance > 0) || !Number.isFinite(activity.moving_time) || !(activity.moving_time > 0)) return null;
  const timestamp = Date.parse(activity.start_date);
  if (!Number.isFinite(timestamp)) return null;
  const coordinates = activity.start_latlng;
  const hasLocation = Array.isArray(coordinates) && coordinates.length >= 2 &&
    Number.isFinite(coordinates[0]) && Math.abs(coordinates[0]) <= 90 &&
    Number.isFinite(coordinates[1]) && Math.abs(coordinates[1]) <= 180;
  return {
    id: String(activity.id), name: String(activity.name || "Run").slice(0, 160),
    date: new Date(timestamp).toISOString(), distance: activity.distance,
    pace: activity.moving_time / activity.distance * METERS_PER_MILE,
    movingTime: activity.moving_time, elapsedTime: activity.elapsed_time,
    elevation: activity.total_elevation_gain, heartRate: activity.average_heartrate ?? null,
    workoutType: activity.workout_type ?? null, trainer: Boolean(activity.trainer),
    coordinates: hasLocation ? coordinates.slice(0, 2) : null,
    temp: null, humidity: null, weatherSource: null, weatherStatus: "unavailable",
  };
}

export function createWeatherService(fetchImpl, now = Date.now) {
  const cache = new Map();
  return async function weatherForRun(run) {
    if (!run.coordinates || run.trainer) return { temp: null, humidity: null, weatherSource: null, weatherStatus: run.trainer ? "indoor" : "no-location" };
    const date = run.date.slice(0, 10);
    const hour = run.date.slice(0, 13) + ":00";
    const [lat, lon] = run.coordinates;
    // ERA5 is delayed by five days; allow a seven-day buffer.
    const recent = now() - Date.parse(run.date) < 7 * 86400000;
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}:${date}:${recent}`;
    let pending = cache.get(key);
    if (!pending || pending.expires <= now()) {
      if (cache.size >= 1000) cache.delete(cache.keys().next().value);
      const url = new URL(recent ? "https://api.open-meteo.com/v1/forecast" : "https://archive-api.open-meteo.com/v1/archive");
      url.search = new URLSearchParams({ latitude: lat.toFixed(2), longitude: lon.toFixed(2), start_date: date, end_date: date,
        hourly: "temperature_2m,relative_humidity_2m", temperature_unit: "fahrenheit", timezone: "GMT" });
      if (!recent) url.searchParams.set("models", "era5");
      const promise = requestJSON(fetchImpl, url).catch(error => { cache.delete(key); throw error; });
      pending = { promise, expires: now() + (recent ? 3600000 : 86400000) };
      cache.set(key, pending);
    }
    const data = await pending.promise;
    const index = data.hourly?.time?.indexOf(hour) ?? -1;
    const temp = data.hourly?.temperature_2m?.[index];
    const humidity = data.hourly?.relative_humidity_2m?.[index];
    if (index < 0 || !Number.isFinite(temp)) throw new HttpError(502, "Weather for this run's hour is not available.");
    return { temp, humidity: Number.isFinite(humidity) ? humidity : null, weatherSource: recent ? "recent-model" : "reanalysis", weatherStatus: "available" };
  };
}

export async function enrichRuns(activities, weatherForRun) {
  const normalized = activities.map(normalizeActivity).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
  const runs = normalized.slice(0, 60);
  const deadline = Date.now() + 30000;
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, runs.length) }, async () => {
    while (cursor < runs.length) {
      const run = runs[cursor++];
      try { if (Date.now() < deadline) Object.assign(run, await weatherForRun(run)); }
      catch { run.weatherStatus = "unavailable"; }
      // Location coordinates never leave the server in the activity response.
      delete run.coordinates;
    }
  }));
  return { runs, truncated: normalized.length > 60 };
}
