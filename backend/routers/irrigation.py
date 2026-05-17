from __future__ import annotations

import math
import random
import time
from datetime import datetime

from fastapi import APIRouter

router = APIRouter(prefix="/api/irrigation", tags=["irrigation"])


def _make_noise_grid(size: int, seed: int) -> list:
    """Generate spatially coherent moisture map using box-blur smoothing."""
    rng = random.Random(seed)
    grid = [[rng.random() for _ in range(size)] for _ in range(size)]

    # Apply box blur 5 times for realistic spatial patches
    for _ in range(5):
        new_grid = [[0.0] * size for _ in range(size)]
        for i in range(size):
            for j in range(size):
                vals = []
                for di in range(-2, 3):
                    for dj in range(-2, 3):
                        ni, nj = i + di, j + dj
                        if 0 <= ni < size and 0 <= nj < size:
                            vals.append(grid[ni][nj])
                new_grid[i][j] = sum(vals) / len(vals)
        grid = new_grid

    # Normalize to 0–1
    flat = [v for row in grid for v in row]
    mn, mx = min(flat), max(flat)
    if mx > mn:
        grid = [[(v - mn) / (mx - mn) for v in row] for row in grid]

    return grid


def _classify(moisture: float) -> tuple:
    if moisture < 0.25:
        return "critical", "#dc2626", "Irrigate immediately — critical drought stress"
    if moisture < 0.42:
        return "dry", "#f97316", "Increase irrigation — below optimal moisture"
    if moisture > 0.72:
        return "wet", "#3b82f6", "Reduce irrigation — waterlogging risk"
    return "optimal", "#22c55e", "Maintain current irrigation schedule"


@router.get("/analyze")
def analyze_field(lat: float, lng: float, area_ha: float = 10.0):
    """
    Analyze a field for irrigation needs.
    Returns a GeoJSON FeatureCollection of colored cells.
    Time bucket (8 min) creates real-time drift effect on refresh.
    """
    grid_n = 14  # 14x14 = 196 cells — good resolution without being slow

    # Stable spatial pattern per location
    location_seed = int(abs(lat * 9973) + abs(lng * 9967)) % 999983

    # Temporal variation: subtle drift every 8 minutes
    time_bucket = int(time.time() / 480)
    temporal_rng = random.Random(location_seed + time_bucket * 7)

    base_grid = _make_noise_grid(grid_n, seed=location_seed)

    # Field dimensions in degrees
    side_m = math.sqrt(area_ha * 10000)
    cell_lat = (side_m / grid_n) / 111000
    cell_lng = (side_m / grid_n) / (111000 * math.cos(math.radians(lat)))

    # Southwest corner of the whole grid
    sw_lat = lat - (cell_lat * grid_n) / 2
    sw_lng = lng - (cell_lng * grid_n) / 2

    features = []
    status_counts = {"critical": 0, "dry": 0, "optimal": 0, "wet": 0}

    for i in range(grid_n):
        for j in range(grid_n):
            # Add small temporal noise for live-refresh feel
            moisture = base_grid[i][j] + temporal_rng.gauss(0, 0.035)
            moisture = max(0.0, min(1.0, moisture))

            ndvi = moisture * 0.65 + temporal_rng.gauss(0, 0.025)
            ndvi = max(0.05, min(0.95, ndvi))

            status, color, recommendation = _classify(moisture)
            status_counts[status] += 1

            csw_lat = sw_lat + i * cell_lat
            csw_lng = sw_lng + j * cell_lng

            features.append({
                "type": "Feature",
                "properties": {
                    "moisture_pct": round(moisture * 100, 1),
                    "ndvi": round(ndvi, 3),
                    "status": status,
                    "color": color,
                    "recommendation": recommendation,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [csw_lng,             csw_lat],
                        [csw_lng + cell_lng,  csw_lat],
                        [csw_lng + cell_lng,  csw_lat + cell_lat],
                        [csw_lng,             csw_lat + cell_lat],
                        [csw_lng,             csw_lat],
                    ]],
                },
            })

    total = grid_n * grid_n
    return {
        "type": "FeatureCollection",
        "features": features,
        "analyzed_at": datetime.utcnow().isoformat() + "Z",
        "summary": {
            "area_ha": area_ha,
            "critical_pct": round(status_counts["critical"] / total * 100, 1),
            "dry_pct":      round(status_counts["dry"]      / total * 100, 1),
            "optimal_pct":  round(status_counts["optimal"]  / total * 100, 1),
            "wet_pct":      round(status_counts["wet"]       / total * 100, 1),
        },
    }
