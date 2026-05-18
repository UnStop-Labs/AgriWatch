from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Alert, Field, SatelliteReading
from services.disease_detection import analyze_disease, predict_yield

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _get_field_with_readings(field_id: int, db: Session):
    field = db.query(Field).filter(Field.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    from datetime import datetime, timedelta
    cutoff = datetime.utcnow() - timedelta(days=30)
    readings = (
        db.query(SatelliteReading)
        .filter(SatelliteReading.field_id == field_id, SatelliteReading.captured_at >= cutoff)
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


@router.get("/overview")
def get_analytics_overview(db: Session = Depends(get_db)):
    fields = db.query(Field).all()
    from datetime import datetime, timedelta
    cutoff = datetime.utcnow() - timedelta(days=30)
    result = []
    for field in fields:
        readings = (
            db.query(SatelliteReading)
            .filter(SatelliteReading.field_id == field.id, SatelliteReading.captured_at >= cutoff)
            .all()
        )
        disease = analyze_disease(field, readings)
        yield_pred = predict_yield(field, readings)
        result.append({
            "field_id": field.id,
            "field_name": field.name,
            "crop_type": field.crop_type,
            "area_ha": field.area_ha,
            "health_score": disease["health_score"],
            "risk_level": disease["risk_level"],
            "disease_risk_pct": disease["disease_risk_pct"],
            "detected_stress_count": len(disease["detected_stress"]),
            "yield_forecast_tons": yield_pred["yield_forecast_total_tons"],
            "yield_confidence": yield_pred["confidence_pct"],
            "quality_score": yield_pred["quality_score"],
            "revenue_estimate_usd": yield_pred["revenue_estimate_usd"],
        })
    return result
