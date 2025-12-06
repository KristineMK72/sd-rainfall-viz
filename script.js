import { calculateStats, updateStatsPanel } from "./stats.js";

/* ================================
   Station + County Mapping
================================ */
export const COUNTY_TO_STATION = {
  "Aurora": "mitchell",
  "Beadle": "mitchell",
  "Bennett": "rapid_city",
  "Bon Homme": "yankton",
  "Brookings": "brookings",
  "Brown": "aberdeen",
  "Brule": "mitchell",
  "Buffalo": "pierre",
  "Butte": "rapid_city",
  "Campbell": "aberdeen",
  "Charles Mix": "mitchell",
  "Clark": "brookings",
  "Clay": "sioux_falls",
  "Codington": "brookings",
  "Corson": "rapid_city",
  "Custer": "rapid_city",
  "Davison": "mitchell",
  "Day": "aberdeen",
  "Deuel": "brookings",
  "Dewey": "pierre",
  "Douglas": "mitchell",
  "Edmunds": "aberdeen",
  "Fall River": "rapid_city",
  "Faulk": "aberdeen",
  "Grant": "brookings",
  "Gregory": "mitchell",
  "Haakon": "pierre",
  "Hamlin": "brookings",
  "Hand": "pierre",
  "Hanson": "mitchell",
  "Harding": "rapid_city",
  "Hughes": "pierre",
  "Hutchinson": "mitchell",
  "Hyde": "pierre",
  "Jackson": "rapid_city",
  "Jerauld": "mitchell",
  "Jones": "pierre",
  "Kingsbury": "brookings",
  "Lake": "brookings",
  "Lawrence": "rapid_city",
  "Lincoln": "sioux_falls",
  "Lyman": "pierre",
  "Marshall": "aberdeen",
  "McCook": "sioux_falls",
  "McPherson": "aberdeen",
  "Meade": "rapid_city",
  "Mellette": "pierre",
  "Miner": "brookings",
  "Minnehaha": "sioux_falls",
  "Moody": "brookings",
  "Oglala Lakota": "rapid_city",
  "Pennington": "rapid_city",
  "Perkins": "rapid_city",
  "Potter": "aberdeen",
  "Roberts": "brookings",
  "Sanborn": "mitchell",
  "Shannon": "rapid_city",
  "Spink": "aberdeen",
  "Stanley": "pierre",
  "Sully": "pierre",
  "Todd": "rapid_city",
  "Tripp": "mitchell",
  "Turner": "sioux_falls",
  "Union": "sioux_falls",
  "Walworth": "aberdeen",
  "Yankton": "yankton",
  "Ziebach": "pierre"
};

export const STATION_COORDS = {
  aberdeen:    { lat: 45.4647, lon: -98.4865 },
  mitchell:    { lat: 43.7094, lon: -98.0298 },
  pierre:      { lat: 44.3683, lon: -100.3509 },
  rapid_city:  { lat: 44.0805, lon: -103.2310 },
  sioux_falls: { lat: 43.5499, lon: -96.7003 },
  brookings:   { lat: 44.3114, lon: -96.7984 },
  yankton:     { lat: 42.8712, lon: -97.3973 }
};

// Build station → counties map from COUNTY_TO_STATION
const STATION_TO_COUNTIES = {};
for (const [county, station] of Object.entries(COUNTY_TO_STATION)) {
  if (!STATION_TO_COUNTIES[station]) STATION_TO_COUNTIES[station] = [];
  STATION_TO_COUNTIES[station].push(county);
}

// Human‑friendly labels for dropdown
const STATION_LABELS = {
  aberdeen: "Aberdeen",
  mitchell: "Mitchell",
  pierre: "Pierre",
  rapid_city: "Rapid City",
  sioux_falls: "Sioux Falls",
  brookings: "Brookings",
  yankton: "Yankton"
};

/* ================================
   Metric Config (legend + colors)
================================ */

// Metric keys: "amount" (💧), "trend" (↗️), "variability" (〰️)

