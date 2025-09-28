import './App.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import logo from './assets/logo.svg';
import axios from 'axios';
import MapView from './MapView';
// MUI
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
// Icons
import DashboardIcon from '@mui/icons-material/Dashboard';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import InsightsIcon from '@mui/icons-material/Insights';
import MenuIcon from '@mui/icons-material/Menu';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
// Configure API base URL for production deployments (Netlify/Vercel, etc.)
if (process.env.REACT_APP_API_BASE) {
  axios.defaults.baseURL = process.env.REACT_APP_API_BASE;
}

function App() {
  const [alerts, setAlerts] = useState([]);
  const [geofences, setGeofences] = useState([]);
  const [score, setScore] = useState(null);
  const [credit, setCredit] = useState(null);
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
  const [placeId, setPlaceId] = useState('');
  const [showCreditDetail, setShowCreditDetail] = useState(false);
  const [events, setEvents] = useState([]);
  const [showDev, setShowDev] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all'); // all|open|acknowledged|resolved
  const [searchText, setSearchText] = useState('');
  const [anchors, setAnchors] = useState([]);
  const [gpsPings, setGpsPings] = useState([]);
  const [gpsHistory, setGpsHistory] = useState({});
  const [showLiveGps, setShowLiveGps] = useState(true);
  const [fitGps, setFitGps] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'anchors' | 'analytics'
  const [drawerOpen, setDrawerOpen] = useState(true);

  // MUI theme bound to existing dark state
  const theme = useMemo(() => createTheme({
    palette: { mode: dark ? 'dark' : 'light' },
    shape: { borderRadius: 10 },
  }), [dark]);


  // Fetch incidents filtered by region/time and project to alerts used in table+map
  const fetchFiltered = useCallback(async (opts = {}) => {
    const { silent = false } = opts;
    try {
      if (!silent) setLoading(true);
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
      if (!silent) setLoading(false);
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

  const fetchSafetyCredit = useCallback(async () => {
    try {
      const params = { regionId };
      if (placeId) params.placeId = placeId;
      const res = await axios.get('/safety-credit', { params });
      if (typeof res.data?.score === 'number') setCredit(res.data);
    } catch (e) {
      // ignore credit errors for UX
    }
  }, [regionId, placeId]);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([
      fetchFiltered(),
      fetchGeofences(),
      fetchSafetyScore(),
      fetchSafetyCredit(),
      fetchIncidents(),
      (async()=>{ try { const r = await axios.get('/did/anchors'); if (r.data?.ok && Array.isArray(r.data.anchors)) setAnchors(r.data.anchors); } catch(_){} })(),
      (async()=>{ try { const r = await axios.get('/gps/last'); if (r.data?.ok && Array.isArray(r.data.pings)) setGpsPings(r.data.pings); } catch(_){} })(),
      (async()=>{ try { const r = await axios.get('/gps/history'); if (r.data?.ok && r.data.history) setGpsHistory(r.data.history); } catch(_){} })(),
    ]);
  }, [fetchFiltered, fetchGeofences, fetchSafetyScore, fetchSafetyCredit, fetchIncidents]);

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
      await axios.post('/geofences', body);
      await fetchGeofences();
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert('Failed to seed geofence: ' + (e.response?.data?.error || e.message));
    }
  };

  // Compute filtered alerts for table rendering
  const filteredAlerts = useMemo(() => {
    return alerts.filter(a => {
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
  }, [alerts, statusFilter, searchText, incidentStatus]);

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
    const base = axios.defaults.baseURL || '';
    const sseUrl = base ? `${base.replace(/\/$/, '')}/panic-alerts/stream` : '/panic-alerts/stream';
    const es = new EventSource(sseUrl);

    es.onopen = () => {
      setLiveStatus('connected');
    };

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === 'alert' || data.type === 'incident_update' || data.type === 'snapshot') {
          // Background refresh without toggling spinner
          fetchFiltered({ silent: true });
          if (data.type === 'incident_update' && data.incident?.id && data.incident?.status) {
            setIncidentStatus((prev) => ({ ...prev, [data.incident.id]: data.incident.status }));
          }
        } else if (data.type === 'gps' && data.ping) {
          // Update last GPS pings list in-memory
          setGpsPings((prev) => {
            const next = [data.ping, ...prev.filter(p => (p.touristId||p.deviceId) !== (data.ping.touristId||data.ping.deviceId))];
            return next.slice(0, 50);
          });
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
      if (liveRef.current !== 'connected') {
        fetchFiltered({ silent: true });
        fetchGeofences();
        fetchSafetyScore();
        fetchIncidents();
        (async()=>{ try { const r = await axios.get('/gps/last'); if (r.data?.ok && Array.isArray(r.data.pings)) setGpsPings(r.data.pings); } catch(_){} })();
        (async()=>{ try { const r = await axios.get('/gps/history'); if (r.data?.ok && r.data.history) setGpsHistory(r.data.history); } catch(_){} })();
      }
    }, 10000);

    return () => {
      es.close();
      clearInterval(pollId);
    };
  }, [refreshAll, fetchFiltered, fetchGeofences, fetchSafetyScore, fetchIncidents]);

  // Track live status in a ref for stable polling callbacks
  const liveRef = useRef(liveStatus);
  useEffect(() => { liveRef.current = liveStatus; }, [liveStatus]);

  // When filters change, refetch score and filtered incidents
  useEffect(() => {
    fetchSafetyScore();
    fetchSafetyCredit();
    fetchFiltered();
  }, [fetchSafetyScore, fetchSafetyCredit, fetchFiltered]);

  // Persist selected place per region
  useEffect(() => {
    try {
      const key = `dash.place.${regionId || 'default'}`;
      if (placeId) localStorage.setItem(key, placeId); else localStorage.removeItem(key);
    } catch {}
  }, [placeId, regionId]);

  // Load stored place when region changes
  useEffect(() => {
    try {
      const key = `dash.place.${regionId || 'default'}`;
      const p = localStorage.getItem(key);
      setPlaceId(p || '');
    } catch { setPlaceId(''); }
  }, [regionId]);

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
    <div className={`App ${dark ? 'dark' : ''}`} style={{ padding: 0 }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {/* AppBar */}
        <AppBar position="sticky" color="default" elevation={1}>
          <Toolbar>
            <IconButton edge="start" onClick={()=>setDrawerOpen(v=>!v)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
            <img src={logo} alt="logo" style={{ width:24, height:24, marginRight: 8 }} />
            <Typography variant="h6" sx={{ flexGrow: 1 }}>Smart Tourist Safety</Typography>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {dark ? <DarkModeIcon fontSize="small"/> : <LightModeIcon fontSize="small"/>}
              <Switch checked={dark} onChange={(e)=>setDark(e.target.checked)} />
              <span className={`badge ${liveStatus}`} style={{ marginLeft: 8 }}>{liveStatus}</span>
            </div>
          </Toolbar>
        </AppBar>

        {/* Drawer */}
        <Drawer variant="permanent" open={drawerOpen} PaperProps={{ sx: { width: 200 } }}>
          <Toolbar />
          <List>
            <ListItemButton selected={activeTab==='dashboard'} onClick={()=>setActiveTab('dashboard')}>
              <ListItemIcon><DashboardIcon /></ListItemIcon>
              <ListItemText primary="Dashboard" />
            </ListItemButton>
            <ListItemButton selected={activeTab==='anchors'} onClick={()=>setActiveTab('anchors')}>
              <ListItemIcon><VerifiedUserIcon /></ListItemIcon>
              <ListItemText primary="Anchors" />
            </ListItemButton>
            <ListItemButton selected={activeTab==='analytics'} onClick={()=>setActiveTab('analytics')}>
              <ListItemIcon><InsightsIcon /></ListItemIcon>
              <ListItemText primary="Analytics" />
            </ListItemButton>
          </List>
        </Drawer>

        <div style={{ marginLeft: 200, padding: 24 }}>
      {/* Header / Toolbar */}
      <div className="topbar">
        <div className="brand" style={{ display:'flex', alignItems:'center', gap:8 }}>
          <img src={logo} alt="logo" style={{ width:24, height:24 }} />
          <span>Smart Tourist Safety</span>
        </div>
      {/* Anchors & GPS panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <div className="map-card">
          <div className="map-card-header">
            <div>DID Anchors</div>
            <div>
              <button onClick={async()=>{ try { const r = await axios.get('/did/anchors'); if (r.data?.ok) setAnchors(r.data.anchors||[]); } catch{} }}>Refresh</button>
            </div>
          </div>
          {anchors.length === 0 ? (
            <div style={{ padding: 12, color: '#6b7280' }}>No anchors yet.</div>
          ) : (
            <table className="alerts-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Time</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>DID</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Digest</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Chain</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {anchors.slice(0,20).map(a => (
                  <tr key={a.id}>
                    <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{new Date(a.createdAt).toLocaleString()}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 8, fontFamily:'monospace' }}>{a.didId}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 8, fontFamily:'monospace' }}>{(a.digest||'').slice(0,16)}…</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{a.chain||'-'}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{a.status||'-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="map-card">
          <div className="map-card-header">
            <div>GPS Pings (latest)</div>
            <div>
              <button onClick={async()=>{ try { const r = await axios.get('/gps/last'); if (r.data?.ok) setGpsPings(r.data.pings||[]); } catch{} }}>Refresh</button>
            </div>
          </div>
          {gpsPings.length === 0 ? (
            <div style={{ padding: 12, color: '#6b7280' }}>No GPS pings yet.</div>
          ) : (
            <table className="alerts-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Time</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Lat</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Lng</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Tourist</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Device</th>
                </tr>
              </thead>
              <tbody>
                {gpsPings.slice(0,20).map(p => (
                  <tr key={(p.touristId||p.deviceId||'')+p.at}>
                    <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{new Date(p.at).toLocaleString()}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{p.latitude?.toFixed(5)}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{p.longitude?.toFixed(5)}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 8, fontFamily:'monospace' }}>{p.touristId||'-'}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 8, fontFamily:'monospace' }}>{p.deviceId||'-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {/* Safety Credit card with place selector */}
      <div style={{ margin: '8px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          Place:
          <select value={placeId} onChange={(e)=>setPlaceId(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="">(all in region)</option>
            {Array.from(new Map(
              geofences
                .filter(g => !regionId || regionId === 'all' || g.regionId === regionId)
                .filter(g => g?.meta?.placeId)
                .map(g => [g.meta.placeId, g.name || g.meta.placeId])
            ).entries()).map(([pid,label]) => (
              <option key={pid} value={pid}>{label}</option>
            ))}
          </select>
        </label>
        {typeof credit?.score === 'number' && (
          <div style={{ padding: 10, border: '1px solid #eee', borderRadius: 8, background: credit.score >= 700 ? '#eafaf1' : credit.score >= 400 ? '#fef9e7' : '#fdecea' }}>
            <strong>Safety Credit ({placeId || regionId || 'default'})</strong>: {credit.score}/900
            <button style={{ marginLeft: 8 }} onClick={()=>setShowCreditDetail(true)}>Breakdown</button>
            <span
              title={
                'Heuristic v1: Base 900 minus penalties – incident density (weighted by severity & recency), unresolved ratio, soft alerts ratio, and night-time ratio.'
              }
              style={{ marginLeft: 8, cursor: 'help', border: '1px solid #ccc', borderRadius: 4, padding: '0 6px', fontSize: 12 }}
            >?
            </span>
          </div>
        )}
      </div>
      {showCreditDetail && credit && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={()=>setShowCreditDetail(false)}>
          <div style={{ background:'#fff', minWidth:320, padding:16, borderRadius:8 }} onClick={(e)=>e.stopPropagation()}>
            <h3>Safety Credit Breakdown</h3>
            <pre style={{ fontSize:12, whiteSpace:'pre-wrap' }}>{JSON.stringify(credit, null, 2)}</pre>
            <div style={{ textAlign:'right' }}>
              <button onClick={()=>setShowCreditDetail(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

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
          <label className="toggle" style={{ marginLeft: 8 }}>
            <input type="checkbox" checked={showLiveGps} onChange={(e)=>setShowLiveGps(e.target.checked)} />
            <span>Show live GPS</span>
          </label>
          <label className="toggle" style={{ marginLeft: 8 }}>
            <input type="checkbox" checked={fitGps} onChange={(e)=>setFitGps(e.target.checked)} />
            <span>Fit GPS</span>
          </label>
        </div>
      </div>
      {activeTab==='dashboard' && <h1 style={{ marginTop: 12 }}>Panic Alerts Dashboard</h1>}
      <p>
        Live updates: <strong style={{ color: liveStatus === 'connected' ? 'var(--brand-green)' : liveStatus === 'connecting' ? 'var(--brand-yellow)' : 'var(--brand-red)' }}>{liveStatus}</strong>
        {liveStatus !== 'connected' && ' (fallback to polling)'}
      </p>
      {activeTab==='dashboard' && typeof score === 'number' && (
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
      {activeTab==='dashboard' && (
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
        <Button startIcon={<RefreshIcon/>} onClick={refreshAll} disabled={loading} variant="contained">{loading ? 'Refreshing…' : 'Refresh'}</Button>
        <Button onClick={seedTestGeofence} variant="outlined">Seed Test Geofence</Button>
        <Button startIcon={<DownloadIcon/>} variant="outlined" onClick={() => {
          const params = new URLSearchParams();
          if (regionId && regionId !== 'all') params.set('regionId', regionId);
          if (windowMinutes && Number(windowMinutes) > 0) params.set('minutes', String(windowMinutes));
          const url = `/incidents/export?${params.toString()}`;
          window.open(url, '_blank');
        }}>Export CSV</Button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={testMode} onChange={(e)=>setTestMode(e.target.checked)} />
          Test Alert Mode (click map)
        </label>
      </div>
      )}
      {activeTab==='dashboard' && error && (
        <div style={{ color: 'white', background: '#c0392b', padding: 12, borderRadius: 6, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {activeTab==='dashboard' && (loading ? (
        <div className="map-card" style={{ padding: 16 }}>
          <Skeleton height={28} width={220} />
          <Skeleton height={22} width={'100%'} />
          <Skeleton height={22} width={'100%'} />
          <Skeleton height={22} width={'100%'} />
        </div>
      ) : filteredAlerts.length === 0 ? (
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
      ))}

      {/* Map visualization card with legend */}
      {activeTab==='dashboard' && (
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
          showLiveGps={showLiveGps}
          gpsPings={gpsPings}
          gpsHistory={gpsHistory}
          fitGps={fitGps}
          onMapClick={async ([lat,lng]) => {
            if (!testMode) return;
            try {
              await axios.post('/panic-alert', { latitude: lat, longitude: lng });
            } catch (e) {}
          }}
        />
      </div>
      )}

      {activeTab==='analytics' && (
        <div className="map-card" style={{ padding: 16 }}>
          <div className="map-card-header">Analytics (coming soon)</div>
          <div style={{ padding: 16 }}>
            <Skeleton height={30} width={260} />
            <Skeleton height={140} variant="rectangular" sx={{ mt: 1, borderRadius: 2 }} />
            <Skeleton height={18} width={'70%'} sx={{ mt: 2 }} />
            <Skeleton height={18} width={'40%'} />
          </div>
        </div>
      )}

      </div>{/* content wrapper */}
      </ThemeProvider>
    </div>
  );
}

export default App;
