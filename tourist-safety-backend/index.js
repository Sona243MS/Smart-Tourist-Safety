const express = require('express');
const { randomUUID } = require('crypto');
require('dotenv').config();
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./db');
const safetyScoreSvc = require('./services/safetyScore');
const safetyCreditSvc = require('./services/safetyCredit');
const jwtUtil = require('./utils/jwt');
const didRegistry = require('./services/didRegistry');
const enhancedDID = require('./services/enhancedDid');
const touristSafetyScore = require('./services/touristSafetyScore');
const notificationService = require('./services/notificationService');
const realTimeTracking = require('./services/realTimeTracking');
const anomalyDetection = require('./services/anomalyDetection');
const entryPointIntegration = require('./services/entryPointIntegration');
const policeDashboard = require('./services/policeDashboard');
const multilingualService = require('./services/multilingualService');
const dataPrivacySecurity = require('./services/dataPrivacySecurity');
const iotIntegration = require('./services/iotIntegration');
const useSqlite = process.env.USE_SQLITE === '1';
let sqlite = null;
if (useSqlite) {
  sqlite = require('./db/sqlite').init(process.env.SQLITE_DB_PATH || './data/tourist-safety.db');
}
const app = express();
const port = process.env.PORT || 3000;

// Restrictive CORS: allow only configured frontends (comma-separated)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow non-browser clients (no Origin header) and localhost during development
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) return callback(null, true); // fallback: allow all if not configured
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS not allowed for origin: ' + origin));
  },
  credentials: false,
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

// Initialize database
db.init();

// A simple in-memory store for events, which you'll replace with a database later
const events = [];
// In-memory store for location-only panic alerts consumed by the dashboard
const locationAlerts = [];
// Track SSE clients for live updates
const sseClients = new Set();
// In-memory latest GPS pings keyed by touristId or deviceId
const lastLocations = new Map();
// In-memory GPS history keyed by touristId/deviceId -> [{lat,lng,at}]
const gpsHistory = new Map();
// Track last known geofence per key to detect enter/exit
const lastFenceByKey = new Map();

// Simple point-in-polygon (ray casting) for [lat, lng] vs polygon [[lat,lng], ...]
function pointInPolygon(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  const [x, y] = [point[1], point[0]]; // treat lng as x, lat as y
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][1], yi = polygon[i][0];
    const xj = polygon[j][1], yj = polygon[j][0];
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

app.get('/', (req, res) => {
  res.send('Tourist Safety Backend is running!');
});

// List DID anchors (optionally filter by didId)
app.get('/did/anchors', (req, res) => {
  try {
    const didId = req.query.didId || undefined;
    const anchors = didRegistry.listAnchors({ didId });
    res.json({ ok: true, anchors });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to list anchors' });
  }
});

// Regions list with metadata + contacts
app.get('/regions', (req, res) => {
  try {
    const regions = db.listRegions();
    res.json({ ok: true, regions });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to list regions' });
  }
});

// Batch BLE events ingestion
app.post('/events/ble', (req, res) => {
  try {
    const { deviceId = null, touristId = null, events = [] } = req.body || {};
    if (!Array.isArray(events)) return res.status(400).json({ ok: false, error: 'events array required' });
    const batch = events.map(e => ({
      id: e.id || randomUUID(),
      deviceId: e.deviceId ?? deviceId ?? null,
      touristId: e.touristId ?? touristId ?? null,
      type: e.type || 'ble',
      payload: e.payload || {},
      createdAt: e.createdAt,
    }));
    if (useSqlite) {
      const count = require('./db/sqlite').addEventsBatch(sqlite, batch);
      res.json({ ok: true, count });
    } else {
      const saved = db.addEventsBatch(batch);
      res.json({ ok: true, count: saved.length });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to ingest events' });
  }
});

// Offline sync endpoint (generic batch)
app.post('/sync/offline', (req, res) => {
  try {
    const { deviceId = null, batch = [] } = req.body || {};
    if (!Array.isArray(batch)) return res.status(400).json({ ok: false, error: 'batch array required' });
    const norm = batch.map(e => ({
      id: e.id || randomUUID(),
      deviceId: e.deviceId ?? deviceId ?? null,
      touristId: e.touristId ?? null,
      type: e.type || 'offline',
      payload: e.payload || {},
      createdAt: e.createdAt,
    }));
    if (useSqlite) {
      const count = require('./db/sqlite').addEventsBatch(sqlite, norm);
      res.json({ ok: true, count });
    } else {
      const saved = db.addEventsBatch(norm);
      res.json({ ok: true, count: saved.length });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to sync offline batch' });
  }
});

// DB mode endpoint (dev helper)
app.get('/db-mode', (req, res) => {
  res.json({ ok: true, mode: useSqlite ? 'sqlite' : 'json' });
});

// Dev: list recent events
app.get('/events', (req, res) => {
  try {
    const limit = Number.parseInt(req.query.limit || '200', 10);
    if (useSqlite) {
      const rows = require('./db/sqlite').listEvents(sqlite, { limit });
      return res.json({ ok: true, events: rows });
    }
    const rows = db.listEvents({ limit });
    res.json({ ok: true, events: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to list events' });
  }
});

// Soft status alerts (e.g., low_battery, safe)
app.post('/soft-alert', (req, res) => {
  try {
    const { latitude, longitude, touristId = null, deviceId = null, type } = req.body || {};
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ ok: false, error: 'latitude and longitude required' });
    }
    const softType = (type === 'low_battery' || type === 'safe') ? type : 'status';
    // tag geofence/region
    const fences = db.listGeofences();
    let match = null;
    for (const f of fences) {
      if (Array.isArray(f.polygon) && pointInPolygon([latitude, longitude], f.polygon)) {
        match = f;
        break;
      }
    }
    const incidentPayload = {
      touristId,
      deviceId,
      latitude,
      longitude,
      type: 'panic',
      severity: 'high',
      status: 'open',
      regionId: match?.regionId || 'default',
      meta: match ? { geofenceId: match.id, riskLevel: match.riskLevel } : {},
    };
    const incident = db.createIncident(incidentPayload);
    if (useSqlite) {
      // Mirror to SQLite for durability
      require('./db/sqlite').createIncident(sqlite, incident);
    }
    const alert = {
      id: incident.id,
      at: incident.createdAt,
      latitude,
      longitude,
      incidentId: incident.id,
      riskLevel: match?.riskLevel || null,
      type: softType,
    };
    const ssePayload = `data: ${JSON.stringify({ type: 'alert', alert })}\n\n`;
    for (const client of sseClients) client.write(ssePayload);
    res.json({ ok: true, alert });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to create soft alert' });
  }
});

// GPS tracking: update latest location (lightweight)
app.post('/gps/update', (req, res) => {
  try {
    const { latitude, longitude, touristId = null, deviceId = null } = req.body || {};
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ ok: false, error: 'latitude and longitude required' });
    }
    const at = new Date().toISOString();
    const key = touristId || deviceId || `anon_${Date.now()}`;
    const row = { touristId, deviceId, latitude, longitude, at };
    lastLocations.set(key, row);
    // Append to bounded history (max 50)
    const prev = gpsHistory.get(key) || [];
    prev.push({ latitude, longitude, at });
    if (prev.length > 50) prev.splice(0, prev.length - 50);
    gpsHistory.set(key, prev);
    // Also store as an event (for dev/debug)
    try { if (useSqlite) require('./db/sqlite').addEventsBatch(sqlite, [{ id: randomUUID(), deviceId, touristId, type: 'gps', payload: row, createdAt: at }]); else db.addEvent({ deviceId, touristId, type: 'gps', payload: row, createdAt: at }); } catch {}
    // Broadcast to SSE clients
    const payload = `data: ${JSON.stringify({ type: 'gps', ping: row })}\n\n`;
    for (const client of sseClients) client.write(payload);

    // Geofence enter/exit detection and alerts
    try {
      const fences = db.listGeofences();
      let match = null;
      for (const f of fences) {
        if (Array.isArray(f.polygon) && pointInPolygon([latitude, longitude], f.polygon)) { match = f; break; }
      }
      const key = touristId || deviceId || 'anon';
      const prevFenceId = lastFenceByKey.get(key) || null;
      const newFenceId = match ? match.id : null;
      if (prevFenceId !== newFenceId) {
        lastFenceByKey.set(key, newFenceId);
        const entering = !!newFenceId;
        const alert = {
          id: randomUUID(),
          at,
          latitude,
          longitude,
          touristId,
          deviceId,
          type: 'geofence',
          action: entering ? 'enter' : 'exit',
          geofenceId: newFenceId || prevFenceId,
          regionId: match?.regionId || undefined,
          riskLevel: match?.riskLevel || undefined,
        };
        // Broadcast SSE geofence alert
        const gfPayload = `data: ${JSON.stringify({ type: 'geofence_alert', alert })}\n\n`;
        for (const client of sseClients) client.write(gfPayload);
        // Persist high-risk entries as incidents and send notifications
        if (entering && (match?.riskLevel === 'red' || match?.riskLevel === 'yellow')) {
          const incident = db.createIncident({
            touristId,
            deviceId,
            type: 'geofence',
            severity: match.riskLevel === 'red' ? 'high' : 'medium',
            status: 'open',
            latitude,
            longitude,
            regionId: match.regionId || 'default',
            meta: { geofenceId: match.id, riskLevel: match.riskLevel, source: 'gps/geofence' },
          });
          if (useSqlite) {
            try { require('./db/sqlite').createIncident(sqlite, incident); } catch {}
          }
          const incPayload = `data: ${JSON.stringify({ type: 'incident_update', incident })}\n\n`;
          for (const client of sseClients) client.write(incPayload);

          // Send geofence alert notifications
          try {
            await notificationService.sendGeofenceAlert({
              touristId,
              deviceId,
              latitude,
              longitude,
              geofenceId: match.id,
              action: 'enter',
              riskLevel: match.riskLevel,
              regionId: match.regionId || 'default'
            });
          } catch (e) {
            console.error('Failed to send geofence notifications:', e);
          }
        }
      }
    } catch {}
    res.json({ ok: true, ping: row });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to update GPS' });
  }
});

