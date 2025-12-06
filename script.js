import { calculateStats, updateStatsPanel } from "./stats.js";

let currentMetric = "amount";
const countyDataCache = {};
let map = null;
let geoJsonLayer = null;
let chart = null;
let lastFetch = 0;

// ------------------------
// Rate Limit Helper
// ------------------------
async function delayIfNeeded() {
  const delay = Math.max(0, 1100 - (Date.now() - lastFetch));
  if (delay) await new Promise(r => setTimeout(r, delay));
  lastFetch = Date.now();
}

// ------------------------
// Fetch Daily Rainfall
// ------------------------
async function fetchDaily(lat, lon) {
  await delayIfNeeded();

  const url =
    `https://archive-api.open-meteo.com/v1/archive?` +
    `latitude=${lat}&longitude=${lon}` +
    `&start_date=1940-01-01&end_date=2025-12-05` +
    `&daily=precipitation_sum&precipitation_unit=inch&timezone=America/Chicago`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();

    return (
      json.daily?.time.map((d, i) => ({
        date: d,
        value: json.daily.precipitation_sum[i] ?? 0
      })) || []
    );
  } catch (e) {
    console.warn("Rain data temporarily unavailable");
    return [];
  }
}

// ------------------------
// Aggregate to Yearly
// ------------------------
function aggregateYearly(daily) {
  const yearly = {};

  daily.forEach(d => {
    const year = d.date.slice(0, 4);
    yearly[year] = (yearly[year] || 0) + d.value;
  });

  return Object.entries(yearly)
    .map(([year, value]) => ({ year, value: +value.toFixed(2) }))
    .sort((a, b) => a.year.localeCompare(b.year));
}

// ------------------------
// Metrics (Amount, Trend, Variability)
// ------------------------
function calcAmount(y) {
  const last10 = y.slice(-10).map(d => d.value);
  return last10.length ? last10.reduce((a, b) => a + b, 0) / 10 : null;
}

function calcTrend(y) {
  if (y.length < 40) return null;

  const last20 = y.slice(-20).map(d => d.value);
  const prev20 = y.slice(-40, -20).map(d => d.value);

  const a = last20.reduce((a, b) => a + b, 0) / 20;
  const b = prev20.reduce((a, b) => a + b, 0) / 20;

  return b === 0 ? 0 : ((a - b) / b) * 100;
}

function calcVariability(y) {
  const vals = y.map(d => d.value);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / vals.length);
}

// ------------------------
// Color Scale
// ------------------------
function getColor(metric, v) {
  if (v === null) return "#ccc";

  if (metric === "amount")
    return v > 25 ? "#08306b" :
           v > 20 ? "#2171b5" :
           v > 15 ? "#6baed6" :
           v > 10 ? "#bdd7e7" :
                    "#eff3ff";

  if (metric === "trend")
    return v > 20 ? "#08306b" :
           v > 10 ? "#2171b5" :
           v > 0  ? "#6baed6" :
           v > -10 ? "#fcae91" :
           v > -20 ? "#fb6a4a" :
                     "#cb181d";

  return v > 6 ? "#4d004b" :
         v > 5 ? "#810f7c" :
         v > 4 ? "#8c6bb1" :
         v > 3 ? "#9ebcda" :
         v > 2 ? "#e7e1ef" :
                 "#ffffcc";
}

// ------------------------
// Load County Data
// ------------------------
async function loadCountyData(name, lat, lon) {
  if (countyDataCache[name]) return countyDataCache[name];

  const daily = await fetchDaily(lat, lon);
  const yearly = aggregateYearly(daily);

  const data = {
    amount: calcAmount(yearly),
    trend: calcTrend(yearly),
    variability: calcVariability(yearly),
    yearly
  };

  countyDataCache[name] = data;
  return data;
}

