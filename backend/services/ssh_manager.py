import asyncio
import asyncssh
from typing import Optional
from dataclasses import dataclass, field


@dataclass
class SSHSession:
    """단일 SSH 세션 (연결 + PTY 프로세스)"""
    connection: asyncssh.SSHClientConnection
    process: Optional[asyncssh.SSHClientProcess] = None

    async def close(self):
        if self.process:
            self.process.close()
        self.connection.close()
        await self.connection.wait_closed()


class SSHManager:
    """SSH 세션 풀 관리"""

    def __init__(self):
        self._sessions: dict[str, SSHSession] = {}  # session_key -> SSHSession

    async def connect(
        self,
        session_key: str,
        host: str,
        port: int,
        username: str,
        password: Optional[str] = None,
        private_key_path: Optional[str] = None,
        cols: int = 80,
        rows: int = 24,
    ) -> SSHSession:
        """SSH 연결 생성 및 PTY 프로세스 시작"""
        # 기존 세션 정리
        if session_key in self._sessions:
            await self.disconnect(session_key)

        kwargs = {
            "host": host,
            "port": port,
            "username": username,
            "known_hosts": None,
        }
        if password:
            kwargs["password"] = password
        elif private_key_path:
            kwargs["client_keys"] = [private_key_path]

        conn = await asyncssh.connect(**kwargs)

        # PTY 할당하여 인터랙티브 셸 시작
        process = await conn.create_process(
            term_type="xterm-256color",
            term_size=(cols, rows),
            encoding=None,  # 바이너리 모드
        )

        session = SSHSession(connection=conn, process=process)
        self._sessions[session_key] = session
        return session

    async def disconnect(self, session_key: str):
        """세션 종료"""
        session = self._sessions.pop(session_key, None)
        if session:
            try:
                await session.close()
            except Exception:
                pass

    async def resize(self, session_key: str, cols: int, rows: int):
        """PTY 크기 변경"""
        session = self._sessions.get(session_key)
        if session and session.process:
            session.process.change_terminal_size(cols, rows)

    def get_session(self, session_key: str) -> Optional[SSHSession]:
        return self._sessions.get(session_key)

    async def close_all(self):
        """모든 세션 종료"""
        keys = list(self._sessions.keys())
        for key in keys:
            await self.disconnect(key)


# 싱글톤 인스턴스
ssh_manager = SSHManager()
