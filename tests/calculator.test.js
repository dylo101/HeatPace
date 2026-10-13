import test from "node:test";
import assert from "node:assert/strict";

test("calculator rejects invalid pace before loading runs and shares chart formatting", async (t) => {
  const keys = ["window", "document", "Chart", "alert", "fetch"];
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });

  const result = { innerHTML: "", textContent: "" };
  const elements = {
    pace: { value: "8:99" }, temp: { value: "80" }, result,
    chart: { getContext: () => ({}) }
  };
  const charts = [];
  const alerts = [];
  let fetches = 0;
  globalThis.window = { location: { search: "" } };
  globalThis.document = { getElementById: id => elements[id] };
  globalThis.Chart = class {
    constructor(context, config) { charts.push(config); }
    destroy() {}
  };
  globalThis.alert = message => alerts.push(message);
  globalThis.fetch = () => {
    fetches++;
    throw new Error("This check must not make external requests");
  };

  await import("../frontend/js/app.js");
  await window.calculate();
  assert.match(result.textContent, /Seconds must be 00–59/);
  assert.equal(fetches, 0);
  assert.equal(alerts.length, 0);
  assert.equal(charts.length, 0);

  window.toggleMock();
  elements.pace.value = "8:00";
  await window.calculate();
  assert.match(result.innerHTML, /8:27/);
  assert.equal(charts[0].data.datasets[0].data.length, 11);
  assert.equal(charts[0].options.scales.y.ticks.callback(479.6), "8:00");

  elements.pace.value = "8.549";
  await window.calculate();
  assert.match(result.innerHTML, /9:00/);
  assert.doesNotMatch(result.innerHTML, /8:60/);
  assert.equal(fetches, 0);
});
