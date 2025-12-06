import { calculateStats, updateStatsPanel } from "./stats.js";

let currentMetric = "amount";
const countyDataCache = {};     // keys: "county:County Name"
const stationDataCache = {};    // keys: "station:Station Name"
let map = null;
let geoJsonLayer = null;
let chart = null;
let lastFetch = 0;
let stationMarkers = L.layerGroup();

// ------------------------
// Rate Limit Helper (Open-Meteo ~50 req/min)
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
// Metrics (Amount, Trend, Variability)
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

  // variability
  return v > 6 ? "#4d004b" :
         v > 5 ? "#810f7c" :
         v > 4 ? "#8c6bb1" :
         v > 3 ? "#9ebcda" :
         v > 2 ? "#e7e1ef" :
                 "#ffffcc";
}

// ------------------------
// Data loaders (county vs station keys)
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

async function loadStationData(stationName, lat, lon) {
  const key = `station:${stationName}`;
  if (stationDataCache[key]) return stationDataCache[key];

  const daily = await fetchDaily(lat, lon);
  const yearly = aggregateYearly(daily);

  const data = {
    amount: calcAmount(yearly),
    trend: calcTrend(yearly),
    variability: calcVariability(yearly),
    yearly,
  };

  stationDataCache[key] = data;
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
// Each County Interaction
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
// Stations (cities) list
// ------------------------
// Replace or extend this list if you'd like different stations.
// Note: lat/lon used as fetch points for station calculations.
const stations = [
  { name: "Sioux Falls", lat: 43.5461, lon: -96.7311 },
  { name: "Rapid City", lat: 44.0805, lon: -103.2310 },
  { name: "Mitchell", lat: 43.7083, lon: -98.0246 },
  { name: "Pierre", lat: 44.3683, lon: -100.3510 },
  { name: "Aberdeen", lat: 45.4647, lon: -98.4865 },
  { name: "Brookings", lat: 44.3114, lon: -96.7984 },
  { name: "Yankton", lat: 42.8717, lon: -97.3979 }
];

// Add station markers to map and populate dropdown
function addStationsToMapAndDropdown(citySelect) {
  stationMarkers.clearLayers();

  for (const s of stations) {
    const marker = L.circleMarker([s.lat, s.lon], { radius: 6, fillOpacity: 0.9 })
      .bindTooltip(s.name, { sticky: true });

    marker.on("click", async () => {
      await loadStationData(s.name, s.lat, s.lon);
      map.setView([s.lat, s.lon], 9);
      updateChart(s.name); // title will be station name
    });

    marker.addTo(stationMarkers);

    const opt = document.createElement("option");
    opt.value = `station:${s.name}:${s.lat},${s.lon}`; // identifiable value
    opt.textContent = s.name;
    citySelect.appendChild(opt);
  }

  stationMarkers.addTo(map);
}

// ------------------------
// Chart Updates
// ------------------------
async function updateChart(title) {
  // title could be: "South Dakota Statewide Average", "Sioux Falls", or "Beadle County"
  const mode = document.getElementById("timeScale").value;
  const isCounty = title.endsWith(" County");
  const name = isCounty ? title.replace(" County", "") : title;

  let dataObj = null;

  if (title === "South Dakota Statewide Average") {
    // Ensure we've loaded all counties' data (sequentially, rate-limited).
    await loadAllCountiesDataIfNeeded();
    // compute average of metric across counties
    const countyKeys = Object.keys(countyDataCache);
    if (!countyKeys.length) return;

    // For chart, create a synthetic yearly average across counties
    // gather yearly maps and average by year
    const yearSums = {}; const yearCounts = {};
    for (const k of countyKeys) {
      const c = countyDataCache[k];
      if (!c?.yearly) continue;
      c.yearly.forEach((p) => {
        yearSums[p.year] = (yearSums[p.year] || 0) + p.value;
        yearCounts[p.year] = (yearCounts[p.year] || 0) + 1;
      });
    }
    const years = Object.keys(yearSums).sort();
    const avgYearly = years.map(y => ({ year: y, value: +(yearSums[y] / yearCounts[y]).toFixed(2) }));
    dataObj = { yearly: avgYearly, amount: calcAmount(avgYearly), trend: calcTrend(avgYearly), variability: calcVariability(avgYearly) };
  } else if (isCounty) {
    const key = `county:${name}`;
    dataObj = countyDataCache[key];
    if (!dataObj) {
      // find layer and load by centroid if needed
      const layer = Object.values(geoJsonLayer._layers).find(l => l.feature.properties.NAME === name);
      if (layer) {
        const c = layer.getBounds().getCenter();
        await loadCountyData(name, c.lat, c.lng);
        dataObj = countyDataCache[key];
      }
    }
  } else {
    // station
    const key = `station:${name}`;
    dataObj = stationDataCache[key];
    if (!dataObj) {
      // find station in list and load
      const s = stations.find(x => x.name === name);
      if (s) {
        await loadStationData(s.name, s.lat, s.lon);
        dataObj = stationDataCache[key];
      }
    }
  }

  if (!dataObj) {
    console.warn("No data available for", title);
    return;
  }

  // Prepare points depending on mode
  let points;
  if (mode === "yearly") {
    points = dataObj.yearly.map(d => ({ x: d.year, y: d.value }));
  } else if (mode === "monthly") {
    // If monthly requested but only yearly data available, show yearly as monthly fallback
    points = dataObj.yearly.map(d => ({ x: d.year, y: d.value }));
  } else {
    // daily not supported by archive aggregation in this bright demo; use yearly last 12
    points = dataObj.yearly.slice(-12).map(d => ({ x: d.year, y: d.value }));
  }

  updateStatsPanel(calculateStats(points, mode, title));

  if (chart) chart.destroy();

  chart = new Chart("rainfallChart", {
    type: mode === "daily" ? "bar" : "line",
    data: {
      datasets: [{
        label: title,
        data: points,
        borderColor: "#1565c0",
        backgroundColor: mode === "daily" ? "rgba(21,101,192,0.5)" : "rgba(21,101,192,0.1)",
        fill: mode !== "daily",
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: mode === "yearly" ? "Year" : "Time" }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: "Precipitation (in)" }
        }
      }
    }
  });
}

