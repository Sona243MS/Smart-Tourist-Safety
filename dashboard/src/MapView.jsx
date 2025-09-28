import React, { useMemo, useRef, useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polygon, useMapEvents, Polyline, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix default marker icons in CRA
// eslint-disable-next-line no-underscore-dangle
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

function FitBounds({ positions }) {
  const map = useMap();
  React.useEffect(() => {
    if (!positions || positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], 13);
    } else {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [positions, map]);
  return null;
}

function fenceStyle(riskLevel) {
  switch ((riskLevel || '').toLowerCase()) {
    case 'red':
      return { color: '#e74c3c', fillColor: '#e74c3c', fillOpacity: 0.2 };
    case 'green':
      return { color: '#27ae60', fillColor: '#27ae60', fillOpacity: 0.15 };
    case 'yellow':
    default:
      return { color: '#f1c40f', fillColor: '#f1c40f', fillOpacity: 0.15 };
  }
}

function ClickCatcher({ onClick }) {
  useMapEvents({
    click(e) {
      if (onClick) onClick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

export default function MapView({ alerts, geofences, onMapClick, testMode, showLiveGps = false, gpsPings = [], gpsHistory = {}, fitGps = false }) {
  const positions = useMemo(() =>
    (alerts || [])
      .filter(a => typeof a.latitude === 'number' && typeof a.longitude === 'number')
      .map(a => [a.latitude, a.longitude]),
  [alerts]);

  const center = positions[0] || [20.5937, 78.9629]; // default: India

  // Build GPS overlays
  const gpsLatestPositions = useMemo(() => {
    const list = [];
    (gpsPings || []).forEach(p => {
      if (typeof p.latitude === 'number' && typeof p.longitude === 'number') {
        const key = p.touristId || p.deviceId || 'anon';
        list.push({ key, lat: p.latitude, lng: p.longitude, at: p.at });
      }
    });
    return list;
  }, [gpsPings]);

  const gpsTrails = useMemo(() => {
    const entries = Object.entries(gpsHistory || {});
    return entries.map(([key, arr], idx) => {
      const positions = (arr || []).map(p => [p.latitude, p.longitude]).filter(pt => typeof pt[0] === 'number' && typeof pt[1] === 'number');
      return { key, positions, colorIdx: idx };
    });
  }, [gpsHistory]);

  function colorForIdx(i) {
    const palette = ['#2563eb', '#16a34a', '#f59e0b', '#e11d48', '#7c3aed', '#0ea5e9'];
    return palette[i % palette.length];
  }

  // Smooth animation for GPS markers: interpolate to new points over 1s
  const [animPositions, setAnimPositions] = useState({}); // key -> {lat,lng}
  const animRef = useRef({ running: false, start: 0, from: {}, to: {} });

  useEffect(() => {
    if (!showLiveGps) return;
    const nowTargets = {};
    gpsLatestPositions.forEach(p => { nowTargets[p.key] = { lat: p.lat, lng: p.lng }; });
    const from = { ...animPositions };
    // For keys unseen before, start from their target (no animation jitter)
    Object.keys(nowTargets).forEach(k => {
      if (!from[k]) from[k] = { ...nowTargets[k] };
    });
    animRef.current = { running: true, start: performance.now(), from, to: nowTargets };

    let rafId = 0;
    const duration = 1000;
    const ease = (t) => t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t; // easeInOut
    const step = (ts) => {
      const t = Math.min(1, (ts - animRef.current.start) / duration);
      const e = ease(t);
      const next = {};
      Object.keys(animRef.current.to).forEach(k => {
        const a = animRef.current.from[k] || animRef.current.to[k];
        const b = animRef.current.to[k];
        next[k] = { lat: a.lat + (b.lat - a.lat) * e, lng: a.lng + (b.lng - a.lng) * e };
      });
      setAnimPositions(next);
      if (t < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        animRef.current.running = false;
      }
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsLatestPositions.map(p=>p.key+':'+p.lat+','+p.lng).join('|'), showLiveGps]);

  // Fit to GPS trails when requested
  const fitPositions = useMemo(() => {
    if (!fitGps || !showLiveGps) return positions;
    const extra = [];
    Object.values(gpsHistory || {}).forEach(arr => {
      (arr || []).forEach(p => { if (typeof p.latitude==='number' && typeof p.longitude==='number') extra.push([p.latitude, p.longitude]); });
    });
    return positions.concat(extra);
  }, [fitGps, showLiveGps, positions, gpsHistory]);

  return (
    <div style={{ height: 400, width: '100%', marginTop: 16 }}>
      <MapContainer center={center} zoom={5} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds positions={fitPositions} />
        <ClickCatcher onClick={onMapClick} />
        {(geofences || []).map((g) => (
          <Polygon key={g.id}
            pathOptions={fenceStyle(g.riskLevel)}
            positions={(g.polygon || []).map(p => [p[0], p[1]])}
          >
            <Popup>
              <div>
                <div><strong>Zone:</strong> {g.name || g.id}</div>
                <div><strong>Risk:</strong> {g.riskLevel || 'yellow'}</div>
                <div><strong>Region:</strong> {g.regionId || 'default'}</div>
              </div>
            </Popup>
          </Polygon>
        ))}
        {/* GPS Trails (mini-paths) */}
        {showLiveGps && gpsTrails.map(trail => (
          trail.positions.length >= 2 ? (
            <Polyline key={`trail-${trail.key}`} positions={trail.positions} pathOptions={{ color: colorForIdx(trail.colorIdx), weight: 3, opacity: 0.7 }} />
          ) : null
        ))}
        {/* Latest GPS markers */}
        {showLiveGps && gpsLatestPositions.map((p, idx) => {
          const anim = animPositions[p.key] || { lat: p.lat, lng: p.lng };
          return (
          <CircleMarker key={`gps-${p.key}`} center={[anim.lat, anim.lng]} radius={6} pathOptions={{ color: colorForIdx(idx), fillColor: colorForIdx(idx), fillOpacity: 0.8 }}>
            <Popup>
              <div>
                <div><strong>GPS</strong></div>
                <div><strong>Time:</strong> {new Date(p.at).toLocaleString()}</div>
                <div><strong>Lat:</strong> {anim.lat.toFixed(6)}</div>
                <div><strong>Lng:</strong> {anim.lng.toFixed(6)}</div>
                <div><strong>Key:</strong> <code>{p.key}</code></div>
              </div>
            </Popup>
          </CircleMarker>
        );})}
        {/* Legend for GPS colors */}
        {showLiveGps && (
          <div style={{ position:'absolute', bottom: 10, right: 10, background:'rgba(255,255,255,0.9)', padding: 6, borderRadius: 6, border:'1px solid #ddd', maxHeight: 120, overflow:'auto' }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>GPS Legend</div>
            {gpsLatestPositions.slice(0,10).map((p, idx) => (
              <div key={`legend-${p.key}`} style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ width: 10, height: 10, background: colorForIdx(idx), borderRadius: 2 }} />
                <code style={{ fontSize: 12 }}>{p.key}</code>
              </div>
            ))}
            {gpsLatestPositions.length > 10 && <div style={{ fontSize: 12, color:'#6b7280' }}>+{gpsLatestPositions.length - 10} more…</div>}
          </div>
        )}
        {(alerts || []).map((a) => (
          <Marker key={a.id} position={[a.latitude, a.longitude]}>
            <Popup>
              <div>
                <div><strong>Time:</strong> {new Date(a.at).toLocaleString()}</div>
                <div><strong>Lat:</strong> {a.latitude}</div>
                <div><strong>Lng:</strong> {a.longitude}</div>
                <div><strong>ID:</strong> <code>{a.id}</code></div>
                {a.riskLevel && <div><strong>Risk:</strong> {a.riskLevel}</div>}
              </div>
            </Popup>
          </Marker>
        ))}
        {testMode && (
          <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(255,255,255,0.9)', padding: 6, borderRadius: 6, border: '1px solid #ddd' }}>
            Click on the map to send a test alert
          </div>
        )}
      </MapContainer>
    </div>
  );
}
