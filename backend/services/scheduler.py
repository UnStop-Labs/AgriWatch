from __future__ import annotations

import logging
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler

from database import SessionLocal
from models import Alert, Field, SatelliteReading
from services.anomaly_engine import evaluate
from services.line_notify import send_alert
from services.satellite_mock import generate_reading

logger = logging.getLogger(__name__)

_scheduler = BackgroundScheduler()
_config = {
    "ingest_interval_minutes": 15,
    "ndvi_critical_threshold": 0.30,
    "ndvi_decline_threshold": 0.15,
    "soil_dry_threshold": 15.0,
    "soil_wet_threshold": 60.0,
    "heat_stress_threshold": 38.0,
    "frost_threshold": 2.0,
}


def get_config() -> dict:
    return dict(_config)


def update_config(updates: dict):
    _config.update(updates)
    _reschedule()


def _reschedule():
    if _scheduler.get_job("ingest"):
        _scheduler.remove_job("ingest")
    _scheduler.add_job(
        run_ingest_cycle,
        "interval",
        minutes=_config["ingest_interval_minutes"],
        id="ingest",
    )


def run_ingest_cycle() -> dict:
    db = SessionLocal()
    try:
        fields = db.query(Field).all()
        readings_created = 0
        alerts_generated = 0

        for field in fields:
            last = (
                db.query(SatelliteReading)
                .filter(SatelliteReading.field_id == field.id)
                .order_by(SatelliteReading.timestamp.desc())
                .first()
            )
            previous = None
            if last:
                previous = {
                    "ndvi": last.ndvi,
                    "soil_moisture": last.soil_moisture,
                    "surface_temp_c": last.surface_temp_c,
                    "data_quality": last.data_quality,
                }

            reading_data = generate_reading(
                field.id, field.crop_type, datetime.utcnow(), previous
            )
            reading = SatelliteReading(**reading_data)
            db.add(reading)
            db.flush()
            readings_created += 1

            history_rows = (
                db.query(SatelliteReading)
                .filter(SatelliteReading.field_id == field.id)
                .order_by(SatelliteReading.timestamp.desc())
                .limit(12)
                .all()
            )
            history = [
                {
                    "ndvi": r.ndvi,
                    "soil_moisture": r.soil_moisture,
                    "surface_temp_c": r.surface_temp_c,
                    "data_quality": r.data_quality,
                }
                for r in reversed(history_rows)
            ]

            active_alert_rows = (
                db.query(Alert)
                .filter(Alert.field_id == field.id, Alert.acknowledged == False)
                .all()
            )
            active_alerts = [
                {
                    "alert_type": a.alert_type,
                    "triggered_at": a.triggered_at,
                }
                for a in active_alert_rows
            ]

            reading_dict = {
                "field_id": field.id,
                "crop_type": field.crop_type,
                "ndvi": reading.ndvi,
                "soil_moisture": reading.soil_moisture,
                "surface_temp_c": reading.surface_temp_c,
                "data_quality": reading.data_quality,
                "timestamp": reading.timestamp,
            }
            new_alerts = evaluate(reading_dict, history, active_alerts, _config)
            for alert_data in new_alerts:
                alert_data["reading_id"] = reading.id
                db.add(Alert(**alert_data))
                alerts_generated += 1
                # Fire LINE notification for high/critical alerts
                if alert_data.get("severity") in ("critical", "high"):
                    send_alert(
                        field_name=field.name,
                        alert_type=alert_data["alert_type"],
                        severity=alert_data["severity"],
                        message=alert_data["message"],
                    )

        db.commit()
        logger.info(
            "Ingest cycle: %d readings, %d alerts", readings_created, alerts_generated
        )
        return {
            "fields_processed": len(fields),
            "readings_created": readings_created,
            "alerts_generated": alerts_generated,
        }
    except Exception:
        db.rollback()
        logger.exception("Ingest cycle failed")
        raise
    finally:
        db.close()


def start():
    _reschedule()
    _scheduler.start()
    logger.info("Scheduler started, ingest every %d min", _config["ingest_interval_minutes"])


def stop():
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
