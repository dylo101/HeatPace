import { calculateHeatScore, heatLabel } from "./heatScore.js";
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

  if (hotRuns.length === 0 || coldRuns.length === 0) {
    return "Not enough temperature variation in runs yet.";
  }

  const avgHot =
    hotRuns.reduce((sum, r) => sum + r.pace, 0) / hotRuns.length;

  const avgCold =
    coldRuns.reduce((sum, r) => sum + r.pace, 0) / coldRuns.length;

  const diff = avgHot - avgCold;

  return `You slow down ~${Math.round(diff)} sec/km in heat`;
}

function getTokenFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("token");
}

window.connectStrava = function () {
  window.location.href = "http://localhost:3001/auth";
};

async function getStravaRuns() {
  const token = getTokenFromURL();

  if (!token) {
    alert("Connect Strava first.");
    return [];
  }

  const res = await fetch(
    `http://localhost:3001/activities?token=${token}`
  );

  const activities = await res.json();

  console.log("Raw Strava activities:", activities);

  // Convert Strava activities → your run format
  const runs = activities
    .filter(a => a.type === "Run")
    .map(a => {
      const pace = a.moving_time / (a.distance / 1000);

      return {
        pace: pace,
        temp: 70 // placeholder until we add weather API
      };
    });

  return runs;
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

  const runs = await getStravaRuns();

  console.log("Strava runs received:", runs);

  const insight = getInsight(runs);

  updateUI(temp, newPace, score, insight);

  renderChart(runs);
};
