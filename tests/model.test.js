import test from "node:test";
import assert from "node:assert/strict";
import { parsePace, formatPace, analyzeRuns, predictPace, isComparable, toFahrenheit, fromFahrenheit, KM_PER_MILE } from "../frontend/js/heatScore.js";
import { mockRuns } from "../frontend/js/mockRuns.js";

const plan = { pace: 480, tempF: 80, humidity: null };
const run = overrides => ({ id: Math.random().toString(), temp: 60, pace: 480, distance: 8000, trainer: false,
  workoutType: 0, elevation: 40, movingTime: 2400, elapsedTime: 2450, heartRate: 145, ...overrides });
const cohort = () => Array.from({ length: 18 }, (_, i) => run({ temp: 50 + i * 2.5, pace: 460 + i * 5 }));

test("pace parsing rejects partial, negative, and malformed values", () => {
  assert.equal(parsePace(" 8:09 "), 489);
  for (const invalid of ["8:99", "8.5", "8hello", "-2:00", "8:1", "8:00:00", "", "Infinity"]) assert.throws(() => parsePace(invalid));
});
test("formatting carries rounded seconds into the next minute", () => {
  assert.equal(formatPace(479.6), "8:00");
  assert.equal(formatPace(3599.8), "60:00");
  assert.equal(formatPace(NaN), "—");
});
test("baseline scales with pace and is continuous at the reference temperature", () => {
  assert.equal(predictPace(plan).pace, 510);
  assert.equal(predictPace({ ...plan, pace: 600 }).adjustment, 37.5);
  assert.equal(predictPace({ ...plan, tempF: 55 }).adjustment, 0);
  assert.equal(predictPace({ ...plan, tempF: 30 }).adjustment, 0);
  assert.ok(predictPace({ ...plan, tempF: 55.01 }).adjustment < 0.02);
});
test("humidity affects condition context but does not invent a pace correction", () => {
  const dry = predictPace({ ...plan, tempF: 87, humidity: 20 });
  const humid = predictPace({ ...plan, tempF: 87, humidity: 100 });
  assert.equal(dry.pace, humid.pace);
  assert.equal(humid.condition.level, "high");
  assert.equal(predictPace({ ...plan, tempF: 0 }).condition.level, "cool");
});
test("invalid plans are rejected instead of returning non-finite or negative estimates", () => {
  for (const patch of [{ pace: -1 }, { pace: Infinity }, { tempF: NaN }, { tempF: 121 }, { humidity: 101 }, { humidity: -1 }]) assert.throws(() => predictPace({ ...plan, ...patch }));
});
test("equivalent Celsius and kilometer inputs produce equivalent results", () => {
  assert.ok(Math.abs(toFahrenheit(fromFahrenheit(80, "c"), "c") - 80) < 1e-10);
  const kmPace = 480 / KM_PER_MILE;
  assert.ok(Math.abs(predictPace({ ...plan, pace: kmPace * KM_PER_MILE }).pace - 510) < 1e-8);
});
test("comparison rules exclude workouts, indoor runs, hills, missing heart rate and pauses", () => {
  assert.ok(isComparable(run()));
  for (const patch of [{ workoutType: 1 }, { workoutType: 3 }, { trainer: true }, { temp: null }, { heartRate: null }, { distance: 2000 }, { distance: 17000 }, { elevation: 200 }, { elevation: undefined }, { elapsedTime: 4000 }, { movingTime: 0 }]) assert.ok(!isComparable(run(patch)), JSON.stringify(patch));
});
test("trend uses actual temperatures and gives a known regression slope", () => {
  const analysis = analyzeRuns(cohort());
  assert.ok(analysis.available);
  assert.ok(Math.abs(analysis.slope - 2) < 1e-10);
  assert.ok(Math.abs(analysis.r2 - 1) < 1e-10);
});
test("insufficient samples and missing hot/cool coverage prevent personalization", () => {
  assert.equal(analyzeRuns(cohort().slice(0, 11)).available, false);
  assert.equal(analyzeRuns(cohort().map(r => ({ ...r, temp: r.temp + 40 }))).available, false);
  assert.equal(analyzeRuns(cohort().map(r => ({ ...r, heartRate: null }))).available, false);
});
test("heart-rate outliers do not enter the comparison cohort", () => {
  const analysis = analyzeRuns([...cohort(), run({ heartRate: 195, temp: 95, pace: 900 })]);
  assert.equal(analysis.comparable.length, 18);
  assert.ok(Math.abs(analysis.slope - 2) < 1e-10);
});
test("negative and flat trends fall back to baseline", () => {
  for (const rows of [cohort().map(r => ({ ...r, pace: 1000 - r.pace })), cohort().map(r => ({ ...r, pace: 480 }))]) assert.equal(analyzeRuns(rows).available, false);
});
test("history affects pace only after opt-in and with adequate data", () => {
  const analysis = analyzeRuns(mockRuns);
  assert.ok(analysis.available);
  assert.equal(predictPace({ ...plan, analysis }).pace, 510);
  assert.ok(predictPace({ ...plan, analysis, usePersonal: true }).pace > 510);
  assert.equal(predictPace({ ...plan, analysis: analyzeRuns([]), usePersonal: true }).pace, 510);
});
test("extreme observed trends are bounded and the overall adjustment is capped", () => {
  const analysis = { available: true, percentPerF: 100, comparable: Array(100).fill({}) };
  const result = predictPace({ ...plan, tempF: 120, analysis, usePersonal: true });
  assert.equal(result.coefficient, 0.425);
  assert.equal(result.percent, 20);
  assert.equal(result.pace, 576);
  assert.ok(result.low <= result.pace && result.high >= result.pace);
});
