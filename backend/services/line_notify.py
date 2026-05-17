from __future__ import annotations

import logging
import urllib.parse
import urllib.request

logger = logging.getLogger(__name__)

# In-memory token store (persists for process lifetime).
# On Render, can be overridden by LINE_NOTIFY_TOKEN env var.
_token: str = ""


def set_token(token: str):
    global _token
    _token = token.strip()


def get_token() -> str:
    import os
    return _token or os.environ.get("LINE_NOTIFY_TOKEN", "")


def send(message: str, token: str = "") -> bool:
    tok = token or get_token()
    if not tok:
        logger.debug("LINE Notify: no token configured, skipping")
        return False
    try:
        data = urllib.parse.urlencode({"message": f"\n{message}"}).encode("utf-8")
        req = urllib.request.Request(
            "https://notify-api.line.me/api/notify",
            data=data,
            headers={"Authorization": f"Bearer {tok}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            ok = resp.status == 200
            if ok:
                logger.info("LINE Notify sent: %s", message[:60])
            return ok
    except Exception as exc:
        logger.warning("LINE Notify failed: %s", exc)
        return False


def send_alert(field_name: str, alert_type: str, severity: str, message: str):
    severity_icon = {"critical": "🚨", "high": "⚠️", "medium": "📢", "low": "ℹ️"}.get(severity, "📢")
    text = (
        f"{severity_icon} AgriWatch Alert\n"
        f"Field: {field_name}\n"
        f"Type: {alert_type.replace('_', ' ').title()}\n"
        f"Severity: {severity.upper()}\n"
        f"Detail: {message}"
    )
    send(text)
