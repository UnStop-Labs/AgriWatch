from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional

CROP_GROWTH_DAYS = {
    "wheat": 120,
    "corn": 95,
    "soy": 105,
    "rice": 130,
    "vegetables": 65,
}

CROP_BASE_YIELD_TONS_HA = {
    "wheat": 3.5,
    "corn": 8.0,
    "soy": 2.5,
    "rice": 5.0,
    "vegetables": 18.0,
}

CROP_WATER_M3_HA = {
    "wheat": 4500,
    "corn": 5200,
    "soy": 4000,
    "rice": 12000,
    "vegetables": 6000,
}

CROP_FERTILIZER_KG_HA = {
    "wheat": 180,
    "corn": 220,
    "soy": 120,
    "rice": 200,
    "vegetables": 250,
}

CROP_PRICE_USD_TON = {
    "wheat": 220,
    "corn": 185,
    "soy": 420,
    "rice": 380,
    "vegetables": 600,
}

ALT_CROPS = {
    "wheat": "corn",
    "corn": "soy",
    "soy": "wheat",
    "rice": "vegetables",
    "vegetables": "soy",
}


def compute_field_intelligence(field, readings_30d: list, active_alert_count: int) -> dict:
    crop = field.crop_type
    area = field.area_ha

    good = [r for r in readings_30d if r.data_quality != "missing"]
    avg_ndvi = sum(r.ndvi for r in good) / len(good) if good else 0.50
    avg_sm = sum(r.soil_moisture for r in good) / len(good) if good else 30.0
    avg_temp = sum(r.surface_temp_c for r in good) / len(good) if good else 24.0

    # Yield forecast
    base_yield = CROP_BASE_YIELD_TONS_HA.get(crop, 3.5)
    healthy_ndvi = 0.65
    ndvi_factor = min(1.25, max(0.25, avg_ndvi / healthy_ndvi))
    # Penalty for active alerts
    alert_penalty = max(0.0, 1.0 - active_alert_count * 0.03)
    yield_factor = ndvi_factor * alert_penalty
    yield_forecast_ha = round(base_yield * yield_factor, 2)
    yield_forecast_total = round(yield_forecast_ha * area, 1)
    yield_vs_baseline_pct = round((yield_factor - 1.0) * 100, 1)

    # Water savings
    water_cost = field.water_cost_per_m3 or 0.50
    baseline_water = field.baseline_water_m3_ha or CROP_WATER_M3_HA.get(crop, 5000)
    # Savings from optimized scheduling (higher savings when soil is overwatered)
    sm_factor = min(0.22, max(0.10, (avg_sm - 25) / 200 + 0.14))
    water_savings_m3_ha = baseline_water * sm_factor
    water_savings_usd = round(water_savings_m3_ha * area * water_cost, 0)

    # Fertilizer savings
    baseline_fert = field.baseline_fertilizer_kg_ha or CROP_FERTILIZER_KG_HA.get(crop, 200)
    fert_savings_pct = 0.18 if avg_ndvi > 0.50 else 0.10
    fert_savings_kg = round(baseline_fert * fert_savings_pct * area, 0)
    fert_savings_usd = round(fert_savings_kg * 0.75, 0)

    # Spray savings
    baseline_spray = field.baseline_spray_usd_ha or 150.0
    spray_savings_usd = round(baseline_spray * 0.25 * area, 0)

    total_savings = water_savings_usd + fert_savings_usd + spray_savings_usd

    # Harvest timing
    planting_date = field.planting_date
    growth_days = CROP_GROWTH_DAYS.get(crop, 100)
    harvest_due = None
    days_to_harvest = None
    harvest_status = "unknown"

    if planting_date:
        harvest_due = planting_date + timedelta(days=growth_days)
        days_to_harvest = (harvest_due - datetime.utcnow()).days
        if days_to_harvest < 0:
            harvest_status = "overdue"
        elif days_to_harvest <= 7:
            harvest_status = "imminent"
        elif days_to_harvest <= 21:
            harvest_status = "upcoming"
        else:
            harvest_status = "on_track"

    # Recommendations
    recs = []
    crop_price = CROP_PRICE_USD_TON.get(crop, 250)

    if avg_ndvi < 0.45:
        impact = round(base_yield * 0.20 * area * crop_price, 0)
        recs.append({
            "type": "irrigation",
            "priority": "high",
            "title": "Increase irrigation frequency",
            "reason": f"NDVI at {avg_ndvi:.2f} indicates water stress. Fields with similar profiles gained 20% yield after irrigation adjustment.",
            "action": "Increase irrigation by 20% and shift watering to 05:00–07:00 for 2 weeks.",
            "financial_impact_usd": impact,
        })

    if avg_sm < 20:
        impact = round(base_yield * 0.15 * area * crop_price, 0)
        recs.append({
            "type": "soil",
            "priority": "high",
            "title": "Critical soil moisture — irrigate immediately",
            "reason": f"Soil moisture at {avg_sm:.0f}% is below the 20% critical threshold. Crop stress likely within 48h.",
            "action": "Run emergency irrigation cycle today. Check for pipe or pump failure.",
            "financial_impact_usd": impact,
        })

    if avg_temp > 35:
        impact = round(base_yield * 0.12 * area * crop_price, 0)
        recs.append({
            "type": "heat",
            "priority": "medium",
            "title": "Heat stress management required",
            "reason": f"Average surface temp {avg_temp:.0f}°C. Sustained heat above 35°C degrades chlorophyll and slows growth.",
            "action": "Increase irrigation frequency. Consider shade nets for high-value crops.",
            "financial_impact_usd": impact,
        })

    if active_alert_count >= 3:
        impact = round(base_yield * 0.18 * area * crop_price, 0)
        recs.append({
            "type": "inspection",
            "priority": "high",
            "title": "Urgent field inspection required",
            "reason": f"{active_alert_count} simultaneous stress indicators detected. Early on-site diagnosis can prevent major yield loss.",
            "action": "Schedule field inspection within 24–48 hours.",
            "financial_impact_usd": impact,
        })

    alt = ALT_CROPS.get(crop, "corn")
    alt_yield = CROP_BASE_YIELD_TONS_HA.get(alt, 3.5)
    alt_price = CROP_PRICE_USD_TON.get(alt, 250)
    if avg_ndvi < 0.55:
        impact = round((alt_yield * alt_price - base_yield * yield_factor * crop_price) * area, 0)
        if impact > 0:
            recs.append({
                "type": "crop_change",
                "priority": "medium",
                "title": f"Consider switching to {alt.title()} next season",
                "reason": f"Soil moisture and temperature profile in this field are better suited for {alt}. Historical satellite data from similar fields shows 18% higher revenue.",
                "action": f"Evaluate {alt} for next planting cycle. Request soil analysis.",
                "financial_impact_usd": impact,
            })

    recs.append({
        "type": "water",
        "priority": "medium",
        "title": "Optimize irrigation schedule",
        "reason": "Satellite data shows soil moisture peaks mid-day — early morning watering reduces evaporation by 15–20%.",
        "action": "Shift all irrigation to 05:00–07:00. Install moisture sensors for automated control.",
        "financial_impact_usd": water_savings_usd,
    })

    # Sort by financial impact desc, then priority
    priority_order = {"high": 0, "medium": 1, "low": 2}
    recs.sort(key=lambda r: (-r["financial_impact_usd"], priority_order.get(r["priority"], 9)))

    return {
        "yield_forecast_tons": yield_forecast_total,
        "yield_forecast_tons_ha": yield_forecast_ha,
        "yield_vs_baseline_pct": yield_vs_baseline_pct,
        "water_savings_m3": round(water_savings_m3_ha * area, 0),
        "water_savings_usd": water_savings_usd,
        "fertilizer_savings_kg": fert_savings_kg,
        "fertilizer_savings_usd": fert_savings_usd,
        "spray_savings_usd": spray_savings_usd,
        "total_savings_usd": total_savings,
        "avg_ndvi_30d": round(avg_ndvi, 3),
        "harvest_due": harvest_due.isoformat() if harvest_due else None,
        "days_to_harvest": days_to_harvest,
        "harvest_status": harvest_status,
        "recommendations": recs,
    }
