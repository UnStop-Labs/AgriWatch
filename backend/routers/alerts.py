from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Alert, Field
from schemas import AlertRead, AlertStats

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


def _to_read(alert: Alert, db: Session) -> AlertRead:
    field = db.get(Field, alert.field_id)
    return AlertRead(
        id=alert.id,
        field_id=alert.field_id,
        field_name=field.name if field else "Unknown",
        reading_id=alert.reading_id,
        alert_type=alert.alert_type,
        severity=alert.severity,
        message=alert.message,
        triggered_at=alert.triggered_at,
        acknowledged=alert.acknowledged,
        acknowledged_at=alert.acknowledged_at,
    )


@router.get("", response_model=List[AlertRead])
def list_alerts(
    field_id: Optional[int] = None,
    severity: Optional[str] = None,
    acknowledged: Optional[bool] = None,
    limit: int = Query(50, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(Alert)
    if field_id is not None:
        q = q.filter(Alert.field_id == field_id)
    if severity:
        q = q.filter(Alert.severity == severity)
    if acknowledged is not None:
        q = q.filter(Alert.acknowledged == acknowledged)
    alerts = q.order_by(Alert.triggered_at.desc()).limit(limit).all()
    return [_to_read(a, db) for a in alerts]


@router.get("/stats", response_model=AlertStats)
def alert_stats(db: Session = Depends(get_db)):
    all_alerts = db.query(Alert).all()
    by_severity: Dict[str, int] = {}
    by_type: Dict[str, int] = {}
    unacknowledged = 0
    for a in all_alerts:
        by_severity[a.severity] = by_severity.get(a.severity, 0) + 1
        by_type[a.alert_type] = by_type.get(a.alert_type, 0) + 1
        if not a.acknowledged:
            unacknowledged += 1
    return AlertStats(
        total=len(all_alerts),
        by_severity=by_severity,
        by_type=by_type,
        unacknowledged=unacknowledged,
    )


@router.get("/{alert_id}", response_model=AlertRead)
def get_alert(alert_id: int, db: Session = Depends(get_db)):
    from fastapi import HTTPException
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(404, "Alert not found")
    return _to_read(alert, db)


@router.patch("/{alert_id}/acknowledge", response_model=AlertRead)
def acknowledge_alert(alert_id: int, db: Session = Depends(get_db)):
    from fastapi import HTTPException
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(404, "Alert not found")
    alert.acknowledged = True
    alert.acknowledged_at = datetime.utcnow()
    db.commit()
    db.refresh(alert)
    return _to_read(alert, db)


@router.patch("/acknowledge-all", response_model=Dict[str, int])
def acknowledge_all(field_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(Alert).filter(Alert.acknowledged == False)
    if field_id is not None:
        q = q.filter(Alert.field_id == field_id)
    now = datetime.utcnow()
    count = 0
    for alert in q.all():
        alert.acknowledged = True
        alert.acknowledged_at = now
        count += 1
    db.commit()
    return {"acknowledged": count}
