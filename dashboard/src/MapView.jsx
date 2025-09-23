import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polygon, useMapEvents } from 'react-leaflet';
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

export default function MapView({ alerts, geofences, onMapClick, testMode }) {
  const positions = useMemo(() =>
    (alerts || [])
      .filter(a => typeof a.latitude === 'number' && typeof a.longitude === 'number')
      .map(a => [a.latitude, a.longitude]),
  [alerts]);

  const center = positions[0] || [20.5937, 78.9629]; // default: India

  return (
    <div style={{ height: 400, width: '100%', marginTop: 16 }}>
      <MapContainer center={center} zoom={5} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds positions={positions} />
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
