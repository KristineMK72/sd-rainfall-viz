// ======================================================
// STATISTICS ENGINE – South Dakota Rainfall Explorer
// ======================================================

/**
 * Calculate statistics from an array of data points
 * @param {Array<{x: string|number, y: number}>} dataPoints
 * @param {"daily"|"monthly"|"yearly"} mode
 * @param {string} label - e.g., "Sioux Falls", "South Dakota Average", etc.
 */
function calculateStats(dataPoints = [], mode = "yearly", label = "Rainfall") {
  // Guard clause: no data
  if (!Array.isArray(dataPoints) || dataPoints.length === 0) {
    return {
      title: label,
      total: 0,
      average: 0,
      wettest: null,
      driest: null,
      last10: null,
      prev10: null,
      trend: null,
    };
  }

  // Extract rainfall values
  const values = dataPoints.map(d => d.y).filter(v => typeof v === "number" && !isNaN(v));
  if (values.length === 0) return { title: label, total: 0, average: 0, wettest: null, driest: null, last10: null, prev10: null, trend: null };

  const total = values.reduce((a, b) => a + b, 0);
  const average = total / values.length;
  const wettest = Math.max(...values);
  const driest = Math.min(...values);

  // Only calculate trend for monthly/yearly data with enough points
  let last10 = null;
  let prev10 = null;
  let trend = null;

  if (mode !== "daily" && values.length >= 20) {
    const last10vals = values.slice(-10);
    const prev10vals = values.slice(-20, -10);

    last10 = last10vals.reduce((a, b) => a + b, 0) / 10;
    prev10 = prev10vals.reduce((a, b) => a + b, 0) / 10;

    // Avoid division by zero
    trend = prev10 === 0 ? 0 : ((last10 - prev10) / prev10) * 100;
  }

  return {
    title: label,
    total,
    average,
    wettest,
    driest,
    last10,
    prev10,
    trend,
  };
}

// ======================================================
// RENDER STATS PANEL
// ======================================================
function updateStatsPanel(stats) {
  const panel = document.getElementById("statsPanel");
  if (!panel) {
    console.warn("statsPanel element not found!");
    return;
  }

  if (!stats || stats.total === 0 && stats.average === 0) {
    panel.innerHTML = "<p style='color:#666; text-align:center; padding:20px;'>No data available.</p>";
    return;
  }

  const { title, total, average, wettest, driest, trend } = stats;

  // Determine trend arrow and color
  let trendHTML = "";
  let trendClass = "neutral";

  if (trend !== null) {
    if (trend > 5) trendClass = "up";
    else if (trend < -5) trendClass = "down";

    const arrow = trend > 0 ? "↑" : "↓";
    trendHTML = `
      <div class="stat-card ${trendClass}">
        <div class="big">${Math.abs(trend).toFixed(1)}% ${arrow}</div>
        <small>Last 10 vs previous 10 ${getModeLabel()}</small>
      </div>
    `;
  }

  panel.innerHTML = `
    <h3 style="margin:0 0 12px; color:#0d47a1; font-weight:600;">
      ${title}
    </h3>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="big">${total.toFixed(1)}</div>
        <small>Total rainfall (in)</small>
      </div>
      <div class="stat-card">
        <div class="big">${average.toFixed(2)}</div>
        <small>Average per ${getModeLabel()}</small>
      </div>
      <div class="stat-card highlight">
        <div class="big">${wettest.toFixed(2)}</div>
        <small>Wettest ${getModeLabel()}</small>
      </div>
      <div class="stat-card warning">
        <div class="big">${driest.toFixed(2)}</div>
        <small>Driest ${getModeLabel()}</small>
      </div>
      ${trendHTML}
    </div>
  `;
}

// Helper: get current time scale label
function getModeLabel() {
  const select = document.getElementById("timeScale");
  const mode = select?.value || "year";
  return mode === "yearly" ? "year" : mode === "monthly" ? "month" : "day";
}

// Optional: auto-export if using modules (safe for both <script> and import)
// (Vite will handle this correctly either way)
if (typeof module !== "undefined" && module.exports) {
  module.exports = { calculateStats, updateStatsPanel };
}
