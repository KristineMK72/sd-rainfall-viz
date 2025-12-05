import { calculateStats, updateStatsPanel } from './stats.js';

const cities = { "Statewide Average": { lat: 44.37, lon: -100.35 }, "Sioux Falls": { lat: 43.54, lon: -96.73 }, "Rapid City": { lat: 44.08, lon: -103.23 }, "Pierre": { lat: 44.37, lon: -100.35 }, "Aberdeen": { lat: 45.46, lon: -98.49 }, "Mitchell": { lat: 43.71, lon: -98.03 }, "Watertown": { lat: 44.90, lon: -97.12 }, "Brookings": { lat: 44.31, lon: -96.80 }, "Huron": { lat: 44.36, lon: -98.21 }, "Yankton": { lat: 42.87, lon: -97.39 } };

let currentMetric = "amount";
const countyDataCache = {};
let map = null;
let geoJsonLayer = null;
let chart = null;
let lastFetch = 0;

async function fetchDaily(lat, lon) {
  const delay = Math.max(0, 1100 - (Date.now() - lastFetch));
  if (delay) await new Promise(r => setTimeout(r, delay));
  lastFetch = Date.now();

  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=1940-01-01&end_date=2025-12-05&daily=precipitation_sum&precipitation_unit=inch&timezone=America/Chicago`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    return json.daily?.time.map((d, i) => ({ date: d, value: json.daily.precipitation_sum[i] ?? 0 })) || [];
  } catch (e) {
    console.warn("Rate limited or no data – will retry later");
    return [];
  }
}

function aggregateYearly(daily) {
  const yearly = {};
  daily.forEach(d => {
    const y = d.date.slice(0, 4);
    yearly[y] = (yearly[y] || 0) + d.value;
  });
  return Object.entries(yearly).map(([y, v]) => ({ year: y, value: +v.toFixed(2) })).sort((a, b) => a.year.localeCompare(b.year));
}

function calcAmount(y) { const last10 = y.slice(-10).map(d => d.value); return last10.length ? last10.reduce((a,b)=>a+b,0)/10 : null; }
function calcTrend(y) { if (y.length < 40) return null; const l = y.slice(-20).map(d=>d.value); const p = y.slice(-40,-20).map(d=>d.value); const a = l.reduce((a,b)=>a+b,0)/20; const b = p.reduce((a,b)=>a+b,0)/20; return b===0?0:((a-b)/b)*100; }
function calcVariability(y) { const v = y.map(d=>d.value); const m = v.reduce((a,b)=>a+b,0)/v.length; const varr = v.reduce((s,x)=>s+Math.pow(x-m,2),0)/v.length; return Math.sqrt(varr); }

function getColor(metric, v) {
  if (v===null) return "#e5e7eb";
  if (metric==="amount") return v>25?"#08306b":v>20?"#2171b5":v>15?"#6baed6":v>10?"#bdd7e7":"#eff3ff";
  if (metric==="trend") return v>20?"#08306b":v>10?"#2171b5":v>0?"#6baed6":v>-10?"#fcae91":v>-20?"#fb6a4a":"#cb181d";
  return v>6?"#4d004b":v>5?"#810f7c":v>4?"#8c6bb1":v>3?"#9ebcda":v>2?"#e7e1ef":"#ffffcc";
}

async function loadCountyData(name) {
  if (countyDataCache[name]) return countyDataCache[name];
  const daily = await fetchDaily(cities[name]?.lat || 44.37, cities[name]?.lon || -100.35);
  const yearly = aggregateYearly(daily);
  const data = { amount: calcAmount(yearly), trend: calcTrend(yearly), variability: calcVariability(yearly), yearly };
  countyDataCache[name] = data;
  return data;
}

function styleCounty(f) {
  const name = f.properties.name || f.properties.NAME;
  const data = countyDataCache[name];
  return { fillColor: getColor(currentMetric, data?.[currentMetric] ?? null), weight: 2, color: "white", fillOpacity: 0.75 };
}

function onEachCounty(feature, layer) {
  const name = feature.properties.name || feature.properties.NAME || "Unknown";
  layer.bindTooltip(name, { sticky: true });
  layer.on({
    mouseover: e => e.target.setStyle({ weight: 5, color: "#333" }),
    mouseout: () => geoJsonLayer.resetStyle(layer),
    click: async () => {
      const data = await loadCountyData(name);
      if (data) {
        map.fitBounds(layer.getBounds());
        updateChartFromCoords(cities[name]?.lat || 44.37, cities[name]?.lon || -100.35, name + " County");
      }
    }
  });
}

async function updateChartFromCoords(lat, lon, title) {
  const mode = document.getElementById("timeScale").value;
  const daily = await fetchDaily(lat, lon);
  const yearly = aggregateYearly(daily);
  let points = mode==="yearly" ? yearly.map(d=>({x:d.year,y:d.value}))
           : mode==="monthly" ? Object.entries(daily.reduce((a,d)=>{const m=d.date.slice(0,7);a[m]=(a[m]||0)+d.value;return a;},{}))
               .map(([m,v])=>({x:m,y:+v.toFixed(2)}))
           : daily.slice(-365).map(d=>({x:d.date,y:d.value}));

  updateStatsPanel(calculateStats(points, mode, title));
  if (chart) chart.destroy();
  chart = new Chart("rainfallChart", {
    type: mode==="daily"?"bar":"line",
    data: { datasets: [{ label: title, data: points, borderColor:"#1565c0", backgroundColor: mode==="daily"?"rgba(21,101,192,0.5)":"rgba(21,101,192,0.1)", fill: mode!=="daily" }] },
    options: { responsive:true, maintainAspectRatio:false, scales:{ y:{beginAtZero:true,title:{display:true,text:"Precipitation (in)"}} } }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const sel = document.getElementById("citySelect");
  Object.keys(cities).forEach(c => { const o=document.createElement("option"); o.value=o.text=c; if(c==="Statewide Average")o.selected=true; sel.appendChild(o); });

  map = L.map("map").setView([44.37,-100.35],7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"&copy; OpenStreetMap"}).addTo(map);

  const res = await fetch("sd-counties.geojson");
  const geo = await res.json();
  geoJsonLayer = L.geoJson(geo, { style: styleCounty, onEachFeature: onEachCounty }).addTo(map);

  await updateChartFromCoords(44.37, -100.35, "South Dakota Statewide Average");

  sel.onchange = () => updateChartFromCoords(cities[sel.value].lat, cities[sel.value].lon, sel.value);
  document.getElementById("timeScale").onchange = () => updateChartFromCoords(cities[sel.value].lat, cities[sel.value].lon, sel.value);
  document.getElementById("resetZoom").onclick = () => chart?.resetZoom();

  document.querySelectorAll(".metric-option").forEach((b,i) => b.onclick = () => {
    document.querySelectorAll(".metric-option").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    currentMetric = b.dataset.metric;
    document.querySelector(".metric-bg").style.transform = `translateX(${i*100}%)`;
    geoJsonLayer.setStyle(styleCounty);
  });
});
