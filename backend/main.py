from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from backend.db.database import init_db, async_session
from backend.core.security import _ensure_encryption_key
from backend.services.ssh_manager import ssh_manager
from sqlalchemy import text
import time

# 서버 시작 시간 기록
_server_start_time = time.time()
from backend.api.connections import router as connections_router
from backend.api.terminal import router as terminal_router
from backend.api.files import router as files_router
from backend.api.logtail import router as logtail_router
from backend.api.workspace import router as workspace_router
from backend.api.transfer import router as transfer_router
from backend.api.git import router as git_router


async def _migrate_db():
    """기존 DB 스키마 마이그레이션 (컬럼 추가)"""
    async with async_session() as db:
        try:
            await db.execute(text("ALTER TABLE connections ADD COLUMN service_url TEXT"))
            await db.commit()
        except Exception:
            pass  # 이미 존재하면 무시


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    _ensure_encryption_key()
    await init_db()
    await _migrate_db()
    yield
    # Shutdown
    await ssh_manager.close_all()


app = FastAPI(title="IvansTerm", version="0.1.0", lifespan=lifespan)

# CORS 설정 (개발 환경)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 라우터 등록
app.include_router(connections_router)
app.include_router(terminal_router)
app.include_router(files_router)
app.include_router(logtail_router)
app.include_router(workspace_router)
app.include_router(transfer_router)
app.include_router(git_router)


# 헬스체크
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": "IvansTerm"}


# 서버 상태 (상태 바용)
@app.get("/api/server-status")
async def server_status():
    uptime_seconds = int(time.time() - _server_start_time)
    active_sessions = list(ssh_manager._sessions.keys())
    return {
        "uptime_seconds": uptime_seconds,
        "active_ssh_sessions": active_sessions,
        "session_count": len(active_sessions),
    }


# Frontend 정적 파일 서빙 (빌드 후) — 반드시 마지막에 마운트
static_path = Path(__file__).parent.parent / "static"
if static_path.exists():
    app.mount("/", StaticFiles(directory=str(static_path), html=True), name="static")
