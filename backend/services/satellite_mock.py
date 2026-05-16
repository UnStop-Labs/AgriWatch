from __future__ import annotations

import math
import random
from datetime import datetime, timedelta

import numpy as np

CROP_BASES = {
    "wheat": {"ndvi": 0.65, "moisture": 35.0, "temp": 22.0},
    "corn": {"ndvi": 0.75, "moisture": 40.0, "temp": 24.0},
    "soy": {"ndvi": 0.70, "moisture": 38.0, "temp": 23.0},
    "rice": {"ndvi": 0.72, "moisture": 42.0, "temp": 26.0},
    "vegetables": {"ndvi": 0.60, "moisture": 45.0, "temp": 20.0},
}

DEFAULT_BASE = {"ndvi": 0.65, "moisture": 38.0, "temp": 22.0}


def _seasonal_factor(dt: datetime) -> float:
    """Returns a -1..1 seasonal multiplier peaking in July."""
    day_of_year = dt.timetuple().tm_yday
    return math.sin(2 * math.pi * (day_of_year - 80) / 365)


def _diurnal_temp_offset(dt: datetime) -> float:
    """Returns temperature offset based on hour of day (peak at 14:00)."""
    hour = dt.hour + dt.minute / 60
    return 6 * math.sin(math.pi * (hour - 6) / 12) if 6 <= hour <= 18 else -3


def generate_reading(
    field_id: int,
    crop_type: str,
    timestamp: datetime,
    previous: dict | None = None,
) -> dict:
    rng = random.Random(field_id * 1000 + int(timestamp.timestamp() / 3600))
    base = CROP_BASES.get(crop_type, DEFAULT_BASE)

    seasonal = _seasonal_factor(timestamp)

    # NDVI — seasonal sine + random walk from previous
    if previous and previous.get("data_quality") != "missing":
        prev_ndvi = previous["ndvi"]
        # stress event: 5% chance of sudden drop
        if rng.random() < 0.05:
            stress_drop = rng.uniform(0.10, 0.25)
            ndvi = max(0.05, prev_ndvi - stress_drop)
        else:
            delta = rng.gauss(0, 0.015)
            # mean revert toward seasonal base
            target = base["ndvi"] + 0.10 * seasonal
            revert = (target - prev_ndvi) * 0.03
            ndvi = max(0.05, min(0.95, prev_ndvi + delta + revert))
    else:
        ndvi = base["ndvi"] + 0.10 * seasonal + rng.gauss(0, 0.05)
        ndvi = max(0.05, min(0.95, ndvi))

    # Soil moisture — random walk with mean reversion
    if previous and previous.get("data_quality") != "missing":
        prev_sm = previous["soil_moisture"]
        delta = rng.gauss(0, 1.5)
        revert = (base["moisture"] - prev_sm) * 0.05
        # occasional rainfall event
        if rng.random() < 0.03:
            delta += rng.uniform(10, 25)
        soil_moisture = max(5.0, min(90.0, prev_sm + delta + revert))
    else:
        soil_moisture = base["moisture"] + rng.gauss(0, 5)
        soil_moisture = max(5.0, min(90.0, soil_moisture))

    # Surface temperature — diurnal + seasonal + random
    temp_base = base["temp"] + 8 * seasonal + _diurnal_temp_offset(timestamp)
    if previous and previous.get("data_quality") != "missing":
        prev_temp = previous["surface_temp_c"]
        # heat wave: 3% chance
        heat_wave_offset = rng.uniform(8, 15) if rng.random() < 0.03 else 0
        surface_temp = prev_temp * 0.7 + temp_base * 0.3 + rng.gauss(0, 1.5) + heat_wave_offset
    else:
        surface_temp = temp_base + rng.gauss(0, 2)

    # Cloud cover — gamma distributed, skewed toward clear
    cloud_cover = min(100.0, max(0.0, rng.gammavariate(2, 15)))

    if cloud_cover > 90:
        data_quality = "missing"
        ndvi = 0.0
        soil_moisture = 0.0
        surface_temp = 0.0
    elif cloud_cover > 70:
        data_quality = "degraded"
    else:
        data_quality = "good"

    return {
        "field_id": field_id,
        "timestamp": timestamp,
        "ndvi": round(ndvi, 4),
        "soil_moisture": round(soil_moisture, 2),
        "surface_temp_c": round(surface_temp, 2),
        "cloud_cover_pct": round(cloud_cover, 1),
        "data_quality": data_quality,
    }


def seed_historical(
    field_id: int,
    crop_type: str,
    days: int = 30,
    interval_minutes: int = 60,
) -> list[dict]:
    now = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    start = now - timedelta(days=days)
    readings = []
    previous = None
    current = start

    while current <= now:
        reading = generate_reading(field_id, crop_type, current, previous)
        readings.append(reading)
        previous = reading
        current += timedelta(minutes=interval_minutes)

    return readings