// List latest GPS pings
app.get('/gps/last', (_req, res) => {
  try {
    const arr = Array.from(lastLocations.values()).sort((a,b) => new Date(b.at) - new Date(a.at));
    res.json({ ok: true, pings: arr });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to list GPS pings' });
  }
});

// GPS history per device/tourist
app.get('/gps/history', (_req, res) => {
  try {
    const out = {};
    for (const [key, arr] of gpsHistory.entries()) out[key] = arr;
    res.json({ ok: true, history: out });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to list GPS history' });
  }
});

// Incident workflow endpoints
app.post('/incidents/acknowledge', (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });
    const updated = db.updateIncidentStatus(id, 'acknowledged');
    if (useSqlite) require('./db/sqlite').updateIncidentStatus(sqlite, id, 'acknowledged');
    if (!updated) return res.status(404).json({ ok: false, error: 'incident not found' });
    const payload = `data: ${JSON.stringify({ type: 'incident_update', incident: updated })}\n\n`;
    for (const client of sseClients) client.write(payload);
    res.json({ ok: true, incident: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to acknowledge incident' });
  }
});

app.post('/incidents/resolve', (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });
    const updated = db.updateIncidentStatus(id, 'resolved');
    if (useSqlite) require('./db/sqlite').updateIncidentStatus(sqlite, id, 'resolved');
    if (!updated) return res.status(404).json({ ok: false, error: 'incident not found' });
    const payload = `data: ${JSON.stringify({ type: 'incident_update', incident: updated })}\n\n`;
    for (const client of sseClients) client.write(payload);
    res.json({ ok: true, incident: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to resolve incident' });
  }
});

// Geofence APIs
app.get('/geofences', (req, res) => {
  try {
    const fences = db.listGeofences();
    res.json({ ok: true, geofences: fences });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to list geofences' });
  }
});

app.post('/geofences', (req, res) => {
  try {
    const { id, name, polygon, riskLevel = 'yellow', regionId = 'default' } = req.body || {};
    const created = db.upsertGeofence({ id, name, polygon, riskLevel, regionId });
    res.json({ ok: true, geofence: created });
  } catch (e) {
    console.error(e);
    res.status(400).json({ ok: false, error: e.message || 'Invalid geofence' });
  }
});

// Registration and pairing endpoints
app.post('/tourists/register', (req, res) => {
  try {
    const { name, phone, aadhaar } = req.body || {};
    const out = db.registerTourist({ name, phone, aadhaar });
    res.json({ ok: true, touristId: out.id, createdAt: out.createdAt });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to register tourist' });
  }
});

app.post('/devices/pair', (req, res) => {
  try {
    const { touristId, bleAddress } = req.body || {};
    const out = db.pairDevice({ touristId, bleAddress });
    res.json({ ok: true, deviceId: out.id, pairedAt: out.pairedAt });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to pair device' });
  }
});

