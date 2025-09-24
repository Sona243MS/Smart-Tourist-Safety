const express = require('express');
const { randomUUID } = require('crypto');
require('dotenv').config();
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./db');
const useSqlite = process.env.USE_SQLITE === '1';
let sqlite = null;
if (useSqlite) {
  sqlite = require('./db/sqlite').init(process.env.SQLITE_DB_PATH || './data/tourist-safety.db');
}
const app = express();
const port = process.env.PORT || 3000;

// Use CORS to allow requests from your frontend app
app.use(cors());
app.use(bodyParser.json());

// Initialize database
db.init();

// A simple in-memory store for events, which you'll replace with a database later
const events = [];
// In-memory store for location-only panic alerts consumed by the dashboard
const locationAlerts = [];
// Track SSE clients for live updates
const sseClients = new Set();

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
    const { name, phone } = req.body || {};
    const out = db.registerTourist({ name, phone });
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

const safetyScoreSvc = require('./services/safetyScore');
const safetyCreditSvc = require('./services/safetyCredit');
const jwtUtil = require('./utils/jwt');

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
    res.json({ ok: true, didToken: token, didId, expiresAt: new Date(expSec * 1000).toISOString() });
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
  } catch (e) {
    console.error('Failed to persist incident:', e);
  }

  // In a real app, persist this to a database and/or trigger downstream notifications here
  // Broadcast to SSE clients
  const payload = `data: ${JSON.stringify({ type: 'alert', alert })}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }

  return res.status(200).json({ ok: true, message: 'Panic alert received', coords: { latitude, longitude }, alert });
});

// Dashboard can poll this endpoint to get the most recent location alerts
app.get('/panic-alerts', (_req, res) => {
  res.json({ ok: true, count: locationAlerts.length, alerts: locationAlerts });
});

// Server-Sent Events endpoint for live updates
app.get('/panic-alerts/stream', (req, res) => {
  // Explicit CORS for Firebase-hosted dashboards
  res.setHeader('Access-Control-Allow-Origin', '*');
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

app.listen(port, () => {
  console.log(`Backend server listening on port ${port}`);
});
