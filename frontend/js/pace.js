// Pace values are seconds per mile. Invalid input returns NaN.
export function parsePace(input) {
  if (typeof input !== "string") return NaN;

  const value = input.trim();
  const clock = /^(\d+):([0-5]\d)$/.exec(value);
  let seconds;

  if (clock) {
    seconds = Number(clock[1]) * 60 + Number(clock[2]);
  } else if (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) {
    seconds = Number(value) * 60;
  } else {
    return NaN;
  }

  return Number.isFinite(seconds) && seconds > 0 &&
    Number.isSafeInteger(Math.round(seconds)) ? seconds : NaN;
}

export function formatPace(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";

  const rounded = Math.round(seconds);
  if (!Number.isSafeInteger(rounded)) return "--:--";

  const minutes = Math.floor(rounded / 60);
  const remainder = (rounded % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}
