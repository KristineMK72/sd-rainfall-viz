export function calculateStats(dataPoints = [], mode = "yearly", label = "Rainfall") {
  if (!Array.isArray(dataPoints) || dataPoints.length === 0) {
    return { title: label, total: 0, average: 0, wettest: null, driest: null, last10: null, prev10: null, trend: null };
  }

  const values = dataPoints.map(d => d.y).filter(v => typeof v === "number" && !isNaN(v));
  if (values.length === 0) return { title: label, total: 0, average: 0, wettest: null, driest: null, last10: null, prev10: null, trend: null };

  const total = values.reduce((a, b) => a + b, 0);
  const average = total / values.length;
  const wettest = Math.max(...values);
  const driest = Math.min(...values);

  let last10 = null, prev10 = null, trend = null;
  if (mode !== "daily" && values.length >= 20) {
    const last10vals = values.slice(-10);
    const prev10vals = values.slice(-20, -10);
    last10 = last10vals.reduce((a, b) => a + b, 0) / 10;
    prev10 = prev10vals.reduce((a, b) => a + b, 0) / 10;
    trend = prev10 === 0 ? 0 : ((last10 - prev10) / prev10) * 100;
  }

  return { title: label, total, average, wettest, driest, last10, prev10, trend };
}

export function updateStatsPanel(stats) {
  const panel = document.getElementById("statsPanel");
  if (!panel) return;

  if (!stats || stats.total === 0) {
    panel.innerHTML = "<p>No data available.</p>";
    return;
  }

  const { title, total, average, wettest, driest, trend } = stats;
  let trendHTML = "";
  if (trend !== null) {
    const arrow = trend > 0 ? "up" : "down";
    trendHTML = `<div style="color:${trend > 5 ? '#059669' : trend < -5 ? '#dc2626' : '#64748b'};font-weight:bold;">
      ${Math.abs(trend).toFixed(1)}% ${arrow}</div><small>Last 10 vs previous 10</small>`;
  }

  panel.innerHTML = `
    <h3 style="margin:0 0 12px;color:#0d47a1;">${title}</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px;">
      <div style="background:white;padding:12px;border-radius:8px;text-align:center;border:1px solid #e2e8f0;">
        <div style="font-size:1.8rem;font-weight:700;color:#0d47a1;">${total.toFixed(1)}</div><small>Total (in)</small>
      </div>
      <div style="background:white;padding:12px;border-radius:8px;text-align:center;border:1px solid #e2e8f0;">
        <div style="font-size:1.8rem;font-weight:700;color:#0d47a1;">${average.toFixed(2)}</div><small>Avg/year</small>
      </div>
      <div style="background:white;padding:12px;border-radius:8px;text-align:center;border:1px solid #e2e8f0;">
        <div style="font-size:1.8rem;font-weight:700;color:#059669;">${wettest.toFixed(2)}</div><small>Wettest</small>
      </div>
      <div style="background:white;padding:12px;border-radius:8px;text-align:center;border:1px solid #e2e8f0;">
        <div style="font-size:1.8rem;font-weight:700;color:#dc2626;">${dri Safariest.toFixed(2)}</div><small>Driest</small>
      </div>
      ${trend !== null ? `<div style="background:white;padding:12px;border-radius:8px;text-align:center;border:1px solid #e2e8f0;">${trendHTML}</div>` : ""}
    </div>
  `;
}
