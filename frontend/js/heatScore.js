export function calculateHeatScore(tempF) {
  if (tempF < 50) return 1;
  if (tempF < 60) return 2;
  if (tempF < 70) return 4;
  if (tempF < 80) return 7;
  if (tempF < 90) return 9;
  return 10;
}

export function heatLabel(score) {
  if (score <= 2) return "Perfect Running Conditions";
  if (score <= 4) return "Good Conditions";
  if (score <= 7) return "Moderate Heat Impact";
  if (score <= 9) return "Hard Conditions";
  return "Extreme Heat – Slow Down";
}
