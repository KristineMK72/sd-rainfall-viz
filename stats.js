// ======================================================
// STATISTICS ENGINE – South Dakota Rainfall Explorer
// ======================================================

/**
 * Calculates comprehensive statistics from an array of time-series data points.
 * @param {Array<{x: string|number, y: number}>} dataPoints - Array of {time, value} objects.
 * @param {string} [mode="yearly"] - The aggregation level (e.g., "yearly", "monthly").
 * @param {string} [label="Rainfall"] - Descriptive label for the data set.
 * @returns {object} An object containing key statistics like total, average, trends, etc.
 */
export function calculateStats(
    dataPoints = [], 
    mode = "yearly", 
    label = "Rainfall"
) {
    // --- 1. Guard Clause and Initialization ---
    if (!Array.isArray(dataPoints) || dataPoints.length === 0) {
        return {
            title: label,
            total: 0,
            average: 0,
            wettest: null,
            driest: null,
        };
    }

    // --- 2. Data Preparation and Aggregation ---
    const values = dataPoints.map(point => point.y).filter(y => y !== null && y !== undefined);
    
    const total = values.reduce((sum, current) => sum + current, 0);
    const count = values.length;
    const average = count > 0 ? total / count : 0;
    
    // Find min/max data points (ensures we get the time/date as well)
    let wettest = dataPoints[0];
    let driest = dataPoints[0];

    for (const point of dataPoints) {
        if (point.y > wettest.y) {
            wettest = point;
        }
        if (point.y < driest.y) {
            driest = point;
        }
    }

    // --- 3. Return Final Statistics Object ---
    return {
        title: label,
        dataPointsCount: count,
        total: parseFloat(total.toFixed(2)),
        average: parseFloat(average.toFixed(2)),
        wettest: wettest,
        driest: driest,
    };
}


// ======================================================
// PANEL UPDATE FUNCTION (REQUIRED FIX FOR THE ERROR)
// ======================================================

/**
 * Updates the HTML elements on the dashboard with the calculated statistics.
 * **NOTE: THIS FUNCTION MUST BE EXPORTED to fix the Uncaught SyntaxError**
 * @param {object} stats - The statistics object returned by calculateStats.
 * @param {string} elementId - The base ID of the container element (e.g., 'stats-panel').
 */
export function updateStatsPanel(stats, elementId) {
    // A placeholder for the actual UI update logic
    
    // Example: Update the total rainfall display
    const totalElement = document.getElementById(`${elementId}-total`);
    if (totalElement) {
        totalElement.textContent = `${stats.total} in.`;
    }
    
    // Example: Log to console to verify data flow
    console.log("Stats successfully calculated and ready for display:", stats);
}

// --- END OF FILE ---
