from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def response_envelope(data: Any, *, request_id: str) -> dict[str, Any]:
    return {
        "data": data,
        "meta": {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "request_id": request_id,
        },
    }
