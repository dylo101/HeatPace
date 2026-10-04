import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
const port = Number(process.env.PORT || 3001);
const app = createApp({ config: {
  origin: process.env.APP_ORIGIN || `http://localhost:${port}`,
  clientId: process.env.STRAVA_CLIENT_ID,
  clientSecret: process.env.STRAVA_CLIENT_SECRET,
  production: process.env.NODE_ENV === "production",
} });
const server = app.listen(port, error => {
  if (error) { console.error(`HeatPace could not start (${error.code || "unknown error"}).`); process.exitCode = 1; return; }
  console.log(`HeatPace is running on port ${port}`);
});
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));
