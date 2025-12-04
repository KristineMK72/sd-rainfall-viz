// ======================================================
// CONFIG
// ======================================================

// Cities for dropdown
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

// Approximate county centroids (expand later)
const countyCentroids = {
  "Minnehaha": { lat: 43.67, lon: -96.79 },
  "Pennington": { lat: 44.00, lon: -103.45 },
  "Hughes": { lat: 44.37, lon: -100.37 },
  "Brown": { lat: 45.57, lon: -98.37 },
  "Lincoln": { lat: 43.25, lon: -96.70 },
  "Codington": { lat: 44.97, lon: -97.18 },
  "Brookings": { lat: 44.31, lon: -96.80 }
};

// GeoJSON source
const GEOJSON_URL =
  "https://raw.githubusercontent.com/datasets/geo-boundaries-us-counties/master/geojson/counties-50m.geojson";

// Choropleth metric state
let currentMetric = "amount";

// Cache for county rainfall metrics
const countyDataCache = {};

// Map + chart references
let map = null;
let geoJsonLayer = null;
let chart = null;

// ======================================================
// FETCH RAINFALL DATA
// ======================================================

async function fetchDaily(lat, lon) {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=1940-01-01&end_date=2025-12-31&daily=precipitation_sum&precipitation_unit=inch&timezone=America/Chicago`;

  const res = await fetch(url);
  const json = await res.json();

  if (!json.daily) return [];

  return json.daily.time.map((date, i) => ({
    date,
    value: json.daily.precipitation_sum[i] || 0
  }));
}

function aggregateYearly(daily) {
  const yearly = {};
  daily.forEach(d => {
    const year = d.date.slice(0, 4);
    yearly[year] = (yearly[year] || 0) + d.value;
  });
  return Object.entries(yearly).map(([year, val]) => ({
    year,
    value: Number(val.toFixed(2))
  }));
}

// ======================================================
// METRIC CALCULATIONS
// ======================================================

// 1. Amount = 10-year average
function calcAmount(yearly) {
  const last10 = yearly.slice(-10).map(d => d.value);
  if (!last10.length) return null;
  return last10.reduce((a, b) => a + b, 0) / last10.length;
}

// 2. Trend = % change (last 20 vs previous 20)
function calcTrend(yearly) {
  if (yearly.length < 40) return null;

  const last20 = yearly.slice(-20).map(d => d.value);
  const prev20 = yearly.slice(-40, -20).map(d => d.value);

  const avgLast = last20.reduce((a, b) => a + b, 0) / 20;
  const avgPrev = prev20.reduce((a, b) => a + b, 0) / 20;

  return ((avgLast - avgPrev) / avgPrev) * 100;
}

// 3. Variability = standard deviation
function calcVariability(yearly) {
  const vals = yearly.map(d => d.value);
  if (!vals.length) return null;

  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance =
    vals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / vals.length;

  return Math.sqrt(variance);
}

// ======================================================
// COLOR SCALES
// ======================================================

// Amount (blue)
function colorAmount(v) {
  if (v == null) return "#e5e7eb";
  if (v > 25) return "#08306b";
  if (v > 20) return "#2171b5";
  if (v > 15) return "#6baed6";
  if (v > 10) return "#bdd7e7";
  return "#eff3ff";
}

// Trend (red → blue)
function colorTrend(v) {
  if (v == null) return "#e5e7eb";
  if (v > 20) return "#08306b";
  if (v > 10) return "#2171b5";
  if (v > 0) return "#6baed6";
  if (v > -10) return "#fcae91";
  if (v > -20) return "#fb6a4a";
  return "#cb181d";
}

// Variability (yellow → purple)
function colorVariability(v) {
  if (v == null) return "#e5e7eb";
  if (v > 6) return "#4d004b";
  if (v > 5) return "#810f7c";
  if (v > 4) return "#8c6bb1";
  if (v > 3) return "#9ebcda";
  if (v > 2) return "#e7e1ef";
  return "#ffffcc";
}

function getColor(metric, v) {
  if (metric === "amount") return colorAmount(v);
  if (metric === "trend") return colorTrend(v);
  return colorVariability(v);
}

// ======================================================
// COUNTY DATA LOADING
// ======================================================

async function loadCountyData(countyName) {
  if (countyDataCache[countyName]) return countyDataCache[countyName];

  const centroid = countyCentroids[countyName];
  if (!centroid) return null;

  const daily = await fetchDaily(centroid.lat, centroid.lon);
  const yearly = aggregateYearly(daily);

  const amount = calcAmount(yearly);
  const trend = calcTrend(yearly);
  const variability = calcVariability(yearly);

  countyDataCache[countyName] = { amount, trend, variability, yearly };
  return countyDataCache[countyName];
}

// ======================================================
// MAP + CHOROPLETH
// ======================================================

function styleCounty(feature) {
  const name = feature.properties.NAME;
  const data = countyDataCache[name];
  const v = data ? data[currentMetric] : null;

  return {
    fillColor: getColor(currentMetric, v),
    weight: 1,
    opacity: 1,
    color: "white",
    dashArray: "2",
    fillOpacity: 0.8
  };
}

function onEachCounty(feature, layer) {
  const name = feature.properties.NAME;

  layer.on({
    mouseover: e => {
      const target = e.target;
      target.setStyle({
        weight: 3,
        color: "#111827",
        dashArray: "",
        fillOpacity: 0.9
      });
      target.bringToFront();
    },
    mouseout: e => {
      geoJsonLayer.resetStyle(e.target);
    },
    click: async () => {
      const data = await loadCountyData(name);
      if (!data) return;

      const centroid = countyCentroids[name];
      if (centroid) {
        map.fitBounds(layer.getBounds(), { maxZoom: 9 });
        updateChartFromCoords(
          centroid.lat,
          centroid.lon,
          `${name} County rainfall`
        );
      }
    }
  });

  layer.bindTooltip(
    () => {
      const data = countyDataCache[name];
      if (!data) return `${name} County<br>Loading…`;

      const v = data[currentMetric];
      const label =
        currentMetric === "amount"
          ? `${v.toFixed(1)} in/yr`
          : currentMetric === "trend"
          ? `${v.toFixed(1)}%`
          : `${v.toFixed(2)} std dev`;

      return `${name} County<br>${label}`;
    },
    { sticky: true }
  );
}

async function buildChoropleth() {
  const res = await fetch(GEOJSON_URL);
  const geojson = await res.json();

  // Preload county data
  const names = Object.keys(countyCentroids);
  await Promise.all(names.map(n => loadCountyData(n)));

  geoJsonLayer = L.geoJson(geojson, {
    filter: f => f.properties.STATE === "46",
    style: styleCounty,
    onEachFeature: onEachCounty
  }).addTo(map);

  updateLegend();
}

// ======================================================
// LEGEND
// ======================================================

function updateLegend() {
  if (map._legendControl) map.removeControl(map._legendControl);

  const legend = L.control({ position: "bottomright" });

  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "info legend");
    div.innerHTML = `<h4>${
      currentMetric === "amount"
        ? "Avg annual rainfall"
        : currentMetric === "trend"
        ? "20-year trend"
        : "Variability"
    }</h4>`;

    const ranges =
      currentMetric === "amount"
        ? [0, 10, 15, 20, 25]
        : currentMetric === "trend"
        ? [-20, -10, 0, 10, 20]
        : [0, 2, 3, 4, 5, 6];

    for (let i = 0; i < ranges.length; i++) {
      const from = ranges[i];
      const to = ranges[i + 1];
      const color = getColor(currentMetric, from + 0.1);

      div.innerHTML +=
        `<i style="background:${color}"></i> ` +
        from +
        (to ? "–" + to : "+") +
        "<br>";
    }

    return div;
  };

  legend.addTo(map);
  map._legendControl = legend;
}

// ======================================================
// CHART + STATS
// ======================================================

async function updateChartFromCoords(lat, lon, labelOverride) {
  const mode = document.getElementById("timeScale").value;

  const daily = await fetchDaily(lat, lon);
  const yearly = aggregateYearly(daily);

  let dataPoints = [];

  if (mode === "yearly") {
    dataPoints = yearly.map(d => ({ x: d.year, y: d.value }));
  } else if (mode === "monthly") {
    const monthly = {};
    daily.forEach(d => {
      const m = d.date.slice(0, 7);
      monthly[m] = (monthly[m] || 0) + d.value;
    });
    dataPoints = Object.entries(monthly).map(([m, v]) => ({
      x: m,
      y: Number(v.toFixed(2))
    }));
  } else {
    dataPoints = daily.map(d => ({ x: d.date, y: d.value }));
  }

  const label =
    labelOverride ||
    `${document.getElementById("citySelect").value} – ${
      mode === "yearly" ? "Annual" : mode === "monthly" ? "Monthly" : "Daily"
    } rainfall`;

  const stats = calculateStats(dataPoints, mode, label);
  updateStatsPanel(stats);

  if (chart) chart.destroy();

  const ctx = document.getElementById("rainfallChart");
  chart = new Chart(ctx, {
    type: mode === "daily" ? "bar" : "line",
    data: {
      datasets: [
        {
          label,
          data: dataPoints,
          borderColor: "#1565c0",
          backgroundColor:
            mode === "daily"
              ? "rgba(21, 101, 192, 0.5)"
              : "rgba(21, 101, 192, 0.1)",
          tension: 0.2,
          pointRadius: mode === "daily" ? 1 : 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.parsed.y} inches`
          }
        },
        zoom: {
          pan: { enabled: true, mode: "x" },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: "x"
          }
        }
      },
      scales: {
        x: {
          type: mode === "daily" ? "time" : "category",
          time: {
            unit:
              mode === "daily"
                ? "month"
                : mode === "monthly"
                ? "year"
                : "year"
          }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: "Precipitation (inches)" }
        }
      }
    }
  });
}

