from fastapi import APIRouter
from schemas import SystemConfig
from services import scheduler

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/health")
def health():
    return {
        "status": "ok",
        "scheduler_running": scheduler._scheduler.running,
    }


@router.get("/config", response_model=SystemConfig)
def get_config():
    return SystemConfig(**scheduler.get_config())


@router.put("/config", response_model=SystemConfig)
def update_config(body: SystemConfig):
    scheduler.update_config(body.model_dump())
    return SystemConfig(**scheduler.get_config())
