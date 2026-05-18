from __future__ import annotations

import json
import math
import random
import time
from datetime import datetime, timedelta
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Field, SatelliteReading
from services.disease_detection import analyze_disease, predict_yield

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

RAI_TO_HA = 0.16  # 1 rai = 0.16 ha
CROP_TYPES = ["rice", "corn", "soy", "wheat", "vegetables"]


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─── helpers ─────────────────────────────────────────────────────────────────

def _make_bbox_geojson(lat: float, lng: float, area_ha: float) -> str:
    """Square GeoJSON polygon centred on lat/lng with given area."""
    side_m = math.sqrt(area_ha * 10_000)
    dlat = (side_m / 2) / 111_000
    dlng = (side_m / 2) / (111_000 * math.cos(math.radians(lat)))
    return json.dumps({
        "type": "Feature",
        "properties": {},
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [lng - dlng, lat - dlat],
                [lng + dlng, lat - dlat],
                [lng + dlng, lat + dlat],
                [lng - dlng, lat + dlat],
                [lng - dlng, lat - dlat],
            ]],
        },
    })


def _synthetic_readings(lat: float, lng: float, n: int = 30) -> list:
    """
    Generate n spatially coherent synthetic readings for a coordinate.
    Stable per location; drifts slightly every 8 minutes (same bucket trick
    as the irrigation endpoint).
    """
    location_seed = int(abs(lat * 9_973) + abs(lng * 9_967)) % 999_983
    time_bucket = int(time.time() / 480)

    base_rng = random.Random(location_seed)
    base_ndvi = base_rng.uniform(0.32, 0.72)
    base_sm = base_rng.uniform(16, 68)
    base_temp = base_rng.uniform(24, 38)

    readings = []
    for i in range(n):
        day_rng = random.Random(location_seed + i * 97 + time_bucket * 3)
        readings.append(SimpleNamespace(
            ndvi=max(0.10, min(0.90, base_ndvi + day_rng.gauss(0, 0.04))),
            soil_moisture=max(5.0, min(90.0, base_sm + day_rng.gauss(0, 3.5))),
            surface_temp_c=max(18.0, min(42.0, base_temp + day_rng.gauss(0, 1.5))),
            data_quality="good",
        ))
    return readings


def _synthetic_field(lat: float, lng: float, area_ha: float,
                     crop_type: str, location_seed: int):
    """Thin field-like object accepted by the service functions."""
    return SimpleNamespace(
        id=location_seed,
        name=f"Field @ {lat:.4f}, {lng:.4f}",
        crop_type=crop_type,
        area_ha=area_ha,
        geojson=_make_bbox_geojson(lat, lng, area_ha),
        planting_date=None,
        water_cost_per_m3=0.20,
        baseline_water_m3_ha=None,
        baseline_fertilizer_kg_ha=None,
        baseline_spray_usd_ha=None,
    )


# ─── coordinate-based endpoint (no DB required) ──────────────────────────────

@router.get("/analyze")
def analyze_by_coordinates(
    lat: float,
    lng: float,
    area_ha: float = 1.6,
    crop_type: str = "rice",
):
    """
    Full disease + yield analysis for any coordinates.
    No database field required — everything is derived from lat/lng.
    area_ha should already be converted from rai on the frontend (1 rai = 0.16 ha).
    """
    if crop_type not in CROP_TYPES:
        crop_type = "rice"

    location_seed = int(abs(lat * 9_973) + abs(lng * 9_967)) % 999_983
    readings = _synthetic_readings(lat, lng, n=30)
    field = _synthetic_field(lat, lng, area_ha, crop_type, location_seed)

    disease = analyze_disease(field, readings)
    yield_pred = predict_yield(field, readings)

    return {
        "disease": disease,
        "yield": yield_pred,
        "analyzed_at": datetime.utcnow().isoformat() + "Z",
    }


# ─── field-id–based endpoints (kept for Field Detail page future use) ─────────

def _get_field_with_readings(field_id: int, db: Session):
    field = db.query(Field).filter(Field.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    cutoff = datetime.utcnow() - timedelta(days=30)
    readings = (
        db.query(SatelliteReading)
        .filter(
            SatelliteReading.field_id == field_id,
            SatelliteReading.captured_at >= cutoff,
        )
        .order_by(SatelliteReading.captured_at.desc())
        .all()
    )
    return field, readings


@router.get("/disease/{field_id}")
def get_disease_analysis(field_id: int, db: Session = Depends(get_db)):
    field, readings = _get_field_with_readings(field_id, db)
    return analyze_disease(field, readings)


@router.get("/yield/{field_id}")
def get_yield_prediction(field_id: int, db: Session = Depends(get_db)):
    field, readings = _get_field_with_readings(field_id, db)
    return predict_yield(field, readings)
