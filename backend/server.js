import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
console.log("CLIENT_ID:", CLIENT_ID);
const REDIRECT_URI = "https://heatpace.onrender.com/exchange_token";

app.get("/auth", (req, res) => {
  const url =
    `https://www.strava.com/oauth/authorize?` +
    `client_id=${CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${REDIRECT_URI}` +
    `&scope=activity:read`;
  console.log("STRAVA AUTH URL:", url);
  res.redirect(url);
});

app.get("/exchange_token", async (req, res) => {
  const code = req.query.code;
  console.log("OAuth callback hit");
  console.log("Code received:", code);

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

  // redirect back to Netlify frontend
  res.redirect(`https://heatpace.netlify.app/?token=${data.access_token}`);
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

const WEATHER_KEY = process.env.WEATHER_KEY;

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
  console.log(`Server running on ${PORT}`);
});
