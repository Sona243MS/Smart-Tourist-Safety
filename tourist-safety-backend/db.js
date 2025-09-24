const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const DB_PATH = path.join(process.cwd(), 'tourist-safety.json');

let state = {
  tourists: [],
  devices: [],
  incidents: [],
  geofences: [],
};

function load() {
  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      state = {
        tourists: parsed.tourists || [],
        devices: parsed.devices || [],
        incidents: parsed.incidents || [],
        geofences: parsed.geofences || [],
        regions: parsed.regions || [],
        events: parsed.events || [],
      };
    } catch (e) {
      console.error('Failed to read DB file, starting fresh:', e);
    }
  }
  // Seed regions metadata if empty
  if (!state.regions || state.regions.length === 0) {
    state.regions = [
      {
        id: 'default',
        name: 'Default Region',
        contacts: [
          { label: 'Police', phone: '112' },
          { label: 'Ambulance', phone: '108' },
          { label: 'Disaster Response', phone: '1070' },
        ],
        metadata: {},
      },
      {
        id: 'shillong',
        name: 'Shillong',
        contacts: [
          { label: 'Police', phone: '100' },
          { label: 'Ambulance', phone: '108' },
          { label: 'Disaster Management', phone: '1070' },
        ],
        metadata: {},
      },
      {
        id: 'guwahati',
        name: 'Guwahati',
        contacts: [
          { label: 'Police', phone: '100' },
          { label: 'Ambulance', phone: '108' },
          { label: 'Women Helpline', phone: '181' },
        ],
        metadata: {},
      },
      {
        id: 'assam',
        name: 'Assam',
        contacts: [
          { label: 'Police', phone: '100' },
          { label: 'Ambulance', phone: '108' },
          { label: 'Disaster Mgmt', phone: '1070' },
        ],
        metadata: { state: 'Assam' },
      },
    ];
    persist();
  }
}

function persist() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Failed to write DB file:', e);
  }
}

function init() {
  load();
  // also create file if missing
  persist();
  // initialize arrays
  state.events = state.events || [];
  state.regions = state.regions || [];
  // Seed some demo geofences for North-East if none present
  if (!state.geofences || state.geofences.length === 0) {
    try {
      const seed = [
        {
          id: 'ne-shillong-central',
          name: 'Shillong Central',
          regionId: 'shillong',
          riskLevel: 'yellow',
          polygon: [
            [25.585, 91.885],
            [25.585, 91.901],
            [25.571, 91.901],
            [25.571, 91.885],
          ],
        },
        {
          id: 'ne-guwahati-central',
          name: 'Guwahati Central',
          regionId: 'guwahati',
          riskLevel: 'red',
          polygon: [
            [26.198, 91.726],
            [26.198, 91.755],
            [26.165, 91.755],
            [26.165, 91.726],
          ],
        },
        // Assam tourist spots (approximate boxes/polylines for demo; replace with accurate polygons later)
        {
          id: 'assam-kaziranga-central',
          name: 'Kaziranga National Park (Central Range)',
          regionId: 'assam',
          riskLevel: 'yellow',
          polygon: [
            [26.585, 93.350],
            [26.585, 93.430],
            [26.510, 93.430],
            [26.510, 93.350],
          ],
          meta: { placeId: 'kaziranga' },
        },
        {
          id: 'assam-kamakhya-temple',
          name: 'Kamakhya Temple',
          regionId: 'assam',
          riskLevel: 'yellow',
          polygon: [
            [26.172, 91.698],
            [26.172, 91.705],
            [26.166, 91.705],
            [26.166, 91.698],
          ],
          meta: { placeId: 'kamakhya' },
        },
        {
          id: 'assam-umananda-island',
          name: 'Umananda Island',
          regionId: 'assam',
          riskLevel: 'yellow',
          polygon: [
            [26.192, 91.749],
            [26.192, 91.754],
            [26.188, 91.754],
            [26.188, 91.749],
          ],
          meta: { placeId: 'umananda' },
        },
        {
          id: 'assam-majuli',
          name: 'Majuli River Island',
          regionId: 'assam',
          riskLevel: 'yellow',
          polygon: [
            [26.980, 94.140],
            [26.980, 94.300],
            [26.820, 94.300],
            [26.820, 94.140],
          ],
          meta: { placeId: 'majuli' },
        },
        {
          id: 'assam-pobitora',
          name: 'Pobitora Wildlife Sanctuary',
          regionId: 'assam',
          riskLevel: 'yellow',
          polygon: [
            [26.258, 91.961],
            [26.258, 92.010],
            [26.220, 92.010],
            [26.220, 91.961],
          ],
          meta: { placeId: 'pobitora' },
        },
      ];
      state.geofences = [...(state.geofences || []), ...seed];
      persist();
      console.log('Seeded NE demo geofences.');
    } catch (e) {
      console.error('Failed to seed geofences:', e);
    }
  }
}

