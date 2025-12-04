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
    changePercent = ((recent10 -
