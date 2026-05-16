from __future__ import annotations

from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Alert, Field, SatelliteReading
from schemas import FieldCreate, FieldRead, FieldSummary
from services.anomaly_engine import compute_health_status
from services.satellite_mock import seed_historical

router = APIRouter(prefix="/api/fields", tags=["fields"])


def _build_summary(field: Field, db: Session) -> FieldSummary:
    latest = (
        db.query(SatelliteReading)
        .filter(
            SatelliteReading.field_id == field.id,
            SatelliteReading.data_quality != "missing",
        )
        .order_by(SatelliteReading.timestamp.desc())
        .first()
    )
    active_alerts = (
        db.query(func.count(Alert.id))
        .filter(Alert.field_id == field.id, Alert.acknowledged == False)
        .scalar()
    )
    latest_ndvi = latest.ndvi if latest else None
    health = compute_health_status(latest_ndvi, active_alerts)
    return FieldSummary(
        id=field.id,
        name=field.name,
        crop_type=field.crop_type,
        area_ha=field.area_ha,
        geojson=field.geojson,
        created_at=field.created_at,
        latest_ndvi=latest_ndvi,
        latest_soil_moisture=latest.soil_moisture if latest else None,
        latest_temp_c=latest.surface_temp_c if latest else None,
        latest_reading_at=latest.timestamp if latest else None,
        active_alert_count=active_alerts,
        health_status=health,
    )


@router.get("", response_model=List[FieldSummary])
def list_fields(db: Session = Depends(get_db)):
    fields = db.query(Field).order_by(Field.created_at).all()
    return [_build_summary(f, db) for f in fields]


@router.post("", response_model=FieldRead, status_code=201)
def create_field(body: FieldCreate, db: Session = Depends(get_db)):
    field = Field(**body.model_dump())
    db.add(field)
    db.commit()
    db.refresh(field)
    return field


@router.get("/{field_id}", response_model=FieldSummary)
def get_field(field_id: int, db: Session = Depends(get_db)):
    field = db.get(Field, field_id)
    if not field:
        raise HTTPException(404, "Field not found")
    return _build_summary(field, db)


@router.put("/{field_id}", response_model=FieldRead)
def update_field(field_id: int, body: FieldCreate, db: Session = Depends(get_db)):
    field = db.get(Field, field_id)
    if not field:
        raise HTTPException(404, "Field not found")
    for k, v in body.model_dump().items():
        setattr(field, k, v)
    db.commit()
    db.refresh(field)
    return field


@router.delete("/{field_id}", status_code=204)
def delete_field(field_id: int, db: Session = Depends(get_db)):
    field = db.get(Field, field_id)
    if not field:
        raise HTTPException(404, "Field not found")
    db.delete(field)
    db.commit()


@router.post("/{field_id}/seed", response_model=dict)
def seed_field_endpoint(field_id: int, days: int = 30, db: Session = Depends(get_db)):
    field = db.get(Field, field_id)
    if not field:
        raise HTTPException(404, "Field not found")
    db.query(Alert).filter(Alert.field_id == field_id).delete()
    db.query(SatelliteReading).filter(SatelliteReading.field_id == field_id).delete()
    db.flush()

    readings_data = seed_historical(field.id, field.crop_type, days=days)
    for rd in readings_data:
        db.add(SatelliteReading(**rd))
    db.commit()
    return {"seeded": len(readings_data), "days": days}
