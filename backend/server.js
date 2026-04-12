import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// 🔑 YOU WILL FILL THESE
const CLIENT_ID = "223733";
const CLIENT_SECRET = "82af787fe26c39d180e331d4425a8a0cfc40f694";
const REDIRECT_URI = "http://localhost:3001/exchange_token";

app.get("/auth", (req, res) => {
  const url =
    `https://www.strava.com/oauth/authorize?` +
    `client_id=${CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${REDIRECT_URI}` +
    `&scope=activity:read`;

  res.redirect(url);
});

app.get("/exchange_token", async (req, res) => {
  const code = req.query.code;

  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      grant_type: "authorization_code"
    })
  });

  const data = await response.json();

  // redirect back to frontend with token
  res.redirect(`http://localhost:3000?token=${data.access_token}`);
});

app.get("/activities", async (req, res) => {
  const token = req.query.token;

  const response = await fetch(
    "https://www.strava.com/api/v3/athlete/activities",
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const data = await response.json();
  res.json(data);
});

const WEATHER_KEY = "91ed8ba7c07b4e1c0530723e9ea9cd48";

app.get("/weather", async (req, res) => {

  const lat = req.query.lat;
  const lon = req.query.lon;

  const url =
    `https://api.openweathermap.org/data/2.5/weather` +
    `?lat=${lat}` +
    `&lon=${lon}` +
    `&units=imperial` +
    `&appid=${WEATHER_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  res.json(data);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("Serving running on ${PORT}");
});