const METRIC_CONFIG = {
  amount: {
    icon: "💧",
    title: "Rainfall (10‑yr Avg)",
    categories: [
      { label: "Very Wet",   color: "#08306b" },
      { label: "Above Avg",  color: "#2171b5" },
      { label: "Moderate",   color: "#6baed6" },
      { label: "Below Avg",  color: "#bdd7e7" },
      { label: "Dry",        color: "#eff3ff" }
    ],
    // thresholds in inches (10‑yr average); can be tuned
    thresholds: [25, 20, 15, 10]
  },
  trend: {
    icon: "↗️",
    title: "20‑yr Change in Rainfall",
    categories: [
      { label: "Strong Increase",   color: "#00441b" },
      { label: "Moderate Increase", color: "#238b45" },
      { label: "Stable",            color: "#74c476" },
      { label: "Moderate Decrease", color: "#bae4b3" },
      { label: "Strong Decrease",   color: "#edf8e9" }
    ],
    // thresholds in % change
    thresholds: [20, 5, -5, -20]
  },
  variability: {
    icon: "〰️",
    title: "Year‑to‑Year Variability",
    categories: [
      { label: "Very High", color: "#4a1486" },
      { label: "High",      color: "#6a51a3" },
      { label: "Moderate",  color: "#9e9ac8" },
      { label: "Low",       color: "#cbc9e2" },
      { label: "Very Low",  color: "#f2f0f7" }
    ],
    // thresholds in inches (std dev)
    thresholds: [4, 3, 2, 1]
  }
};

/* ================================
   Global State
================================ */
let map = null;
let countiesGeoJSON = null;
let currentStationKey = "aberdeen";
let currentMetric = "amount"; // "amount" | "trend" | "variability"
let chart = null;
let lastFetch = 0;
const stationDataCache = {}; // per-station metrics
let stationLayer = null;     // merged polygon layer

/* ================================
   Rate Limit Helper
================================ */
async function delayIfNeeded() {
  const delay = Math.max(0, 1100 - (Date.now() - lastFetch));
  if (delay) await new Promise((r) => setTimeout(r, delay));
  lastFetch = Date.now();
}

/* ================================
   Fetch Daily Rainfall
================================ */
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

/* ================================
   Aggregate to Yearly
================================ */
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

/* ================================
   Metric Calculations
================================ */
function calcAmount(yearly) {
  const last10 = yearly.slice(-10).map((d) => d.value);
  return last10.length ? last10.reduce((a, b) => a + b, 0) / 10 : null;
}

function calcTrend(yearly) {
  if (yearly.length < 40) return null;

  const last20 = yearly.slice(-20).map((d) => d.value);
  const prev20 = yearly.slice(-40, -20).map((d) => d.value);

  const a = last20.reduce((a, b) => a + b, 0) / 20;
  const b = prev20.reduce((a, b) => a + b, 0) / 20;

  return b === 0 ? 0 : ((a - b) / b) * 100;
}

function calcVariability(yearly) {
  const vals = yearly.map((d) => d.value);
  if (!vals.length) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(
    vals.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / vals.length
  );
}

/* ================================
   Metric → Color Utility
================================ */
function getColorForValue(metricKey, value) {
  const config = METRIC_CONFIG[metricKey];
  if (!config || value == null || isNaN(value)) {
    return "#6baed6"; // fallback
  }

  const { thresholds, categories } = config;
  // thresholds are high → low (for amount/variability) or pos→neg (trend)
  // categories: [strong high, moderate high, mid, moderate low, strong low]

  if (value >= thresholds[0]) return categories[0].color;
  if (value >= thresholds[1]) return categories[1].color;
  if (value >= thresholds[2]) return categories[2].color;
  if (value >= thresholds[3]) return categories[3].color;
  return categories[4].color;
}

/* ================================
   Load Station Data
================================ */
async function loadStationData(stationKey) {
  if (stationDataCache[stationKey]) return stationDataCache[stationKey];

  const coords = STATION_COORDS[stationKey];
  if (!coords) {
    console.error("No coordinates for station:", stationKey);
    return null;
  }

  const daily = await fetchDaily(coords.lat, coords.lon);
  const yearly = aggregateYearly(daily);

  const amount = calcAmount(yearly);
  const trend = calcTrend(yearly);
  const variability = calcVariability(yearly);

  const data = {
    amount,
    trend,
    variability,
    yearly
  };

  stationDataCache[stationKey] = data;
  return data;
}

/* ================================
   Load SD Counties (ArcGIS)
================================ */
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

/* ================================
   Build Merged Polygon for Station
================================ */
function buildStationPolygon(stationKey) {
  if (!countiesGeoJSON) return null;

  const countiesForStation = STATION_TO_COUNTIES[stationKey] || [];
  const features = countiesGeoJSON.features.filter((f) =>
    countiesForStation.includes(f.properties.NAME)
  );

  if (!features.length) return null;

  return {
    type: "FeatureCollection",
    features
  };
}

