import test from "node:test";
import assert from "node:assert/strict";
import { parsePace, formatPace } from "../frontend/js/pace.js";

test("accepts clock paces and decimal minutes", () => {
  for (const [input, expected] of [
    ["8:00", 480], ["8:59", 539], [" 8:05 ", 485],
    ["8.5", 510], ["8", 480], [".5", 30], ["0:30", 30]
  ]) {
    assert.equal(parsePace(input), expected, input);
  }
});

test("rejects malformed, non-positive, and unrepresentable paces", () => {
  for (const input of [
    "", "   ", "8:99", "8:60", "8:5", "8:", ":30", "8:00:30",
    "8:30abc", "8.5abc", "8 minutes", "-8:00", "-8.5", "0", "0:00",
    "Infinity", "NaN", "1e3", "0x10", "9".repeat(400), null, undefined, 8
  ]) {
    assert.ok(Number.isNaN(parsePace(input)), String(input));
  }
});

test("rounds the total seconds before splitting minutes and seconds", () => {
  for (const [seconds, expected] of [
    [0, "0:00"], [480, "8:00"], [485, "8:05"],
    [479.49, "7:59"], [479.5, "8:00"], [539.6, "9:00"],
    [3599.5, "60:00"], [parsePace("8.999"), "9:00"]
  ]) {
    assert.equal(formatPace(seconds), expected, String(seconds));
  }
});

test("uses a placeholder for invalid display values", () => {
  for (const value of [NaN, Infinity, -Infinity, -1, 1e30, "480", null]) {
    assert.equal(formatPace(value), "--:--");
  }
});
