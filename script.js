import { calculateStats, updateStatsPanel } from "./stats.js";

/* ============================================================
   1. Station + County Mapping
============================================================ */
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

const STATION_TO_COUNTIES = {};
for (const [county, station] of Object.entries(COUNTY_TO_STATION)) {
  if (!STATION_TO_COUNTIES[station]) STATION_TO_COUNTIES[station] = [];
  STATION_TO_COUNTIES[station].push(county);
}

const STATION_LABELS = {
  aberdeen: "Aberdeen",
  mitchell: "Mitchell",
  pierre: "Pierre",
  rapid_city: "Rapid City",
  sioux_falls: "Sioux Falls",
  brookings: "Brookings",
  yankton: "Yankton"
};

/* ============================================================
   2. Dramatic Metric Color Scales
============================================================ */

const METRIC_CONFIG = {
  amount: {
    icon: "💧",
    title: "Rainfall (10‑yr Avg)",
    thresholds: [24, 20, 16, 12],
    colors: ["#08306b", "#2171b5", "#6baed6", "#bdd7e7", "#eff3ff"],
    labels: ["Very Wet", "Above Avg", "Moderate", "Below Avg", "Dry"]
  },

  trend: {
    icon: "↗️",
    title: "20‑yr Change",
    thresholds: [10, 3, -3, -10],
    colors: ["#00441b", "#238b45", "#74c476", "#bae4b3", "#edf8e9"],
    labels: ["Strong Increase", "Moderate Increase", "Stable", "Moderate Decrease", "Strong Decrease"]
  },

  variability: {
    icon: "〰️",
    title: "Year‑to‑Year Variability",
    thresholds: [3.5, 2.5, 1.8, 1.2],
    colors: ["#4a1486", "#6a51a3", "#9e9ac8", "#cbc9e2", "#f2f0f7"],
    labels: ["Very High", "High", "Moderate", "Low", "Very Low"]
  }
};

/* ============================================================
   3. Global State
============================================================ */

let map = null;
let countiesGeoJSON = null;
let stationLayer = null;

let currentStationKey = "aberdeen";
let currentMetric = "amount";

let chart = null;
let lastFetch = 0;

const stationDataCache = {}; // { stationKey: { amount, trend, variability, yearly } }

/* ============================================================
   4. Rate Limit Helper
============================================================ */

async function delayIfNeeded() {
  const delay = Math.max(0, 1100 - (Date.now() - lastFetch));
  if (delay) await new Promise((r) => setTimeout(r, delay));
  lastFetch = Date.now();
}

/* ============================================================
   5. Fetch + Process Rainfall
============================================================ */

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

    return json.daily.time.map((d, i) => ({
      date: d,
      value: json.daily.precipitation_sum[i] ?? 0
    }));
  } catch (e) {
    console.warn("Rain data temporarily unavailable", e);
    return [];
  }
}

function aggregateYearly(daily) {
  const yearly = {};
  daily.forEach((d) => {
    const y = d.date.slice(0, 4);
    yearly[y] = (yearly[y] || 0) + d.value;
  });

  return Object.entries(yearly)
    .map(([year, value]) => ({ year, value: +value.toFixed(2) }))
    .sort((a, b) => a.year.localeCompare(b.year));
}

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
  return Math.sqrt(vals.reduce((s, x) => s + (x - mean) ** 2, 0) / vals.length);
}

async function loadStationData(stationKey) {
  if (stationDataCache[stationKey]) return stationDataCache[stationKey];

  const coords = STATION_COORDS[stationKey];
  const daily = await fetchDaily(coords.lat, coords.lon);
  const yearly = aggregateYearly(daily);

  const data = {
    amount: calcAmount(yearly),
    trend: calcTrend(yearly),
    variability: calcVariability(yearly),
    yearly
  };

  stationDataCache[stationKey] = data;
  return data;
}

/* ============================================================
   6. Color Utility
============================================================ */

function getColor(metricKey, value) {
  const cfg = METRIC_CONFIG[metricKey];
  if (value == null) return cfg.colors[2]; // fallback to middle

  const t = cfg.thresholds;
  const c = cfg.colors;

  if (value >= t[0]) return c[0];
  if (value >= t[1]) return c[1];
  if (value >= t[2]) return c[2];
  if (value >= t[3]) return c[3];
  return c[4];
}

/* ============================================================
   7. Map + Polygon Rendering
============================================================ */

