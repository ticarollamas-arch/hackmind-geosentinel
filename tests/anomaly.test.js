import test from "node:test";
import assert from "node:assert/strict";
import { median, detectAnomalies, summarizeAnomalies } from "../src/anomaly.js";

test("median handles odd and even arrays", () => {
  assert.equal(median([1, 3, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test("detector flags an isolated large spike", () => {
  const points = Array.from({ length: 41 }, (_, i) => ({ date: `2026-01-${String(i+1).padStart(2,"0")}`, value: 10 }));
  points[20].value = 100;
  const result = detectAnomalies(points, { windowSize: 21, threshold: 3.5 });
  assert.equal(result[20].anomaly, true);
  assert.ok(result[20].score > 3.5);
});

test("summary handles empty input", () => {
  assert.deepEqual(summarizeAnomalies([]), { total: 0, anomalies: 0, latest: null, percentage: 0 });
});
