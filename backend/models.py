from datetime import datetime
from typing import List, Optional
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class Field(Base):
    __tablename__ = "fields"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    crop_type: Mapped[str] = mapped_column(String(50), nullable=False)
    area_ha: Mapped[float] = mapped_column(Float, nullable=False)
    geojson: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    readings: Mapped[List["SatelliteReading"]] = relationship(
        back_populates="field", cascade="all, delete-orphan"
    )
    alerts: Mapped[List["Alert"]] = relationship(
        back_populates="field", cascade="all, delete-orphan"
    )


class SatelliteReading(Base):
    __tablename__ = "satellite_readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    field_id: Mapped[int] = mapped_column(Integer, ForeignKey("fields.id"), nullable=False, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    ndvi: Mapped[float] = mapped_column(Float, nullable=False)
    soil_moisture: Mapped[float] = mapped_column(Float, nullable=False)
    surface_temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    cloud_cover_pct: Mapped[float] = mapped_column(Float, nullable=False)
    data_quality: Mapped[str] = mapped_column(String(10), nullable=False, default="good")

    field: Mapped["Field"] = relationship(back_populates="readings")
    alerts: Mapped[List["Alert"]] = relationship(back_populates="reading")


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    field_id: Mapped[int] = mapped_column(Integer, ForeignKey("fields.id"), nullable=False, index=True)
    reading_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("satellite_readings.id"), nullable=True)
    alert_type: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    triggered_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    field: Mapped["Field"] = relationship(back_populates="alerts")
    reading: Mapped[Optional["SatelliteReading"]] = relationship(back_populates="alerts")
