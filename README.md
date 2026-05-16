# 🌾 AgriWatch

**AI-powered agriculture monitoring platform** — detect crop stress, irrigation issues, and field anomalies days before they're visible to the human eye.

AgriWatch continuously ingests satellite data for your farm fields, runs a rule-based anomaly detection engine, and surfaces actionable alerts to operators through a clean dashboard — no hardware, no on-site inspections required.

---

## Screenshots

| Dashboard | Field Map | Field Detail |
|---|---|---|
| Live KPI cards, alert feed, field health table | Leaflet map with NDVI-colored polygons | Time-series charts for NDVI, moisture, temperature |

---

## Features

- **Real-time field monitoring** — satellite-derived NDVI, soil moisture, surface temperature
- **Anomaly detection engine** — 7 detection rules with cooldown logic (crop stress, irrigation issues, heat/frost events, compound failures)
- **Interactive map** — fields colored green→red by current vegetation health
- **Time-series charts** — 24h / 7d / 30d views with threshold reference lines
- **Alert management** — severity chips, per-field filtering, bulk acknowledge
- **Auto-ingest** — background scheduler polls every 15 minutes; manual trigger available
- **Zero hardware** — satellite data only, runs entirely in the browser + API

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python · FastAPI · SQLAlchemy · SQLite · APScheduler |
| Frontend | React 18 · Vite · Tailwind CSS · Recharts · Leaflet |
| Satellite data | Realistic mock generator (NDVI, soil moisture, temperature) |
| Anomaly engine | Rule-based, stateless, 7 detection rules |
| Deployment | Render (API) · Vercel (Frontend) |

---

## Quickstart (local)

### Prerequisites
- Python 3.9+
- Node 18+

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API starts at `http://localhost:8000`. On first run it:
- Creates `agriwatch.db` (SQLite)
- Seeds 4 default fields with 30 days of historical satellite data
- Starts the background ingest scheduler (every 15 min)

API docs available at `http://localhost:8000/docs`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard opens at `http://localhost:5173`

---

## Environment Variables

### Backend

| Variable | Default | Description |
|---|---|---|
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated list of allowed frontend origins |
| `PORT` | `8000` | Port (set automatically by Render) |

### Frontend

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | Backend API base URL |

---

## Deployment

### Backend → Render

1. Connect the GitHub repo to [Render](https://render.com)
2. Select **Web Service** → root directory: `backend`
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add env var: `CORS_ORIGINS=https://your-vercel-app.vercel.app`

Or use the included `render.yaml` for one-click deployment.

### Frontend → Vercel

1. Connect the GitHub repo to [Vercel](https://vercel.com)
2. Set root directory to `frontend`
3. Add env var: `VITE_API_URL=https://your-render-app.onrender.com`
4. Deploy

---

## Project Structure

```
agriwatch/
├── backend/
│   ├── main.py                  # FastAPI app, startup seed, CORS
│   ├── database.py              # SQLAlchemy engine + session
│   ├── models.py                # Field, SatelliteReading, Alert ORM models
│   ├── schemas.py               # Pydantic request/response schemas
│   ├── routers/
│   │   ├── fields.py            # Field CRUD + seed endpoint
│   │   ├── readings.py          # Time-series readings + manual ingest
│   │   ├── alerts.py            # Alert list, stats, acknowledge
│   │   └── system.py           # Health check + config tuning
│   ├── services/
│   │   ├── satellite_mock.py    # Realistic mock data generator
│   │   ├── anomaly_engine.py    # 7-rule detection engine
│   │   └── scheduler.py        # APScheduler background ingest loop
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/client.js        # Axios API client
│   │   ├── hooks/usePolling.js  # Generic polling hook
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx    # KPI cards + alert feed + field table
│   │   │   ├── FieldMap.jsx     # Leaflet map with NDVI polygons
│   │   │   ├── FieldDetail.jsx  # Time-series charts + alert history
│   │   │   ├── Fields.jsx       # Field management CRUD
│   │   │   └── Alerts.jsx       # Full alert list + filters
│   │   └── components/          # Navbar, StatCard, SeverityChip, etc.
│   ├── vercel.json
│   └── package.json
├── render.yaml                  # Render deployment config
└── docs/
    ├── architecture.md
    └── api.md
```

---

## Anomaly Detection Rules

| Rule | Trigger | Severity |
|---|---|---|
| NDVI Low | NDVI < 0.30 | High |
| NDVI Rapid Decline | Drop > 0.15 in 6 hours | Medium / High |
| Soil Dry | Moisture < 15% | High |
| Soil Waterlogged | Moisture > 60% | Medium |
| Heat Stress | Surface temp > 38°C | Medium / Critical |
| Cold Stress / Frost | Surface temp < 2°C | Critical |
| Compound Anomaly | NDVI low + soil dry + heat simultaneously | Critical |

All rules include cooldown windows (2–8 hours) to prevent alert flooding.

---

## API Overview

| Method | Path | Description |
|---|---|---|
| GET | `/api/fields` | List all fields with latest metrics |
| POST | `/api/fields` | Create a new field |
| GET | `/api/fields/{id}` | Field detail with health summary |
| POST | `/api/fields/{id}/seed` | Re-seed historical data |
| GET | `/api/readings/{field_id}` | Time-series readings (date range filter) |
| GET | `/api/readings/summary` | Cross-field health summary |
| GET | `/api/readings/ingest` | Trigger manual ingest cycle |
| GET | `/api/alerts` | List alerts (field, severity, ack filters) |
| GET | `/api/alerts/stats` | Alert counts by severity and type |
| PATCH | `/api/alerts/{id}/acknowledge` | Acknowledge single alert |
| PATCH | `/api/alerts/acknowledge-all` | Bulk acknowledge |
| GET | `/api/system/health` | Liveness + scheduler status |
| GET/PUT | `/api/system/config` | View/update detection thresholds |

Full interactive docs at `/docs` (Swagger UI).

---

## License

MIT
