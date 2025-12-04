let currentDataPoints = [];
// NOTE: These city names are no longer used for map interaction but are kept for the chart dropdown
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
let geoJsonLayer;
let countyRainfallData = {}; // Stores { county_name: value }
let activeCounty = null;
let currentGeojsonData = null; // Stores the raw GeoJSON data

// --- 1. CORE DATA FUNCTIONS (UNCHANGED) ---

async function fetchData(lat, lon, mode = "monthly") {
  // ... (Your existing fetchData logic remains here, using Open-Meteo) ...
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

// ... (Your existing updateChart function remains here) ...
async function updateChart() {
  const city = document.getElementById("citySelect").value;
  const mode = document.getElementById("timeScale").value;
  const { lat, lon } = cities[city];

  const dataPoints = await fetchData(lat, lon, mode);
  currentDataPoints = dataPoints;
  const label = mode === "yearly" ? "Annual" : mode === "monthly" ? "Monthly" : "Daily";

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

// --- 2. CHOROPLETH FUNCTIONS (UPDATED FOR LIVE DATA) ---

// Real GeoJSON URL for US Counties, filtered for South Dakota (FIPS code 46)
// This is a publicly hosted file and demonstrates live data fetching.
const GEOJSON_URL = 'https://raw.githubusercontent.com/datasets/geo-boundaries-us-counties/master/geojson/counties-50m.geojson';

// --- DATA CONFIGURATION ---
const DATA_PROPERTY = 'POP10_SQMI'; // Using Population Density as the coloring metric
const LEGEND_TITLE = 'Population Density (per sq mi)';
// Color scale definition
const bins = [0.5, 5, 10, 25, 50]; // Population density values
const colors = ['#fef0d9', '#fdcc8a', '#fc8d59', '#e34a33', '#b30000']; // Light Orange to Dark Red

function getColor(d) {
    return d > bins[4] ? colors[4] :
           d > bins[3] ? colors[3] :
           d > bins[2] ? colors[2] :
           d > bins[1] ? colors[1] :
           colors[0];
}

function countyStyle(feature) {
    // Check if the county is in South Dakota (FIPS code 46)
    if (feature.properties.STATE !== '46') {
        return {
             fillColor: '#ccc', // Gray out non-SD counties
             weight: 0.5,
             opacity: 0.5,
             color: 'white',
             fillOpacity: 0.3
        };
    }
    
    // Use the actual data property from the GeoJSON feature
    const value = feature.properties[DATA_PROPERTY] || 0;
    
    return {
        fillColor: getColor(value),
        weight: 1,
        opacity: 1,
        color: 'white',
        dashArray: '3',
        fillOpacity: 0.7
    };
}

// Map Interaction Handler
function onEachFeature(feature, layer) {
    // Only add interaction for South Dakota counties
    if (feature.properties.STATE !== '46') return;

    // Get the name and value for the tooltip
    const countyName = feature.properties.NAME;
    const value = feature.properties[DATA_PROPERTY] ? feature.properties[DATA_PROPERTY].toFixed(1) : 'N/A';
    
    layer.on({
        mouseover: function(e) {
            const layer = e.target;
            layer.setStyle({
                weight: 3,
                color: '#666',
                dashArray: '',
                fillOpacity: 0.9
            });
            if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                layer.bringToFront();
            }
        },
        mouseout: function(e) {
            geoJsonLayer.resetStyle(e.target); 
        },
        click: function(e) {
            // OPTIONAL: Zoom to the clicked county
            map.fitBounds(e.target.getBounds());
            
            // Check if the county name matches a city in the dropdown to update the chart
            const select = document.getElementById("citySelect");
            if (cities[countyName]) {
                select.value = countyName;
                updateChart();
            } else {
                // If the county doesn't match a city, at least alert the data
                alert(`${countyName} County: ${value} people/sq mi. No specific city data for this county.`);
            }
        }
    });

    // Bind a simple tooltip on hover
    layer.bindTooltip(`${countyName} County: ${value} pop/sq mi`, {
        permanent: false,
        direction: 'auto',
        sticky: true
    });
}

// Function to load and render the GeoJSON
async function loadGeoJSON() {
    try {
        // STEP 1: Load GeoJSON from the live URL
        const geojsonRes = await fetch(GEOJSON_URL);
        const geojson = await geojsonRes.json();
        currentGeojsonData = geojson; // Store the data globally
        
        // STEP 2: Filter and add the layer to the map
        geoJsonLayer = L.geoJson(geojson, {
            // Use filter to only include South Dakota (FIPS '46') to speed up rendering
            filter: function(feature, layer) {
                return feature.properties.STATE === '46';
            },
            style: countyStyle, // Use the color function
            onEachFeature: onEachFeature // Use the interaction function
        }).addTo(map);

        // STEP 3: Add the legend
        addLegend();
        
    } catch (error) {
        console.error("Error loading or parsing GeoJSON:", error);
    }
}


// --- 3. LEGEND CONTROL (UPDATED TITLE AND UNIT) ---

function addLegend() {
    const legend = L.control({ position: 'bottomright' });

    legend.onAdd = function (map) {
        const div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = `<h4>${LEGEND_TITLE}</h4>`;
        let labels = [];

        for (let i = 0; i < bins.length; i++) {
            const from = bins[i];
            const to = bins[i + 1];

            labels.push(
                `<i style="background:${getColor(from + 1)};"></i> ${from}${
                    to ? '&ndash;' + to : '+'
                }`
            );
        }

        div.innerHTML += labels.join('<br>');
        return div;
    };

    legend.addTo(map);
}


// --- 4. INITIALIZATION ---

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

// Initial loads
loadGeoJSON(); // Load and display the map layer from the live URL
updateChart(); // Load and display the initial chart
