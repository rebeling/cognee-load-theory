"""Agent actions (stub).

Accepts an action request and echoes a result. Replace with real agent
dispatch later.
"""

from fastapi import APIRouter

from backend.core.models import ActionRequest, ActionResult

router = APIRouter(prefix="/actions", tags=["actions"])


@router.post("", response_model=ActionResult)
def run_action(req: ActionRequest) -> ActionResult:
    return ActionResult(
        action=req.action,
        status="ok",
        result={"echo": req.payload or {}},
    )
