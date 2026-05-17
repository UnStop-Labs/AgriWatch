from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from schemas import SystemConfig
from services import line_notify, scheduler

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/health")
def health():
    return {
        "status": "ok",
        "scheduler_running": scheduler._scheduler.running,
        "line_notify_configured": bool(line_notify.get_token()),
    }


@router.get("/config", response_model=SystemConfig)
def get_config():
    return SystemConfig(**scheduler.get_config())


@router.put("/config", response_model=SystemConfig)
def update_config(body: SystemConfig):
    scheduler.update_config(body.model_dump())
    return SystemConfig(**scheduler.get_config())


class LineTokenBody(BaseModel):
    token: str


@router.put("/line-token")
def set_line_token(body: LineTokenBody):
    line_notify.set_token(body.token)
    return {"ok": True, "configured": bool(body.token.strip())}


@router.get("/line-token")
def get_line_token_status():
    tok = line_notify.get_token()
    return {
        "configured": bool(tok),
        "preview": f"{tok[:6]}…{tok[-4:]}" if len(tok) > 10 else ("set" if tok else ""),
    }


@router.post("/line-test")
def test_line_notification():
    tok = line_notify.get_token()
    if not tok:
        raise HTTPException(400, "No LINE Notify token configured")
    ok = line_notify.send(
        "✅ AgriWatch test message\nYour LINE notifications are working!\n🌾 You will receive crop alerts here."
    )
    if not ok:
        raise HTTPException(502, "Failed — check your token")
    return {"ok": True}
