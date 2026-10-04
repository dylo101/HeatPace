// Synthetic sample runs. No real athlete or location data.
const temperatures = [54, 59, 72, 83, 62, 79, 57, 86, 69, 76, 52, 81, 66, 88, 58, 74, 55, 84, 64, 78, 60, 90, 71, 80];
export const mockRuns = temperatures.map((temp, index) => {
  const distance = [6400, 8000, 5000, 10000][index % 4];
  const pace = 472 + (temp - 55) * 1.9 + [8, -9, 3, -2, 12, -6][index % 6];
  const movingTime = Math.round(pace * distance / 1609.344);
  return { id: `demo-${index}`, name: ["Neighborhood loop", "River path", "Morning miles", "Park loop"][index % 4],
    date: new Date(Date.UTC(2026, 7, 1 + index * 2, 14)).toISOString(), distance,
    pace, temp, humidity: 45 + index % 7 * 5, movingTime, elapsedTime: movingTime + 35,
    elevation: index === 19 ? 300 : 22 + index % 5 * 8,
    heartRate: index === 8 ? null : 142 + index % 5, workoutType: index === 22 ? 3 : 0,
    trainer: false, weatherSource: "sample", weatherStatus: "available" };
}).reverse();
