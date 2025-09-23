// Simple safety score service (v1).
// Computes a score out of 900 based on recent incident count per region.

function computeScore(db, { regionId = 'default', days = 30 } = {}) {
  try {
    const windowMs = days * 24 * 60 * 60 * 1000;
    const sinceISO = new Date(Date.now() - windowMs).toISOString();
    const rows = db.listIncidentsFiltered({ regionId, sinceISO, limit: 5000 });
    const count = rows.length;
    const penalty = Math.min(900, count * 3);
    const score = Math.max(0, 900 - penalty);
    return {
      regionId,
      days,
      score,
      inputs: { incidentCount: count, penaltyPerIncident: 3 },
      computedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error('Failed to compute safety score:', e);
    return { regionId, days, score: 0, inputs: {}, computedAt: new Date().toISOString() };
  }
}

module.exports = { computeScore };
