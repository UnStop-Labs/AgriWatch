from __future__ import annotations
import json
import random
from datetime import datetime, timedelta

STRESS_TYPES = {
    "fungal_infection": {
        "name": "Fungal Infection",
        "icon": "🍄",
        "triggers": lambda ndvi, sm, temp: sm > 70 and temp > 28,
        "base_impact": 0.22,
    },
    "drought_stress": {
        "name": "Drought / Water Stress",
        "icon": "🌵",
        "triggers": lambda ndvi, sm, temp: sm < 25 or ndvi < 0.35,
        "base_impact": 0.18,
    },
    "nutrient_deficiency": {
        "name": "Nutrient Deficiency",
        "icon": "🧪",
        "triggers": lambda ndvi, sm, temp: ndvi < 0.45 and sm > 20,
        "base_impact": 0.14,
    },
    "pest_damage": {
        "name": "Pest Damage",
        "icon": "🐛",
        "triggers": lambda ndvi, sm, temp: ndvi < 0.40,
        "base_impact": 0.20,
    },
    "heat_stress": {
        "name": "Heat Stress",
        "icon": "🌡",
        "triggers": lambda ndvi, sm, temp: temp > 34,
        "base_impact": 0.12,
    },
}


def _bbox(geojson_str: str):
    try:
        geo = json.loads(geojson_str)
        coords = geo["geometry"]["coordinates"][0] if geo.get("type") == "Feature" else geo["coordinates"][0]
        lngs = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        return min(lngs), min(lats), max(lngs), max(lats)
    except Exception:
        return None


def _blur_grid(grid, n):
    rows, cols = len(grid), len(grid[0])
    for _ in range(n):
        g2 = [[0.0] * cols for _ in range(rows)]
        for r in range(rows):
            for c in range(cols):
                vals = [grid[r2][c2] for r2 in range(max(0,r-1), min(rows,r+2))
                        for c2 in range(max(0,c-1), min(cols,c+2))]
                g2[r][c] = sum(vals) / len(vals)
        grid = g2
    return grid


def _make_disease_heatmap(bbox, risk_bias: float, seed: int) -> dict:
    rng = random.Random(seed)
    min_lng, min_lat, max_lng, max_lat = bbox
    GRID = 10
    cw = (max_lng - min_lng) / GRID
    ch = (max_lat - min_lat) / GRID

    grid = [[rng.uniform(0, 1) for _ in range(GRID)] for _ in range(GRID)]
    grid = _blur_grid(grid, 4)
    flat = [grid[r][c] for r in range(GRID) for c in range(GRID)]
    mn, mx = min(flat), max(flat)

    features = []
    counts = {"healthy": 0, "watch": 0, "stressed": 0, "critical": 0}

    for row in range(GRID):
        for col in range(GRID):
            v = (grid[row][col] - mn) / (mx - mn + 1e-9)
            v = v * (0.35 + risk_bias * 0.65)

            if v < 0.25:
                status, color = "healthy", "#16a34a"
            elif v < 0.50:
                status, color = "watch", "#eab308"
            elif v < 0.75:
                status, color = "stressed", "#f97316"
            else:
                status, color = "critical", "#dc2626"

            counts[status] += 1
            lng0 = min_lng + col * cw
            lat0 = min_lat + row * ch
            features.append({
                "type": "Feature",
                "properties": {"status": status, "color": color, "risk_pct": round(v * 100)},
                "geometry": {"type": "Polygon", "coordinates": [[
                    [lng0, lat0], [lng0+cw, lat0], [lng0+cw, lat0+ch],
                    [lng0, lat0+ch], [lng0, lat0],
                ]]},
            })

    total = GRID * GRID
    summary = {k: round(v / total * 100) for k, v in counts.items()}
    return {"type": "FeatureCollection", "features": features}, summary


