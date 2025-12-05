
import { calculateStats, updateStatsPanel } from './stats.js';

let currentMetric = "amount";
const countyDataCache = {};
let map = null;
let geoJsonLayer = null;
let chart = null;
let lastFetch = 0;

// Rate-limit helper
async function delayIfNeeded() {
  const delay = Math.max(0, 1100 - (Date.now() - lastFetch));
  if (delay) await new Promise(r => setTimeout(r, delay));
  lastFetch = Date.now();
}

async function fetchDaily(lat, lon) {
  await delayIfNeeded();
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=1940-01-01&end_date=2025-12-05&daily=precipitation_sum&precipitation_unit=inch&timezone=America/Chicago`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    return json.daily?.time.map((d, i) => ({ date: d, value: json.daily.precipitation_sum[i] ?? 0 })) || [];
  } catch (e) {
    console.warn("Data temporarily unavailable – will show later");
    return [];
  }
}

function aggregateYearly(daily) {
  const y = {};
  daily.forEach(d => { const year = d.date.slice(0,4); y[year] = (y[year]||0) + d.value; });
  return Object.entries(y).map(([year,v]) => ({year, value: +v.toFixed(2)})).sort((a,b) => a.year.localeCompare(b.year));
}

function calcAmount(y) { const l = y.slice(-10).map(d=>d.value); return l.length ? l.reduce((a,b)=>a+b,0)/10 : null; }
function calcTrend(y) { if (y.length < 40) return null; const l = y.slice(-20).map(d=>d.value); const p = y.slice(-40,-20).map(d=>d.value); const a = l.reduce((a,b)=>a+b,0)/20; const b = p.reduce((a,b)=>a+b,0)/20; return b===0?0:((a-b)/b)*100; }
function calcVariability(y) { const v = y.map(d=>d.value); const m = v.reduce((a,b)=>a+b,0)/v.length; return Math.sqrt(v.reduce((s,x)=>s+Math.pow(x-m,2),0)/v.length); }

function getColor(m, v) {
  if (v===null) return "#ccc";
  if (m==="amount") return v>25?"#08306b":v>20?"#2171b5":v>15?"#6baed6":v>10?"#bdd7e7":"#eff3ff";
  if (m==="trend") return v>20?"#08306b":v>10?"#2171b5":v>0?"#6baed6":v>-10?"#fcae91":v>-20?"#fb6a4a":"#cb181d";
  return v>6?"#4d004b":v>5?"#810f7c":v>4?"#8c6bb1":v>3?"#9ebcda":v>2?"#e7e1ef":"#ffffcc";
}

async function loadCountyData(name, lat, lon) {
  if (countyDataCache[name]) return countyDataCache[name];
  const daily = await fetchDaily(lat, lon);
  const yearly = aggregateYearly(daily);
  const data = { amount: calcAmount(yearly), trend: calcTrend(yearly), variability: calcVariability(yearly), yearly };
  countyDataCache[name] = data;
  return data;
}

function styleCounty(f) {
  const name = f.properties.name;
  const data = countyDataCache[name];
  return { fillColor: getColor(currentMetric, data?.[currentMetric] ?? null), weight: 2, color: "white", fillOpacity: 0.8 };
}

function onEachCounty(feature, layer) {
  const name = feature.properties.name;
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

async function updateChart(title) {
  const mode = document.getElementById("timeScale").value;
  const name = title.replace(" County","");
  const data = countyDataCache[name];
  if (!data) return;

  let points = mode==="yearly" ? data.yearly.map(d=>({x:d.year,y:d.value}))
             : mode==="monthly" ? Object.entries(data.yearly.reduce((a,y)=>(a[y.year]=(a[y.year]||0)+y.value,a),{})).map(([m,v])=>({x:m,y:+v.toFixed(2)}))
             : data.yearly.slice(-12).map(d=>({x:d.year,y:d.value}));

  updateStatsPanel(calculateStats(points, mode, title));
  if (chart) chart.destroy();
  chart = new Chart("rainfallChart", {
    type: mode==="daily"?"bar":"line",
    data: { datasets: [{ label: title, data: points, borderColor:"#1565c0", backgroundColor: mode==="daily"?"rgba(21,101,192,0.5)":"rgba(21,101,192,0.1)", fill: mode!=="daily" }] },
    options: { responsive:true, maintainAspectRatio:false, scales:{ y:{beginAtZero:true,title:{display:true,text:"Precipitation (in)"}} } }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const citySelect = document.getElementById("citySelect");
  citySelect.innerHTML = '<option>Statewide Average</option>';

  map = L.map("map").setView([44.37, -100.35], 7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(map);

  const res = await fetch("sd-counties.geojson");
  const geojson = await res.json();

  geoJsonLayer = L.geoJson(geojson, {
    style: styleCounty,
    onEachFeature: (f, l) => {
      const name = f.properties.name;
      onEachCounty(f, l);
      const opt = document.createElement("option");
      opt.value = opt.textContent = name + " County";
      citySelect.appendChild(opt);
    }
  }).addTo(map);

  // Initial statewide view
  updateChart("South Dakota Statewide Average");

  citySelect.onchange = () => {
    const val = citySelect.value;
    if (val === "Statewide Average") {
      map.setView([44.37, -100.35], 7);
      updateChart("South Dakota Statewide Average");
    } else {
      const layer = [...geoJsonLayer._layers].find(l => (l.feature.properties.name + " County") === val);
      if (layer) layer.fire("click");
    }
  };

  document.getElementById("timeScale").onchange = () => updateChart(citySelect.value);
  document.getElementById("resetZoom").onclick = () => chart?.resetZoom();

  document.querySelectorAll(".metric-option").forEach((b,i) => b.onclick = () => {
    document.querySelectorAll(".metric-option").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    currentMetric = b.dataset.metric;
    document.querySelector(".metric-bg").style.transform = `translateX(${i*100}%)`;
    geoJsonLayer.setStyle(styleCounty);
  });
});