function registerTourist({ name, phone }) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  state.tourists.push({ id, name: name || null, phone: phone || null, createdAt });
  persist();
  return { id, createdAt };
}

function pairDevice({ touristId, bleAddress }) {
  const id = randomUUID();
  const pairedAt = new Date().toISOString();
  state.devices.push({ id, touristId: touristId || null, bleAddress: bleAddress || null, pairedAt });
  persist();
  return { id, pairedAt };
}

function createIncident({ touristId = null, deviceId = null, latitude, longitude, type = 'panic', severity = 'high', status = 'open', regionId = 'default', meta = {} }) {
  const id = randomUUID();
  const row = {
    id,
    touristId: touristId || null,
    deviceId: deviceId || null,
    type,
    severity,
    status,
    latitude,
    longitude,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    regionId: regionId || null,
    meta: meta || null,
  };
  state.incidents.push(row);
  // keep array reasonably bounded
  if (state.incidents.length > 5000) state.incidents = state.incidents.slice(-3000);
  persist();
  return row;
}

function listIncidents({ limit = 100 } = {}) {
  return [...state.incidents]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

// Events persistence (BLE/offline batches)
function addEvent({ deviceId = null, touristId = null, type = 'unknown', payload = {}, createdAt }) {
  const row = {
    id: randomUUID(),
    deviceId,
    touristId,
    type,
    payload: payload || {},
    createdAt: createdAt || new Date().toISOString(),
  };
  state.events.push(row);
  persist();
  return row;
}

function addEventsBatch(items = []) {
  const saved = [];
  for (const it of items) {
    saved.push(addEvent(it));
  }
  return saved;
}

function listEvents({ limit = 200 } = {}) {
  return [...(state.events || [])]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

function listIncidentsFiltered({ regionId, sinceISO, limit = 1000 } = {}) {
  let rows = [...state.incidents];
  if (regionId && regionId !== 'all') {
    rows = rows.filter(i => (i.regionId || 'default') === regionId);
  }
  if (sinceISO) {
    const since = new Date(sinceISO);
    rows = rows.filter(i => new Date(i.createdAt) >= since);
  }
  rows.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return rows.slice(0, limit);
}

function getIncident(id) {
  return (state.incidents || []).find(i => i.id === id) || null;
}

function updateIncidentStatus(id, status) {
  const idx = (state.incidents || []).findIndex(i => i.id === id);
  if (idx === -1) return null;
  const row = state.incidents[idx];
  const now = new Date().toISOString();
  const updated = { ...row, status };
  if (status === 'resolved') {
    updated.resolvedAt = now;
  }
  state.incidents[idx] = updated;
  persist();
  return updated;
}

function safetyScore({ regionId = 'default', days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400000);
  const incidents = state.incidents.filter(i => (!regionId || i.regionId === regionId) && new Date(i.createdAt) >= since).length;
  const score = Math.max(0, 900 - Math.min(incidents, 300) * 3);
  return { score, inputs: { regionId, days, incidents } };
}

function listGeofences() {
  return state.geofences || [];
}

function upsertGeofence({ id, name, polygon, riskLevel = 'yellow', regionId = 'default' }) {
  if (!Array.isArray(polygon) || polygon.length < 3) {
    throw new Error('polygon must be an array of [lat,lng] with at least 3 points');
  }
  if (!id) id = randomUUID();
  const idx = (state.geofences || []).findIndex(g => g.id === id);
  const row = { id, name: name || 'Zone', polygon, riskLevel, regionId };
  if (idx >= 0) state.geofences[idx] = row; else state.geofences.push(row);
  persist();
  return row;
}

function listRegions() {
  return [...(state.regions || [])];
}

module.exports = {
  init,
  registerTourist,
  pairDevice,
  createIncident,
  listIncidents,
  addEvent,
  addEventsBatch,
  listEvents,
  listIncidentsFiltered,
  getIncident,
  updateIncidentStatus,
  safetyScore,
  listGeofences,
  upsertGeofence,
  listRegions,
};
