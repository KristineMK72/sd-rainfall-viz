import { calculateStats, updateStatsPanel } from "./stats.js";

let currentMetric = "amount";
const countyDataCache = {};
let map = null;
let geoJsonLayer = null;
let chart = null;
let lastFetch = 0;

// ---- RATE LIMIT PROTECTION ----
async function delayIfNeeded() {
  const delay = Math.max(0, 1100 - (Date.now() - lastFetch));
  if (delay) await new Promise((r) => setTimeout(r, delay));
  lastFetch = Date.now();
}

// ---- FETCH DAILY DATA ----
async function fetchDaily(lat, lon) {
  await delayIfNeeded();
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=1940-01-01&end_date=2025-12-05&daily=precipitation_sum&precipitation_unit=inch&timezone=America/Chicago`;

  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const j = await r.json();
    return (
      j.daily?.time.map((d, i) => ({
        date: d,
        value: j.daily.precipitation_sum[i] ?? 0,
      })) || []
    );
  } catch {
    return [];
  }
}

// ---- YEARLY AGGREGATION ----
function aggregateYearly(d) {
  const yearly = {};
  d.forEach((x) => {
    const yr = x.date.slice(0, 4);
    yearly[yr] = (yearly[yr] || 0) + x.value;
  });

  return Object.entries(yearly)
    .map(([yr, v]) => ({ year: yr, value: +v.toFixed(2) }))
    .sort((a, b) => a.year.localeCompare(b.year));
}

// ---- METRIC CALCULATIONS ----
function calcAmount(y) {
  const last10 = y.slice(-10);
  return last10.length
    ? last10.reduce((a, b) => a + b.value, 0) / 10
    : null;
}

function calcTrend(y) {
  if (y.length < 40) return null;
  const last20 = y.slice(-20);
  const prev20 = y.slice(-40, -20);
  const a =
    last20.reduce((s, x) => s + x.value, 0) / 20;
  const b =
    prev20.reduce((s, x) => s + x.value, 0) / 20;
  return b === 0 ? 0 : ((a - b) / b) * 100;
}

function calcVariability(y) {
  const v = y.map((x) => x.value);
  const mean =
    v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(
    v.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / v.length
  );
}

// ---- COLOR SCALES ----
function getColor(metric, v) {
  if (v === null) return "#ccc";

  if (metric === "amount")
    return v > 25
      ? "#08306b"
      : v > 20
      ? "#2171b5"
      : v > 15
      ? "#6baed6"
      : v > 10
      ? "#bdd7e7"
      : "#eff3ff";

  if (metric === "trend")
    return v > 20
      ? "#08306b"
      : v > 10
      ? "#2171b5"
      : v > 0
      ? "#6baed6"
      : v > -10
      ? "#fcae91"
      : v > -20
      ? "#fb6a4a"
      : "#cb181d";

  // variability
  return v > 6
    ? "#4d004b"
    : v > 5
    ? "#810f7c"
    : v > 4
    ? "#8c6bb1"
    : v > 3
    ? "#9ebcda"
    : v > 2
    ? "#e7e1ef"
    : "#ffffcc";
}

// ---- LOAD COUNTY DATA ----
async function loadCountyData(name, lat, lon) {
  if (countyDataCache[name]) return countyDataCache[name];

  const daily = await fetchDaily(lat, lon);
  const yearly = aggregateYearly(daily);

  countyDataCache[name] = {
    amount: calcAmount(yearly),
    trend: calcTrend(yearly),
    variability: calcVariability(yearly),
    yearly,
  };

  return countyDataCache[name];
}

// ---- MAP STYLE ----
function styleCounty(f) {
  const name = f.properties.NAME;
  const d = countyDataCache[name];

  return {
    fillColor: getColor(
      currentMetric,
      d?.[currentMetric] ?? null
    ),
    weight: 2,
    color: "white",
    fillOpacity: 0.8,
  };
}

// ---- MOUSE + CLICK ----
function onEachCounty(f, layer) {
  const name = f.properties.NAME;
  const center = layer.getBounds().getCenter();

  layer.bindTooltip(name, { sticky: true });

  layer.on({
    click: async () => {
      map.fitBounds(layer.getBounds());
      await loadCountyData(name, center.lat, center.lng);
      updateChart(name + " County");
    },
  });
}

// ---- UPDATE CHART ----
async function updateChart(title) {
  const mode = document.getElementById("timeScale").value;
  const name = title.replace(" County", "");
  const data = countyDataCache[name] || { yearly: [] };

  let points = [];

  if (mode === "yearly") {
    points = data.yearly.map((d) => ({
      x: d.year,
      y: d.value,
    }));
  } else if (mode === "monthly") {
    const monthly = {};
    data.yearly.forEach((y) => {
      monthly[y.year] = (monthly[y.year] || 0) + y.value;
    });
    points = Object.entries(monthly).map(([m, v]) => ({
      x: m,
      y: +v.toFixed(2),
    }));
  } else {
    points = data.yearly.slice(-12).map((d) => ({
      x: d.year,
      y: d.value,
    }));
  }

  updateStatsPanel(
    calculateStats(points, mode, title)
  );

  if (chart) chart.destroy();

  chart = new Chart("rainfallChart", {
    type: mode === "daily" ? "bar" : "line",
    data: {
      datasets: [
        {
          label: title,
          data: points,
          borderColor: "#1565c0",
          backgroundColor:
            mode === "daily"
              ? "rgba(21,101,192,0.5)"
              : "rgba(21,101,192,0.1)",
          fill: mode !== "daily",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Precipitation (in)",
          },
        },
      },
    },
  });
}

// ---- DOM READY ----
document.addEventListener("DOMContentLoaded", async () => {
  const sel = document.getElementById("citySelect");
  sel.innerHTML = `<option>Statewide Average</option>`;

  map = L.map("map").setView([44.37, -100.35], 7);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { attribution: "&copy; OpenStreetMap" }
  ).addTo(map);

  const r = await fetch("sd-counties.geojson");
  const geojson = await r.json();

  geoJsonLayer = L.geoJson(geojson, {
    style: styleCounty,
    onEachFeature: (f, l) => {
      onEachCounty(f, l);

      const opt = document.createElement("option");
      opt.value = opt.textContent = f.properties.NAME + " County";
      sel.appendChild(opt);
    },
  }).addTo(map);

  updateChart("South Dakota Statewide Average");

  sel.onchange = () => {
    if (sel.value === "Statewide Average") {
      map.setView([44.37, -100.35], 7);
      updateChart("South Dakota Statewide Average");
    } else {
      const countyName = sel.value.replace(" County", "");

      const layer = Object.values(
        geoJsonLayer._layers
      ).find(
        (l) =>
          l.feature.properties.NAME === countyName
      );

      if (layer) layer.fire("click");
    }
  };

  document.getElementById("timeScale").onchange = () =>
    updateChart(sel.value);

  document.getElementById("resetZoom").onclick = () =>
    chart?.resetZoom();

  document
    .querySelectorAll(".metric-option")
    .forEach((btn, i) => {
      btn.onclick = () => {
        document
          .querySelectorAll(".metric-option")
          .forEach((x) => x.classList.remove("active"));

        btn.classList.add("active");

        currentMetric = btn.dataset.metric;

        document.querySelector(
          ".metric-bg"
        ).style.transform = `translateX(${i * 100}%)`;

        geoJsonLayer.setStyle(styleCounty);
      };
    });
});
