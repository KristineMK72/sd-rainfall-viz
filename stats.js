function calculateStats(dataPoints, mode, label) {
  if (!dataPoints || dataPoints.length === 0) return null;

  const values = dataPoints.map(d => d.y);
  const total = values.reduce((a, b) => a + b, 0);
  const avg = total / values.length;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const maxIdx = values.indexOf(max);
  const minIdx = values.indexOf(min);

  let changePercent = null;
  if (mode === "yearly" && dataPoints.length >= 20) {
    const recent10 = values.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const previous10 = values.slice(-20, -10).reduce((a, b) => a + b, 0) / 10;
    if (previous10 > 0) {
      changePercent = ((recent10 - previous10) / previous10 * 100).toFixed(1);
    }
  }

  // Long-term baseline (1940–1999) vs recent decade
  let longTermTrend = null;
  if (mode === "yearly") {
    const oldValues = dataPoints.filter(d => d.x < "2000").map(d => d.y);
    const oldAvg = oldValues.length
      ? oldValues.reduce((a, b) => a + b, 0) / oldValues.length
      : null;

    if (values.length >= 10) {
      const recentAvg = values.slice(-10).reduce((a, b) => a + b, 0) / 10;
      if (oldAvg && oldAvg > 0) {
        longTermTrend = ((recentAvg - oldAvg) / oldAvg * 100).toFixed(1);
      }
    }
  }

  const period =
    mode === "yearly"
      ? "1940–present · Annual totals"
      : mode === "monthly"
      ? "1940–present · Monthly totals"
      : "Recent years · Daily totals";

  return {
    label,
    total: total.toFixed(1),
    average: avg.toFixed(2),
    wettest: { value: max.toFixed(2), period: dataPoints[maxIdx].x },
    driest: { value: min.toFixed(2), period: dataPoints[minIdx].x },
    changePercent,
    longTermTrend,
    period
  };
}

function updateStatsPanel(stats) {
  const panel = document.getElementById("statsPanel");
  if (!panel) return;

  if (!stats) {
    panel.innerHTML = "<p>No data available.</p>";
    return;
  }

  const avgUnit = stats.period.includes("Annual") ? "in/yr" : "in/mo";

  panel.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <h3>Total rainfall</h3>
        <p class="big">${stats.total} inches</p>
        <small>${stats.period}</small>
      </div>

      <div class="stat-card">
        <h3>Average</h3>
        <p class="big">${stats.average} ${avgUnit}</p>
        <small>Average over all available years</small>
      </div>

      <div class="stat-card highlight">
        <h3>Wettest period</h3>
        <p class="big">${stats.wettest.value} in</p>
        <small>${stats.wettest.period}</small>
      </div>

      <div class="stat-card warning">
        <h3>Driest period</h3>
        <p class="big">${stats.driest.value} in</p>
        <small>${stats.driest.period}</small>
      </div>

      ${
        stats.changePercent !== null
          ? `
      <div class="stat-card ${stats.changePercent > 0 ? "up" : "down"}">
        <h3>Last 10 yrs vs prior 10</h3>
        <p class="big">${
          stats.changePercent > 0 ? "+" : ""
        }${stats.changePercent}%</p>
        <small>Yearly totals trend</small>
      </div>`
          : ""
      }

      ${
        stats.longTermTrend !== null
          ? `
      <div class="stat-card ${stats.longTermTrend > 0 ? "up" : "down"}">
        <h3>Recent decade vs 1940–1999</h3>
        <p class="big">${
          stats.longTermTrend > 0 ? "+" : ""
        }${stats.longTermTrend}%</p>
        <small>Long-term rainfall shift</small>
      </div>`
          : ""
      }
    </div>
  `;
}
