from __future__ import annotations

from datetime import datetime, timedelta


def _was_recently_alerted(active_alerts: list[dict], alert_type: str, cooldown_hours: float) -> bool:
    cutoff = datetime.utcnow() - timedelta(hours=cooldown_hours)
    return any(
        a["alert_type"] == alert_type and a["triggered_at"] >= cutoff
        for a in active_alerts
    )


def evaluate(
    reading: dict,
    history: list[dict],
    active_alerts: list[dict],
    thresholds: dict | None = None,
) -> list[dict]:
    if reading.get("data_quality") == "missing":
        return []

    t = thresholds or {}
    ndvi_crit = t.get("ndvi_critical_threshold", 0.30)
    ndvi_decline = t.get("ndvi_decline_threshold", 0.15)
    soil_dry = t.get("soil_dry_threshold", 15.0)
    soil_wet = t.get("soil_wet_threshold", 60.0)
    heat_thresh = t.get("heat_stress_threshold", 38.0)
    frost_thresh = t.get("frost_threshold", 2.0)

    ndvi = reading["ndvi"]
    sm = reading["soil_moisture"]
    temp = reading["surface_temp_c"]
    field_id = reading["field_id"]
    now = reading.get("timestamp", datetime.utcnow())

    good_history = [r for r in history if r.get("data_quality") != "missing"]
    alerts = []

    def make_alert(alert_type, severity, message):
        return {
            "field_id": field_id,
            "alert_type": alert_type,
            "severity": severity,
            "message": message,
            "triggered_at": now,
        }

    # Compute 6h NDVI decline
    ndvi_delta = None
    if len(good_history) >= 4:
        prev_ndvi = good_history[-6]["ndvi"] if len(good_history) >= 6 else good_history[0]["ndvi"]
        ndvi_delta = ndvi - prev_ndvi

    # Compound stress check first (Rule 7)
    compound = (
        ndvi < ndvi_crit
        and sm < soil_dry
        and temp > heat_thresh
    )
    if compound and not _was_recently_alerted(active_alerts, "anomaly_cluster", 8):
        alerts.append(make_alert(
            "anomaly_cluster", "critical",
            f"Multiple simultaneous stress indicators: NDVI {ndvi:.2f}, soil moisture {sm:.1f}%, temp {temp:.1f}°C — urgent inspection required"
        ))
        return alerts  # suppress individual alerts

    # Rule 1: Absolute NDVI low
    if ndvi < ndvi_crit and not _was_recently_alerted(active_alerts, "ndvi_low", 6):
        alerts.append(make_alert(
            "ndvi_low", "high",
            f"NDVI critically low at {ndvi:.2f} — likely severe crop stress or crop failure"
        ))

    # Rule 2: NDVI rapid decline
    if ndvi_delta is not None and ndvi_delta < -ndvi_decline:
        severity = "high" if ndvi_delta < -0.25 else "medium"
        if not _was_recently_alerted(active_alerts, "ndvi_rapid_decline", 4):
            alerts.append(make_alert(
                "ndvi_rapid_decline", severity,
                f"NDVI declined {abs(ndvi_delta):.2f} in recent hours — possible disease, pest, or water stress"
            ))

    # Rule 3: Soil dry
    if sm < soil_dry and not _was_recently_alerted(active_alerts, "soil_dry", 4):
        alerts.append(make_alert(
            "soil_dry", "high",
            f"Soil moisture at {sm:.1f}% — below critical threshold, irrigation recommended immediately"
        ))

    # Rule 4: Soil waterlogged
    if sm > soil_wet and not _was_recently_alerted(active_alerts, "soil_waterlogged", 4):
        alerts.append(make_alert(
            "soil_waterlogged", "medium",
            f"Soil moisture at {sm:.1f}% — waterlogging risk, check drainage systems"
        ))

    # Rule 5: Heat stress
    if temp > heat_thresh and ndvi > 0.2:
        severity = "critical" if temp > 42 else "medium"
        if not _was_recently_alerted(active_alerts, "heat_stress", 3):
            alerts.append(make_alert(
                "heat_stress", severity,
                f"Surface temperature {temp:.1f}°C exceeds heat stress threshold — crop damage risk"
            ))

    # Rule 6: Frost
    if temp < frost_thresh and not _was_recently_alerted(active_alerts, "cold_stress", 2):
        alerts.append(make_alert(
            "cold_stress", "critical",
            f"Near-freezing surface temperature {temp:.1f}°C — frost damage risk"
        ))

    return alerts


def compute_health_status(latest_ndvi: float | None, active_alerts: int) -> str:
    if latest_ndvi is None:
        return "unknown"
    if active_alerts > 0 and latest_ndvi < 0.30:
        return "critical"
    if active_alerts > 0 or latest_ndvi < 0.40:
        return "warning"
    if latest_ndvi >= 0.55:
        return "healthy"
    return "watch"
