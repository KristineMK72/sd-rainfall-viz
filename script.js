// ======================================================
// South Dakota Rainfall Explorer – script.js
// ======================================================

// Import stats functions (now works thanks to type="module")
import { calculateStats, updateStatsPanel } from './stats.js';

// ======================================================
// CONFIG
// ======================================================
const cities = {
  "Statewide Average": { lat: 44.37, lon: -100.35 },
  "Sioux Falls": { lat: 43.54, lon: -96.73 },
  "Rapid City": { lat: 44.08, lon: -103.23 },
  "Pierre": { lat: 44.37, lon: -100.35 },
  "Aberdeen": { lat: 45.46, lon: -98.49 },
  "Mitchell": { lat: 43.71, lon: -98.03 },
  "Watertown": { lat: 44.90, lon: -97.12 },
  "Brookings": { lat: 44.31, lon: -96.80 },
  "Huron": { lat: 44.36, lon: -98.21 },
  "Yankton": { lat: 42.87, lon: -97.39 }
};

const countyCentroids = {
  "Minnehaha": { lat: 43.67, lon: -96.79 },
  "Pennington": { lat: 44.00, lon: -103.45 },
  "Hughes": { lat: 44.37, lon: -100.37 },
  "Brown": { lat: 45.57, lon: -98.37 },
  "Lincoln": { lat: 43.25, lon: -96.70 },
  "Codington": { lat: 44.97, lon: -97.18 },
  "Brookings": { lat: 44.31, lon: -96.80 }
  // Add more counties later!
};

const GEOJSON_URL = "https://raw.githubusercontent.com/datasets/geo-boundaries-us-counties/master/geojson/counties-50m.geojson";

let currentMetric = "amount";
const countyDataCache = {};
let map = null;
let geoJsonLayer = null;
let chart = null;

