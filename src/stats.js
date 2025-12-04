// ======================================================
// STATISTICS ENGINE
// ======================================================

// Compute stats from chart data
function calculateStats(dataPoints, mode, label) {
  if (!dataPoints || dataPoints.length === 0) {
    return {
      title: label,
      total: 0,
      average: 0,
      wettest: null,
      driest: null,
      last10: null,
      prev10: null,
      trend: null
    };
  }

  // Extract numeric values
  const values = dataPoints.map(d => d.y);

  // Total
  const total = values.reduce((a, b) => a + b, 0);

  // Average
  const average = total / values.length;

  // Wettest / driest
  const wettest = Math.max(...values);
  const driest = Math.min(...values);

  // Last 10 vs previous 10 (only for yearly/monthly)
  let last10 = null;
  let prev10 = null;
  let trend = null;

  if (mode !== "daily" && values.length >= 20) {
    const last10vals = values.slice(-10);
    const prev10vals = values.slice(-20, -10);

    last10 = last10vals.reduce((a, b) => a + b, 0) / 10;
    prev10 = prev10vals.reduce((a, b) => a + b, 0) / 10;

    trend = ((last10 - prev10) / prev10) * 100;
  }

  return {
    title: label,
    total,
    average,
    wettest,
    driest,
    last10,
    prev10,
    trend
  };
}

// ======================================================
// RENDER STATS PANEL
// ======================================================

function updateStatsPanel(stats) {
  const panel = document.getElementById("statsPanel");

  if (!stats) {
    panel.innerHTML = "<p>No data available.</p>";
    return;
  }

  const {
    title,
    total,
    average,
    wettest,
    driest,
    last10,
    prev10,
    trend
  } = stats;

  // Trend card class
  let trendClass = "";
  if (trend != null) {
    if (trend > 5) trendClass = "up";
    else if (trend < -5) trendClass = "down";
  }

  panel.innerHTML = `
    <h3 style="margin:0 0 10px; color:#0d47a1; font-size:1.1rem;">
      ${title}
    </h3>

    <div class="stat-grid">

      <div class="stat-card">
        <div class="big">${total.toFixed(1)}</div>
        <small>Total rainfall (inches)</small>
      </div>

      <div class="stat-card">
        <div class="big">${average.toFixed(2)}</div>
        <small>Average (${statsModeLabel()})</small>
      </div>

      <div class="stat-card highlight">
        <div class="big">${wettest?.toFixed(2)}</div>
        <small>Wettest ${statsModeLabel()}</small>
      </div>

      <div class="stat-card warning">
        <div class="big">${driest?.toFixed(2)}</div>
        <small>Driest ${statsModeLabel()}</small>
      </div>

      ${
        trend != null
          ? `
        <div class="stat-card ${trendClass}">
          <div class="big">${trend.toFixed(1)}%</div>
          <small>Last 10 vs previous 10</small>
        </div>
      `
          : ""
      }

    </div>
  `;
}

// Helper: label for stats depending on time scale
function statsModeLabel() {
  const mode = document.getElementById("timeScale").value;
  if (mode === "yearly") return "year";
  if (mode === "monthly") return "month";
  return "day";
}
