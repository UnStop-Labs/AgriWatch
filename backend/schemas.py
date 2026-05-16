from datetime import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel


class FieldCreate(BaseModel):
    name: str
    crop_type: str
    area_ha: float
    geojson: str
    planting_date: Optional[datetime] = None
    irrigation_method: Optional[str] = None
    water_cost_per_m3: Optional[float] = None
    baseline_water_m3_ha: Optional[float] = None
    baseline_fertilizer_kg_ha: Optional[float] = None
    baseline_spray_usd_ha: Optional[float] = None


class FieldRead(BaseModel):
    id: int
    name: str
    crop_type: str
    area_ha: float
    geojson: str
    created_at: datetime
    planting_date: Optional[datetime] = None
    irrigation_method: Optional[str] = None
    water_cost_per_m3: Optional[float] = None
    baseline_water_m3_ha: Optional[float] = None
    baseline_fertilizer_kg_ha: Optional[float] = None
    baseline_spray_usd_ha: Optional[float] = None

    model_config = {"from_attributes": True}


class FieldSummary(FieldRead):
    latest_ndvi: Optional[float] = None
    latest_soil_moisture: Optional[float] = None
    latest_temp_c: Optional[float] = None
    latest_reading_at: Optional[datetime] = None
    active_alert_count: int = 0
    health_status: str = "unknown"


class SatelliteReadingRead(BaseModel):
    id: int
    field_id: int
    timestamp: datetime
    ndvi: float
    soil_moisture: float
    surface_temp_c: float
    cloud_cover_pct: float
    data_quality: str

    model_config = {"from_attributes": True}


class AlertRead(BaseModel):
    id: int
    field_id: int
    field_name: str
    reading_id: Optional[int] = None
    alert_type: str
    severity: str
    message: str
    triggered_at: datetime
    acknowledged: bool
    acknowledged_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AlertStats(BaseModel):
    total: int
    by_severity: Dict[str, int]
    by_type: Dict[str, int]
    unacknowledged: int


class ReadingsSummary(BaseModel):
    field_id: int
    field_name: str
    crop_type: str
    avg_ndvi_7d: Optional[float]
    latest_ndvi: Optional[float]
    latest_soil_moisture: Optional[float]
    latest_temp_c: Optional[float]
    active_alerts: int
    health_status: str


class IngestResult(BaseModel):
    fields_processed: int
    readings_created: int
    alerts_generated: int


class SystemConfig(BaseModel):
    ingest_interval_minutes: int = 15
    ndvi_critical_threshold: float = 0.30
    ndvi_decline_threshold: float = 0.15
    soil_dry_threshold: float = 15.0
    soil_wet_threshold: float = 60.0
    heat_stress_threshold: float = 38.0
    frost_threshold: float = 2.0


class Recommendation(BaseModel):
    type: str
    priority: str
    title: str
    reason: str
    action: str
    financial_impact_usd: float


class FieldIntelligence(BaseModel):
    field_id: int
    field_name: str
    crop_type: str
    area_ha: float
    yield_forecast_tons: float
    yield_forecast_tons_ha: float
    yield_vs_baseline_pct: float
    water_savings_m3: float
    water_savings_usd: float
    fertilizer_savings_kg: float
    fertilizer_savings_usd: float
    spray_savings_usd: float
    total_savings_usd: float
    avg_ndvi_30d: float
    harvest_due: Optional[str] = None
    days_to_harvest: Optional[int] = None
    harvest_status: str
    recommendations: List[Recommendation]


class DashboardFinancials(BaseModel):
    total_yield_forecast_tons: float
    total_water_savings_usd: float
    total_fertilizer_savings_usd: float
    total_spray_savings_usd: float
    total_savings_usd: float
    fields: List[FieldIntelligence]
