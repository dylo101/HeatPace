import { calculateHeatScore, heatLabel } from "./heatScore.js";
import { runs } from "../data/mockRuns.js";
import { renderChart } from "./chart.js";

// Optional: debug check
console.log("HeatPace app loaded");

function updateUI(temp, pace, score) {
  document.getElementById("result").innerHTML = `
    <b>Heat Score:</b> ${score}/10<br/>
    <b>Condition:</b> ${heatLabel(score)}<br/>
    <b>Predicted Pace:</b> ${pace} sec/km`;
  function getInsight(runs) {
  const hotRuns = runs.filter(r => r.temp > 75);
  const coldRuns = runs.filter(r => r.temp <= 60);

  const avgHot = hotRuns.reduce((a, b) => a + b.pace, 0) / hotRuns.length;
  const avgCold = coldRuns.reduce((a, b) => a + b.pace, 0) / coldRuns.length;

  const diff = avgHot - avgCold;

  return `You slow down ~${Math.round(diff)} sec/km in heat`;
  document.getElementById("result").innerHTML += `
  <br/><br/><b>Insight:</b> ${getInsight(runs)}`;

}

}

// 👇 MUST be global because HTML uses onclick=""
window.calculate = function () {
  console.log("calculate clicked");

  let pace = parseFloat(document.getElementById("pace").value);
  let temp = parseFloat(document.getElementById("temp").value);

  // basic validation
  if (isNaN(pace) || isNaN(temp)) {
    document.getElementById("result").innerHTML =
      "⚠️ Please enter valid numbers";
    return;
  }

  // heat logic
  const score = calculateHeatScore(temp);
  const adjustment = score * 3;
  const newPace = pace + adjustment;

  // update text UI
  updateUI(temp, newPace, score);

  // update chart with mock data
  renderChart(runs);
};
