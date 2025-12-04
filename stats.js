function calculateStats(dataPoints, mode, city) {
  if (dataPoints.length === 0) return null;

  const values = dataPoints.map(d => d.y);
  const years = dataPoints.map(d => d.x.slice(0,4));
  
  const total = values.reduce((a,b) => a + b, 0);
  const avg = total / values.length;

  // Wettest / Driest
  const max = Math.max(...values);
  const min = Math.min(...values);
  const maxIdx = values.indexOf(max);
  const minIdx = values.indexOf(min);

  // % change last vs first (or last decade vs previous)
  let changePercent = null;
  if (mode === "yearly" && dataPoints.length > 10) {
    const recent10 = values.slice(-10).reduce((a,b) => a+b, 0) / 10;
    const previous10 = values.slice(-20, -10).reduce((a,b) => a+b, 0) / 10;
    changePercent = ((recent10 - previous10) / previous10 * 100).toFixed(1);
  }

  // 20th century baseline (1940–1999) vs current decade
  let longTermTrend = null;
  if (mode === "yearly") {
    const oldAvg = dataPoints.filter(d => d.x < "2000").map(d => d.y);
    oldAvg = oldAvg.length ? oldAvg.reduce((a,b)=>a+b)/oldAvg.length : null;
    recentAvg = values.slice(-10).reduce((a,b)=>a+b,0)/10;
    if (oldAvg) {
      longTermTrend = ((recentAvg - oldAvg) / oldAvg * 100).toFixed(1);
    }
  }

  return {
    total: total.toFixed(1),
    average: avg.toFixed(2),
    wettest: { value: max.toFixed(2), year: dataPoints[maxIdx].x },
    driest:  { value: min.toFixed(2), year: dataPoints[minIdx].x },
    changePercent,
    longTermTrend,
    period: mode === "yearly" ? "1940–2024" : Annual" : mode === "monthly" ? "1940–2024 : Monthly" : "2023–2025 : Daily"
  };
}

function updateStatsPanel(stats) {
  const panel = document.getElementById("statsPanel");
  if (!stats) {
    panel.innerHTML = "<p>No data";
    return;
  }

  panel.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <h3>Total Rainfall</h3>
        <p class="big">${stats.total} inches</p>
        <small>${stats.period}</small>
      </div>
      <div class="stat-card">
        <h3>Average</h3>
        <p class="big">${stats.average} ${stats.mode === "yearly" ? "in/yr" : "in/mo"}</p>
      </div>
      <div class="stat-card highlight">
        <h3>Wettest</h3>
        <p class="big">${stats.wettest.value} in</p>
        <small>${stats.wettest.year}</small>
      </div>
      <div class="stat-card warning">
        <h3>Driest</h3>
        <p class="big">${stats.driest.value} in</p>
        <small>${stats.driest.year}</small>
      </div>
      ${stats.changePercent !== null ? `
      <div class="stat-card ${stats.changePercent > 0 ? 'up' : 'down'}">
        <h3>Last 10 yrs vs Prev 10</h3>
        <p class="big">${stats.changePercent > 0 ? '+' : ''}${stats.changePercent}%</p>
      </div>` : ''}
      ${stats.longTermTrend !== null ? `
      <div class="stat-card ${stats.longTermTrend > 0 ? 'up' : 'down'}">
        <h3>2020s vs 1900s Avg</h3>
        <p class="big">${stats.longTermTrend > 0 ? '+' : ''}${stats.longTermTrend}%</p>
      </div>` : ''}
    </div>
  `;
}
