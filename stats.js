function calculateStats(dataPoints, mode, city) {
  if (dataPoints.length === 0) return null;

  const values = dataPoints.map(d => d.y);
  // Note: We don't need 'years' here unless we use it later
  // const years = dataPoints.map(d => d.x.slice(0,4)); 
  
  const total = values.reduce((a,b) => a + b, 0);
  const avg = total / values.length;

  // Wettest / Driest
  const max = Math.max(...values);
  const min = Math.min(...values);
  const maxIdx = values.indexOf(max);
  const minIdx = values.indexOf(min);

  // % change last vs first (or last decade vs previous)
  let changePercent = null;
  if (mode === "yearly" && dataPoints.length >= 20) {
    const recent10 = values.slice(-10).reduce((a,b) => a+b, 0) / 10;
    const previous10 = values.slice(-20, -10).reduce((a,b) => a+b, 0) / 10;
    // Check to prevent division by zero
    if (previous10 > 0) {
      changePercent = ((recent10 - previous10) / previous10 * 100).toFixed(1);
    }
  }

  // 20th century baseline (1940–1999) vs current decade
  let longTermTrend = null;
  if (mode === "yearly") {
    // FIX: Filter data points to get values before 2000
    const oldValues = dataPoints.filter(d => d.x < "2000").map(d => d.y); 
    // FIX: Use a new variable for the average value
    const oldAvgValue = oldValues.length ? oldValues.reduce((a,b)=>a+b)/oldValues.length : null;
    
    // Calculate recent average (last 10 years)
    const recentAvg = values.slice(-10).reduce((a,b)=>a+b,0)/10;
    
    if (oldAvgValue && oldAvgValue > 0) {
      longTermTrend = ((recentAvg - oldAvgValue) / oldAvgValue * 100).toFixed(1);
    }
  }

  return {
    total: total.toFixed(1),
    average: avg.toFixed(2),
    wettest: { value: max.toFixed(2), year: dataPoints[maxIdx].x },
    driest:  { value: min.toFixed(2), year: dataPoints[minIdx].x },
    changePercent,
    longTermTrend,
    // FIX: Corrected the period string
    period: mode === "yearly" ? "1940–2024 : Annual" : mode === "monthly" ? "1940–2024 : Monthly" : "2023–2025 : Daily"
  };
}

function updateStatsPanel(stats) {
  const panel = document.getElementById("statsPanel");
  if (!stats) {
    panel.innerHTML = "<p>No data</p>";
    return;
  }
  
  // Determine if the average unit should be in/yr or in/mo
  const avgUnit = stats.period.includes("Annual") ? "in/yr" : "in/mo";

  panel.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <h3>Total Rainfall</h3>
        <p class="big">${stats.total} inches</p>
        <small>${stats.period}</small>
      </div>
      <div class="stat-card">
        <h3>Average</h3>
        <p class="big">${stats.average} ${avgUnit}</p>
        <small>Average over the period</small>
      </div>
      <div class="stat-card highlight">
        <h3>Wettest Period</h3>
        <p class="big">${stats.wettest.value} in</p>
        <small>${stats.wettest.year}</small>
      </div>
      <div class="stat-card warning">
        <h3>Driest Period</h3>
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
        <h3>2020s vs 1940-1999 Avg</h3>
        <p class="big">${stats.longTermTrend > 0 ? '+' : ''}${stats.longTermTrend}%</p>
      </div>` : ''}
    </div>
  `;
}
