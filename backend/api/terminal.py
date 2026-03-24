import asyncio
import json
import re
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from backend.db.database import async_session
from backend.db.models import Connection
from backend.core.security import decrypt
from backend.services.ssh_manager import ssh_manager

router = APIRouter()


@router.websocket("/ws/terminal")
async def terminal_websocket(websocket: WebSocket, conn_id: int, session_id: str = ""):
    """SSH 터미널 WebSocket 엔드포인트

    클라이언트 → 서버 메시지:
      - 바이너리/텍스트: stdin 입력
      - JSON {"type": "resize", "cols": N, "rows": N}: 터미널 리사이즈

    서버 → 클라이언트:
      - 바이너리: stdout/stderr 출력
    """
    await websocket.accept()

    # DB에서 접속 정보 조회
    async with async_session() as db:
        conn = await db.get(Connection, conn_id)
        if not conn:
            await websocket.close(code=4004, reason="Connection not found")
            return

        host = conn.host
        port = conn.port
        username = conn.username
        auth_method = conn.auth_method
        password = decrypt(conn.password_encrypted) if conn.password_encrypted else None
        private_key_path = conn.private_key_path
        working_dir = conn.last_working_dir or "~"

    # 세션 키: WebSocket별 고유
    session_key = f"terminal_{conn_id}_{id(websocket)}"

    try:
        # tmux 세션 이름: session_id가 있으면 세션별 고유 tmux 사용 (재접속 시 새 터미널 보장)
        safe_sid = re.sub(r"[^a-zA-Z0-9_-]", "_", session_id)[:16] if session_id else ""
        tmux_name = f"ivan_{conn_id}_{safe_sid}" if safe_sid else f"ivan_{conn_id}"

        # SSH 연결 (tmux 세션 자동 연결)
        session = await ssh_manager.connect(
            session_key=session_key,
            host=host,
            port=port,
            username=username,
            password=password if auth_method == "password" else None,
            private_key_path=private_key_path if auth_method == "key" else None,
            tmux_session=tmux_name,
        )

        process = session.process

        # stdout → WebSocket 전송 태스크
        async def read_stdout():
            try:
                while True:
                    data = await process.stdout.read(4096)
                    if not data:
                        break
                    await websocket.send_bytes(data)
            except Exception:
                pass
            # PTY 종료 → WebSocket 닫기 (메인 루프 탈출)
            try:
                await websocket.close(code=1000, reason="SSH session ended")
            except Exception:
                pass

        # stderr → WebSocket 전송 태스크
        async def read_stderr():
            try:
                while True:
                    data = await process.stderr.read(4096)
                    if not data:
                        break
                    await websocket.send_bytes(data)
            except Exception:
                pass

        # WebSocket ping (연결 유지용 — idle 끊김 방지)
        async def ping_loop():
            try:
                while True:
                    await asyncio.sleep(20)
                    await websocket.send_json({"type": "ping"})
            except Exception:
                pass

        # 백그라운드 읽기 태스크 먼저 시작 (초기 출력 포워딩)
        stdout_task = asyncio.create_task(read_stdout())
        stderr_task = asyncio.create_task(read_stderr())
        ping_task = asyncio.create_task(ping_loop())

        # 신규 tmux 세션일 때만 Working Directory로 이동
        # 기존 세션 attach(리프레시/재연결) 시에는 cd 미전송 — Claude 실행 중 입력 방지
        if session.is_new_tmux and working_dir and working_dir != "~":
            await asyncio.sleep(0.5)
            process.stdin.write(f"cd {working_dir}\n".encode())

        # WebSocket → SSH stdin
        try:
            while True:
                message = await websocket.receive()

                if message.get("type") == "websocket.disconnect":
                    break

                # 텍스트 메시지: JSON 명령 또는 일반 입력
                if "text" in message:
                    text = message["text"]
                    try:
                        cmd = json.loads(text)
                        if cmd.get("type") == "resize":
                            await ssh_manager.resize(
                                session_key,
                                cols=cmd.get("cols", 80),
                                rows=cmd.get("rows", 24),
                            )
                            continue
                    except (json.JSONDecodeError, AttributeError):
                        pass
                    # 일반 텍스트 입력
                    process.stdin.write(text.encode())

                # 바이너리 메시지: 직접 stdin 전달
                elif "bytes" in message:
                    process.stdin.write(message["bytes"])

        except WebSocketDisconnect:
            pass

        # 읽기 태스크 정리
        stdout_task.cancel()
        stderr_task.cancel()
        ping_task.cancel()

    except Exception as e:
        try:
            await websocket.close(code=4500, reason=f"SSH error: {str(e)[:100]}")
        except Exception:
            pass
    finally:
        await ssh_manager.disconnect(session_key)