// ------------------------
// Leaflet Style
// ------------------------
function styleCounty(f) {
  const name = f.properties.NAME;
  const data = countyDataCache[name];

  return {
    fillColor: getColor(currentMetric, data?.[currentMetric] ?? null),
    weight: 2,
    color: "white",
    fillOpacity: 0.8
  };
}

// ------------------------
// Each County Interaction
// ------------------------
function onEachCounty(feature, layer) {
  const name = feature.properties.NAME;
  const centroid = layer.getBounds().getCenter();

  layer.bindTooltip(name, { sticky: true });

  layer.on({
    mouseover: e => e.target.setStyle({ weight: 5, color: "#000" }),
    mouseout: () => geoJsonLayer.resetStyle(layer),
    click: async () => {
      map.fitBounds(layer.getBounds());
      await loadCountyData(name, centroid.lat, centroid.lng);
      updateChart(name + " County");
    }
  });
}

// ------------------------
// Chart Updates
// ------------------------
async function updateChart(title) {
  const mode = document.getElementById("timeScale").value;
  const name = title.replace(" County", "");
  const data = countyDataCache[name];

  if (!data) return;

  let points =
    mode === "yearly" ? data.yearly.map(d => ({ x: d.year, y: d.value })) :
    mode === "monthly" ? Object.entries(
      data.yearly.reduce((a, y) => ((a[y.year] = (a[y.year] || 0) + y.value), a), {})
    ).map(([m, v]) => ({ x: m, y: +v.toFixed(2) })) :
    data.yearly.slice(-12).map(d => ({ x: d.year, y: d.value }));

  updateStatsPanel(calculateStats(points, mode, title));

  if (chart) chart.destroy();

  chart = new Chart("rainfallChart", {
    type: mode === "daily" ? "bar" : "line",
    data: {
      datasets: [{
        label: title,
        data: points,
        borderColor: "#1565c0",
        backgroundColor: mode === "daily"
          ? "rgba(21,101,192,0.5)"
          : "rgba(21,101,192,0.1)",
        fill: mode !== "daily"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "Precipitation (in)" }
        }
      }
    }
  });
}

// ------------------------
// DOM LOAD
// ------------------------
document.addEventListener("DOMContentLoaded", async () => {
  const citySelect = document.getElementById("citySelect");
  citySelect.innerHTML = '<option>Statewide Average</option>';

  // Map
  map = L.map("map").setView([44.37, -100.35], 7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  // Load SD counties
  const res = await fetch("sd-counties.geojson");
  const geojson = await res.json();

  geoJsonLayer = L.geoJson(geojson, {
    style: styleCounty,
    onEachFeature: (f, l) => {
      const name = f.properties.NAME;
      onEachCounty(f, l);

      const opt = document.createElement("option");
      opt.value = opt.textContent = name + " County";
      citySelect.appendChild(opt);
    }
  }).addTo(map);

  updateChart("South Dakota Statewide Average");

  // Dropdown
  citySelect.onchange = () => {
    const val = citySelect.value;

    if (val === "Statewide Average") {
      map.setView([44.37, -100.35], 7);
      updateChart("South Dakota Statewide Average");
      return;
    }

    const layer = Object.values(geoJsonLayer._layers)
      .find(l => (l.feature.properties.NAME + " County") === val);

    if (layer) layer.fire("click");
  };

  // Time-scale switching
  document.getElementById("timeScale").onchange = () =>
    updateChart(citySelect.value);

  // Chart Zoom Reset
  document.getElementById("resetZoom").onclick = () =>
    chart?.resetZoom();

  // Metrics switching
  document.querySelectorAll(".metric-option").forEach((b, i) => {
    b.onclick = () => {
      document.querySelectorAll(".metric-option").forEach(x =>
        x.classList.remove("active")
      );
      b.classList.add("active");
      currentMetric = b.dataset.metric;
      document.querySelector(".metric-bg").style.transform =
        `translateX(${i * 100}%)`;
      geoJsonLayer.setStyle(styleCounty);
    };
  });
});
