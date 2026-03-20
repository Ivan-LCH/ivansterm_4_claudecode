"""워크스페이스 레이아웃 상태 저장/복구 API"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.database import get_db
from backend.db.models import Workspace

router = APIRouter(prefix="/api/workspace", tags=["workspace"])


class LayoutState(BaseModel):
    layout_state: dict


@router.get("")
async def get_workspace(session: AsyncSession = Depends(get_db)):
    """현재 워크스페이스 레이아웃 상태 조회 (단일 레코드 id=1)"""
    result = await session.execute(select(Workspace).where(Workspace.id == 1))
    ws = result.scalar_one_or_none()
    if not ws:
        return {"layout_state": {}}

    # layout_state가 JSON 문자열인 경우 파싱
    import json
    try:
        state = json.loads(ws.layout_state) if isinstance(ws.layout_state, str) else ws.layout_state
    except (json.JSONDecodeError, TypeError):
        state = {}

    return {"layout_state": state}


@router.put("")
async def save_workspace(body: LayoutState, session: AsyncSession = Depends(get_db)):
    """워크스페이스 레이아웃 상태 저장"""
    import json

    result = await session.execute(select(Workspace).where(Workspace.id == 1))
    ws = result.scalar_one_or_none()

    state_json = json.dumps(body.layout_state, ensure_ascii=False)

    if ws:
        ws.layout_state = state_json
    else:
        ws = Workspace(id=1, name="default", layout_state=state_json)
        session.add(ws)

    await session.commit()
    return {"status": "ok"}
