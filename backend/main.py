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

DEFAULT_FIELDS = [
    {
        "name": "North Wheat Block",
        "crop_type": "wheat",
        "area_ha": 45.0,
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