/* ================================
   Map Initialization
================================ */
async function initMap() {
  map = L.map("map").setView([44.5, -100], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  countiesGeoJSON = await loadSDCounties();
  if (!countiesGeoJSON) return;

  // Initial station polygon
  updateStationPolygonAndView(currentStationKey);
}

/* ================================
   Update Polygon + View + Color
================================ */
async function updateStationPolygonAndView(stationKey) {
  if (!countiesGeoJSON || !map) return;

  const stationFC = buildStationPolygon(stationKey);
  if (!stationFC) {
    console.warn("No counties found for station:", stationKey);
    return;
  }

  // Ensure data for color is loaded
  const data = await loadStationData(stationKey);
  const metricValue = data ? data[currentMetric] : null;
  const fillColor = getColorForValue(currentMetric, metricValue);

  if (stationLayer) {
    map.removeLayer(stationLayer);
  }

  stationLayer = L.geoJSON(stationFC, {
    style: {
      color: "#ffffff",
      weight: 2,
      fillOpacity: 0.7,
      fillColor
    }
  }).addTo(map);

  map.fitBounds(stationLayer.getBounds());
}

/* ================================
   Chart + Stats Updater
================================ */
function updateChartAndStats(stationKey) {
  const data = stationDataCache[stationKey];
  const label = STATION_LABELS[stationKey] || stationKey;

  if (!data || !data.yearly || data.yearly.length === 0) {
    updateStatsPanel({ total: 0 });
    if (chart) {
      chart.destroy();
      chart = null;
    }
    return;
  }

  const yearly = data.yearly.map((d) => ({
    x: d.year,
    y: d.value,
  }));

  const stats = calculateStats(yearly, "yearly", `${label} station`);
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
          label: `${label} station`,
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

/* ================================
   Legend Updater
================================ */
function updateLegend() {
  const legendEl = document.getElementById("legend");
  if (!legendEl) return;

  const config = METRIC_CONFIG[currentMetric];
  if (!config) return;

  const titleEl = legendEl.querySelector("h4");
  const rowsContainer = legendEl.querySelector(".legend-rows");

  if (titleEl) {
    titleEl.textContent = `${config.icon} ${config.title}`;
  }

  if (!rowsContainer) return;

  rowsContainer.innerHTML = "";

  config.categories.forEach((cat) => {
    const row = document.createElement("div");
    const swatch = document.createElement("span");
    swatch.style.background = cat.color;
    row.appendChild(swatch);
    row.appendChild(document.createTextNode(cat.label));
    rowsContainer.appendChild(row);
  });
}

/* ================================
   Metric Toggle (Icon Buttons)
================================ */
function initMetricToggle() {
  const amountBtn = document.getElementById("metricAmount");
  const trendBtn = document.getElementById("metricTrend");
  const variabilityBtn = document.getElementById("metricVariability");

  if (!amountBtn || !trendBtn || !variabilityBtn) {
    console.warn("Metric toggle buttons not found");
    return;
  }

  function setActiveMetric(metric) {
    currentMetric = metric;

    // Update active state
    amountBtn.classList.toggle("active", metric === "amount");
    trendBtn.classList.toggle("active", metric === "trend");
    variabilityBtn.classList.toggle("active", metric === "variability");

    // Update legend
    updateLegend();

    // Recolor current polygon
    updateStationPolygonAndView(currentStationKey);
  }

  amountBtn.addEventListener("click", () => setActiveMetric("amount"));
  trendBtn.addEventListener("click", () => setActiveMetric("trend"));
  variabilityBtn.addEventListener("click", () => setActiveMetric("variability"));

  // Initial state
  setActiveMetric(currentMetric);
}

/* ================================
   Dropdown Initialization
================================ */
function initDropdown() {
  const select = document.getElementById("locationSelect");
  if (!select) {
    console.error("locationSelect element not found");
    return;
  }

  select.innerHTML = "";

  const stationKeys = Object.keys(STATION_LABELS);
  stationKeys.forEach((key) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = STATION_LABELS[key];
    select.appendChild(opt);
  });

  select.value = currentStationKey;

  select.addEventListener("change", async () => {
    currentStationKey = select.value;

    const data = await loadStationData(currentStationKey);
    if (data) {
      updateChartAndStats(currentStationKey);
      updateStationPolygonAndView(currentStationKey);
    }
  });
}

/* ================================
   Main Init
================================ */
async function initApp() {
  initMetricToggle();
  initDropdown();
  await initMap();

  const data = await loadStationData(currentStationKey);
  if (data) {
    updateChartAndStats(currentStationKey);
    updateStationPolygonAndView(currentStationKey);
  }

  // Legend initial render
  updateLegend();
}

initApp();
