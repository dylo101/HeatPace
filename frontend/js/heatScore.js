// Product heuristics, not a validated physiological or race prediction model.
export const METERS_PER_MILE = 1609.344;
export const KM_PER_MILE = 1.609344;
export const MODEL = Object.freeze({ referenceF: 55, percentPerF: 0.25, maxPercent: 20 });

export function parsePace(input) {
  const text = String(input).trim();
  if (!/^\d{1,2}:[0-5]\d$/.test(text)) throw new Error("Enter pace as minutes:seconds, such as 8:00.");
  const [minutes, seconds] = text.split(":").map(Number);
  return minutes * 60 + seconds;
}
export function formatPace(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}
export function toFahrenheit(value, unit) { return unit === "c" ? value * 9 / 5 + 32 : value; }
export function fromFahrenheit(value, unit) { return unit === "c" ? (value - 32) * 5 / 9 : value; }
export function displayPace(secondsPerMile, unit) { return formatPace(unit === "km" ? secondsPerMile / KM_PER_MILE : secondsPerMile); }
export function validatePlan({ pace, tempF, humidity }) {
  if (!Number.isFinite(pace) || pace < 120 || pace > 1800) throw new Error("Choose a pace between 2:00 and 30:00 per mile (1:15–18:38 per km).");
  if (!Number.isFinite(tempF) || tempF < -20 || tempF > 120) throw new Error("Enter a temperature between −20 and 120°F (−29 to 49°C).");
  if (humidity !== null && (!Number.isFinite(humidity) || humidity < 0 || humidity > 100)) throw new Error("Humidity should be between 0 and 100%, or left blank.");
}
export function conditions(tempF, humidity = null) {
  // Humidity affects the display category only; there is no humidity pace coefficient.
  const effective = tempF + (tempF >= 70 && humidity !== null ? Math.max(0, humidity - 50) * 0.12 : 0);
  if (effective >= 90) return { label: "High heat", level: "high", advice: "Consider a cooler time, a shorter route, or moving your run indoors. A slower pace does not make extreme heat safe." };
  if (effective >= 80) return { label: "Hot conditions", level: "hot", advice: "Start gently, choose shade, and let effort guide your pace." };
  if (effective >= 65) return { label: "Warm conditions", level: "warm", advice: "Leave room to ease off as the run warms up." };
  if (tempF < 40) return { label: "Cold conditions", level: "cool", advice: "No heat adjustment. Wind, ice, and cold can still affect your run." };
  return { label: "Mild conditions", level: "mild", advice: "Little heat adjustment. Keep your planned effort comfortable." };
}
export function isComparable(run) {
  return Number.isFinite(run.temp) && Number.isFinite(run.pace) && run.pace >= 120 && run.pace <= 1800 &&
    run.distance >= 3000 && run.distance <= 16000 && !run.trainer &&
    (run.workoutType === null || run.workoutType === undefined || run.workoutType === 0) &&
    Number.isFinite(run.elevation) && run.elevation / run.distance <= 0.015 &&
    Number.isFinite(run.movingTime) && run.movingTime > 0 &&
    Number.isFinite(run.elapsedTime) && run.elapsedTime / run.movingTime <= 1.25 &&
    Number.isFinite(run.heartRate) && run.heartRate >= 60 && run.heartRate <= 220;
}
export function analyzeRuns(runs) {
  const candidates = runs.filter(isComparable);
  const heartRates = candidates.map(r => r.heartRate).sort((a, b) => a - b);
  const medianHR = heartRates.length ? heartRates[Math.floor(heartRates.length / 2)] : 0;
  const comparable = candidates.filter(r => Math.abs(r.heartRate - medianHR) <= 10);
  const cool = comparable.filter(r => r.temp <= 60), hot = comparable.filter(r => r.temp >= 75);
  const base = { comparable, available: false, slope: null, r2: null, percentPerF: null, coolCount: cool.length, hotCount: hot.length };
  if (comparable.length < 12 || cool.length < 3 || hot.length < 3) return { ...base, reason: "A personal trend needs 12 comparable runs, including 3 cool and 3 hot runs, with heart-rate data." };
  const mean = (rows, key) => rows.reduce((sum, r) => sum + r[key], 0) / rows.length;
  const x = mean(comparable, "temp"), y = mean(comparable, "pace");
  const sxx = comparable.reduce((sum, r) => sum + (r.temp - x) ** 2, 0);
  const syy = comparable.reduce((sum, r) => sum + (r.pace - y) ** 2, 0);
  const sxy = comparable.reduce((sum, r) => sum + (r.temp - x) * (r.pace - y), 0);
  const slope = sxy / sxx, r2 = syy > 0 ? sxy ** 2 / (sxx * syy) : 0;
  if (slope <= 0 || r2 < 0.15) return { ...base, r2, reason: "These runs do not show a consistent positive pace–temperature trend. Use the baseline estimate." };
  return { ...base, available: true, slope, r2, percentPerF: slope / mean(cool, "pace") * 100,
    intercept: y - slope * x, reason: "Observed association at similar heart rates. Terrain, fatigue, training, and humidity can still affect it." };
}
export function predictPace({ pace, tempF, humidity = null, analysis = null, usePersonal = false }) {
  validatePlan({ pace, tempF, humidity });
  let coefficient = MODEL.percentPerF;
  const personalized = Boolean(usePersonal && analysis?.available);
  if (personalized) {
    const observed = Math.max(0.1, Math.min(0.6, analysis.percentPerF));
    const weight = Math.min(0.5, analysis.comparable.length / 60);
    coefficient = coefficient * (1 - weight) + observed * weight;
  }
  const percent = Math.min(MODEL.maxPercent, Math.max(0, tempF - MODEL.referenceF) * coefficient);
  const adjustment = pace * percent / 100;
  return { pace: pace + adjustment, adjustment, percent, coefficient, personalized,
    // A planning band, deliberately not a statistical confidence interval.
    low: pace + adjustment * 0.75, high: pace + adjustment * 1.25, condition: conditions(tempF, humidity) };
}
