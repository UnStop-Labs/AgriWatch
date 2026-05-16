# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                     React Frontend                       │
│   Dashboard · Field Map · Field Detail · Alerts         │
│         Polling every 30–60s via usePolling()           │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP/REST
┌────────────────────────▼────────────────────────────────┐
│                   FastAPI Backend                        │
│  /api/fields  /api/readings  /api/alerts  /api/system   │
│                                                         │
│  ┌──────────────┐   ┌──────────────────────────────┐   │
│  │  APScheduler  │   │      Anomaly Engine          │   │
│  │  (15 min)    │──▶│  7 rules · cooldown logic    │   │
│  └──────────────┘   └──────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │             SQLite Database                       │   │
│  │  fields · satellite_readings · alerts            │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────┐
│  Satellite Mock      │
│  Generator          │
│  (realistic NDVI,   │
│  soil moisture,     │
│  surface temp)      │
└─────────────────────┘
```

## Data Flow

### Ingest Cycle (every 15 minutes)

```
APScheduler.run_ingest_cycle()
  │
  ├── for each Field in DB:
  │     ├── satellite_mock.generate_reading(field, timestamp, previous)
  │     │     ├── NDVI: seasonal sine + random walk + stress events (5% chance)
  │     │     ├── Soil moisture: random walk + rainfall simulation
  │     │     ├── Surface temp: diurnal cycle + seasonal + heat waves (3% chance)
  │     │     └── Cloud cover: gamma distributed → marks data_quality
  │     │
  │     ├── INSERT SatelliteReading
  │     │
  │     ├── FETCH last 12 readings (history window)
  │     ├── FETCH active alerts (cooldown reference)
  │     │
  │     └── anomaly_engine.evaluate(reading, history, active_alerts)
  │           ├── Skip if data_quality == "missing"
  │           ├── Check compound rule first (Rule 7)
  │           ├── Evaluate Rules 1–6 in order
  │           ├── Check cooldown per rule type
  │           └── Return list of new Alert dicts
  │
  └── INSERT new Alerts, COMMIT
```

### Frontend Polling

```
Dashboard     → GET /api/readings/summary   (60s interval)
              → GET /api/alerts?ack=false   (30s interval)

FieldDetail   → GET /api/fields/{id}        (60s interval)
              → GET /api/readings/{id}      (60s interval)
              → GET /api/alerts?field_id=   (30s interval)

Navbar        → GET /api/alerts?ack=false   (30s interval, for badge count)
```

## Database Schema

```sql
CREATE TABLE fields (
    id          INTEGER PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    crop_type   VARCHAR(50)  NOT NULL,
    area_ha     FLOAT        NOT NULL,
    geojson     TEXT         NOT NULL,   -- GeoJSON Feature string
    created_at  DATETIME     DEFAULT NOW
);

CREATE TABLE satellite_readings (
    id               INTEGER PRIMARY KEY,
    field_id         INTEGER NOT NULL REFERENCES fields(id),
    timestamp        DATETIME NOT NULL,
    ndvi             FLOAT NOT NULL,      -- 0.0–1.0
    soil_moisture    FLOAT NOT NULL,      -- % volumetric water content
    surface_temp_c   FLOAT NOT NULL,      -- degrees Celsius
    cloud_cover_pct  FLOAT NOT NULL,      -- 0–100
    data_quality     VARCHAR(10) NOT NULL -- "good" | "degraded" | "missing"
);

CREATE TABLE alerts (
    id               INTEGER PRIMARY KEY,
    field_id         INTEGER NOT NULL REFERENCES fields(id),
    reading_id       INTEGER REFERENCES satellite_readings(id),
    alert_type       VARCHAR(50) NOT NULL,
    severity         VARCHAR(10) NOT NULL,  -- "low"|"medium"|"high"|"critical"
    message          TEXT        NOT NULL,
    triggered_at     DATETIME    NOT NULL,
    acknowledged     BOOLEAN     DEFAULT FALSE,
    acknowledged_at  DATETIME
);
```

## Anomaly Engine

The engine is a **pure function** — it takes inputs and returns outputs without mutating state:

```python
evaluate(reading, history_window, active_alerts, thresholds) -> list[Alert]
```

This makes it:
- **Testable**: no mocks needed, just pass data
- **Restartable**: no in-memory state is lost on restart
- **Configurable**: thresholds passed at runtime via system config endpoint

### Cooldown Logic

Cooldowns are enforced by querying the `alerts` table for the same `(field_id, alert_type)` within a time window. No in-memory cache — the DB is the source of truth.

### Rule Priority

Rule 7 (compound anomaly) is evaluated first. If it fires, individual rules 1, 3, and 5 are skipped for that reading to prevent alert flooding.

## Mock Satellite Data

The generator (`satellite_mock.py`) produces deterministic yet realistic time-series using:

| Signal | Technique |
|---|---|
| NDVI | Crop-type base + seasonal sine wave + random walk + stress events |
| Soil moisture | Mean-reverting random walk + rainfall spikes |
| Surface temp | Diurnal sine (peak 14:00) + seasonal offset + heat waves |
| Cloud cover | Gamma distribution (skewed toward clear skies) |

Each reading uses a deterministic seed based on `field_id × 1000 + hour_timestamp`, so the same inputs always produce the same reading. This makes debugging reproducible.

## Frontend Architecture

```
App (BrowserRouter)
├── Navbar (polling 30s for unread alert count)
└── Routes
    ├── / → Dashboard
    │         usePolling(getReadingsSummary, 60s)
    │         usePolling(getAlerts, 30s)
    ├── /map → FieldMap
    │         usePolling(getFields, 60s)
    │         Leaflet GeoJSON polygons colored by NDVI
    ├── /fields → Fields (CRUD)
    ├── /fields/:id → FieldDetail
    │         usePolling(getField, 60s)
    │         usePolling(getReadings, 60s)   ← time-range aware
    │         usePolling(getAlerts, 30s)
    │         Recharts: LineChart + AreaChart (syncId for crosshair sync)
    └── /alerts → Alerts
              usePolling(getAlerts, 30s)
              usePolling(getAlertStats, 30s)
```

## Key Design Decisions

**SQLite over Postgres** — Zero infrastructure for MVP. SQLAlchemy abstractions mean a Postgres migration is a one-line engine URL change.

**Stateless anomaly engine** — No in-memory rule state means the engine is trivially testable and survives restarts. Cooldown logic queries the DB.

**Polling over WebSockets** — For satellite data that's batched at 15-minute intervals, 60-second polling is operationally equivalent to real-time push and eliminates WebSocket complexity.

**Mock data with realistic physics** — Sine waves, random walks, and mean reversion produce time-series data that triggers rules naturally and charts well, making the system self-demonstrating.
