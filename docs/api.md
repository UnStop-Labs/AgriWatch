# API Reference

Base URL: `http://localhost:8000` (local) or your Render deployment URL.

Interactive Swagger UI: `{BASE_URL}/docs`

---

## Fields

### List all fields
```
GET /api/fields
```
Returns all fields with their latest satellite reading summary and health status.

**Response**
```json
[
  {
    "id": 1,
    "name": "North Wheat Block",
    "crop_type": "wheat",
    "area_ha": 45.0,
    "geojson": "{...}",
    "created_at": "2026-05-16T00:00:00",
    "latest_ndvi": 0.452,
    "latest_soil_moisture": 42.9,
    "latest_temp_c": 27.8,
    "latest_reading_at": "2026-05-16T10:00:00",
    "active_alert_count": 0,
    "health_status": "watch"
  }
]
```

`health_status` values: `healthy` · `watch` · `warning` · `critical` · `unknown`

---

### Create field
```
POST /api/fields
```

**Body**
```json
{
  "name": "East Barley Field",
  "crop_type": "wheat",
  "area_ha": 30.0,
  "geojson": "{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[...]]]}}"
}
```

---

### Get field detail
```
GET /api/fields/{field_id}
```

Returns field with full health summary (same shape as list item).

---

### Update field
```
PUT /api/fields/{field_id}
```
Same body as POST.

---

### Delete field
```
DELETE /api/fields/{field_id}
```
Cascades — deletes all readings and alerts for this field.

---

### Seed historical data
```
POST /api/fields/{field_id}/seed?days=30
```
Wipes and regenerates mock satellite data for the field. Useful for demos or resetting state.

**Query params**
- `days` (int, default 30) — how many days of history to generate

**Response**
```json
{ "seeded": 720, "days": 30 }
```

---

## Readings

### Get time-series readings for a field
```
GET /api/readings/{field_id}
```

**Query params**
| Param | Type | Description |
|---|---|---|
| `from` | ISO datetime | Start of range (inclusive) |
| `to` | ISO datetime | End of range (inclusive) |
| `limit` | int (max 2000) | Max readings returned (default 500) |

**Response**
```json
[
  {
    "id": 554,
    "field_id": 1,
    "timestamp": "2026-05-09T04:00:00",
    "ndvi": 0.6334,
    "soil_moisture": 30.6,
    "surface_temp_c": 27.84,
    "cloud_cover_pct": 41.7,
    "data_quality": "good"
  }
]
```

`data_quality` values: `good` · `degraded` (cloud cover 70–90%) · `missing` (cloud cover >90%, sensor values are 0)

---

### Cross-field health summary
```
GET /api/readings/summary
```

Returns one summary object per field with 7-day average NDVI and latest readings.

---

### Trigger manual ingest
```
GET /api/readings/ingest
```

Immediately runs one ingest cycle across all fields (same as the scheduled job).

**Response**
```json
{ "fields_processed": 4, "readings_created": 4, "alerts_generated": 1 }
```

---

### Latest reading for a field
```
GET /api/readings/{field_id}/latest
```

Returns the single most recent reading (or null if none).

---

## Alerts

### List alerts
```
GET /api/alerts
```

**Query params**
| Param | Type | Description |
|---|---|---|
| `field_id` | int | Filter by field |
| `severity` | string | Filter by severity (`low`/`medium`/`high`/`critical`) |
| `acknowledged` | bool | Filter by ack status (`false` = active only) |
| `limit` | int (max 500) | Default 50 |

**Response**
```json
[
  {
    "id": 12,
    "field_id": 1,
    "field_name": "North Wheat Block",
    "reading_id": 731,
    "alert_type": "ndvi_rapid_decline",
    "severity": "medium",
    "message": "NDVI declined 0.18 in recent hours — possible disease, pest, or water stress",
    "triggered_at": "2026-05-14T08:00:00",
    "acknowledged": false,
    "acknowledged_at": null
  }
]
```

**Alert types**
| Type | Description |
|---|---|
| `ndvi_low` | NDVI below critical threshold |
| `ndvi_rapid_decline` | NDVI dropped sharply in 6 hours |
| `soil_dry` | Soil moisture critically low |
| `soil_waterlogged` | Soil moisture dangerously high |
| `heat_stress` | Surface temperature above heat threshold |
| `cold_stress` | Near-freezing temperature |
| `anomaly_cluster` | Multiple stress indicators simultaneously |

---

### Alert statistics
```
GET /api/alerts/stats
```

**Response**
```json
{
  "total": 47,
  "by_severity": { "critical": 3, "high": 12, "medium": 28, "low": 4 },
  "by_type": { "ndvi_rapid_decline": 18, "heat_stress": 11, "soil_dry": 7, "..." : "..." },
  "unacknowledged": 5
}
```

---

### Acknowledge alert
```
PATCH /api/alerts/{alert_id}/acknowledge
```

Marks alert as acknowledged, records timestamp. Returns updated alert.

---

### Bulk acknowledge
```
PATCH /api/alerts/acknowledge-all
```

**Query params**
- `field_id` (optional) — limit to one field

**Response**
```json
{ "acknowledged": 12 }
```

---

## System

### Health check
```
GET /api/system/health
```

```json
{ "status": "ok", "scheduler_running": true }
```

---

### Get detection thresholds
```
GET /api/system/config
```

```json
{
  "ingest_interval_minutes": 15,
  "ndvi_critical_threshold": 0.30,
  "ndvi_decline_threshold": 0.15,
  "soil_dry_threshold": 15.0,
  "soil_wet_threshold": 60.0,
  "heat_stress_threshold": 38.0,
  "frost_threshold": 2.0
}
```

---

### Update detection thresholds
```
PUT /api/system/config
```

Same body as GET response. Changes take effect immediately on the next ingest cycle — no restart required.

---

## Error Responses

All errors return a standard FastAPI error body:

```json
{ "detail": "Field not found" }
```

Common status codes:
- `404` — resource not found
- `422` — validation error (check request body / query params)
- `500` — internal server error (check backend logs)
