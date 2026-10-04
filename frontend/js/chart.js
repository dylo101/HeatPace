import { displayPace, fromFahrenheit } from "./heatScore.js";

export function renderChart(runs, analysis, { paceUnit = "mi", tempUnit = "f", comparableOnly = false } = {}) {
  const wrap = document.getElementById("chart-wrap");
  const empty = document.getElementById("chart-empty");
  const detail = document.getElementById("chart-detail");
  const ids = new Set(analysis.comparable.map(r => r.id));
  const points = runs.filter(r => Number.isFinite(r.temp) && Number.isFinite(r.pace) && r.pace > 0 && (!comparableOnly || ids.has(r.id)));
  wrap.replaceChildren();
  wrap.hidden = !points.length;
  empty.hidden = Boolean(points.length);
  document.getElementById("trend-legend").hidden = !analysis.available || !points.length;
  if (!points.length) {
    empty.querySelector("h3").textContent = runs.length ? "No runs to plot here yet." : "Every run has a story.";
    empty.querySelector("p").textContent = runs.length ? (comparableOnly ? "Try All runs. Comparable runs need weather, heart rate, and steady outdoor activity data." : "No hourly weather was available for these runs. Your pace calculator still works.") : "See how pace and temperature line up across your runs. Connect Strava, or take a look with sample data.";
    return;
  }
  const width = Math.max(280, Math.min(660, Math.round(wrap.clientWidth || 660)));
  const height = width < 480 ? 240 : 280, left = 48, right = 17, top = 23, bottom = 45;
  const minX = Math.floor((Math.min(...points.map(r => r.temp)) - 3) / 5) * 5;
  const maxX = Math.ceil((Math.max(...points.map(r => r.temp)) + 3) / 5) * 5;
  const minY = Math.floor((Math.min(...points.map(r => r.pace)) - 15) / 30) * 30;
  const maxY = Math.ceil((Math.max(...points.map(r => r.pace)) + 15) / 30) * 30;
  const x = value => left + (value - minX) / (maxX - minX) * (width - left - right);
  const y = value => height - bottom - (value - minY) / (maxY - minY) * (height - top - bottom);
  const degree = tempUnit === "c" ? "°C" : "°F";
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" class="chart-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="Run pace against temperature. Select a dot to inspect a run."><title>Run pace against temperature</title>`];
  for (let i = 0; i <= 4; i++) {
    const value = minY + (maxY - minY) * i / 4;
    parts.push(`<line class="grid-line" x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}"/><text x="${left-10}" y="${y(value)+4}" text-anchor="end">${displayPace(value, paceUnit)}</text>`);
  }
  for (let i = 0; i <= 5; i++) {
    const value = minX + (maxX - minX) * i / 5;
    parts.push(`<text x="${x(value)}" y="${height-bottom+21}" text-anchor="middle">${Math.round(fromFahrenheit(value, tempUnit))}°</text>`);
  }
  parts.push(`<text class="axis-title" x="${left}" y="12">Pace (min / ${paceUnit})</text><text class="axis-title" x="${width-right}" y="${height-3}" text-anchor="end">Temperature (${degree})</text>`);
  if (analysis.available) {
    const a = Math.min(...analysis.comparable.map(r => r.temp)), b = Math.max(...analysis.comparable.map(r => r.temp));
    parts.push(`<line class="trend-line" x1="${x(a)}" y1="${y(analysis.intercept + analysis.slope*a)}" x2="${x(b)}" y2="${y(analysis.intercept + analysis.slope*b)}"/>`);
  }
  for (const [index, run] of points.entries()) {
    const label = `${displayPace(run.pace, paceUnit)} per ${paceUnit}, ${Math.round(fromFahrenheit(run.temp, tempUnit))}${degree}`;
    parts.push(`<g class="run-point" data-index="${index}" tabindex="0" role="button" aria-label="Run ${index+1}: ${label}"><title>${label}</title><circle class="dot-target" cx="${x(run.temp)}" cy="${y(run.pace)}" r="12"/><circle class="run-dot${ids.has(run.id) ? "" : " other"}" cx="${x(run.temp)}" cy="${y(run.pace)}" r="5"/></g>`);
  }
  parts.push("</svg>");
  // Only finite numeric values and fixed labels enter this SVG template.
  wrap.innerHTML = parts.join("");
  const describe = node => {
    const run = points[Number(node.dataset.index)];
    const date = new Date(run.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    detail.textContent = `${run.name} · ${date} · ${displayPace(run.pace, paceUnit)} / ${paceUnit} at ${Math.round(fromFahrenheit(run.temp, tempUnit))}${degree}${run.heartRate ? ` · ${Math.round(run.heartRate)} bpm` : ""}`;
  };
  let selected = null;
  const select = node => {
    selected?.classList.remove("selected");
    selected = node;
    selected.classList.add("selected");
    describe(node);
  };
  for (const dot of wrap.querySelectorAll(".run-point")) {
    dot.addEventListener("mouseenter", () => { if (!selected) describe(dot); });
    dot.addEventListener("focus", () => select(dot));
    dot.addEventListener("click", event => {
      // Overlapping touch targets should select the nearest actual dot.
      const svg = wrap.querySelector("svg"), point = svg.createSVGPoint();
      point.x = event.clientX; point.y = event.clientY;
      const local = point.matrixTransform(svg.getScreenCTM().inverse());
      let nearest = 0, distance = Infinity;
      points.forEach((run, index) => {
        const squared = (x(run.temp) - local.x) ** 2 + (y(run.pace) - local.y) ** 2;
        if (squared < distance) { distance = squared; nearest = index; }
      });
      select(wrap.querySelector(`[data-index="${nearest}"]`));
    });
    dot.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(dot); } });
  }
  detail.textContent = "Hover, tap, or focus a dot to explore a run. Association ≠ causation.";
}
