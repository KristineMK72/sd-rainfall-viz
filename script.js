import { calculateStats, updateStatsPanel } from "./stats.js";

let currentMetric = "amount";
const countyDataCache = {};
const stationDataCache = {};
let map = null;
let geoJsonLayer = null;
let chart = null;
let lastFetch = 0;
let stationMarkers = L.layerGroup();

// ------------------------
// Rate Limit Helper
// ------------------------
async function delayIfNeeded() {
  const delay = Math.max(0, 1100 - (Date.now() - lastFetch));
  if (delay) await new Promise((r) => setTimeout(r, delay));
  lastFetch = Date.now();
}

// ------------------------
// Fetch Daily Rainfall
// ------------------------
async function fetchDaily(lat, lon, start = "1940-01-01", end = "2025-12-05") {
  await delayIfNeeded();

  const url =
    `https://archive-api.open-meteo.com/v1/archive?` +
    `latitude=${lat}&longitude=${lon}` +
    `&start_date=${start}&end_date=${end}` +
    `&daily=precipitation_sum&precipitation_unit=inch&timezone=America/Chicago`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();

    return (
      json.daily?.time.map((d, i) => ({
        date: d,
        value: json.daily.precipitation_sum[i] ?? 0,
      })) || []
    );
  } catch (e) {
    console.warn("Rain data temporarily unavailable", e);
    return [];
  }
}

// ------------------------
// Aggregate to Yearly
// ------------------------
function aggregateYearly(daily) {
  const yearly = {};

  daily.forEach((d) => {
    const year = d.date.slice(0, 4);
    yearly[year] = (yearly[year] || 0) + d.value;
  });

  return Object.entries(yearly)
    .map(([year, value]) => ({ year, value: +value.toFixed(2) }))
    .sort((a, b) => a.year.localeCompare(b.year));
}

// ------------------------
// Metrics
// ------------------------
function calcAmount(y) {
  const last10 = y.slice(-10).map((d) => d.value);
  return last10.length ? last10.reduce((a, b) => a + b, 0) / 10 : null;
}

function calcTrend(y) {
  if (y.length < 40) return null;

  const last20 = y.slice(-20).map((d) => d.value);
  const prev20 = y.slice(-40, -20).map((d) => d.value);

  const a = last20.reduce((a, b) => a + b, 0) / 20;
  const b = prev20.reduce((a, b) => a + b, 0) / 20;

  return b === 0 ? 0 : ((a - b) / b) * 100;
}

function calcVariability(y) {
  const vals = y.map((d) => d.value);
  if (!vals.length) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / vals.length);
}

// ------------------------
// Color Scale
// ------------------------
function getColor(metric, v) {
  if (v === null || v === undefined) return "#ccc";

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
async function loadCountyData(countyName, lat, lon) {
  const key = `county:${countyName}`;
  if (countyDataCache[key]) return countyDataCache[key];

  const daily = await fetchDaily(lat, lon);
  const yearly = aggregateYearly(daily);

  const data = {
    amount: calcAmount(yearly),
    trend: calcTrend(yearly),
    variability: calcVariability(yearly),
    yearly,
  };

  countyDataCache[key] = data;
  return data;
}

// ------------------------
// Leaflet Style
// ------------------------
function styleCounty(feature) {
  const name = feature.properties.NAME;
  const key = `county:${name}`;
  const data = countyDataCache[key];

  return {
    fillColor: getColor(currentMetric, data?.[currentMetric] ?? null),
    weight: 2,
    color: "white",
    fillOpacity: 0.8,
  };
}

// ------------------------
// County Interaction
// ------------------------
function onEachCounty(feature, layer) {
  const name = feature.properties.NAME;
  const centroid = layer.getBounds().getCenter();

  layer.bindTooltip(name, { sticky: true });

  layer.on({
    mouseover: (e) => e.target.setStyle({ weight: 5, color: "#000" }),
    mouseout: () => geoJsonLayer.resetStyle(layer),
    click: async () => {
      map.fitBounds(layer.getBounds());
      await loadCountyData(name, centroid.lat, centroid.lng);
      updateChart(name + " County");
    },
  });
}

// ------------------------
// Load SD Counties (ArcGIS)
// ------------------------
async function loadSDCounties() {
  const url =
    "https://arcgis.sd.gov/arcgis/rest/services/SD_All/Boundary_County/FeatureServer/0/query" +
    "?where=1%3D1&outFields=*&outSR=4326&f=geojson";

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load county boundaries");
    return await res.json();
  } catch (err) {
    console.error("County boundary fetch error:", err);
    return null;
  }
}

// ------------------------
// Chart Updater (PATCHED)
// ------------------------
function updateChart(title) {
  const key = `county:${title.replace(" County", "")}`;
  const data = countyDataCache[key];

  // ✅ Prevent crashes when Open-Meteo rate-limits (429)
  if (!data || !data.yearly || data.yearly.length === 0) {
    updateStatsPanel({ total: 0 });
    return;
  }

  const yearly = data.yearly.map((d) => ({
    x: d.year,
    y: d.value,
  }));

  const stats = calculateStats(yearly, "yearly", title);
  updateStatsPanel(stats);

  if (chart) chart.destroy();

  const canvas = document.getElementById("chart");
  if (!canvas) {
    console.error("Chart canvas not found");
    return;
  }

  chart = new Chart(canvas, {
    type: "line",
    data: {
      datasets: [
        {
          label: title,
          data: yearly,
          borderColor: "#0d47a1",
          backgroundColor: "rgba(13,71,161,0.2)",
          tension: 0.2,
        },
      ],
    },
    options: {
      scales: {
        x: { title: { display: true, text: "Year" } },
        y: { title: { display: true, text: "Inches" } },
      },
    },
  });
}

// ------------------------
// Map Initialization
// ------------------------
async function initMap() {
  map = L.map("map").setView([44.5, -100], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const geojson = await loadSDCounties();
  if (!geojson) return;

  geoJsonLayer = L.geoJSON(geojson, {
    style: styleCounty,
    onEachFeature: onEachCounty,
  }).addTo(map);
}

// ------------------------
// Metric Switch
// ------------------------
document.querySelectorAll(".metric-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentMetric = btn.dataset.metric;
    geoJsonLayer.setStyle(styleCounty);
  });
});

// ------------------------
initMap();
