let currentDataPoints = [];   // ← add this line
const cities = {
  "Statewide Average": { lat: 44.37, lon: -100.35 },
  "Sioux Falls":      { lat: 43.54, lon: -96.73 },
  "Rapid City":       { lat: 44.08, lon: -103.23 },
  "Pierre":           { lat: 44.37, lon: -100.35 },
  "Aberdeen":         { lat: 45.46, lon: -98.49 },
  "Mitchell":         { lat: 43.71, lon: -98.03 },
  "Watertown":        { lat: 44.90, lon: -97.12 },
  "Brookings":        { lat: 44.31, lon: -96.80 },
  "Huron":            { lat: 44.36, lon: -98.21 },
  "Yankton":          { lat: 42.87, lon: -97.39 }
};

let chart;

async function fetchData(lat, lon, mode = "monthly") {
  let url;
  if (mode === "daily") {
    url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2023-01-01&end_date=2025-12-31&daily=precipitation_sum&precipitation_unit=inch&timezone=America/Chicago`;
  } else {
    url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=1940-01-01&end_date=2025-12-31&daily=precipitation_sum&precipitation_unit=inch&timezone=America/Chicago`;
  }

  const res = await fetch(url);
  const json = await res.json();

  const dates = json.daily.time;
  const precip = json.daily.precipitation_sum;

  // Convert to yearly or monthly
  const aggregated = {};

  dates.forEach((date, i) => {
    const value = precip[i] || 0;
    if (mode === "yearly") {
      const year = date.slice(0, 4);
      aggregated[year] = (aggregated[year] || 0) + value;
    } else if (mode === "monthly") {
      const month = date.slice(0, 7); // YYYY-MM
      aggregated[month] = (aggregated[month] || 0) + value;
    } else {
      aggregated[date] = value;
    }
  });

  return Object.keys(aggregated).map(key => ({
    x: key,
    y: Number(aggregated[key].toFixed(2))
  }));
}

async function updateChart() {
  const city = document.getElementById("citySelect").value;
  const mode = document.getElementById("timeScale").value;
  const { lat, lon } = cities[city];

  const dataPoints = await fetchData(lat, lon, mode);
  currentDataPoints = dataPoints;   // ← add this
  const label = mode === "yearly" ? "Annual" : mode === "monthly" ? "Monthly" : "Daily";

    // Calculate and show statistics
  const stats = calculateStats(dataPoints, mode, city);
  updateStatsPanel(stats);
  if (chart) chart.destroy();

  chart = new Chart(document.getElementById("rainfallChart"), {
    type: mode === "daily" ? "bar" : "line",
    data: {
      datasets: [{
        label: `${city} – ${label} Precipitation (inches)`,
        data: dataPoints,
        borderColor: "#1565c0",
        backgroundColor: mode === "daily" ? "rgba(21, 101, 192, 0.5)" : "rgba(21, 101, 192, 0.1)",
        tension: 0.2,
        pointRadius: mode === "daily" ? 1 : 3
      }]
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.y} inches` } },
        zoom: {
          pan: { enabled: true, mode: "xy" },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: "xy"
          }
        }
      },
      scales: {
        x: {
          type: mode === "daily" ? "time" : "category",
          time: { unit: mode === "monthly" ? "year" : "day" },
          title: { display: true, text: mode === "daily" ? "Date" : mode === "monthly" ? "Year–Month" : "Year" }
        },
        y: { beginAtZero: true, title: { display: true, text: "Precipitation (inches)" } }
      }
    }
  });
}

// Populate city dropdown
const select = document.getElementById("citySelect");
Object.keys(cities).forEach(city => {
  const opt = document.createElement("option");
  opt.value = city;
  opt.textContent = city;
  select.appendChild(opt);
});

// events
select.addEventListener("change", updateChart);
document.getElementById("timeScale").addEventListener("change", updateChart);
document.getElementById("resetZoom").addEventListener("click", () => {
  if (chart) chart.resetZoom();
});

// initial load
updateChart();
