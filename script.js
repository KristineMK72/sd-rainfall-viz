// ---------- CONFIG ----------

// Cities for dropdown (used to fetch rainfall and move map)
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

// A few approximate county centroids for SD (for choropleth interaction)
const countyCentroids = {
  "Minnehaha": { lat: 43.67, lon: -96.79 },
  "Pennington": { lat: 44.00, lon: -103.45 },
  "Hughes": { lat: 44.37, lon: -100.37 },
  "Brown": { lat: 45.57, lon: -98.37 },
  "Lincoln": { lat: 43.25, lon: -96.70 },
  "Codington": { lat: 44.97, lon: -97.18 },
  "Brookings": { lat: 44.31, lon: -96.80 }
  // You can expand this over time for more counties
};

let chart = null;
let map = null;
let geoJsonLayer = null;

// Choropleth config
const GEOJSON_URL =
  "https://raw.githubusercontent.com/datasets/geo-boundaries-us-counties/master/geojson/counties-50m.geojson";

const bins = [10, 15, 20, 25, 30]; // inches/year
const colors = ["#edf8fb", "#b3cde3", "#8c96c6", "#8856a7", "#810f7c"];

// ---------- HELPERS ----------

function getColor(d) {
  return d > bins[4]
    ? colors[4]
    : d > bins[3]
    ? colors[3]
    : d > bins[2]
    ? colors[2]
    : d > bins[1]
    ? colors[1]
    : colors[0];
}

// Fetch and aggregate rainfall for a given lat/lon and mode
async function fetchData(lat, lon, mode = "monthly") {
  let url;
  if (mode === "daily") {
    url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2023-01-01&end_date=2025-12-31&daily=precipitation_sum&precipitation_unit=inch&timezone=America/Chicago`;
  } else {
    url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=1940-01-01&end_date=2025-12-31&daily=precipitation_sum&precipitation_unit=inch&timezone=America/Chicago`;
  }

  const res = await fetch(url);
  const json = await res.json();

  if (!json || !json.daily || !json.daily.time || !json.daily.precipitation_sum) {
    return [];
  }

  const dates = json.daily.time;
  const precip = json.daily.precipitation_sum;

  const aggregated = {};

  dates.forEach((date, i) => {
    const value = precip[i] || 0;
    if (mode === "yearly") {
      const year = date.slice(0, 4);
      aggregated[year] = (aggregated[year] || 0) + value;
    } else if (mode === "monthly") {
      const month = date.slice(0, 7);
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

// ---------- CHART + STATS ----------

async function updateChartFromCoords(lat, lon, labelOverride) {
  const mode = document.getElementById("timeScale").value;
  const dataPoints = await fetchData(lat, lon, mode);

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
            unit: mode === "daily" ? "month" : mode === "monthly" ? "year" : "year"
          },
          title: {
            display: true,
            text:
              mode === "daily"
                ? "Date"
                : mode === "monthly"
                ? "Year–Month"
                : "Year"
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

// Update chart when dropdown or time scale changes
async function updateChartFromCity() {
  const city = document.getElementById("citySelect").value;
  const { lat, lon } = cities[city];
  await updateChartFromCoords(lat, lon, `${city} rainfall`);
}

// ---------- CHOROPLETH MAP ----------

// Simple cache of county rainfall (annual total for a recent year range)
const countyRainfallCache = {};

async function estimateCountyRainfall(countyName) {
  if (countyRainfallCache[countyName]) {
    return countyRainfallCache[countyName];
  }

  const centroid = countyCentroids[countyName];
  if (!centroid) return null;

  // Pull a single recent-year series and average
  const points = await fetchData(centroid.lat, centroid.lon, "yearly");
  if (!points.length) return null;

  const values = points.slice(-10).map(d => d.y);
  const avg =
    values.reduce((a, b) => a + b, 0) / (values.length || 1);

  countyRainfallCache[countyName] = avg;
  return avg;
}

function styleCounty(feature) {
  // Only SD (STATE FIPS '46')
  if (feature.properties.STATE !== "46") {
    return {
      fillColor: "#cccccc",
      weight: 0.5,
      opacity: 0.7,
      color: "white",
      fillOpacity: 0.2
    };
  }

  const name = feature.properties.NAME;
  const value = countyRainfallCache[name];

  const fillColor = value ? getColor(value) : "#e5e7eb";

  return {
    fillColor,
    weight: 1,
    opacity: 1,
    color: "white",
    dashArray: "2",
    fillOpacity: 0.8
  };
}

function onEachCounty(feature, layer) {
  if (feature.properties.STATE !== "46") return;

  const countyName = feature.properties.NAME;

  layer.on({
    mouseover: e => {
      const target = e.target;
      target.setStyle({
        weight: 3,
        color: "#111827",
        dashArray: "",
        fillOpacity: 0.9
      });
      if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        target.bringToFront();
      }
    },
    mouseout: e => {
      geoJsonLayer.resetStyle(e.target);
    },
    click: async e => {
      const centroid = countyCentroids[countyName];
      if (centroid) {
        map.fitBounds(e.target.getBounds(), { maxZoom: 9 });

        await updateChartFromCoords(
          centroid.lat,
          centroid.lon,
          `${countyName} County rainfall`
        );
      } else {
        alert(
          `${countyName} County: rainfall data uses approximate statewide or nearby station (centroid not defined in this demo).`
        );
      }
    }
  });

  const value = countyRainfallCache[countyName];
  const label = value
    ? `${countyName} County<br>${value.toFixed(1)} in/yr (approx)`
    : `${countyName} County<br>Loading…`;

  layer.bindTooltip(label, {
    permanent: false,
    direction: "auto",
    sticky: true
  });
}

function addLegend() {
  const legend = L.control({ position: "bottomright" });

  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "info legend");
    div.innerHTML = "<h4>Avg annual rainfall</h4>";
    const labels = [];

    for (let i = 0; i < bins.length; i++) {
      const from = bins[i];
      const to = bins[i + 1];

      labels.push(
        `<i style="background:${getColor(from + 0.1)}"></i> ${from}${
          to ? "–" + to : "+ "
        } in`
      );
    }

    div.innerHTML += labels.join("<br>");
    return div;
  };

  legend.addTo(map);
}

async function buildChoropleth() {
  // Precompute rainfall for counties we know centroids for
  const countyNames = Object.keys(countyCentroids);
  await Promise.all(
    countyNames.map(async name => {
      await estimateCountyRainfall(name);
    })
  );

  const res = await fetch(GEOJSON_URL);
  const geojson = await res.json();

  geoJsonLayer = L.geoJson(geojson, {
    filter: feature => feature.properties.STATE === "46",
    style: styleCounty,
    onEachFeature: onEachCounty
  }).addTo(map);

  addLegend();
}

// ---------- INIT ----------

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

  // Initial chart from statewide
  await updateChartFromCity();

  // Wire controls
  select.addEventListener("change", async () => {
    await updateChartFromCity();
  });

  document
    .getElementById("timeScale")
    .addEventListener("change", async () => {
      // Keep same coordinates but change aggregation
      const city = document.getElementById("citySelect").value;
      const { lat, lon } = cities[city];
      await updateChartFromCoords(lat, lon, `${city} rainfall`);
    });

  document.getElementById("resetZoom").addEventListener("click", () => {
    if (chart && chart.resetZoom) {
      chart.resetZoom();
    }
  });

  // Build choropleth
  await buildChoropleth();
});