// ======================================================
// UI CONTROLS
// ======================================================

function setupMetricToggle() {
  const buttons = document.querySelectorAll(".metric-option");
  const bg = document.querySelector(".metric-bg");

  buttons.forEach((btn, i) => {
    btn.addEventListener("click", () => {
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      currentMetric = btn.dataset.metric;

      // Move highlight bar
      bg.style.transform = `translateX(${i * 100}%)`;

      // Recolor map
      geoJsonLayer.setStyle(styleCounty);

      // Update legend
      updateLegend();
    });
  });
}

// ======================================================
// INIT
// ======================================================

document.addEventListener("DOMContentLoaded", async () => {
  // Populate dropdown
  const select = document.getElementById("citySelect");
  Object.keys(cities).forEach(city => {
    const opt = document.createElement("option");
    opt.value = city;
    opt.textContent = city;
    select.appendChild(opt);
  });

  // Map
  map = L.map("map").setView([44.37, -100.35], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "© OpenStreetMap"
  }).addTo(map);

  // Build choropleth
  await buildChoropleth();

  // Initial chart
  await updateChartFromCoords(
    cities["Statewide Average"].lat,
    cities["Statewide Average"].lon,
    "Statewide rainfall"
  );

  // Controls
  select.addEventListener("change", async () => {
    const city = select.value;
    const { lat, lon } = cities[city];
    await updateChartFromCoords(lat, lon, `${city} rainfall`);
  });

  document.getElementById("timeScale").addEventListener("change", async () => {
    const city = select.value;
    const { lat, lon } = cities[city];
    await updateChartFromCoords(lat, lon, `${city} rainfall`);
  });

  document.getElementById("resetZoom").addEventListener("click", () => {
    if (chart && chart.resetZoom) chart.resetZoom();
  });

  setupMetricToggle();
});