// List recent incidents
app.get('/incidents', (req, res) => {
  try {
    const limit = Number.parseInt(req.query.limit || '100', 10);
    let rows = db.listIncidents({ limit });
    // Prefer SQLite if enabled
    if (useSqlite) {
      rows = require('./db/sqlite').listIncidents(sqlite, { limit });
    }
    res.json({ ok: true, incidents: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to list incidents' });
  }
});

// Filtered incidents by region and time window (minutes)
app.get('/incidents/filter', (req, res) => {
  try {
    const regionId = req.query.regionId || undefined; // e.g., 'shillong' | 'guwahati' | 'default'
    const minutes = Number.parseInt(req.query.minutes || '0', 10);
    const sinceISO = minutes > 0 ? new Date(Date.now() - minutes * 60000).toISOString() : undefined;
    let rows = db.listIncidentsFiltered({ regionId, sinceISO, limit: 2000 });
    if (useSqlite) {
      rows = require('./db/sqlite').listIncidents(sqlite, { regionId, sinceISO, limit: 2000 });
    }
    res.json({ ok: true, incidents: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to filter incidents' });
  }
});

// CSV export of incidents (optionally filtered by region/minutes)
app.get('/incidents/export', (req, res) => {
  try {
    const regionId = req.query.regionId || undefined;
    const minutes = Number.parseInt(req.query.minutes || '0', 10);
    const sinceISO = minutes > 0 ? new Date(Date.now() - minutes * 60000).toISOString() : undefined;
    const rows = db.listIncidentsFiltered({ regionId, sinceISO, limit: 5000 });
    const headers = ['id','touristId','deviceId','type','severity','status','latitude','longitude','createdAt','resolvedAt','regionId','riskLevel','geofenceId'];
    const csv = [headers.join(',')]
      .concat(rows.map(r => {
        const risk = r.meta && r.meta.riskLevel ? r.meta.riskLevel : '';
        const gid = r.meta && r.meta.geofenceId ? r.meta.geofenceId : '';
        const vals = [
          r.id, r.touristId || '', r.deviceId || '', r.type || '', r.severity || '', r.status || '',
          r.latitude ?? '', r.longitude ?? '', r.createdAt || '', r.resolvedAt || '', r.regionId || '', risk, gid
        ];
        return vals.map(v => typeof v === 'string' && v.includes(',') ? '"' + v.replace(/"/g,'""') + '"' : v).join(',');
      }))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="incidents.csv"');
    res.send(csv);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to export incidents' });
  }
});

// Safety score endpoint (delegates to service)
app.get('/safety-score', (req, res) => {
  try {
    const regionId = req.query.regionId || 'default';
    const days = Number.parseInt(req.query.days || '30', 10);
    const result = safetyScoreSvc.computeScore(db, { regionId, days });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to compute safety score' });
  }
});

// Safety Credit Score (CIBIL-like) for a region/place
app.get('/safety-credit', (req, res) => {
  try {
    const regionId = req.query.regionId || 'default';
    const placeId = req.query.placeId || undefined;
    const days = Number.parseInt(req.query.days || '30', 10);
    const result = safetyCreditSvc.computeCredit(db, { regionId, placeId, days });
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to compute safety credit' });
  }
});

// DID issuance (JWT-based, blockchain-pluggable)
app.post('/did/issue', (req, res) => {
  try {
    const { kycType, kycHash, itinerary, emergencyContacts, validDays = 14 } = req.body || {};
    if (!kycType || !kycHash) return res.status(400).json({ ok: false, error: 'kycType and kycHash required' });
    const didId = randomUUID();
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = nowSec + Math.max(1, Math.min(60, Number(validDays))) * 86400;
    const payload = {
      iss: 'smart-tourist-safety',
      iat: nowSec,
      exp: expSec,
      didId,
      kycType,
      kycHash,
      itinerary: itinerary || null,
      emergencyContacts: emergencyContacts || null,
    };
    const token = jwtUtil.sign(payload);
    // Anchor DID issuance (pluggable registry: local now, chain-ready later)
    const anchorPromise = didRegistry.anchor({ didId, kycHash, expiresAtISO: new Date(expSec * 1000).toISOString() });
    
    // Handle both sync and async anchor responses
    if (anchorPromise && typeof anchorPromise.then === 'function') {
      anchorPromise.then(anchorRec => {
        res.json({ ok: true, didToken: token, didId, expiresAt: new Date(expSec * 1000).toISOString(), anchor: anchorRec });
      }).catch(e => {
        console.error('DID anchoring failed:', e);
        res.json({ ok: true, didToken: token, didId, expiresAt: new Date(expSec * 1000).toISOString(), anchor: null });
      });
    } else {
      res.json({ ok: true, didToken: token, didId, expiresAt: new Date(expSec * 1000).toISOString(), anchor: anchorPromise });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to issue DID token' });
  }
});

app.post('/did/verify', (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ ok: false, error: 'token required' });
    const claims = jwtUtil.verify(token);
    if (!claims) return res.status(401).json({ ok: false, error: 'invalid or expired token' });
    res.json({ ok: true, claims });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to verify token' });
  }
});

// The backend endpoint that your frontend will send data to
app.post('/api/panic', (req, res) => {
  const { deviceId, touristDid, events: eventList, bandMetadata } = req.body;

  if (!deviceId || !touristDid || !eventList || !bandMetadata) {
    return res.status(400).json({ ok: false, error: 'Missing required fields' });
  }

  // Log the received data for debugging
  console.log('Received Panic Alert:', {
    deviceId,
    touristDid,
    events: eventList,
    bandMetadata,
  });

  // Here you would process the data, for example, save it to a database
  events.push({
    timestamp: new Date().toISOString(),
    deviceId,
    touristDid,
    eventList,
    bandMetadata,
  });

  res.status(200).json({ ok: true, message: 'Alert received successfully' });
});

// Lightweight endpoint used by the mobile web app to send panic alerts with location only
app.post('/panic-alert', (req, res) => {
  const { latitude, longitude, touristId = null, deviceId = null } = req.body || {};

  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    Number.isNaN(latitude) ||
    Number.isNaN(longitude)
  ) {
    return res.status(400).json({ ok: false, error: 'latitude and longitude are required numbers' });
  }

  // Log the received coordinates for observability
  const at = new Date().toISOString();
  console.log('Received Panic Alert (coords):', { latitude, longitude, at });

  // Store for dashboard consumption
  const alert = { id: `${Date.now()}_${Math.random().toString(36).slice(2,8)}`, latitude, longitude, at };
  // Tag geofence/region if applicable
  try {
    const fences = db.listGeofences();
    const match = (fences || []).find(f => pointInPolygon([latitude, longitude], f.polygon));
    if (match) {
      alert.regionId = match.regionId || 'default';
      alert.geofenceId = match.id;
      alert.riskLevel = match.riskLevel;
    } else {
      alert.regionId = 'default';
    }
  } catch (e) {
    // ignore tagging errors
  }
  locationAlerts.unshift(alert);
  // keep only latest 100
  if (locationAlerts.length > 100) locationAlerts.length = 100;

  // Persist as an incident
  try {
    const incident = db.createIncident({
      touristId,
      deviceId,
      type: 'panic',
      severity: 'high',
      status: 'open',
      latitude,
      longitude,
      createdAt: at,
      regionId: alert.regionId || 'default',
      meta: { source: 'mobile-app', geofenceId: alert.geofenceId || null, riskLevel: alert.riskLevel || null },
    });
    alert.incidentId = incident.id;
    
    // Mirror to SQLite if enabled
    if (useSqlite) {
      require('./db/sqlite').createIncident(sqlite, incident);
    }
  } catch (e) {
    console.error('Failed to persist incident:', e);
  }

  // Send emergency notifications
  let notificationResult = null;
  try {
    notificationResult = await notificationService.sendPanicAlert({
      touristId,
      deviceId,
      latitude,
      longitude,
      regionId: alert.regionId || 'default',
      severity: 'high',
      additionalInfo: {
        source: 'mobile-app',
        geofenceId: alert.geofenceId,
        riskLevel: alert.riskLevel
      }
    });
  } catch (e) {
    console.error('Failed to send panic notifications:', e);
  }

  // Broadcast to SSE clients
  const payload = `data: ${JSON.stringify({ type: 'alert', alert })}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }

  return res.status(200).json({ 
    ok: true, 
    message: 'Panic alert received', 
    coords: { latitude, longitude }, 
    alert,
    notifications: notificationResult?.notifications || [],
    nearestPolice: notificationResult?.nearestPolice,
    emergencyContacts: notificationResult?.emergencyContacts
  });
});

// Dashboard can poll this endpoint to get the most recent location alerts
app.get('/panic-alerts', (_req, res) => {
  res.json({ ok: true, count: locationAlerts.length, alerts: locationAlerts });
});

// Server-Sent Events endpoint for live updates
app.get('/panic-alerts/stream', (req, res) => {
  // Explicit CORS for Firebase-hosted dashboards; prefer restricting to allowed origins when provided
  const reqOrigin = req.headers.origin;
  const originAllowed = !reqOrigin || allowedOrigins.length === 0 || allowedOrigins.includes(reqOrigin);
  res.setHeader('Access-Control-Allow-Origin', originAllowed ? (reqOrigin || '*') : '*');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Hint client to retry in case of disconnects
  res.write('retry: 5000\n\n');
  res.flushHeaders && res.flushHeaders();

  // Send a snapshot first
  res.write(`data: ${JSON.stringify({ type: 'snapshot', alerts: locationAlerts })}\n\n`);

  sseClients.add(res);
  // Heartbeat to keep some proxies from closing idle connections
  const hb = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': ping\n\n');
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(hb);
    sseClients.delete(res);
  });
});

// Enhanced DID endpoints
app.get('/enhanced-did/entry-points', (req, res) => {
  try {
    const entryPoints = enhancedDID.listEntryPoints();
    res.json({ ok: true, entryPoints });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to list entry points' });
  }
});

app.post('/enhanced-did/issue', async (req, res) => {
  try {
    const {
      kycType,
      kycNumber,
      entryPointId,
      touristInfo,
      itinerary,
      emergencyContacts,
      validDays,
      issuedBy
    } = req.body || {};

    if (!kycType || !entryPointId) {
      return res.status(400).json({ ok: false, error: 'kycType and entryPointId required' });
    }

    const result = await enhancedDID.issueDID({
      kycType,
      kycNumber,
      entryPointId,
      touristInfo,
      itinerary,
      emergencyContacts,
      validDays,
      issuedBy
    });

    if (result.success) {
      res.json({ ok: true, ...result });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to issue enhanced DID' });
  }
});

app.post('/enhanced-did/verify', (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ ok: false, error: 'token required' });

    const result = enhancedDID.verifyDID(token);
    if (result.valid) {
      res.json({ ok: true, ...result });
    } else {
      res.status(401).json({ ok: false, error: result.error });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to verify enhanced DID' });
  }
});

app.post('/enhanced-did/revoke', (req, res) => {
  try {
    const { didId, reason } = req.body || {};
    if (!didId) return res.status(400).json({ ok: false, error: 'didId required' });

    const success = enhancedDID.revokeDID(didId, reason);
    if (success) {
      res.json({ ok: true, message: 'DID revoked successfully' });
    } else {
      res.status(404).json({ ok: false, error: 'DID not found' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to revoke DID' });
  }
});

app.get('/enhanced-did/stats', (req, res) => {
  try {
    const entryPointId = req.query.entryPointId || null;
    const days = Number.parseInt(req.query.days || '30', 10);
    const stats = enhancedDID.getIssuanceStats(entryPointId, days);
    res.json({ ok: true, stats });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get DID stats' });
  }
});

app.get('/enhanced-did/active', (req, res) => {
  try {
    const activeTokens = enhancedDID.listActiveTokens();
    res.json({ ok: true, tokens: activeTokens });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to list active tokens' });
  }
});

// Tourist-specific Safety Score (auto-assign based on travel patterns and area sensitivity)
app.get('/tourists/safety-score', (req, res) => {
  try {
    const touristId = req.query.touristId || null;
    const hours = Number.parseInt(req.query.hours || '24', 10);
    if (!touristId) return res.status(400).json({ ok: false, error: 'touristId required' });

    // Build GPS history for this tourist from in-memory store
    const gps = gpsHistory.get(touristId) || [];

    // Pull incidents for this tourist within time window
    const sinceISO = new Date(Date.now() - hours * 3600000).toISOString();
    let incidents = db.listIncidentsFiltered({ sinceISO, limit: 5000 });
    incidents = incidents.filter(i => i.touristId === touristId);

    const geofences = db.listGeofences();

    const result = touristSafetyScore.calculateTouristSafetyScore({
      touristId,
      gpsHistory: gps,
      incidents,
      geofences,
      timeWindow: hours,
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to compute tourist safety score' });
  }
});

// Batch: recent tourists with GPS history
app.get('/tourists/safety-score/recent', (req, res) => {
  try {
    const hours = Number.parseInt(req.query.hours || '24', 10);
    const sinceISO = new Date(Date.now() - hours * 3600000).toISOString();
    let incidents = db.listIncidentsFiltered({ sinceISO, limit: 5000 });
    const geofences = db.listGeofences();

    const out = [];
    for (const [key, arr] of gpsHistory.entries()) {
      // Treat only explicit touristId keys (skip anon_ and device-only keys)
      if (!key || key.startsWith('anon_')) continue;
      const gps = arr || [];
      const inc = incidents.filter(i => i.touristId === key);
      const result = touristSafetyScore.calculateTouristSafetyScore({
        touristId: key,
        gpsHistory: gps,
        incidents: inc,
        geofences,
        timeWindow: hours,
      });
      out.push(result);
    }
    res.json({ ok: true, scores: out });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to compute batch tourist safety scores' });
  }
});

// Emergency contacts and police stations endpoints
app.get('/emergency/contacts', (req, res) => {
  try {
    const regionId = req.query.regionId || 'default';
    const contacts = notificationService.getEmergencyContacts(regionId);
    res.json({ ok: true, regionId, contacts });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get emergency contacts' });
  }
});

app.get('/emergency/police-stations', (req, res) => {
  try {
    const regionId = req.query.regionId || 'default';
    const stations = notificationService.getPoliceStations(regionId);
    res.json({ ok: true, regionId, stations });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get police stations' });
  }
});

app.get('/emergency/nearest-police', (req, res) => {
  try {
    const { latitude, longitude, regionId = 'default' } = req.query;
    if (!latitude || !longitude) {
      return res.status(400).json({ ok: false, error: 'latitude and longitude required' });
    }
    
    const nearest = notificationService.findNearestPoliceStation(
      parseFloat(latitude), 
      parseFloat(longitude), 
      regionId
    );
    
    res.json({ ok: true, nearest });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to find nearest police station' });
  }
});

// Real-time Tracking endpoints
app.post('/tracking/start', (req, res) => {
  try {
    const {
      touristId,
      deviceId,
      sessionType,
      authorizedBy,
      duration,
      permissions
    } = req.body || {};

    if (!touristId || !sessionType || !authorizedBy) {
      return res.status(400).json({ ok: false, error: 'touristId, sessionType, and authorizedBy required' });
    }

    const session = realTimeTracking.createTrackingSession({
      touristId,
      deviceId,
      sessionType,
      authorizedBy,
      duration,
      permissions
    });

    res.json({ ok: true, session });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to start tracking session' });
  }
});

app.post('/tracking/update', (req, res) => {
  try {
    const { sessionId, locationData } = req.body || {};
    if (!sessionId || !locationData) {
      return res.status(400).json({ ok: false, error: 'sessionId and locationData required' });
    }

    const result = realTimeTracking.updateLocation(sessionId, locationData);
    if (result.success) {
      res.json({ ok: true, ...result });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to update location' });
  }
});

app.get('/tracking/current/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const location = realTimeTracking.getCurrentLocation(sessionId);
    
    if (location) {
      res.json({ ok: true, location });
    } else {
      res.status(404).json({ ok: false, error: 'Location not found or session inactive' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get current location' });
  }
});

app.get('/tracking/history/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const limit = Number.parseInt(req.query.limit || '100', 10);
    const history = realTimeTracking.getLocationHistory(sessionId, limit);
    
    res.json({ ok: true, history });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get location history' });
  }
});

app.get('/tracking/sessions/:touristId', (req, res) => {
  try {
    const { touristId } = req.params;
    const sessions = realTimeTracking.getActiveSessions(touristId);
    
    res.json({ ok: true, sessions });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get tracking sessions' });
  }
});

app.post('/tracking/stop', (req, res) => {
  try {
    const { sessionId, reason } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'sessionId required' });
    }

    const result = realTimeTracking.stopTrackingSession(sessionId, reason);
    if (result.success) {
      res.json({ ok: true, ...result });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to stop tracking session' });
  }
});

app.get('/tracking/stats/:touristId', (req, res) => {
  try {
    const { touristId } = req.params;
    const stats = realTimeTracking.getTrackingStats(touristId);
    
    res.json({ ok: true, stats });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get tracking stats' });
  }
});

app.post('/tracking/emergency', (req, res) => {
  try {
    const {
      touristId,
      deviceId,
      authorizedBy,
      reason,
      duration
    } = req.body || {};

    if (!touristId || !authorizedBy || !reason) {
      return res.status(400).json({ ok: false, error: 'touristId, authorizedBy, and reason required' });
    }

    const session = realTimeTracking.activateEmergencyTracking({
      touristId,
      deviceId,
      authorizedBy,
      reason,
      duration
    });

    res.json({ ok: true, session });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to activate emergency tracking' });
  }
});

app.get('/tracking/report/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { startTime, endTime } = req.query;
    
    if (!startTime || !endTime) {
      return res.status(400).json({ ok: false, error: 'startTime and endTime required' });
    }

    const report = realTimeTracking.generateTrackingReport(sessionId, startTime, endTime);
    if (report.success) {
      res.json({ ok: true, ...report });
    } else {
      res.status(400).json({ ok: false, error: report.error });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to generate tracking report' });
  }
});

app.get('/tracking/all', (req, res) => {
  try {
    const sessions = realTimeTracking.getAllSessions();
    res.json({ ok: true, sessions });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get all sessions' });
  }
});

// Anomaly Detection endpoints
app.post('/anomaly/analyze', (req, res) => {
  try {
    const {
      touristId,
      gpsHistory = [],
      incidents = [],
      geofences = [],
      timeWindow = 24
    } = req.body || {};

    if (!touristId) {
      return res.status(400).json({ ok: false, error: 'touristId required' });
    }

    const result = anomalyDetection.analyzeBehavior({
      touristId,
      gpsHistory,
      incidents,
      geofences,
      timeWindow
    });

    res.json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to analyze behavior' });
  }
});

app.get('/anomaly/history/:touristId', (req, res) => {
  try {
    const { touristId } = req.params;
    const history = anomalyDetection.getDetectionHistory(touristId);
    
    res.json({ ok: true, history });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get detection history' });
  }
});

app.get('/anomaly/profiles', (req, res) => {
  try {
    const profiles = anomalyDetection.getAllProfiles();
    res.json({ ok: true, profiles });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get profiles' });
  }
});

// Batch anomaly detection for all tourists with GPS history
app.post('/anomaly/batch-analyze', (req, res) => {
  try {
    const { timeWindow = 24 } = req.body || {};
    const results = [];
    
    // Get all tourists with GPS history
    for (const [touristId, gpsHistory] of gpsHistory.entries()) {
      if (gpsHistory && gpsHistory.length > 0) {
        // Get incidents for this tourist
        const sinceISO = new Date(Date.now() - timeWindow * 3600000).toISOString();
        let incidents = db.listIncidentsFiltered({ sinceISO, limit: 5000 });
        incidents = incidents.filter(i => i.touristId === touristId);
        
        const geofences = db.listGeofences();
        
        const result = anomalyDetection.analyzeBehavior({
          touristId,
          gpsHistory,
          incidents,
          geofences,
          timeWindow
        });
        
        results.push(result);
      }
    }
    
    res.json({ ok: true, results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to perform batch analysis' });
  }
});

// Entry Point Integration endpoints
app.get('/entry-points', (req, res) => {
  try {
    const entryPoints = entryPointIntegration.listEntryPoints();
    res.json({ ok: true, entryPoints });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to list entry points' });
  }
});

app.get('/entry-points/:entryPointId', (req, res) => {
  try {
    const { entryPointId } = req.params;
    const entryPoint = entryPointIntegration.getEntryPoint(entryPointId);
    
    if (entryPoint) {
      res.json({ ok: true, entryPoint });
    } else {
      res.status(404).json({ ok: false, error: 'Entry point not found' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get entry point' });
  }
});

app.post('/entry-points/:entryPointId/arrival', async (req, res) => {
  try {
    const { entryPointId } = req.params;
    const { touristData, staffId, arrivalType } = req.body || {};

    if (!touristData || !staffId) {
      return res.status(400).json({ ok: false, error: 'touristData and staffId required' });
    }

    const arrival = await entryPointIntegration.processTouristArrival({
      entryPointId,
      touristData,
      staffId,
      arrivalType
    });

    res.json({ ok: true, arrival });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message || 'Failed to process tourist arrival' });
  }
});

app.get('/entry-points/:entryPointId/stats', (req, res) => {
  try {
    const { entryPointId } = req.params;
    const stats = entryPointIntegration.getEntryPointStats(entryPointId);
    
    if (stats) {
      res.json({ ok: true, stats });
    } else {
      res.status(404).json({ ok: false, error: 'Entry point not found' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get entry point stats' });
  }
});

app.get('/entry-points/stats/all', (req, res) => {
  try {
    const stats = entryPointIntegration.getAllEntryPointStats();
    res.json({ ok: true, stats });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get all entry point stats' });
  }
});

app.get('/entry-points/:entryPointId/staff', (req, res) => {
  try {
    const { entryPointId } = req.params;
    const staff = entryPointIntegration.getEntryPointStaff(entryPointId);
    
    res.json({ ok: true, staff });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get entry point staff' });
  }
});

app.post('/entry-points/:entryPointId/status', (req, res) => {
  try {
    const { entryPointId } = req.params;
    const { isActive, reason } = req.body || {};

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'isActive must be boolean' });
    }

    const success = entryPointIntegration.updateEntryPointStatus(entryPointId, isActive, reason);
    
    if (success) {
      res.json({ ok: true, message: 'Entry point status updated' });
    } else {
      res.status(404).json({ ok: false, error: 'Entry point not found' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to update entry point status' });
  }
});

app.get('/entry-points/:entryPointId/operating-hours', (req, res) => {
  try {
    const { entryPointId } = req.params;
    const hours = entryPointIntegration.getOperatingHours(entryPointId);
    
    if (hours) {
      res.json({ ok: true, hours });
    } else {
      res.status(404).json({ ok: false, error: 'Entry point not found' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get operating hours' });
  }
});

app.get('/entry-points/:entryPointId/is-operating', (req, res) => {
  try {
    const { entryPointId } = req.params;
    const isOperating = entryPointIntegration.isCurrentlyOperating(entryPointId);
    
    res.json({ ok: true, isOperating });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to check operating status' });
  }
});

app.post('/entry-points/:entryPointId/verify-staff', (req, res) => {
  try {
    const { entryPointId } = req.params;
    const { staffId, permission } = req.body || {};

    if (!staffId || !permission) {
      return res.status(400).json({ ok: false, error: 'staffId and permission required' });
    }

    const hasAccess = entryPointIntegration.verifyStaffAccess(entryPointId, staffId, permission);
    
    res.json({ ok: true, hasAccess });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to verify staff access' });
  }
});

// Police Dashboard endpoints
app.get('/police-dashboard/metrics', (req, res) => {
  try {
    const metrics = policeDashboard.getDashboardMetrics();
    res.json({ ok: true, metrics });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get dashboard metrics' });
  }
});

app.get('/police-dashboard/heatmap/:regionId', (req, res) => {
  try {
    const { regionId } = req.params;
    const timeWindow = Number.parseInt(req.query.hours || '24', 10);
    
    // Get incidents for the region
    const sinceISO = new Date(Date.now() - timeWindow * 3600000).toISOString();
    let incidents = db.listIncidentsFiltered({ regionId, sinceISO, limit: 5000 });
    const geofences = db.listGeofences();
    
    const heatMapData = policeDashboard.generateHeatMapData(incidents, geofences, regionId);
    res.json({ ok: true, heatMapData });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to generate heat map data' });
  }
});

app.get('/police-dashboard/clusters/:regionId', (req, res) => {
  try {
    const { regionId } = req.params;
    const clusterData = policeDashboard.generateTouristClusters(gpsHistory, regionId);
    res.json({ ok: true, clusterData });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to generate cluster data' });
  }
});

app.post('/police-dashboard/e-fir', (req, res) => {
  try {
    const {
      touristId,
      deviceId,
      incidentType,
      description,
      location,
      reportedBy,
      priority,
      additionalInfo
    } = req.body || {};

    if (!touristId || !incidentType || !description || !location || !reportedBy) {
      return res.status(400).json({ ok: false, error: 'Required fields missing' });
    }

    const eFir = policeDashboard.generateEFir({
      touristId,
      deviceId,
      incidentType,
      description,
      location,
      reportedBy,
      priority,
      additionalInfo
    });

    res.json({ ok: true, eFir });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to generate E-FIR' });
  }
});

app.get('/police-dashboard/e-fir/:firId', (req, res) => {
  try {
    const { firId } = req.params;
    const eFir = policeDashboard.getEFir(firId);
    
    if (eFir) {
      res.json({ ok: true, eFir });
    } else {
      res.status(404).json({ ok: false, error: 'E-FIR not found' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get E-FIR' });
  }
});

app.get('/police-dashboard/e-fir', (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      priority: req.query.priority,
      jurisdiction: req.query.jurisdiction,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo
    };
    
    const eFirs = policeDashboard.listEFirs(filters);
    res.json({ ok: true, eFirs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to list E-FIRs' });
  }
});

app.put('/police-dashboard/e-fir/:firId/status', (req, res) => {
  try {
    const { firId } = req.params;
    const { status, updates } = req.body || {};

    if (!status) {
      return res.status(400).json({ ok: false, error: 'Status required' });
    }

    const eFir = policeDashboard.updateEFirStatus(firId, status, updates);
    res.json({ ok: true, eFir });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message || 'Failed to update E-FIR status' });
  }
});

app.get('/police-dashboard/tourist/:touristId/records', (req, res) => {
  try {
    const { touristId } = req.params;
    const records = policeDashboard.getTouristDigitalRecords(touristId);
    res.json({ ok: true, records });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get tourist records' });
  }
});

app.get('/police-dashboard/tourist/:touristId/alerts', (req, res) => {
  try {
    const { touristId } = req.params;
    const limit = Number.parseInt(req.query.limit || '50', 10);
    const alerts = policeDashboard.getTouristAlertHistory(touristId, limit);
    res.json({ ok: true, alerts });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get tourist alerts' });
  }
});

app.get('/police-dashboard/tourist/:touristId/location', (req, res) => {
  try {
    const { touristId } = req.params;
    const location = policeDashboard.getTouristLastLocation(touristId);
    res.json({ ok: true, location });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get tourist location' });
  }
});

app.get('/police-dashboard/report', (req, res) => {
  try {
    const regionId = req.query.regionId || 'all';
    const timeWindow = Number.parseInt(req.query.hours || '24', 10);
    const report = policeDashboard.generateDashboardReport(regionId, timeWindow);
    res.json({ ok: true, report });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to generate dashboard report' });
  }
});

// Multilingual Support endpoints
app.get('/multilingual/languages', (req, res) => {
  try {
    const languages = multilingualService.getSupportedLanguages();
    res.json({ ok: true, languages });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get supported languages' });
  }
});

app.get('/multilingual/translate', (req, res) => {
  try {
    const { text, from, to } = req.query;
    
    if (!text || !from || !to) {
      return res.status(400).json({ ok: false, error: 'text, from, and to parameters required' });
    }

    const translated = multilingualService.translateText(text, from, to);
    res.json({ ok: true, original: text, translated, from, to });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to translate text' });
  }
});

app.post('/multilingual/translate', (req, res) => {
  try {
    const { text, from, to } = req.body || {};
    
    if (!text || !from || !to) {
      return res.status(400).json({ ok: false, error: 'text, from, and to required' });
    }

    const translated = multilingualService.translateText(text, from, to);
    res.json({ ok: true, original: text, translated, from, to });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to translate text' });
  }
});

app.get('/multilingual/emergency-phrases/:language', (req, res) => {
  try {
    const { language } = req.params;
    const phrases = multilingualService.getEmergencyPhrases(language);
    res.json({ ok: true, language, phrases });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get emergency phrases' });
  }
});

app.post('/multilingual/voice/process', (req, res) => {
  try {
    const { audioData, language } = req.body || {};
    
    if (!audioData) {
      return res.status(400).json({ ok: false, error: 'audioData required' });
    }

    const result = multilingualService.processVoiceInput(audioData, language);
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to process voice input' });
  }
});

app.post('/multilingual/voice/generate', (req, res) => {
  try {
    const { text, language } = req.body || {};
    
    if (!text) {
      return res.status(400).json({ ok: false, error: 'text required' });
    }

    const response = multilingualService.generateVoiceResponse(text, language);
    res.json({ ok: true, response });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to generate voice response' });
  }
});

app.get('/multilingual/voice/settings/:language', (req, res) => {
  try {
    const { language } = req.params;
    const settings = multilingualService.getVoiceSettings(language);
    
    if (settings) {
      res.json({ ok: true, settings });
    } else {
      res.status(404).json({ ok: false, error: 'Language not supported' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get voice settings' });
  }
});

app.put('/multilingual/voice/settings/:language', (req, res) => {
  try {
    const { language } = req.params;
    const settings = req.body || {};
    
    const success = multilingualService.updateVoiceSettings(language, settings);
    
    if (success) {
      res.json({ ok: true, message: 'Voice settings updated' });
    } else {
      res.status(404).json({ ok: false, error: 'Language not supported' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to update voice settings' });
  }
});

app.post('/multilingual/voice/enable', (req, res) => {
  try {
    const { language, enabled } = req.body || {};
    
    if (typeof language === 'undefined' || typeof enabled !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'language and enabled (boolean) required' });
    }

    const success = multilingualService.setVoiceEnabled(language, enabled);
    
    if (success) {
      res.json({ ok: true, message: `Voice ${enabled ? 'enabled' : 'disabled'} for ${language}` });
    } else {
      res.status(404).json({ ok: false, error: 'Language not supported' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to update voice enabled status' });
  }
});

app.get('/multilingual/emergency-message/:incidentType/:language', (req, res) => {
  try {
    const { incidentType, language } = req.params;
    const message = multilingualService.generateEmergencyMessage(incidentType, language);
    res.json({ ok: true, incidentType, language, message });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to generate emergency message' });
  }
});

app.get('/multilingual/emergency-contacts/:language', (req, res) => {
  try {
    const { language } = req.params;
    const contacts = multilingualService.getEmergencyContactNames(language);
    res.json({ ok: true, language, contacts });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get emergency contact names' });
  }
});

app.get('/multilingual/language-info/:language', (req, res) => {
  try {
    const { language } = req.params;
    const langInfo = multilingualService.getLanguage(language);
    
    if (langInfo) {
      const textDirection = multilingualService.getTextDirection(language);
      const script = multilingualService.getScript(language);
      
      res.json({ 
        ok: true, 
        language: langInfo,
        textDirection,
        script
      });
    } else {
      res.status(404).json({ ok: false, error: 'Language not supported' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get language info' });
  }
});

app.get('/multilingual/statistics', (req, res) => {
  try {
    const stats = multilingualService.getLanguageStatistics();
    res.json({ ok: true, statistics: stats });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get language statistics' });
  }
});

app.post('/multilingual/translation', (req, res) => {
  try {
    const { key, translations } = req.body || {};
    
    if (!key || !translations) {
      return res.status(400).json({ ok: false, error: 'key and translations required' });
    }

    multilingualService.addCustomTranslation(key, translations);
    res.json({ ok: true, message: 'Custom translation added' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to add custom translation' });
  }
});

app.delete('/multilingual/translation/:key', (req, res) => {
  try {
    const { key } = req.params;
    const removed = multilingualService.removeCustomTranslation(key);
    
    if (removed) {
      res.json({ ok: true, message: 'Custom translation removed' });
    } else {
      res.status(404).json({ ok: false, error: 'Translation key not found' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to remove custom translation' });
  }
});

// Data Privacy & Security endpoints
app.post('/privacy/encrypt', (req, res) => {
  try {
    const { data, touristId, dataType } = req.body || {};
    
    if (!data || !touristId) {
      return res.status(400).json({ ok: false, error: 'data and touristId required' });
    }

    const encryptedData = dataPrivacySecurity.encryptData(data, touristId, dataType);
    res.json({ ok: true, encryptedData });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message || 'Failed to encrypt data' });
  }
});

app.post('/privacy/decrypt', (req, res) => {
  try {
    const { encryptedData, touristId } = req.body || {};
    
    if (!encryptedData || !touristId) {
      return res.status(400).json({ ok: false, error: 'encryptedData and touristId required' });
    }

    const decryptedData = dataPrivacySecurity.decryptData(encryptedData, touristId);
    res.json({ ok: true, decryptedData });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message || 'Failed to decrypt data' });
  }
});

app.post('/privacy/consent', (req, res) => {
  try {
    const { touristId, consentData } = req.body || {};
    
    if (!touristId || !consentData) {
      return res.status(400).json({ ok: false, error: 'touristId and consentData required' });
    }

    const consent = dataPrivacySecurity.recordConsent(touristId, consentData);
    res.json({ ok: true, consent });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to record consent' });
  }
});

app.get('/privacy/consent/:touristId', (req, res) => {
  try {
    const { touristId } = req.params;
    const { dataType, purpose } = req.query;
    
    if (dataType && purpose) {
      const hasConsent = dataPrivacySecurity.checkConsent(touristId, dataType, purpose);
      res.json({ ok: true, hasConsent, dataType, purpose });
    } else {
      const consent = dataPrivacySecurity.consentRecords.get(touristId);
      res.json({ ok: true, consent });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to check consent' });
  }
});

app.post('/privacy/anonymize', (req, res) => {
  try {
    const { data, dataType } = req.body || {};
    
    if (!data || !dataType) {
      return res.status(400).json({ ok: false, error: 'data and dataType required' });
    }

    const anonymizedData = dataPrivacySecurity.anonymizeData(data, dataType);
    res.json({ ok: true, anonymizedData });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to anonymize data' });
  }
});

app.get('/privacy/audit-logs', (req, res) => {
  try {
    const filters = {
      eventType: req.query.eventType,
      severity: req.query.severity,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo
    };
    
    const logs = dataPrivacySecurity.getAuditLogs(filters);
    res.json({ ok: true, logs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get audit logs' });
  }
});

app.get('/privacy/retention-policy/:dataType', (req, res) => {
  try {
    const { dataType } = req.params;
    const policy = dataPrivacySecurity.getDataRetentionPolicy(dataType);
    
    if (policy) {
      res.json({ ok: true, policy });
    } else {
      res.status(404).json({ ok: false, error: 'Retention policy not found' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get retention policy' });
  }
});

app.put('/privacy/retention-policy/:dataType', (req, res) => {
  try {
    const { dataType } = req.params;
    const policy = req.body || {};
    
    dataPrivacySecurity.updateDataRetentionPolicy(dataType, policy);
    res.json({ ok: true, message: 'Retention policy updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to update retention policy' });
  }
});

app.get('/privacy/report/:touristId', (req, res) => {
  try {
    const { touristId } = req.params;
    const report = dataPrivacySecurity.generatePrivacyReport(touristId);
    res.json({ ok: true, report });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to generate privacy report' });
  }
});

app.get('/privacy/gdpr-compliance/:touristId', (req, res) => {
  try {
    const { touristId } = req.params;
    const compliance = dataPrivacySecurity.checkGDPRCompliance(touristId);
    res.json({ ok: true, compliance });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to check GDPR compliance' });
  }
});

app.get('/privacy/export/:touristId', (req, res) => {
  try {
    const { touristId } = req.params;
    const exportData = dataPrivacySecurity.exportUserData(touristId);
    res.json({ ok: true, exportData });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to export user data' });
  }
});

app.delete('/privacy/delete/:touristId', (req, res) => {
  try {
    const { touristId } = req.params;
    const deleted = dataPrivacySecurity.deleteUserData(touristId);
    res.json({ ok: true, deleted });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to delete user data' });
  }
});

app.post('/privacy/blockchain/hash', (req, res) => {
  try {
    const { data } = req.body || {};
    
    if (!data) {
      return res.status(400).json({ ok: false, error: 'data required' });
    }

    const hash = dataPrivacySecurity.hashDataForBlockchain(data);
    res.json({ ok: true, hash, recordId: data.id || data.touristId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to generate blockchain hash' });
  }
});

app.get('/privacy/blockchain/verify/:recordId', (req, res) => {
  try {
    const { recordId } = req.params;
    const { expectedHash } = req.query;
    
    if (!expectedHash) {
      return res.status(400).json({ ok: false, error: 'expectedHash required' });
    }

    const isValid = dataPrivacySecurity.verifyBlockchainIntegrity(recordId, expectedHash);
    res.json({ ok: true, isValid, recordId, expectedHash });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to verify blockchain integrity' });
  }
});

app.get('/privacy/blockchain/hashes', (req, res) => {
  try {
    const hashes = dataPrivacySecurity.getAllBlockchainHashes();
    res.json({ ok: true, hashes });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get blockchain hashes' });
  }
});

app.get('/privacy/security-report', (req, res) => {
  try {
    const report = dataPrivacySecurity.generateSecurityReport();
    res.json({ ok: true, report });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to generate security report' });
  }
});

app.post('/privacy/cleanup/:dataType', (req, res) => {
  try {
    const { dataType } = req.params;
    const result = dataPrivacySecurity.deleteDataByRetentionPolicy(dataType);
    res.json({ ok: true, result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to cleanup data' });
  }
});

// IoT Integration endpoints
app.get('/iot/device-types', (req, res) => {
  try {
    const deviceTypes = iotIntegration.getDeviceTypes();
    res.json({ ok: true, deviceTypes });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get device types' });
  }
});

app.get('/iot/communication-protocols', (req, res) => {
  try {
    const protocols = iotIntegration.getCommunicationProtocols();
    res.json({ ok: true, protocols });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get communication protocols' });
  }
});

app.post('/iot/qr-code/generate', (req, res) => {
  try {
    const { deviceType, touristId, additionalData } = req.body || {};
    
    if (!deviceType || !touristId) {
      return res.status(400).json({ ok: false, error: 'deviceType and touristId required' });
    }

    const qrResult = iotIntegration.generateQRCode(deviceType, touristId, additionalData);
    res.json({ ok: true, ...qrResult });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to generate QR code' });
  }
});

app.post('/iot/device/register', (req, res) => {
  try {
    const { qrCode, deviceInfo } = req.body || {};
    
    if (!qrCode || !deviceInfo) {
      return res.status(400).json({ ok: false, error: 'qrCode and deviceInfo required' });
    }

    const device = iotIntegration.registerDevice(qrCode, deviceInfo);
    res.json({ ok: true, device });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message || 'Failed to register device' });
  }
});

app.post('/iot/sensor-data', (req, res) => {
  try {
    const { deviceId, sensorData } = req.body || {};
    
    if (!deviceId || !sensorData) {
      return res.status(400).json({ ok: false, error: 'deviceId and sensorData required' });
    }

    const processedData = iotIntegration.processSensorData(deviceId, sensorData);
    res.json({ ok: true, processedData });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message || 'Failed to process sensor data' });
  }
});

app.get('/iot/device/:deviceId/status', (req, res) => {
  try {
    const { deviceId } = req.params;
    const status = iotIntegration.getDeviceStatus(deviceId);
    
    if (status) {
      res.json({ ok: true, status });
    } else {
      res.status(404).json({ ok: false, error: 'Device not found' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get device status' });
  }
});

app.get('/iot/tourist/:touristId/devices', (req, res) => {
  try {
    const { touristId } = req.params;
    const devices = iotIntegration.getTouristDevices(touristId);
    res.json({ ok: true, devices });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get tourist devices' });
  }
});

app.get('/iot/device/:deviceId/sensor-data', (req, res) => {
  try {
    const { deviceId } = req.params;
    const limit = Number.parseInt(req.query.limit || '100', 10);
    const sensorData = iotIntegration.getSensorDataHistory(deviceId, limit);
    res.json({ ok: true, sensorData });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get sensor data history' });
  }
});

app.get('/iot/health-alerts', (req, res) => {
  try {
    const filters = {
      deviceId: req.query.deviceId,
      touristId: req.query.touristId,
      severity: req.query.severity,
      status: req.query.status
    };
    
    const alerts = iotIntegration.getHealthAlerts(filters);
    res.json({ ok: true, alerts });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to get health alerts' });
  }
});

app.put('/iot/device/:deviceId/status', (req, res) => {
  try {
    const { deviceId } = req.params;
    const { status } = req.body || {};
    
    if (!status) {
      return res.status(400).json({ ok: false, error: 'status required' });
    }

    const success = iotIntegration.updateDeviceStatus(deviceId, status);
    
    if (success) {
      res.json({ ok: true, message: 'Device status updated' });
    } else {
      res.status(404).json({ ok: false, error: 'Device not found' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to update device status' });
  }
});

app.get('/iot/tourist/:touristId/pairing-report', (req, res) => {
  try {
    const { touristId } = req.params;
    const report = iotIntegration.generatePairingReport(touristId);
    res.json({ ok: true, report });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to generate pairing report' });
  }
});

// IoT WebSocket endpoint for real-time sensor data
app.ws('/iot/ws/:deviceId', (ws, req) => {
  const { deviceId } = req.params;
  
  ws.on('message', (message) => {
    try {
      const sensorData = JSON.parse(message);
      const processedData = iotIntegration.processSensorData(deviceId, sensorData);
      ws.send(JSON.stringify({ ok: true, processedData }));
    } catch (e) {
      ws.send(JSON.stringify({ ok: false, error: e.message }));
    }
  });
  
  ws.on('close', () => {
    console.log(`IoT WebSocket closed for device ${deviceId}`);
  });
});

// Cleanup expired sessions every hour
setInterval(() => {
  realTimeTracking.cleanupExpiredSessions();
}, 60 * 60 * 1000);

app.listen(port, () => {
  console.log(`Backend server listening on port ${port}`);
});
