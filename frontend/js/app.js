import { calculateHeatScore, heatLabel } from "./heatScore.js";
import { renderChart } from "./chart.js";
import { mockRuns } from "./mockRuns.js";


const metersPerMile = 1609.34;
console.log("HeatPace app loaded");

function calculateHeatSensitivity(runs) {
  const hotRuns = runs.filter(r => r.temp >= 75);
  const coolRuns = runs.filter(r => r.temp <= 60);

  if (hotRuns.length === 0 || coolRuns.length === 0) {
    return null;
  }

  const avgHot =
    hotRuns.reduce((sum, r) => sum + r.pace, 0) / hotRuns.length;

  const avgCool =
    coolRuns.reduce((sum, r) => sum + r.pace, 0) / coolRuns.length;

  const diffPer10F = ((avgHot - avgCool) / 15) * 10;

  return diffPer10F; // sec per mile per +10°F
}

function getRunnerType(sensitivity) {
  if (sensitivity === null) return "Insufficient Data";

  if (sensitivity < 5) return "Heat Resistant 🟢";
  if (sensitivity < 15) return "Moderate 🟡";
  return "Heat Sensitive 🔴";
}


function parsePace(paceStr) {
  // format mm:ss
  if (paceStr.includes(":")) {
    const parts = paceStr.split(":");
    const min = parseInt(parts[0]);
    const sec = parseInt(parts[1]);

    return min * 60 + sec;
  }

  // fallback if user enters decimal like 8.5
  return parseFloat(paceStr) * 60;
}

function formatPace(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");

  return `${min}:${sec}`;
}

async function getTemperature(lat, lon) {
  const res = await fetch(
    `https://heatpace.onrender.com/weather?lat=${lat}&lon=${lon}`
  );

  const data = await res.json();

  console.log("Weather response:", data);

  if (!data.main || !data.main.temp) {
    return 70; // safe fallback
  }

  return data.main.temp;
}


function updateUI(temp, pace, score, insight, sensitivity) {
  document.getElementById("result").innerHTML = `
    <b>Heat Score:</b> ${score}/10<br/>
    <b>Condition:</b> ${heatLabel(score)}<br/>
    <b>Predicted Pace:</b> ${formatPace(pace)} /mile<br/><br/>
    <b>Insight:</b> ${insight}<br/>
    <b>Heat Sensitivity:</b> ${
        sensitivity !== null
          ? `+${Math.round(sensitivity)} sec/mile per +10°F`
          : "Not enough data"
    }<br/>
    
    <b>Runner Type:</b> ${getRunnerType(sensitivity)}
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

  return `You slow down ~${Math.round(diff)} sec/mile in heat`;
}

function getTokenFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("token");
}

window.connectStrava = function () {
  window.location.href = "https://heatpace.onrender.com/auth";
};

async function getStravaRuns() {
  const token = getTokenFromURL();

  if (!token) {
    alert("Connect Strava first.");
    return [];
  }

  const res = await fetch(
    `https://heatpace.onrender.com/activities?token=${token}`
  );

  const activities = await res.json();

  console.log("Raw Strava activities:", activities);

  // Convert Strava activities → your run format
  
  const runs = [];

  for (const a of activities) {

    if (a.type !== "Run") continue;

    const metersPerMile = 1609.34;

    const pace =
      a.moving_time / (a.distance / metersPerMile);

    const lat = a.start_latlng?.[0];
    const lon = a.start_latlng?.[1];

    if (!lat || !lon) continue;

    const temp = Math.round((await getTemperature(lat, lon)) / 2) * 2;


    runs.push({
      pace: pace,
      temp: temp
    });
  }

  return runs;
}



window.calculate = async function () {
  console.log("calculate clicked");

  let paceInput = document.getElementById("pace").value;
  let pace = parsePace(paceInput);
  let temp = parseFloat(document.getElementById("temp").value);

  if (isNaN(pace) || isNaN(temp)) {
    document.getElementById("result").innerHTML =
      "⚠️ Please enter valid numbers";
    return;
  }

  const score = calculateHeatScore(temp);
  const adjustment = score * 3;
  const newPace = pace + adjustment;

  let runs;

  if (window.useMockData) {
    runs = mockRuns;
  } else {
    runs = await getStravaRuns();
  }

  console.log("Strava runs received:", runs);

  const insight = getInsight(runs);

  const sensitivity = calculateHeatSensitivity(runs);

  updateUI(temp, newPace, score, insight, sensitivity);

  renderChart(runs);


};

window.useMockData = false;

window.toggleMock = function () {
  window.useMockData = !window.useMockData;
  alert(window.useMockData ? "Demo Mode ON" : "Live Strava Mode ON");
};

