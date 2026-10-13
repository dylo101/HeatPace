import { formatPace } from "./pace.js";

let chartInstance = null;

export function renderChart(data) {
  const canvas = document.getElementById("chart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  const labels = data.map(d => `${d.temp}°F`);

  const values = data.map(d => d.pace);

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,   
      datasets: [
        {
          label: "Pace (sec/km)",
          data: values, 
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56,189,248,0.2)",
          pointRadius: 5,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: {
            color: "white"
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Temperature",
            color: "white"
          },
          ticks: {
            color: "white"
          }
        },
        y: {
          title: {
            display: true,
            text: "Pace (min/mile)",
            color: "white"
          },
          ticks: {
            color: "white",
            callback: function(value) {
                return formatPace(value);
            }
          }
        }
      }
    }
  });
}
