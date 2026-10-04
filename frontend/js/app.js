import { parsePace, formatPace, displayPace, toFahrenheit, fromFahrenheit, analyzeRuns, predictPace, KM_PER_MILE, METERS_PER_MILE } from "./heatScore.js";
import { mockRuns } from "./mockRuns.js";
import { renderChart } from "./chart.js";
import { api } from "./strava.js";

const $ = id => document.getElementById(id);
const state = { demo: new URLSearchParams(location.search).get("demo") === "1", connected: false, configured: false,
  liveRuns: [], runs: [], analysis: analyzeRuns([]), paceUnit: "mi", tempUnit: "f", comparableOnly: false,
  showAll: false, loading: false, failed: false, syncedAt: null, truncated: false, revision: 0 };

function notice(message) { $("notice").textContent = message; $("notice").hidden = !message; }
function plan() {
  const pace = parsePace($("pace").value) * (state.paceUnit === "km" ? KM_PER_MILE : 1);
  if (!$("temp").value.trim()) throw new Error("Enter the temperature for your run.");
  const tempF = toFahrenheit(Number($("temp").value), state.tempUnit);
  const humidity = $("humidity").value.trim() ? Number($("humidity").value) : null;
  return { pace, tempF, humidity };
}
function calculate() {
  try {
    const input = plan();
    const result = predictPace({ ...input, analysis: state.analysis, usePersonal: $("personal-toggle").checked });
    const unit = state.paceUnit, divisor = unit === "km" ? KM_PER_MILE : 1;
    $("adjusted-pace").textContent = displayPace(result.pace, unit);
    $("result-unit").textContent = unit === "km" ? "/ km" : "/ mile";
    $("result-change").textContent = `+${Math.round(result.adjustment / divisor)} sec / ${unit} · ${result.percent.toFixed(1)}% adjustment`;
    $("planned-output").textContent = `${displayPace(input.pace, unit)} / ${unit}`;
    $("range-output").textContent = `${displayPace(result.low, unit)}–${displayPace(result.high, unit)} / ${unit}`;
    $("condition-badge").textContent = result.condition.label;
    document.querySelector(".result-panel").dataset.level = result.condition.level;
    $("effort-advice").textContent = result.condition.advice;
    $("estimate-note").textContent = result.personalized ? `${state.demo ? "Sample" : "Personal"} trend + baseline · experimental planning estimate` : "Baseline planning estimate · not a race prediction";
    $("form-error").hidden = true;
    $("pace").removeAttribute("aria-invalid");
    $("temp").removeAttribute("aria-invalid");
    $("humidity").removeAttribute("aria-invalid");
    document.querySelector(".result-panel").removeAttribute("aria-label");
    return true;
  } catch (error) {
    $("form-error").textContent = error.message;
    $("form-error").hidden = false;
    $("estimate-note").textContent = "Previous estimate · correct the form to update it";
    document.querySelector(".result-panel").setAttribute("aria-label", "Previous estimate. Correct the form to update it.");
    return false;
  }
}
function updateConnection() {
  $("connect-button").textContent = state.connected ? "Disconnect Strava" : "Connect Strava ↗";
  $("demo-button").textContent = state.demo ? "Exit demo ↗" : "Try demo ↗";
  $("source-status").replaceChildren();
  const dot = document.createElement("span"); dot.className = "status-dot";
  $("source-status").append(dot, state.demo ? " Sample data" : state.loading ? " Loading Strava runs…" : state.connected ? " Strava connected" : " Baseline estimate");
}
function renderHistory() {
  state.runs = state.demo ? mockRuns : state.liveRuns;
  state.analysis = analyzeRuns(state.runs);
  const analysis = state.analysis;
  $("personal-toggle").disabled = !analysis.available;
  if (!analysis.available) $("personal-toggle").checked = false;
  $("personal-help").textContent = analysis.available ? `Blend the baseline with ${state.demo ? "sample" : "your"} run history. This is an observed association, not a validated prediction.` : state.runs.length ? analysis.reason : "Try the demo or connect Strava to explore a personal trend.";
  const weatherCount = state.runs.filter(r => Number.isFinite(r.temp)).length;
  $("weather-count").textContent = state.runs.length ? `${weatherCount} / ${state.runs.length}` : "—";
  $("comparable-count").textContent = state.runs.length ? analysis.comparable.length : "—";
  $("coverage-count").textContent = state.runs.length ? `${analysis.coolCount} / ${analysis.hotCount}` : "—";
  $("trend-title").textContent = analysis.available ? `+${(analysis.slope * 10 / (state.paceUnit === "km" ? KM_PER_MILE : 1)).toFixed(0)} sec / ${state.paceUnit} per 10°F` : state.runs.length ? "More miles, more context." : "Get to know your warm-weather miles.";
  if (state.tempUnit === "c" && analysis.available) $("trend-title").textContent = `+${(analysis.slope * 9 / (state.paceUnit === "km" ? KM_PER_MILE : 1)).toFixed(0)} sec / ${state.paceUnit} per 5°C`;
  $("trend-copy").textContent = analysis.available ? `Warmer runs had slower paces in ${analysis.comparable.length} comparable ${state.demo ? "sample " : ""}runs. ${analysis.reason}` : state.runs.length ? analysis.reason : "Bring in your run history to explore how your pace changes with temperature at similar heart rates.";
  let status = state.demo ? "Demo · 24 synthetic runs. No real athlete data." : state.loading ? "Matching runs to hourly weather. This may take a minute." : state.failed ? "Run history could not be loaded. Your calculator still works." : state.connected ? state.runs.length ? "Up to 60 runs from the last 180 days." : "No accessible runs found in the last 180 days." : "Your calculator works without a Strava account.";
  if (!state.demo && state.runs.length && weatherCount < state.runs.length) status += ` Weather missing for ${state.runs.length - weatherCount} runs; those runs are excluded from the trend.`;
  if (!state.demo && state.truncated) status += " Activity limit reached; history is a partial sample.";
  if (!state.demo && state.syncedAt && state.runs.length) status += ` Synced ${new Date(state.syncedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.`;
  $("history-status").textContent = status;
  $("history-action").hidden = state.demo || !state.connected || state.loading;
  $("history-action").textContent = state.failed ? "Retry loading runs →" : "Reload run history →";
  $("filter-all").classList.toggle("active", !state.comparableOnly);
  $("filter-comparable").classList.toggle("active", state.comparableOnly);
  $("filter-all").setAttribute("aria-pressed", !state.comparableOnly);
  $("filter-comparable").setAttribute("aria-pressed", state.comparableOnly);
  renderChart(state.runs, analysis, state);
  renderTable();
  updateConnection();
  calculate();
}
function renderTable() {
  $("runs-panel").hidden = !state.runs.length;
  $("run-summary").textContent = `${state.demo ? "Sample data" : "Strava history"} · ${state.runs.length} runs`;
  $("runs-body").replaceChildren();
  const comparableIds = new Set(state.analysis.comparable.map(r => r.id));
  const rows = state.showAll ? state.runs : state.runs.slice(0, 5);
  for (const run of rows) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    const name = document.createElement("span"); name.className = "run-name"; name.textContent = run.name;
    const date = document.createElement("span"); date.className = "run-date";
    date.textContent = new Date(run.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    nameCell.append(name, date); row.append(nameCell);
    const distance = state.paceUnit === "km" ? run.distance / 1000 : run.distance / METERS_PER_MILE;
    const values = [`${distance.toFixed(1)} ${state.paceUnit}`, `${displayPace(run.pace, state.paceUnit)} / ${state.paceUnit}`,
      Number.isFinite(run.temp) ? `${Math.round(fromFahrenheit(run.temp, state.tempUnit))}°${state.tempUnit.toUpperCase()}${run.humidity !== null ? ` · ${Math.round(run.humidity)}%` : ""}` : run.weatherStatus === "indoor" ? "Indoor" : run.weatherStatus === "no-location" ? "No location" : "Unavailable"];
    for (const value of values) { const cell = document.createElement("td"); cell.textContent = value; row.append(cell); }
    const cell = document.createElement("td"), tag = document.createElement("span");
    const eligible = comparableIds.has(run.id);
    tag.className = `run-tag${eligible ? "" : " excluded"}`; tag.textContent = eligible ? "Comparable" : "Excluded";
    tag.title = eligible ? "Meets comparison rules, including the heart-rate band." : "Does not meet all comparison rules. See methodology below.";
    cell.append(tag); row.append(cell); $("runs-body").append(row);
  }
  $("show-runs").hidden = state.runs.length <= 5;
  $("show-runs").textContent = state.showAll ? "Show fewer runs ↑" : `Show all ${state.runs.length} runs ↓`;
}
async function loadRuns() {
  const revision = ++state.revision;
  state.loading = true; state.failed = false; renderHistory();
  try {
    const data = await api("activities");
    if (revision !== state.revision) return;
    if (!Array.isArray(data.runs)) throw new Error("Run history could not be read. Try again.");
    state.liveRuns = data.runs; state.syncedAt = data.syncedAt; state.truncated = data.truncated;
    if (!state.demo) notice(data.runs.length ? "" : "No accessible runs found. Private activities aren’t requested; you can still explore the demo.");
  } catch (error) {
    if (revision !== state.revision) return;
    state.failed = true;
    if (error.status === 401) { state.connected = false; state.liveRuns = []; }
    if (!state.demo) notice(error.message);
  } finally {
    if (revision === state.revision) { state.loading = false; renderHistory(); }
  }
}
function toggleDemo() {
  state.demo = !state.demo;
  state.showAll = false;
  $("personal-toggle").checked = false;
  const url = new URL(location.href);
  if (state.demo) url.searchParams.set("demo", "1"); else url.searchParams.delete("demo");
  history.replaceState(null, "", url.pathname + url.search + url.hash);
  notice(state.demo ? "You’re exploring 24 synthetic runs. Try the observed-trend option to see how history changes the estimate." : "");
  renderHistory();
}
$("pace-form").addEventListener("submit", event => { event.preventDefault(); calculate(); });
$("personal-toggle").addEventListener("change", calculate);
$("demo-button").addEventListener("click", toggleDemo);
$("empty-demo").addEventListener("click", () => { if (!state.demo) toggleDemo(); else { state.comparableOnly = false; renderHistory(); } });
$("filter-all").addEventListener("click", () => { state.comparableOnly = false; renderHistory(); });
$("filter-comparable").addEventListener("click", () => { state.comparableOnly = true; renderHistory(); });
$("show-runs").addEventListener("click", () => { state.showAll = !state.showAll; renderTable(); });
$("history-action").addEventListener("click", loadRuns);
let chartResize;
window.addEventListener("resize", () => {
  cancelAnimationFrame(chartResize);
  chartResize = requestAnimationFrame(() => renderChart(state.runs, state.analysis, state));
});
$("pace-unit").addEventListener("change", () => {
  try {
    const seconds = parsePace($("pace").value) * (state.paceUnit === "km" ? KM_PER_MILE : 1);
    $("pace").value = displayPace(seconds, $("pace-unit").value);
  } catch { /* Preserve invalid input for the user to fix. */ }
  state.paceUnit = $("pace-unit").value; renderHistory();
});
$("temp-unit").addEventListener("change", () => {
  if ($("temp").value.trim()) {
    const fahrenheit = toFahrenheit(Number($("temp").value), state.tempUnit);
    $("temp").value = Number(fromFahrenheit(fahrenheit, $("temp-unit").value).toFixed(1));
  }
  state.tempUnit = $("temp-unit").value; renderHistory();
});
$("connect-button").addEventListener("click", async () => {
  if (!state.connected) {
    if (!state.configured) { notice("Strava is not configured on this installation. The calculator and sample-data demo are ready to use."); return; }
    location.assign("/api/auth"); return;
  }
  $("connect-button").disabled = true;
  try {
    await api("disconnect", { method: "POST" });
    state.revision++; state.connected = false; state.liveRuns = []; state.loading = false; state.failed = false;
    state.syncedAt = null; state.truncated = false; $("personal-toggle").checked = false;
    notice("Strava disconnected from HeatPace. To revoke app access entirely, use your Strava settings."); renderHistory();
  } catch (error) { notice(error.message); }
  finally { $("connect-button").disabled = false; }
});
async function init() {
  const params = new URLSearchParams(location.search);
  // Discard legacy bearer-token links immediately; v2 never consumes URL tokens.
  if (params.has("token")) { params.delete("token"); notice("This old Strava link is no longer supported. Connect again to create a secure session."); }
  const connection = params.get("connection");
  if (connection) {
    const messages = { success: "Strava connected. Loading your recent runs…", denied: "Strava connection cancelled. Your calculator still works.", scope: "Activity access wasn’t granted. Connect again and allow activity reading.", failed: "Strava couldn’t connect. Try again, or explore the demo." };
    notice(messages[connection] || ""); params.delete("connection");
  }
  history.replaceState(null, "", location.pathname + (params.size ? `?${params}` : "") + location.hash);
  renderHistory();
  try {
    const session = await api("session"); state.configured = session.configured; state.connected = session.connected;
    updateConnection(); if (state.connected) await loadRuns();
  } catch { $("history-status").textContent = "Connection service unavailable. Calculator and demo are ready to use."; }
}
init();
