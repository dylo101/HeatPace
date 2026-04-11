import { calculateHeatScore, heatLabel } from "./heatScore.js";
import { getStravaRuns } from "./strava.js";
import { renderChart } from "./chart.js";

console.log("HeatPace app loaded");

function updateUI(temp, pace, score, insight) {
  document.getElementById("result").innerHTML = `
    <b>Heat Score:</b> ${score}/10<br/>
    <b>Condition:</b> ${heatLabel(score)}<br/>
    <b>Predicted Pace:</b> ${pace} sec/km<br/><br/>
    <b>Insight:</b> ${insight}
  `;
}

function getInsight(runs) {
  const hotRuns = runs.filter(r => r.temp > 75);
  const coldRuns = runs.filter(r => r.temp <= 60);

  const avgHot =
    hotRuns.reduce((sum, r) => sum + r.pace, 0) / hotRuns.length;

  const avgCold =
    coldRuns.reduce((sum, r) => sum + r.pace, 0) / coldRuns.length;

  const diff = avgHot - avgCold;

  return `You slow down ~${Math.round(diff)} sec/km in heat`;
}

window.calculate = async function () {
  console.log("calculate clicked");

  let pace = parseFloat(document.getElementById("pace").value);
  let temp = parseFloat(document.getElementById("temp").value);

  if (isNaN(pace) || isNaN(temp)) {
    document.getElementById("result").innerHTML =
      "⚠️ Please enter valid numbers";
    return;
  }

  const score = calculateHeatScore(temp);
  const adjustment = score * 3;
  const newPace = pace + adjustment;

  // 🔥 Fetch Strava data FIRST
  const runs = await getStravaRuns();

  console.log("Strava runs received:", runs);

  // 🔥 Generate insight from real dataset
  const insight = getInsight(runs);

  // 🔥 Update UI
  updateUI(temp, newPace, score, insight);

  // 🔥 Update chart
  renderChart(runs);
};
