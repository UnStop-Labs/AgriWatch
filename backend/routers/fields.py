from __future__ import annotations

from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Alert, Field, SatelliteReading
from schemas import DashboardFinancials, FieldCreate, FieldIntelligence, FieldRead, FieldSummary, Recommendation
from services.anomaly_engine import compute_health_status
from services.intelligence import compute_field_intelligence
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


@router.get("/{field_id}/intelligence", response_model=FieldIntelligence)
def get_field_intelligence(field_id: int, db: Session = Depends(get_db)):
    field = db.get(Field, field_id)
    if not field:
        raise HTTPException(404, "Field not found")

    from_ts = datetime.utcnow() - timedelta(days=30)
    readings_30d = (
        db.query(SatelliteReading)
        .filter(SatelliteReading.field_id == field_id, SatelliteReading.timestamp >= from_ts)
        .order_by(SatelliteReading.timestamp.asc())
        .all()
    )
    active_alerts = (
        db.query(func.count(Alert.id))
        .filter(Alert.field_id == field_id, Alert.acknowledged == False)
        .scalar()
    )

    intel = compute_field_intelligence(field, readings_30d, active_alerts)
    return FieldIntelligence(
        field_id=field.id,
        field_name=field.name,
        crop_type=field.crop_type,
        area_ha=field.area_ha,
        **intel,
        recommendations=[Recommendation(**r) for r in intel["recommendations"]],
    )


@router.get("/intelligence/dashboard", response_model=DashboardFinancials)
def get_dashboard_financials(db: Session = Depends(get_db)):
    fields = db.query(Field).all()
    from_ts = datetime.utcnow() - timedelta(days=30)
    result = []

    for field in fields:
        readings_30d = (
            db.query(SatelliteReading)
            .filter(SatelliteReading.field_id == field.id, SatelliteReading.timestamp >= from_ts)
            .order_by(SatelliteReading.timestamp.asc())
            .all()
        )
        active_alerts = (
            db.query(func.count(Alert.id))
            .filter(Alert.field_id == field.id, Alert.acknowledged == False)
            .scalar()
        )
        intel = compute_field_intelligence(field, readings_30d, active_alerts)
        result.append(FieldIntelligence(
            field_id=field.id,
            field_name=field.name,
            crop_type=field.crop_type,
            area_ha=field.area_ha,
            **intel,
            recommendations=[Recommendation(**r) for r in intel["recommendations"]],
        ))

    return DashboardFinancials(
        total_yield_forecast_tons=round(sum(f.yield_forecast_tons for f in result), 1),
        total_water_savings_usd=sum(f.water_savings_usd for f in result),
        total_fertilizer_savings_usd=sum(f.fertilizer_savings_usd for f in result),
        total_spray_savings_usd=sum(f.spray_savings_usd for f in result),
        total_savings_usd=sum(f.total_savings_usd for f in result),
        fields=result,
    )


@router.post("/{field_id}/seed", response_model=dict)
def seed_field_endpoint(field_id: int, days: int = 30, db: Session = Depends(get_db)):
    from services.anomaly_engine import evaluate
    from services.scheduler import get_config

    field = db.get(Field, field_id)
    if not field:
        raise HTTPException(404, "Field not found")
    db.query(Alert).filter(Alert.field_id == field_id).delete()
    db.query(SatelliteReading).filter(SatelliteReading.field_id == field_id).delete()
    db.flush()

    readings_data = seed_historical(field.id, field.crop_type, days=days)
    thresholds = get_config()
    alerts_generated = 0

    # Insert readings one at a time and run anomaly detection in chronological order
    # so cooldown windows work correctly across historical data
    persisted = []
    active_alerts_cache: List[dict] = []

    for rd in readings_data:
        reading_orm = SatelliteReading(**rd)
        db.add(reading_orm)
        db.flush()  # get the assigned id

        history = [
            {
                "ndvi": r.ndvi,
                "soil_moisture": r.soil_moisture,
                "surface_temp_c": r.surface_temp_c,
                "data_quality": r.data_quality,
            }
            for r in persisted[-12:]
        ]

        reading_dict = {
            "field_id": field.id,
            "crop_type": field.crop_type,
            "ndvi": reading_orm.ndvi,
            "soil_moisture": reading_orm.soil_moisture,
            "surface_temp_c": reading_orm.surface_temp_c,
            "data_quality": reading_orm.data_quality,
            "timestamp": reading_orm.timestamp,
        }

        new_alerts = evaluate(reading_dict, history, active_alerts_cache, thresholds)
        for alert_data in new_alerts:
            alert_data["reading_id"] = reading_orm.id
            alert_orm = Alert(**alert_data)
            db.add(alert_orm)
            active_alerts_cache.append({
                "alert_type": alert_data["alert_type"],
                "triggered_at": alert_data["triggered_at"],
            })
            alerts_generated += 1

        persisted.append(reading_orm)

    db.commit()
    return {"seeded": len(readings_data), "alerts_generated": alerts_generated, "days": days}