// ------------------------
// Load all counties sequentially (rate-limited)
// ------------------------
let _allCountiesLoading = false;
async function loadAllCountiesDataIfNeeded() {
  const existing = Object.keys(countyDataCache).length;
  // if we already have most counties, skip
  if (existing >= 60) return;

  if (!geoJsonLayer) return;
  if (_allCountiesLoading) return;
  _allCountiesLoading = true;

  const layers = Object.values(geoJsonLayer._layers);
  for (const l of layers) {
    const name = l.feature.properties.NAME;
    const key = `county:${name}`;
    if (!countyDataCache[key]) {
      const c = l.getBounds().getCenter();
      try {
        await loadCountyData(name, c.lat, c.lng);
        // update style progressively so map colors appear as we fetch
        geoJsonLayer.setStyle(styleCounty);
      } catch (e) {
        console.warn("Failed to load county", name, e);
      }
    }
  }

  _allCountiesLoading = false;
}

// ------------------------
// DOM LOAD
// ------------------------
document.addEventListener("DOMContentLoaded", async () => {
  const citySelect = document.getElementById("citySelect");
  if (!citySelect) {
    console.error("Missing #citySelect element");
    return;
  }

  // Reset dropdown and add Statewide option
  citySelect.innerHTML = "";
  const statewideOpt = document.createElement("option");
  statewideOpt.value = "statewide";
  statewideOpt.textContent = "Statewide Average";
  citySelect.appendChild(statewideOpt);

  // Map
  map = L.map("map").setView([44.37, -100.35], 7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  // Add stations to dropdown & map
  addStationsToMapAndDropdown(citySelect);

  // Load SD counties GeoJSON (assumes placed at /public/sd-counties.geojson)
  try {
    const res = await fetch("/sd-counties.geojson");
    if (!res.ok) throw new Error("County GeoJSON not found: " + res.status);
    const geojson = await res.json();

    geoJsonLayer = L.geoJson(geojson, {
      style: styleCounty,
      onEachFeature: (f, l) => {
        onEachCounty(f, l);

        const name = f.properties.NAME;
        const opt = document.createElement("option");
        opt.value = `county:${name}`;
        opt.textContent = name + " County";
        citySelect.appendChild(opt);
      }
    }).addTo(map);

    // initial style update
    geoJsonLayer.setStyle(styleCounty);
  } catch (e) {
    console.error("Failed to load sd-counties.geojson", e);
    // keep going: station-only mode
  }

  // Initial chart: statewide or Sioux Falls if you prefer
  updateChart("South Dakota Statewide Average");

  // Dropdown behavior
  citySelect.onchange = async () => {
    const val = citySelect.value;

    if (!val || val === "statewide") {
      map.setView([44.37, -100.35], 7);
      await updateChart("South Dakota Statewide Average");
      return;
    }

    if (val.startsWith("station:")) {
      // format station:Name:lat,lon
      const parts = val.split(":");
      const stationName = parts[1];
      // find station entry for coords (we stored coords in value as last part)
      const coords = parts[2] || "";
      const [lat, lon] = coords.split(",").map(Number);
      if (lat && lon) map.setView([lat, lon], 9);
      // load and show station
      await loadStationData(stationName, lat, lon);
      updateChart(stationName);
      return;
    }

    if (val.startsWith("county:")) {
      const countyName = val.replace("county:", "");
      // find layer and trigger click to reuse existing behavior
      const layer = Object.values(geoJsonLayer._layers).find(l => l.feature.properties.NAME === countyName);
      if (layer) layer.fire("click");
      else {
        // fallback: try to load by name if geojson missing
        console.warn("County layer not found for", countyName);
        await loadCountyData(countyName, 44.37, -100.35);
        updateChart(countyName + " County");
      }
      return;
    }
  };

  // Time-scale switching
  const timeScaleEl = document.getElementById("timeScale");
  if (timeScaleEl) {
    timeScaleEl.onchange = () => updateChart(citySelect.options[citySelect.selectedIndex].text);
  }

  // Chart Zoom Reset
  const resetZoomBtn = document.getElementById("resetZoom");
  if (resetZoomBtn) resetZoomBtn.onclick = () => chart?.resetZoom();

  // Metrics switching UI (keeps your previous logic)
  document.querySelectorAll(".metric-option").forEach((b, i) => {
    b.onclick = () => {
      document.querySelectorAll(".metric-option").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      currentMetric = b.dataset.metric;
      const bg = document.querySelector(".metric-bg");
      if (bg) bg.style.transform = `translateX(${i * 100}%)`;
      if (geoJsonLayer) geoJsonLayer.setStyle(styleCounty);
      // refresh chart for currently selected
      const currentText = citySelect.options[citySelect.selectedIndex]?.text || "South Dakota Statewide Average";
      updateChart(currentText);
    };
  });
});