// ======================================================
// FETCH & AGGREGATE
// ======================================================
async function fetchDaily(lat, lon) {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=1940-01-01&end_date=2025-12-31&daily=precipitation_sum&precipitation_unit=inch&timezone=America/Chicago`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.daily) return [];
    return json.daily.time.map((date, i) => ({
      date,
      value: json.daily.precipitation_sum[i] ?? 0
    }));
  } catch (err) {
    console.error("Failed to fetch rainfall data:", err);
    return [];
  }
}

function aggregateYearly(daily) {
  const yearly = {};
  daily.forEach(d => {
    const year = d.date.slice(0, 4);
    yearly[year] = (yearly[year] || 0) + d.value;
  });
  return Object.entries(yearly)
    .map(([year, val]) => ({ year, value: Number(val.toFixed(2)) }))
    .sort((a, b) => a.year.localeCompare(b.year));
}

// ======================================================
// METRIC CALCULATIONS
// ======================================================
function calcAmount(yearly) {
  const last10 = yearly.slice(-10).map(d => d.value);
  return last10.length ? last10.reduce((a, b) => a + b, 0) / last10.length : null;
}

function calcTrend(yearly) {
  if (yearly.length < 40) return null;
  const last20 = yearly.slice(-20).map(d => d.value);
  const prev20 = yearly.slice(-40, -20).map(d => d.value);
  const avgLast = last20.reduce((a, b) => a + b, 0) / 20;
  const avgPrev = prev20.reduce((a, b) => a + b, 0) / 20;
  return avgPrev === 0 ? 0 : ((avgLast - avgPrev) / avgPrev) * 100;
}

function calcVariability(yearly) {
  const vals = yearly.map(d => d.value);
  if (vals.length === 0) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / vals.length;
  return Math.sqrt(variance);
}

// ======================================================
// COLOR SCALES
// ======================================================
const colorScales = {
  amount: v => v == null ? "#e5e7eb" :
    v > 25 ? "#08306b" :
    v > 20 ? "#2171b5" :
    v > 15 ? "#6baed6" :
    v > 10 ? "#bdd7e7" : "#eff3ff",

  trend: v => v == null ? "#e5e7eb" :
    v > 20 ? "#08306b" :
    v > 10 ? "#2171b5" :
    v > 0 ? "#6baed6" :
    v > -10 ? "#fcae91" :
    v > -20 ? "#fb6a4a" : "#cb181d",

  variability: v => v == null ? "#e5e7eb" :
    v > 6 ? "#4d004b" :
    v > 5 ? "#810f7c" :
    v > 4 ? "#8c6bb1" :
    v > 3 ? "#9ebcda" :
    v > 2 ? "#e7e1ef" : "#ffffcc"
};

function getColor(metric, v) {
  return colorScales[metric](v);
}

// ======================================================
// COUNTY DATA + MAP
// ======================================================
async function loadCountyData(countyName) {
  if (countyDataCache[countyName]) return countyDataCache[countyName];
  const centroid = countyCentroids[countyName];
  if (!centroid) return null;

  const daily = await fetchDaily(centroid.lat, centroid.lon);
  const yearly = aggregateYearly(daily);
  const data = {
    amount: calcAmount(yearly),
    trend: calcTrend(yearly),
    variability: calcVariability(yearly),
    yearly
  };
  countyDataCache[countyName] = data;
  return data;
}

function styleCounty(feature) {
  const name = feature.properties.NAME;
  const data = countyDataCache[name];
  const value = data ? data[currentMetric] : null;
  return {
    fillColor: getColor(currentMetric, value),
    weight: 2,
    opacity: 1,
    color: "white",
    dashArray: "3",
    fillOpacity: 0.7
  };
}

function onEachCounty(feature, layer) {
  const name = feature.properties.NAME;

  layer.on({
    mouseover: e => {
      e.target.setStyle({ weight: 5, color: "#1f2937", fillOpacity: 0.9 });
      e.target.bringToFront();
    },
    mouseout: () => geoJsonLayer.resetStyle(layer),
    click: async () => {
      const data = await loadCountyData(name);
      if (!data || !countyCentroids[name]) return;
      map.fitBounds(layer.getBounds(), { padding: [50, 50] });
      updateChartFromCoords(countyCentroids[name].lat, countyCentroids[name].lon, `${name} County`);
    }
  });

  layer.bindTooltip(() => {
    const data = countyDataCache[name];
    if (!data) return `${name} County<br><i>Loading…</i>`;
    const v = data[currentMetric];
    if (v === null) return `${name} County<br><i>No data</i>`;
    const unit = currentMetric === "amount" ? " in/yr" :
                 currentMetric === "trend" ? "%" : " std dev";
    return `<strong>${name} County</strong><br>${v.toFixed(2)}${unit}`;
  }, { sticky: true });
}

async function buildChoropleth() {
  const res = await fetch(GEOJSON_URL);
  const geojson = await res.json();

  // Preload known counties
  await Promise.all(Object.keys(countyCentroids).map(loadCountyData));

  geoJsonLayer = L.geoJson(geojson, {
    filter: f => f.properties.STATE === "46", // South Dakota FIPS
    style: styleCounty,
    onEachFeature: onEachCounty
  }).addTo(map);

  updateLegend();
}

// ======================================================
// LEGEND & CHART
// ======================================================
function updateLegend() {
  if (map._legend) map.removeControl(map._legend);

  const legend = L.control({ position: "bottomright" });
  legend.onAdd = () => {
    const div = L.DomUtil.create("div", "info legend");
    const title = currentMetric === "amount" ? "10-yr Avg (in)" :
                  currentMetric === "trend" ? "40-yr Trend (%)" : "Variability (std dev)";
    div.innerHTML = `<strong>${title}</strong><br>`;

    const grades = currentMetric === "amount" ? [0, 10, 15, 20, 25] :
                   currentMetric === "trend" ? [-30, -15, 0, 15, 30] :
                   [0, 2, 3, 4, 5, 6];

    for (let i = 0; i < grades.length; i++) {
      div.innerHTML += `
        <i style="background:${getColor(currentMetric, grades[i] + 1)}"></i>
        ${grades[i]}${grades[i + 1] ? "&ndash;" + grades[i + 1] : "+"}
        <br>
      `;
    }
    return div;
  };
  legend.addTo(map);
  map._legend = legend;
}

async function updateChartFromCoords(lat, lon, title) {
  const mode = document.getElementById("timeScale").value;
  const daily = await fetchDaily(lat, lon);
  const yearly = aggregateYearly(daily);

  let datasets = [];
  let labels = [];
  let dataPoints = [];

  if (mode === "yearly") {
    dataPoints = yearly.map(d => ({ x: d.year, y: d.value }));
  } else if (mode === "monthly") {
    const monthly = {};
    daily.forEach(d => {
      const m = d.date.slice(0, 7);
      monthly[m] = (monthly[m] || 0) + d.value;
    });
    dataPoints = Object.entries(monthly).map(([m, v]) => ({ x: m, y: +v.toFixed(2) }));
  } else {
    dataPoints = daily.slice(-365).map(d => ({ x: d.date, y: d.value })); // Last year only
  }

  const stats = calculateStats(dataPoints, mode, title);
  updateStatsPanel(stats);

  if (chart) chart.destroy();

  chart = new Chart(document.getElementById("rainfallChart"), {
    type: mode === "daily" ? "bar" : "line",
    data: {
      datasets: [{
        label: title,
        data: dataPoints,
        borderColor: "#1565c0",
        backgroundColor: mode === "daily" ? "rgba(21,101,192,0.5)" : "rgba(21,101,192,0.1)",
        fill: mode !== "daily",
        tension: 0.3,
        pointRadius: mode === "daily" ? 0 : 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.y.toFixed(2)} in` } },
        zoom: { pan: { enabled: true, mode: "x" }, zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" } }
      },
      scales: {
        x: { type: mode === "daily" ? "time" : "category", time: { unit: mode === "daily" ? "month" : "year" } },
        y: { beginAtZero: true, title: { display: true, text: "Precipitation (inches)" } }
      }
    }
  });
}

// ======================================================
// INIT
// ======================================================
document.addEventListener("DOMContentLoaded", async () => {
  // City dropdown
  const select = document.getElementById("citySelect");
  Object.keys(cities).forEach(city => {
    const opt = document.createElement("option");
    opt.value = city;
    opt.textContent = city;
    if (city === "Statewide Average") opt.selected = true;
    select.appendChild(opt);
  });

  // Map setup
  map = L.map("map").setView([44.37, -100.35], 7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  await buildChoropleth();

  // Initial chart
  const initial = cities["Statewide Average"];
  await updateChartFromCoords(initial.lat, initial.lon, "South Dakota Statewide Average");

  // Controls
  select.addEventListener("change", () => {
    const { lat, lon } = cities[select.value];
    updateChartFromCoords(lat, lon, select.value);
  });

  document.getElementById("timeScale").addEventListener("change", () => {
    const { lat, lon } = cities[select.value];
    updateChartFromCoords(lat, lon, select.value);
  });

  document.getElementById("resetZoom").addEventListener("click", () => chart?.resetZoom());

  // Metric toggle
  document.querySelectorAll(".metric-option").forEach((btn, i) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".metric-option").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentMetric = btn.dataset.metric;
      document.querySelector(".metric-bg").style.transform = `translateX(${i * 100}%)`;
      if (geoJsonLayer) geoJsonLayer.setStyle(styleCounty);
      updateLegend();
    });
  });
});
