import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from backend.db.database import async_session
from backend.db.models import Connection
from backend.core.security import decrypt

import asyncssh

router = APIRouter()


@router.websocket("/ws/logtail")
async def logtail_websocket(websocket: WebSocket, conn_id: int):
    """로그 파일 tail -f WebSocket 엔드포인트

    클라이언트 → 서버:
      - JSON {"type": "start", "path": "/var/log/xxx.log"}: tail 시작
      - JSON {"type": "stop"}: tail 중지

    서버 → 클라이언트:
      - 텍스트: 로그 내용
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

    ssh_conn = None
    tail_process = None

    try:
        # SSH 연결
        kwargs = {
            "host": host,
            "port": port,
            "username": username,
            "known_hosts": None,
        }
        if auth_method == "password" and password:
            kwargs["password"] = password
        elif auth_method == "key" and private_key_path:
            kwargs["client_keys"] = [private_key_path]

        ssh_conn = await asyncssh.connect(**kwargs)

        # WebSocket 메시지 수신 루프
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                break

            if "text" not in message:
                continue

            try:
                cmd = json.loads(message["text"])
            except json.JSONDecodeError:
                continue

            if cmd.get("type") == "start" and cmd.get("path"):
                # 기존 tail 프로세스 정리
                if tail_process:
                    tail_process.terminate()
                    tail_process = None

                file_path = cmd["path"]
                # tail -f 시작 (마지막 100줄부터)
                tail_process = await ssh_conn.create_process(
                    f"tail -n 100 -f {file_path}",
                    stderr=asyncssh.STDOUT,
                )

                # stdout 읽기 태스크
                async def read_tail():
                    try:
                        while True:
                            data = await tail_process.stdout.read(4096)
                            if not data:
                                break
                            await websocket.send_text(data)
                    except Exception:
                        pass

                asyncio.create_task(read_tail())

            elif cmd.get("type") == "stop":
                if tail_process:
                    tail_process.terminate()
                    tail_process = None

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.close(code=4500, reason=f"Error: {str(e)[:100]}")
        except Exception:
            pass
    finally:
        if tail_process:
            tail_process.terminate()
        if ssh_conn:
            ssh_conn.close()
