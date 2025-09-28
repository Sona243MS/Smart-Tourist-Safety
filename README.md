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

### New (NE Languages, Assam focus, Safety Credit, Digital ID)
- North-Eastern languages in mobile: Assamese, Bengali (bn), Bodo (brx) with placeholders for Manipuri (mni), Khasi (kha), Garo (grt), Mizo (lus) and English fallback.
- Assam tourist spots seeded as geofences (demo polygons): Kaziranga, Kamakhya, Umananda, Majuli, Pobitora.
- Safety Credit (CIBIL-like) score per region/place: `GET /safety-credit?regionId=assam&placeId=kamakhya`.
- Digital ID (DID) issuance and verification with signed JWTs: `POST /did/issue`, `POST /did/verify`. Mobile auto-attaches `Authorization: Bearer <token>`.

## Endpoints (Backend)
- `POST /panic-alert` – Create an emergency incident.
- `POST /soft-alert` – Create a soft status incident (type: `safe` | `low_battery` | `status`).
- `GET /panic-alerts/stream` – SSE stream of alerts + updates.
- `GET /incidents` – List incidents (recent).
- `GET /incidents/filter?regionId=...&minutes=...` – Filtered incidents.
- `GET /incidents/export?regionId=...&minutes=...` – CSV export.
- `GET /geofences` / `POST /geofences` – Manage geofences.
- `GET /safety-score?regionId=...` – Region safety score.
- `GET /safety-credit?regionId=...&placeId=...&days=...` – Safety Credit Score with component breakdown.
- `POST /did/issue` – Issue a signed DID token (JWT). Body: `{ kycType, kycHash, validDays }`.
- `POST /did/verify` – Verify a DID token. Body: `{ token }`.

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

## Languages
- Mobile UI supports: English (`en`), Assamese (`as`), Bengali (`bn`), Bodo (`brx`), with placeholders for Manipuri (`mni`), Khasi (`kha`), Garo (`grt`), Mizo (`lus`). Missing keys fall back to English.

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

## Deployment (Firebase Hosting for frontends)
To host Dashboard and Mobile under one Firebase project:
1. Create `.env.production` in `dashboard/` and `mobile-app/` with:
   - `REACT_APP_API_BASE=https://YOUR-BACKEND.onrender.com`
2. Build frontends:
   - `cd dashboard && npm install && npm run build`
   - `cd ../mobile-app && npm install && npm run build`
3. In repo root, set up multi-site hosting:
   - `firebase login`
   - `firebase hosting:sites:create <dashboard-site-id>`
   - `firebase hosting:sites:create <mobile-site-id>`
   - `firebase init hosting` → use existing project → not single-site
   - `firebase target:apply hosting dashboard <dashboard-site-id>`
   - `firebase target:apply hosting mobile <mobile-site-id>`
4. Ensure `firebase.json` maps:
   - Dashboard → `public: dashboard/build`, SPA rewrites
   - Mobile → `public: mobile-app/build`, SPA rewrites
5. Deploy:
   - `firebase deploy --only hosting:dashboard`
   - `firebase deploy --only hosting:mobile`

## On-chain DID Anchoring (Polygon testnet)

The backend supports optional EVM anchoring of issued Digital IDs. When enabled via environment variables, every `POST /did/issue` call will hash the DID issuance payload and attempt to call your Registry contract on-chain. The dashboard Anchors panel will show a "View on explorer" link if a transaction hash is available.

### Environment variables (Render backend)

- `CHAIN_NETWORK` – e.g., `polygon-amoy` (or `ethereum-sepolia`)
- `CHAIN_EVM_RPC` – RPC endpoint, e.g., `https://polygon-amoy.g.alchemy.com/v2/<KEY>`
- `CHAIN_PRIVATE_KEY` – Private key for the deployer/account (testnet). Keep this secret.
- `CHAIN_REGISTRY_ADDRESS` – Deployed registry contract address.
- `CHAIN_EXPLORER_TX` – Explorer base for tx links, e.g., `https://amoy.polygonscan.com/tx/`

If these are not set, the backend falls back to local anchoring in `data/did-anchors.json`.

### Expected Registry ABI

The backend calls a single function on your registry. Solidity signature:

```solidity
function anchor(bytes32 digest, string memory didId) public returns (bool);
```

Minimal ABI used by the backend (ethers v6):

```json
[
  "function anchor(bytes32 digest, string didId) public returns (bool)"
]
```

### How it works

- Backend computes a SHA-256 digest of `{ didId, kycHash, expiresAtISO }`.
- If chain env is configured, it sends a transaction to `anchor(digest, didId)`.
- Response stores `txHash` (if available) and marks anchor `status: anchored-onchain`.
- The dashboard shows a link to `${CHAIN_EXPLORER_TX}${txHash}`.

### Notes

- Use a funded testnet account for `CHAIN_PRIVATE_KEY`.
- Keep the private key only in Render environment variables.
- For production, consider gas policies, rate limits, and retries.

