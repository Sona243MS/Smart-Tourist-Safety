import './App.css';
import React, { useCallback, useEffect, useState } from 'react';
import logo from './assets/logo.svg';
import axios from 'axios';
import MapView from './MapView';

function App() {
  const [alerts, setAlerts] = useState([]);
  const [geofences, setGeofences] = useState([]);
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [liveStatus, setLiveStatus] = useState('disconnected'); // disconnected | connecting | connected
  const [incidentStatus, setIncidentStatus] = useState({}); // { [incidentId]: status }
  const [regionId, setRegionId] = useState('default');
  const [windowMinutes, setWindowMinutes] = useState(0); // 0=all, 15, 60, 1440
  const [testMode, setTestMode] = useState(false);
  const [dark, setDark] = useState(false);
  const [regions, setRegions] = useState(['default', 'shillong', 'guwahati']);
  const [dbMode, setDbMode] = useState('json');
  const [events, setEvents] = useState([]);
  const [showDev, setShowDev] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all'); // all|open|acknowledged|resolved
  const [searchText, setSearchText] = useState('');

  // Fetch incidents filtered by region/time and project to alerts used in table+map
  const fetchFiltered = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = {};
      if (regionId && regionId !== 'all') params.regionId = regionId;
      if (windowMinutes && Number(windowMinutes) > 0) params.minutes = windowMinutes;
      const res = await axios.get('/incidents/filter', { params });
      if (res.data?.ok && Array.isArray(res.data.incidents)) {
        const projected = res.data.incidents.map(i => ({
          id: i.id,
          incidentId: i.id,
          latitude: i.latitude,
          longitude: i.longitude,
          at: i.createdAt,
          riskLevel: i.meta?.riskLevel,
          status: i.status || 'open',
          regionId: i.regionId || 'default',
        }));
        setAlerts(projected);
      } else {
        setError('Unexpected server response');
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  }, [regionId, windowMinutes]);

  const fetchIncidents = useCallback(async () => {
    try {
      const res = await axios.get('/incidents', { params: { limit: 50 } });
      if (res.data?.ok && Array.isArray(res.data.incidents)) {
        const statuses = {};
        for (const it of res.data.incidents) if (it?.id && it?.status) statuses[it.id] = it.status;
        setIncidentStatus(statuses);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const fetchGeofences = useCallback(async () => {
    try {
      const res = await axios.get('/geofences');
      if (res.data?.ok && Array.isArray(res.data.geofences)) setGeofences(res.data.geofences);
    } catch (e) {
      // ignore
    }
  }, []);

  const fetchSafetyScore = useCallback(async () => {
    try {
      const res = await axios.get('/safety-score', { params: { regionId } });
      if (res.data?.ok) setScore(res.data.score);
    } catch (e) {
      // ignore score errors for UX
    }
  }, [regionId]);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([
      fetchFiltered(),
      fetchGeofences(),
      fetchSafetyScore(),
      fetchIncidents(),
    ]);
  }, [fetchFiltered, fetchGeofences, fetchSafetyScore, fetchIncidents]);

  const seedTestGeofence = async () => {
    try {
      // Use latest alert position if available; otherwise default to Bengaluru center
      const lat = alerts[0]?.latitude ?? 12.972442;
      const lng = alerts[0]?.longitude ?? 77.580643;
      const d = 0.01; // ~1km box
      const body = {
        id: 'test-zone-1',
        name: 'Test Zone',
        riskLevel: 'red',
        regionId: 'default',
        polygon: [
          [lat + d, lng - d],
          [lat + d, lng + d],
          [lat - d, lng + d],
          [lat - d, lng - d],
        ],
      };

  // Compute filtered alerts for table rendering
  const filteredAlerts = alerts.filter(a => {
    if (statusFilter !== 'all') {
      const s = a.status || (a.incidentId ? (incidentStatus[a.incidentId] || 'open') : 'open');
      if (s !== statusFilter) return false;
    }
    if (searchText) {
      const q = searchText.toLowerCase();
      const parts = [
        a.id,
        a.incidentId,
        a.riskLevel,
        a.regionId,
        (a.status || ''),
      ].map(x => (x ? String(x).toLowerCase() : ''));
      if (!parts.some(p => p.includes(q))) return false;
    }
    return true;
  });
      await axios.post('/geofences', body);
      await fetchGeofences();
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert('Failed to seed geofence: ' + (e.response?.data?.error || e.message));
    }
  };

  useEffect(() => {
    // Load persisted prefs
    try {
      const pDark = localStorage.getItem('dash.dark');
      if (pDark != null) setDark(pDark === '1');
      const pRegion = localStorage.getItem('dash.regionId');
      if (pRegion) setRegionId(pRegion);
      const pWindow = localStorage.getItem('dash.windowMinutes');
      if (pWindow) setWindowMinutes(Number(pWindow));
    } catch {}
    // Fetch regions
    (async () => {
      try {
        const res = await axios.get('/regions');
        if (res.data?.ok && Array.isArray(res.data.regions)) {
          const list = res.data.regions.map(r => r.id);
          if (list.length) setRegions(list);
        }
      } catch {}
    })();
    (async () => {
      try {
        const res = await axios.get('/db-mode');
        if (res.data?.ok && res.data.mode) setDbMode(res.data.mode);
      } catch {}
    })();
    // Start with initial fetches in case SSE is blocked
    refreshAll();
    setLiveStatus('connecting');
    const es = new EventSource('/panic-alerts/stream');

    es.onopen = () => {
      setLiveStatus('connected');
    };

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === 'alert' || data.type === 'incident_update' || data.type === 'snapshot') {
          // Always refetch filtered data so table+map stay aligned with filters
          fetchFiltered();
          if (data.type === 'incident_update' && data.incident?.id && data.incident?.status) {
            setIncidentStatus((prev) => ({ ...prev, [data.incident.id]: data.incident.status }));
          }
        }
      } catch (e) {
        // ignore malformed message
      }
    };

    es.onerror = () => {
      setLiveStatus('disconnected');
      // leave polling as a fallback below
    };

    // Polling fallback every 10s in case SSE disconnects
    const pollId = setInterval(() => {
      if (liveStatus !== 'connected') {
        fetchFiltered();
        fetchGeofences();
        fetchSafetyScore();
        fetchIncidents();
      }
    }, 10000);

    return () => {
      es.close();
      clearInterval(pollId);
    };
  }, [refreshAll, fetchFiltered, fetchGeofences, fetchSafetyScore, fetchIncidents, liveStatus]);

  // When filters change, refetch score and filtered incidents
  useEffect(() => {
    fetchSafetyScore();
    fetchFiltered();
  }, [fetchSafetyScore, fetchFiltered]);

  // Persist prefs
  useEffect(() => {
    try { localStorage.setItem('dash.dark', dark ? '1' : '0'); } catch {}
  }, [dark]);
  useEffect(() => {
    try { localStorage.setItem('dash.regionId', regionId || 'default'); } catch {}
  }, [regionId]);
  useEffect(() => {
    try { localStorage.setItem('dash.windowMinutes', String(windowMinutes || 0)); } catch {}
  }, [windowMinutes]);

  const fetchEvents = async () => {
    try {
      const res = await axios.get('/events', { params: { limit: 20 } });
      if (res.data?.ok && Array.isArray(res.data.events)) setEvents(res.data.events);
    } catch (e) {
      // ignore for dev panel
    }
  };

  return (
    <div className={`App ${dark ? 'dark' : ''}`} style={{ padding: 24 }}>
      {/* Header / Toolbar */}
      <div className="topbar">
        <div className="brand" style={{ display:'flex', alignItems:'center', gap:8 }}>
          <img src={logo} alt="logo" style={{ width:24, height:24 }} />
          <span>Smart Tourist Safety</span>
        </div>

      {showDev && (
        <div className="map-card" style={{ marginTop: 12 }}>
          <div className="map-card-header">
            <div>Dev: Recent Events</div>
            <div>
              <button onClick={fetchEvents}>Refresh</button>
            </div>
          </div>
          {events.length === 0 ? (
            <div style={{ padding: 12, color: '#6b7280' }}>No events yet.</div>
          ) : (
            <table className="alerts-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Time</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Type</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Device</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Tourist</th>
                </tr>
              </thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.id}>
                    <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{new Date(ev.createdAt).toLocaleString()}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{ev.type}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{ev.deviceId || '-'}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{ev.touristId || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
        <div className="badges">
          <span className={`badge ${liveStatus}`}>{liveStatus}</span>
          <span className="badge" style={{ background: '#6b7280', marginLeft: 8 }}>DB: {dbMode}</span>
        </div>
        <div className="actions">
          <button onClick={refreshAll} disabled={loading}>⟳</button>
          <button onClick={() => {
            const params = new URLSearchParams();
            if (regionId && regionId !== 'all') params.set('regionId', regionId);
            if (windowMinutes && Number(windowMinutes) > 0) params.set('minutes', String(windowMinutes));
            const url = `/incidents/export?${params.toString()}`;
            window.open(url, '_blank');
          }}>⇩ CSV</button>
          <label className="toggle">
            <input type="checkbox" checked={dark} onChange={(e)=>setDark(e.target.checked)} />
            <span>Dark</span>
          </label>
        <label>
          Status:
          <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        <input
          type="text"
          placeholder="Search id/region/risk/status"
          value={searchText}
          onChange={(e)=>setSearchText(e.target.value)}
          style={{ padding: 6, border: '1px solid #ccc', borderRadius: 6 }}
        />
          <label className="toggle" style={{ marginLeft: 8 }}>
            <input type="checkbox" checked={showDev} onChange={(e)=>{
              setShowDev(e.target.checked);
              if (e.target.checked) fetchEvents();
            }} />
            <span>Dev</span>
          </label>
        </div>
      </div>
      <h1 style={{ marginTop: 12 }}>Panic Alerts Dashboard</h1>
      <p>
        Live updates: <strong style={{ color: liveStatus === 'connected' ? 'var(--brand-green)' : liveStatus === 'connecting' ? 'var(--brand-yellow)' : 'var(--brand-red)' }}>{liveStatus}</strong>
        {liveStatus !== 'connected' && ' (fallback to polling)'}
      </p>
      {typeof score === 'number' && (
        <div className="safety-banner" style={{
          margin: '8px 0 16px',
          padding: '12px',
          borderRadius: 8,
          color: '#222',
          background: score >= 700 ? '#eafaf1' : score >= 400 ? '#fef9e7' : '#fdecea',
          border: `1px solid ${score >= 700 ? '#2ecc71' : score >= 400 ? '#f1c40f' : '#e74c3c'}`
        }}>
          <strong>Safety Score ({regionId}):</strong> {score}/900
        </div>
      )}
      <div className="controls" style={{ margin: '12px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          Region:
          <select value={regionId} onChange={(e)=>setRegionId(e.target.value)} style={{ marginLeft: 8 }}>
            {regions.map(r => (<option key={r} value={r}>{r}</option>))}
          </select>
        </label>
        <label>
          Time Window:
          <select value={windowMinutes} onChange={(e)=>setWindowMinutes(Number(e.target.value))} style={{ marginLeft: 8 }}>
            <option value={0}>All</option>
            <option value={15}>Last 15m</option>
            <option value={60}>Last 1h</option>
            <option value={1440}>Last 24h</option>
          </select>
        </label>
        <button onClick={refreshAll} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh Now'}</button>
        <button onClick={seedTestGeofence}>
          Seed Test Geofence
        </button>
        <button onClick={() => {
          const params = new URLSearchParams();
          if (regionId && regionId !== 'all') params.set('regionId', regionId);
          if (windowMinutes && Number(windowMinutes) > 0) params.set('minutes', String(windowMinutes));
          const url = `/incidents/export?${params.toString()}`;
          window.open(url, '_blank');
        }}>Export CSV</button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={testMode} onChange={(e)=>setTestMode(e.target.checked)} />
          Test Alert Mode (click map)
        </label>
      </div>
      {error && (
        <div style={{ color: 'white', background: '#c0392b', padding: 12, borderRadius: 6, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {filteredAlerts.length === 0 ? (
        <div>No alerts yet.</div>
      ) : (
        <table className="alerts-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Time</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Latitude</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Longitude</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Alert ID</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Incident ID</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Risk</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Status</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAlerts.map(a => (
              <tr key={a.id}>
                <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{new Date(a.at).toLocaleString()}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{a.latitude}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{a.longitude}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 8, fontFamily: 'monospace' }}>{a.id}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 8, fontFamily: 'monospace' }}>{a.incidentId || '-'}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{a.riskLevel || '-'}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{a.incidentId ? (incidentStatus[a.incidentId] || a.status || 'open') : (a.status || '-')}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>
                  {a.incidentId ? (
                    <>
                      <button
                        style={{ marginRight: 8 }}
                        onClick={async () => {
                          try {
                            await axios.post('/incidents/acknowledge', { id: a.incidentId });
                            setIncidentStatus((prev) => ({ ...prev, [a.incidentId]: 'acknowledged' }));
                          } catch (e) {}
                        }}
                        disabled={(incidentStatus[a.incidentId] || 'open') !== 'open'}
                      >
                        Acknowledge
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await axios.post('/incidents/resolve', { id: a.incidentId });
                            setIncidentStatus((prev) => ({ ...prev, [a.incidentId]: 'resolved' }));
                          } catch (e) {}
                        }}
                        disabled={(incidentStatus[a.incidentId] || 'open') === 'resolved'}
                      >
                        Resolve
                      </button>
                    </>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Map visualization card with legend */}
      <div className="map-card">
        <div className="map-card-header">
          <div>Map</div>
          <div className="legend">
            <span><i className="dot red" /> red</span>
            <span><i className="dot yellow" /> yellow</span>
            <span><i className="dot green" /> green</span>
          </div>
        </div>
        <MapView
          alerts={alerts}
          geofences={geofences}
          testMode={testMode}
          onMapClick={async ([lat,lng]) => {
            if (!testMode) return;
            try {
              await axios.post('/panic-alert', { latitude: lat, longitude: lng });
            } catch (e) {}
          }}
        />
      </div>
    </div>
  );
}

export default App;
