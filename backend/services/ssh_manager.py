import asyncio
import asyncssh
from typing import Optional
from dataclasses import dataclass, field


@dataclass
class SSHSession:
    """단일 SSH 세션 (연결 + PTY 프로세스)"""
    connection: asyncssh.SSHClientConnection
    process: Optional[asyncssh.SSHClientProcess] = None
    is_new_tmux: bool = True  # 신규 tmux 세션이면 True, 기존 세션 attach면 False

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
        tmux_session: Optional[str] = None,
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

        # tmux 세션 신규 여부 판별 (attach이면 cd 전송 안 함)
        is_new_tmux = True
        if tmux_session:
            check = await conn.run(
                f"tmux has-session -t {tmux_session} 2>/dev/null",
                check=False,
            )
            is_new_tmux = check.exit_status != 0  # 0=기존 존재, 비0=신규
            # \; 는 bash에서 리터럴 ;로 tmux에 전달 → tmux 내부 명령 구분자로 동작
            # set-option -g mouse on: 마우스 스크롤 지원 (tmux copy mode 진입)
            command = f"tmux new-session -A -s {tmux_session} \\; set-option -g mouse on || bash"
        else:
            command = None

        # PTY 할당하여 인터랙티브 셸 시작
        process = await conn.create_process(
            command,
            term_type="xterm-256color",
            term_size=(cols, rows),
            encoding=None,  # 바이너리 모드
        )

        session = SSHSession(connection=conn, process=process, is_new_tmux=is_new_tmux)
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