def _make_yield_heatmap(bbox, prod_bias: float, seed: int):
    rng = random.Random(seed + 7777)
    min_lng, min_lat, max_lng, max_lat = bbox
    GRID = 10
    cw = (max_lng - min_lng) / GRID
    ch = (max_lat - min_lat) / GRID

    grid = [[rng.uniform(0, 1) for _ in range(GRID)] for _ in range(GRID)]
    grid = _blur_grid(grid, 4)
    flat = [grid[r][c] for r in range(GRID) for c in range(GRID)]
    mn, mx = min(flat), max(flat)

    features = []
    counts = {"high": 0, "medium": 0, "low": 0}

    for row in range(GRID):
        for col in range(GRID):
            v = (grid[row][col] - mn) / (mx - mn + 1e-9)
            v = v * (0.3 + prod_bias * 0.7)

            if v >= 0.60:
                zone, color = "high", "#16a34a"
            elif v >= 0.35:
                zone, color = "medium", "#84cc16"
            else:
                zone, color = "low", "#f97316"

            counts[zone] += 1
            lng0 = min_lng + col * cw
            lat0 = min_lat + row * ch
            features.append({
                "type": "Feature",
                "properties": {"zone": zone, "color": color, "productivity": round(v * 100)},
                "geometry": {"type": "Polygon", "coordinates": [[
                    [lng0, lat0], [lng0+cw, lat0], [lng0+cw, lat0+ch],
                    [lng0, lat0+ch], [lng0, lat0],
                ]]},
            })

    total = GRID * GRID
    zone_pct = {k: round(v / total * 100) for k, v in counts.items()}
    return {"type": "FeatureCollection", "features": features}, zone_pct


def analyze_disease(field, readings_30d: list) -> dict:
    good = [r for r in readings_30d if r.data_quality != "missing"]
    avg_ndvi = sum(r.ndvi for r in good) / len(good) if good else 0.50
    avg_sm   = sum(r.soil_moisture for r in good) / len(good) if good else 30.0
    avg_temp = sum(r.surface_temp_c for r in good) / len(good) if good else 26.0

    # Overall health score 0-100
    ndvi_score = min(100, avg_ndvi / 0.70 * 100)
    sm_score   = min(100, max(0, (avg_sm - 10) / 60 * 100))
    temp_score = max(0, 100 - max(0, avg_temp - 30) * 5)
    health_score = round(ndvi_score * 0.55 + sm_score * 0.25 + temp_score * 0.20)

    risk_pct = round(100 - health_score)
    if risk_pct < 20:
        risk_level = "low"
    elif risk_pct < 40:
        risk_level = "moderate"
    elif risk_pct < 65:
        risk_level = "high"
    else:
        risk_level = "critical"

    # Detected stress zones
    detected = []
    for sid, st in STRESS_TYPES.items():
        if st["triggers"](avg_ndvi, avg_sm, avg_temp):
            affected = round(st["base_impact"] * (1.0 + (1.0 - avg_ndvi / 0.65)) * 100)
            sev = "high" if affected > 25 else "medium" if affected > 15 else "low"
            detected.append({
                "id": sid,
                "name": st["name"],
                "icon": st["icon"],
                "severity": sev,
                "affected_area_pct": min(60, affected),
                "confidence": round(0.65 + (1.0 - avg_ndvi / 0.70) * 0.30, 2),
                "recommendation": _rec_for(sid, avg_ndvi, avg_sm, avg_temp),
            })

    # 14-day trend (synthetic from readings + small noise)
    rng = random.Random(field.id if isinstance(field.id, int) else 42)
    trend = []
    base_score = health_score
    for i in range(14):
        d = datetime.utcnow() - timedelta(days=13 - i)
        jitter = rng.uniform(-4, 4)
        trend.append({
            "date": d.strftime("%Y-%m-%d"),
            "health_score": max(0, min(100, round(base_score + jitter + (i - 7) * 0.3))),
            "ndvi": round(avg_ndvi + rng.uniform(-0.03, 0.03), 3),
        })

    risk_bias = 1.0 - min(1.0, avg_ndvi / 0.65)
    if avg_sm < 20:
        risk_bias = min(1.0, risk_bias + 0.25)
    if avg_temp > 34:
        risk_bias = min(1.0, risk_bias + 0.15)

    bbox = _bbox(field.geojson) if field.geojson else None
    heatmap, heatmap_summary = None, {}
    if bbox:
        seed = (field.id if isinstance(field.id, int) else 1) * 31 + int(risk_bias * 100)
        heatmap, heatmap_summary = _make_disease_heatmap(bbox, risk_bias, seed)

    return {
        "field_id": field.id,
        "field_name": field.name,
        "crop_type": field.crop_type,
        "health_score": health_score,
        "risk_level": risk_level,
        "disease_risk_pct": risk_pct,
        "avg_ndvi": round(avg_ndvi, 3),
        "avg_soil_moisture": round(avg_sm, 1),
        "avg_temp_c": round(avg_temp, 1),
        "detected_stress": detected,
        "heatmap": heatmap,
        "heatmap_summary": heatmap_summary,
        "trend": trend,
        "analyzed_at": datetime.utcnow().isoformat(),
    }