async function initMap() {
  map = L.map("map").setView([44.5, -100], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  countiesGeoJSON = await loadSDCounties();
  updatePolygon();
}

async function loadSDCounties() {
  const url =
    "https://arcgis.sd.gov/arcgis/rest/services/SD_All/Boundary_County/FeatureServer/0/query" +
    "?where=1%3D1&outFields=*&outSR=4326&f=geojson";

  const res = await fetch(url);
  return await res.json();
}

function buildStationPolygon(stationKey) {
  const counties = STATION_TO_COUNTIES[stationKey] || [];
  const features = countiesGeoJSON.features.filter((f) =>
    counties.includes(f.properties.NAME)
  );

  return { type: "FeatureCollection", features };
}

async function updatePolygon() {
  if (!countiesGeoJSON) return;

  const data = await loadStationData(currentStationKey);
  const metricValue = data[currentMetric];
  const fillColor = getColor(currentMetric, metricValue);

  const fc = buildStationPolygon(currentStationKey);

  if (stationLayer) map.removeLayer(stationLayer);

  stationLayer = L.geoJSON(fc, {
    style: {
      color: "#ffffff",
      weight: 2,
      fillOpacity: 0.75,
      fillColor
    }
  }).addTo(map);

  map.fitBounds(stationLayer.getBounds());
}

/* ============================================================
   8. Chart + Stats
============================================================ */

function updateChartAndStats(stationKey) {
  const data = stationDataCache[stationKey];
  const yearly = data.yearly;

  const stats = calculateStats(
    yearly.map((d) => ({ x: d.year, y: d.value })),
    "yearly",
    STATION_LABELS[stationKey]
  );
  updateStatsPanel(stats);

  if (chart) chart.destroy();

  chart = new Chart(document.getElementById("chart"), {
    type: "line",
    data: {
      datasets: [
        {
          label: STATION_LABELS[stationKey],
          data: yearly.map((d) => ({ x: d.year, y: d.value })),
          borderColor: "#0d47a1",
          backgroundColor: "rgba(13,71,161,0.2)",
          tension: 0.2
        }
      ]
    },
    options: {
      scales: {
        x: { title: { display: true, text: "Year" } },
        y: { title: { display: true, text: "Inches" } }
      },
      plugins: {
        zoom: {
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: "xy"
          },
          pan: { enabled: true, mode: "xy" }
        }
      }
    }
  });
}

/* ============================================================
   9. Legend Updater
============================================================ */

function updateLegend() {
  const legendEl = document.getElementById("legend");
  const rowsEl = legendEl.querySelector(".legend-rows");

  const cfg = METRIC_CONFIG[currentMetric];

  legendEl.querySelector("h4").textContent = `${cfg.icon} ${cfg.title}`;
  rowsEl.innerHTML = "";

  cfg.labels.forEach((label, i) => {
    const row = document.createElement("div");
    const swatch = document.createElement("span");
    swatch.style.background = cfg.colors[i];
    row.appendChild(swatch);
    row.appendChild(document.createTextNode(label));
    rowsEl.appendChild(row);
  });
}

/* ============================================================
   10. Metric Toggle
============================================================ */

function initMetricToggle() {
  const amountBtn = document.getElementById("metricAmount");
  const trendBtn = document.getElementById("metricTrend");
  const variabilityBtn = document.getElementById("metricVariability");

  function setMetric(metric) {
    currentMetric = metric;

    amountBtn.classList.toggle("active", metric === "amount");
    trendBtn.classList.toggle("active", metric === "trend");
    variabilityBtn.classList.toggle("active", metric === "variability");

    updateLegend();
    updatePolygon();
  }

  amountBtn.onclick = () => setMetric("amount");
  trendBtn.onclick = () => setMetric("trend");
  variabilityBtn.onclick = () => setMetric("variability");

  setMetric(currentMetric);
}

/* ============================================================
   11. Station Dropdown
============================================================ */

function initStationDropdown() {
  const select = document.getElementById("stationSelect");
  select.innerHTML = "";

  Object.keys(STATION_LABELS).forEach((key) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = STATION_LABELS[key];
    select.appendChild(opt);
  });

  select.value = currentStationKey;

  select.addEventListener("change", async () => {
    currentStationKey = select.value;

    const data = await loadStationData(currentStationKey);
    updateChartAndStats(currentStationKey);
    updatePolygon();
  });
}

/* ============================================================
   12. Reset Zoom Button
============================================================ */

function initResetZoom() {
  const btn = document.getElementById("resetZoom");
  btn.onclick = () => {
    if (chart) chart.resetZoom();
  };
}

/* ============================================================
   13. App Init
============================================================ */

async function initApp() {
  initMetricToggle();
  initStationDropdown();
  initResetZoom();

  await initMap();

  const data = await loadStationData(currentStationKey);
  updateChartAndStats(currentStationKey);
  updateLegend();
  updatePolygon();
}

initApp();
