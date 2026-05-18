import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import SessionLocal, engine
from models import Base, Field, SatelliteReading
from routers import alerts, analytics, fields, irrigation, readings, system
from services import scheduler
from services.satellite_mock import seed_historical

logging.basicConfig(level=logging.INFO)

def _days_ago(n):
    from datetime import timedelta
    return datetime.utcnow() - timedelta(days=n)


DEFAULT_FIELDS = [
    {
        # Chiang Rai — northern rice belt
        "name": "Chiang Rai Rice Paddy",
        "crop_type": "rice",
        "area_ha": 52.0,
        "planting_date": _days_ago(100),
        "irrigation_method": "flood",
        "water_cost_per_m3": 0.18,
        "baseline_water_m3_ha": 13500,
        "baseline_fertilizer_kg_ha": 210,
        "baseline_spray_usd_ha": 160,
        "geojson": json.dumps({
            "type": "Feature",
            "properties": {},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [99.820, 19.912],
                    [99.845, 19.912],
                    [99.845, 19.930],
                    [99.820, 19.930],
                    [99.820, 19.912],
                ]],
            },
        }),
    },
    {
        # Chiang Mai valley — corn growing region
        "name": "Chiang Mai Corn Field",
        "crop_type": "corn",
        "area_ha": 68.0,
        "planting_date": _days_ago(55),
        "irrigation_method": "sprinkler",
        "water_cost_per_m3": 0.22,
        "baseline_water_m3_ha": 5200,
        "baseline_fertilizer_kg_ha": 225,
        "baseline_spray_usd_ha": 155,
        "geojson": json.dumps({
            "type": "Feature",
            "properties": {},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [98.955, 18.780],
                    [98.985, 18.780],
                    [98.985, 18.802],
                    [98.955, 18.802],
                    [98.955, 18.780],
                ]],
            },
        }),
    },
    {
        # Suphan Buri — central plains soybean
        "name": "Suphan Buri Soybean Plot",
        "crop_type": "soy",
        "area_ha": 41.0,
        "planting_date": _days_ago(42),
        "irrigation_method": "drip",
        "water_cost_per_m3": 0.20,
        "baseline_water_m3_ha": 4000,
        "baseline_fertilizer_kg_ha": 135,
        "baseline_spray_usd_ha": 125,
        "geojson": json.dumps({
            "type": "Feature",
            "properties": {},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [100.118, 14.462],
                    [100.145, 14.462],
                    [100.145, 14.480],
                    [100.118, 14.480],
                    [100.118, 14.462],
                ]],
            },
        }),
    },
    {
        # Nakhon Pathom — vegetable farms near Bangkok
        "name": "Nakhon Pathom Vegetable Farm",
        "crop_type": "vegetables",
        "area_ha": 24.0,
        "planting_date": _days_ago(35),
        "irrigation_method": "drip",
        "water_cost_per_m3": 0.25,
        "baseline_water_m3_ha": 6200,
        "baseline_fertilizer_kg_ha": 255,
        "baseline_spray_usd_ha": 190,
        "geojson": json.dumps({
            "type": "Feature",
            "properties": {},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [100.052, 13.815],
                    [100.072, 13.815],
                    [100.072, 13.832],
                    [100.052, 13.832],
                    [100.052, 13.815],
                ]],
            },
        }),
    },
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        if db.query(Field).count() == 0:
            logging.info("Seeding default fields and historical data…")
            for fd in DEFAULT_FIELDS:
                field = Field(**fd)
                db.add(field)
                db.flush()
                readings_data = seed_historical(field.id, field.crop_type, days=30)
                for rd in readings_data:
                    db.add(SatelliteReading(**rd))
            db.commit()
            logging.info("Seed complete.")
    finally:
        db.close()

    scheduler.start()
    yield
    scheduler.stop()


app = FastAPI(title="AgriWatch API", version="0.1.0", lifespan=lifespan)

_cors_env = os.environ.get("CORS_ORIGINS", "*")
_cors_origins = _cors_env.split(",") if _cors_env != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(fields.router)
app.include_router(readings.router)
app.include_router(alerts.router)
app.include_router(system.router)
app.include_router(irrigation.router)
app.include_router(analytics.router)


@app.get("/")
def root():
    return {"name": "AgriWatch API", "docs": "/docs"}
