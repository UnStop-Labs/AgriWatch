from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Alert, Field, SatelliteReading
from schemas import IngestResult, ReadingsSummary, SatelliteReadingRead
from services.anomaly_engine import compute_health_status
from services.scheduler import run_ingest_cycle

router = APIRouter(prefix="/api/readings", tags=["readings"])


@router.get("/summary", response_model=List[ReadingsSummary])
def readings_summary(db: Session = Depends(get_db)):
    fields = db.query(Field).all()
    result = []
    cutoff_7d = datetime.utcnow() - timedelta(days=7)
    for field in fields:
        avg_ndvi = (
            db.query(func.avg(SatelliteReading.ndvi))
            .filter(
                SatelliteReading.field_id == field.id,
                SatelliteReading.timestamp >= cutoff_7d,
                SatelliteReading.data_quality == "good",
            )
            .scalar()
        )
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
        result.append(
            ReadingsSummary(
                field_id=field.id,
                field_name=field.name,
                crop_type=field.crop_type,
                avg_ndvi_7d=round(avg_ndvi, 4) if avg_ndvi else None,
                latest_ndvi=latest.ndvi if latest else None,
                latest_soil_moisture=latest.soil_moisture if latest else None,
                latest_temp_c=latest.surface_temp_c if latest else None,
                active_alerts=active_alerts,
                health_status=compute_health_status(
                    latest.ndvi if latest else None, active_alerts
                ),
            )
        )
    return result


@router.get("/ingest", response_model=IngestResult)
def trigger_ingest():
    result = run_ingest_cycle()
    return result


@router.get("/{field_id}/latest", response_model=Optional[SatelliteReadingRead])
def latest_reading(field_id: int, db: Session = Depends(get_db)):
    return (
        db.query(SatelliteReading)
        .filter(SatelliteReading.field_id == field_id)
        .order_by(SatelliteReading.timestamp.desc())
        .first()
    )


@router.get("/{field_id}", response_model=List[SatelliteReadingRead])
def get_readings(
    field_id: int,
    from_dt: Optional[datetime] = Query(None, alias="from"),
    to_dt: Optional[datetime] = Query(None, alias="to"),
    limit: int = Query(500, le=2000),
    db: Session = Depends(get_db),
):
    q = db.query(SatelliteReading).filter(SatelliteReading.field_id == field_id)
    if from_dt:
        q = q.filter(SatelliteReading.timestamp >= from_dt)
    if to_dt:
        q = q.filter(SatelliteReading.timestamp <= to_dt)
    return q.order_by(SatelliteReading.timestamp.asc()).limit(limit).all()
