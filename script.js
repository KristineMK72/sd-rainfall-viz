let currentDataPoints = [];
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
let countyRainfallData = {}; // Stores { county_name: rainfall_value }
let activeCounty = null; // Tracks the currently highlighted county

// --- 1. CORE DATA FUNCTIONS ---

async function fetchData(lat, lon, mode = "monthly") {
  // ... (Keep your original fetchData logic here, it is correct) ...
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
      const month = date.slice(0, 7); // YYYY-MM
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

async function updateChart() {
  const city = document.getElementById("citySelect").value;
  const mode = document.getElementById("timeScale").value;
  const { lat, lon } = cities[city];

  const dataPoints = await fetchData(lat, lon, mode);
  currentDataPoints = dataPoints;
  const label = mode === "yearly" ? "Annual" : mode === "monthly" ? "Monthly" : "Daily";

  // Calculate and show statistics
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


// --- 2. CHOROPLETH FUNCTIONS ---

// **NOTE:** Replace this placeholder data with your actual GeoJSON URL
const GEOJSON_URL = 'data/sd_counties.geojson'; 

// Color scale definition
const bins = [10, 15, 20, 25, 30]; // Rainfall values in inches (e.g., Annual Avg)
const colors = ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b']; // Light to Dark Blue

function getColor(d) {
    return d > bins[4] ? colors[4] :
           d > bins[3] ? colors[3] :
           d > bins[2] ? colors[2] :
           d > bins[1] ? colors[1] :
           colors[0];
}

function countyStyle(feature) {
    // Look up the pre-calculated rain data by county name (assuming 'NAME' is the property key)
    const rainValue = countyRainfallData[feature.properties.NAME] || 0;
    
    return {
        fillColor: getColor(rainValue),
        weight: 1,
        opacity: 1,
        color: 'white',
        dashArray: '3',
        fillOpacity: 0.7
    };
}

// Map Interaction Handler
function onEachFeature(feature, layer) {
    // Highlight on mouseover
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
            // Reset to the original style
            geoJsonLayer.resetStyle(e.target); 
        },
        click: function(e) {
            const countyName = feature.properties.NAME;
            
            // 1. Update the stats panel with the *specific county's* rain data (optional)
            // For now, we'll just alert to confirm the click:
            const rain = countyRainfallData[countyName] ? countyRainfallData[countyName].toFixed(2) : 'N/A';
            alert(`Clicked ${countyName} County. Rainfall: ${rain} in.`);
            
            // 2. Select the county's data in the city chart dropdown (if a matching city exists)
            const select = document.getElementById("citySelect");
            // NOTE: This assumes your city names match county names for click-to-chart functionality.
            if (cities[countyName]) {
                select.value = countyName;
                updateChart();
            }
        }
    });

    // Bind a simple tooltip on hover
    const countyName = feature.properties.NAME;
    const rainValue = countyRainfallData[countyName] ? countyRainfallData[countyName].toFixed(2) : 'N/A';
    layer.bindTooltip(`${countyName} County: ${rainValue} in.`, {
        permanent: false,
        direction: 'auto',
        sticky: true
    });
}

// Function to load and render the GeoJSON
async function loadGeoJSON() {
    try {
        // STEP 1: Load GeoJSON
        const geojsonRes = await fetch(GEOJSON_URL);
        const geojson = await geojsonRes.json();
        
        // STEP 2: **MOCK** Map the data to the GeoJSON features.
        // In a real app, you would load a separate CSV/JSON of annual county rain data (e.g., 1990-2020 average)
        // For demonstration, we will assign a random, color-inducing value to each county
        geojson.features.forEach(feature => {
            const countyName = feature.properties.NAME;
            // Mock value between 10 and 35 inches (to test the color scale)
            countyRainfallData[countyName] = 10 + Math.random() * 25; 
        });

        // STEP 3: Add the layer to the map
        geoJsonLayer = L.geoJson(geojson, {
            style: countyStyle, // Use the color function
            onEachFeature: onEachFeature // Use the interaction function
        }).addTo(map);

        // STEP 4: Add the legend
        addLegend();

    } catch (error) {
        console.error("Error loading or parsing GeoJSON:", error);
    }
}


// --- 3. LEGEND CONTROL ---

function addLegend() {
    const legend = L.control({ position: 'bottomright' });

    legend.onAdd = function (map) {
        const div = L.DomUtil.create('div', 'info legend');
        // Add a title
        div.innerHTML = '<h4>Avg. Annual Rain (Inches)</h4>';
        let labels = [];

        // Loop through the intervals and generate a label with a colored square
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
loadGeoJSON(); // Load and display the map layer
updateChart(); // Load and display the initial chart
