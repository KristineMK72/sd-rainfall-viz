// ======================================================
// STATISTICS ENGINE – South Dakota Rainfall Explorer
// ======================================================

/**
 * Calculates comprehensive statistics from an array of time-series data points.
 * * @param {Array<{x: string|number, y: number}>} dataPoints - Array of {time, value} objects.
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
            wettest: null, // Holds the data point object
            driest: null, // Holds the data point object
            // Add more default properties if needed by your front end
        };
    }

    // --- 2. Data Preparation ---
    // Extract only the numeric values (rainfall amounts)
    const values = dataPoints.map(point => point.y).filter(y => y !== null && y !== undefined);
    
    // Calculate basic aggregate stats
    const total = values.reduce((sum, current) => sum + current, 0);
    const count = values.length;
    const average = count > 0 ? total / count : 0;
    
    // Find min/max data points
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
        total: parseFloat(total.toFixed(2)), // Format to two decimal places
        average: parseFloat(average.toFixed(2)),
        wettest: wettest,
        driest: driest,
        // (You would add functions here to calculate trends,
        // moving averages, etc., based on the 'mode' variable.)
    };
}
