// Simple Safety Credit Score (0-900)
// Inputs: incidents (filtered), unresolved ratio, soft alert ratio, seasonality proxy
// This is a heuristic v1 and can be replaced later with ML or richer analytics.

function weightByRecency(createdAt) {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86400000;
  if (ageDays < 1) return 1.0;
  if (ageDays < 7) return 0.7;
  if (ageDays < 30) return 0.4;
  return 0.2;
}

function computeCredit(db, { regionId = 'default', placeId, days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  // Pull incidents from JSON store; if SQLite is active the caller can pass rows in future
  let rows = db.listIncidentsFiltered({ regionId, sinceISO: since, limit: 5000 });
  if (placeId) rows = rows.filter(r => r.meta && r.meta.placeId === placeId);

  const total = rows.length;
  const unresolved = rows.filter(r => r.status !== 'resolved').length;

  // Severity weights
  const sevW = { high: 3, medium: 2, low: 1 };
  let densityPenalty = 0;
  for (const r of rows) {
    const w = (sevW[r.severity] || 1) * weightByRecency(r.createdAt);
    densityPenalty += w * 2; // tune
  }
  densityPenalty = Math.min(500, densityPenalty);

  const unresolvedPenalty = Math.min(250, (unresolved / Math.max(1, total)) * 250);

  const softAlerts = rows.filter(r => r.type === 'status' || r.type === 'safe' || r.type === 'low_battery').length;
  const softRatio = softAlerts / Math.max(1, total);
  const softPenalty = Math.min(100, softRatio * 100);

  // Simple seasonality proxy: nights riskier?
  const nightCount = rows.filter(r => {
    const h = new Date(r.createdAt).getHours();
    return h < 6 || h >= 22;
  }).length;
  const nightRatio = nightCount / Math.max(1, total);
  const seasonPenalty = Math.min(50, nightRatio * 50);

  const base = 900;
  const score = Math.max(0, Math.round(base - densityPenalty - unresolvedPenalty - softPenalty - seasonPenalty));

  return {
    ok: true,
    score,
    components: {
      densityPenalty: Math.round(densityPenalty),
      unresolvedPenalty: Math.round(unresolvedPenalty),
      softPenalty: Math.round(softPenalty),
      seasonPenalty: Math.round(seasonPenalty),
    },
    inputs: { regionId, placeId: placeId || null, days, total, unresolved, softAlerts, nightCount },
  };
}

module.exports = { computeCredit };
