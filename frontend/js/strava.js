// MOCK Strava integration layer
// (we will replace with real API later)

export async function getStravaRuns() {
  console.log("Fetching Strava runs...");

  // simulate API delay
  await new Promise(res => setTimeout(res, 500));

  return [
    { date: "2026-04-01", temp: 52, pace: 318 },
    { date: "2026-04-03", temp: 60, pace: 325 },
    { date: "2026-04-05", temp: 68, pace: 333 },
    { date: "2026-04-07", temp: 74, pace: 348 },
    { date: "2026-04-09", temp: 82, pace: 370 },
    { date: "2026-04-10", temp: 88, pace: 392 }
  ];
}

