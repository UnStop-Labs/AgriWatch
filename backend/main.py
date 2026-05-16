import json
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import SessionLocal, engine
from models import Base, Field, SatelliteReading
from routers import alerts, fields, readings, system
from services import scheduler
from services.satellite_mock import seed_historical

logging.basicConfig(level=logging.INFO)

def _days_ago(n):
    from datetime import timedelta
    return datetime.utcnow() - timedelta(days=n)


DEFAULT_FIELDS = [
    {
        "name": "North Wheat Block",
        "crop_type": "wheat",
        "area_ha": 45.0,
        "planting_date": _days_ago(80),
        "irrigation_method": "drip",
        "water_cost_per_m3": 0.45,
        "baseline_water_m3_ha": 4800,
        "baseline_fertilizer_kg_ha": 190,
        "baseline_spray_usd_ha": 140,
        "geojson": json.dumps({
            "type": "Feature",
            "properties": {},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [-0.12, 51.52],
                    [-0.10, 51.52],
                    [-0.10, 51.53],
                    [-0.12, 51.53],
                    [-0.12, 51.52],
                ]],
            },
        }),
    },
    {
        "name": "East Corn Field",
        "crop_type": "corn",
        "area_ha": 62.0,
        "planting_date": _days_ago(55),
        "irrigation_method": "sprinkler",
        "water_cost_per_m3": 0.50,
        "baseline_water_m3_ha": 5500,
        "baseline_fertilizer_kg_ha": 230,
        "baseline_spray_usd_ha": 160,
        "geojson": json.dumps({
            "type": "Feature",
            "properties": {},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [-0.09, 51.51],
                    [-0.07, 51.51],
                    [-0.07, 51.525],
                    [-0.09, 51.525],
                    [-0.09, 51.51],
                ]],
            },
        }),
    },
    {
        "name": "South Soybean Plot",
        "crop_type": "soy",
        "area_ha": 38.0,
        "planting_date": _days_ago(40),
        "irrigation_method": "drip",
        "water_cost_per_m3": 0.45,
        "baseline_water_m3_ha": 4200,
        "baseline_fertilizer_kg_ha": 130,
        "baseline_spray_usd_ha": 120,
        "geojson": json.dumps({
            "type": "Feature",
            "properties": {},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [-0.115, 51.505],
                    [-0.095, 51.505],
                    [-0.095, 51.515],
                    [-0.115, 51.515],
                    [-0.115, 51.505],
                ]],
            },
        }),
    },
    {
        "name": "West Rice Paddy",
        "crop_type": "rice",
        "area_ha": 28.0,
        "planting_date": _days_ago(100),
        "irrigation_method": "flood",
        "water_cost_per_m3": 0.30,
        "baseline_water_m3_ha": 13000,
        "baseline_fertilizer_kg_ha": 210,
        "baseline_spray_usd_ha": 180,
        "geojson": json.dumps({
            "type": "Feature",
            "properties": {},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [-0.135, 51.51],
                    [-0.122, 51.51],
                    [-0.122, 51.52],
                    [-0.135, 51.52],
                    [-0.135, 51.51],
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


@app.get("/")
def root():
    return {"name": "AgriWatch API", "docs": "/docs"}