def _rec_for(sid, ndvi, sm, temp) -> str:
    if sid == "fungal_infection":
        return "Apply fungicide treatment within 48h. Reduce irrigation by 15–20% to lower humidity."
    if sid == "drought_stress":
        return "Increase irrigation frequency immediately. Check for pipe or pump failure."
    if sid == "nutrient_deficiency":
        return "Soil test recommended. Consider foliar NPK spray as fast-acting supplement."
    if sid == "pest_damage":
        return "Schedule field inspection within 24h. Prepare targeted pesticide application."
    if sid == "heat_stress":
        return "Shift irrigation to 05:00–07:00. Consider shade netting for high-value crops."
    return "Monitor closely and schedule field inspection."


CROP_GROWTH_DAYS = {"wheat": 120, "corn": 95, "soy": 105, "rice": 130, "vegetables": 65}
CROP_BASE_YIELD  = {"wheat": 3.5, "corn": 8.0, "soy": 2.5, "rice": 5.0, "vegetables": 18.0}
CROP_PRICE       = {"wheat": 220, "corn": 185, "soy": 420, "rice": 380, "vegetables": 600}

def predict_yield(field, readings_30d: list) -> dict:
    good = [r for r in readings_30d if r.data_quality != "missing"]
    avg_ndvi = sum(r.ndvi for r in good) / len(good) if good else 0.50
    avg_sm   = sum(r.soil_moisture for r in good) / len(good) if good else 30.0
    avg_temp = sum(r.surface_temp_c for r in good) / len(good) if good else 26.0

    crop  = field.crop_type
    area  = field.area_ha
    base  = CROP_BASE_YIELD.get(crop, 3.5)
    price = CROP_PRICE.get(crop, 300)

    ndvi_factor = min(1.30, max(0.30, avg_ndvi / 0.65))
    sm_factor   = 1.0 if 30 <= avg_sm <= 65 else (0.88 if avg_sm < 30 else 0.92)
    temp_factor = 1.0 if avg_temp <= 33 else max(0.75, 1.0 - (avg_temp - 33) * 0.025)

    yield_factor = ndvi_factor * sm_factor * temp_factor
    yield_ha     = round(base * yield_factor, 2)
    yield_total  = round(yield_ha * area, 1)
    vs_baseline  = round((yield_factor - 1.0) * 100, 1)

    confidence = round(min(92, max(45, 60 + avg_ndvi * 30 + (len(good) / 30) * 15)))
    quality    = round(min(98, max(40, 50 + avg_ndvi * 50 + sm_factor * 10)))

    # Harvest date
    growth_days = CROP_GROWTH_DAYS.get(crop, 100)
    harvest_date = None
    days_to_harvest = None
    if field.planting_date:
        harvest_date = field.planting_date + timedelta(days=growth_days)
        days_to_harvest = (harvest_date - datetime.utcnow()).days

    # Revenue estimate
    revenue_est = round(yield_total * price, 0)

    # Zone breakdown via yield heatmap
    bbox = _bbox(field.geojson) if field.geojson else None
    heatmap, zone_pct = None, {"high": 0, "medium": 0, "low": 0}
    if bbox:
        prod_bias = min(1.0, avg_ndvi / 0.65)
        seed = (field.id if isinstance(field.id, int) else 1) * 53
        heatmap, zone_pct = _make_yield_heatmap(bbox, prod_bias, seed)

    # 14-day trend
    rng = random.Random((field.id if isinstance(field.id, int) else 1) + 5555)
    trend = []
    for i in range(14):
        d = datetime.utcnow() - timedelta(days=13 - i)
        jitter = rng.uniform(-3, 3)
        trend.append({
            "date": d.strftime("%Y-%m-%d"),
            "yield_ha": round(yield_ha + jitter * 0.05, 2),
            "ndvi": round(avg_ndvi + rng.uniform(-0.03, 0.03), 3),
        })

    return {
        "field_id": field.id,
        "field_name": field.name,
        "crop_type": crop,
        "area_ha": area,
        "yield_forecast_tons_ha": yield_ha,
        "yield_forecast_total_tons": yield_total,
        "confidence_pct": confidence,
        "quality_score": quality,
        "vs_baseline_pct": vs_baseline,
        "revenue_estimate_usd": revenue_est,
        "harvest_date": harvest_date.isoformat() if harvest_date else None,
        "days_to_harvest": days_to_harvest,
        "zone_pct": zone_pct,
        "heatmap": heatmap,
        "trend": trend,
        "analyzed_at": datetime.utcnow().isoformat(),
    }
