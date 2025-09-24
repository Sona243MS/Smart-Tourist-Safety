# Smart Tourist Safety System

A monorepo with:
- `tourist-safety-backend/` – Node/Express backend with JSON persistence, geofences, incidents, Server-Sent Events (SSE), safety score, and soft alerts.
- `dashboard/` – React dashboard with live alerts, region/time filters, safety score, geofence map, incident workflow, CSV export, and a test alert tool.
- `mobile-app/` – React PWA mobile app with SOS, offline queue, QR ID card, safety banner, emergency contacts, multi-language labels, and share location.

## Quick Start

### Prerequisites
- Node.js 20 LTS (recommended)
- npm 9+
  - On Windows, use nvm-windows:
    - `nvm install 20.16.0 && nvm use 20.16.0`

### 1) Backend (native)
```bash
cd tourist-safety-backend
npm install
ncp .env.example .env  # or copy manually
# In .env set USE_SQLITE=1 to use SQLite (or 0 for JSON store)
npm start
# Runs on http://localhost:3000
```

### 1b) Backend (Docker Compose)
```bash
docker compose up backend
# Binds http://localhost:3000
# Uses SQLite at /app/data/tourist-safety.db (mounted volume)
```

### 2) Dashboard
```bash
cd ../dashboard
npm install
# Port is pinned via .env: PORT=3002
npm start
# Opens http://localhost:3002
```

### 3) Mobile App
```bash
cd ../mobile-app
npm install
# If you see Tailwind/PostCSS issues on CRA 5, use Tailwind v3 (already configured in package.json)
# Port is pinned via .env: PORT=3003
npm start
# Opens http://localhost:3003
```

## Features
- Live alerts via SSE with polling fallback.
- Geofences with risk (`red|yellow|green`) and `regionId`.
- Region/time filters and CSV export on the dashboard.
- Incident workflow: acknowledge/resolve (SSE updates).
- Safety score per region (0–900, sample heuristic) displayed on dashboard and mobile.
- Mobile app: SOS, offline queue, QR ID, safety banner, emergency contacts, language toggle (English/Assamese), share location, and soft alerts ("I'm safe", "Low battery").

## Endpoints (Backend)
- `POST /panic-alert` – Create an emergency incident.
- `POST /soft-alert` – Create a soft status incident (type: `safe` | `low_battery` | `status`).
- `GET /panic-alerts/stream` – SSE stream of alerts + updates.
- `GET /incidents` – List incidents (recent).
- `GET /incidents/filter?regionId=...&minutes=...` – Filtered incidents.
- `GET /incidents/export?regionId=...&minutes=...` – CSV export.
- `GET /geofences` / `POST /geofences` – Manage geofences.
- `GET /safety-score?regionId=...` – Region safety score.

## Demo Script
1. Seed or verify North-East geofences on backend (`ne-shillong-central`, `ne-guwahati-central`). These auto-seed on first run.
2. Dashboard (`http://localhost:3002`):
   - Choose Region (e.g., `shillong`).
   - Toggle "Test Alert Mode" and click inside a seeded polygon; see Risk tag and table update.
   - Try Acknowledge/Resolve and see status update live.
   - Use Time Window + Export CSV.
3. Mobile App (`http://localhost:3001`):
   - Register tourist, pair device (optional), and send SOS.
   - See Safety banner (score + risk) and QR ID.
   - Use Emergency Contacts quick dial.
   - Change Language to Assamese.
   - Share Location and copy link.
   - Send soft alerts: "I'm safe" or "Low battery".

## Customizable Emergency Contacts
Contacts are now region-aware from the backend.
- Backend: `GET /regions` returns `{ id, name, contacts[] }`.
- Mobile: `mobile-app/src/App.js` fetches regions on load and shows `contacts` from the current `regionId` (fallback `default`).

## Screenshots
Add screenshots to `docs/` and reference here:
- `docs/dashboard.png`
- `docs/mobile_home.png`
- `docs/mobile_qr.png`

## Git Workflow
```bash
# from repo root
git checkout -b feature/your-change
# ...edit code...
git add -A
git commit -m "Describe your change"
git push -u origin feature/your-change
# Open a PR on GitHub
```

## Notes
- Local persistence file: `tourist-safety-backend/tourist-safety.json` (gitignored).
- CORS/SSE are enabled for local dev.
- Tailwind v3 is configured for CRA 5 in the mobile app.
- DB mode endpoint: `GET /db-mode` → `{ mode: 'sqlite' | 'json' }`.

## Working links:
Backend - https://smart-tourist-safety-v1xd.onrender.com/                                                                                                                                 Mobile app - https://smart-tourist-safety-7aa08-mobile.web.app/                                                                                                                           Dashboard - https://smart-tourist-safety-7aa08-dash.web.app/
