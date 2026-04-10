import shlex
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
import asyncssh

from backend.db.database import get_db
from backend.db.models import Connection
from backend.core.security import decrypt

router = APIRouter(prefix="/api/git", tags=["git"])


async def _get_ssh(conn: Connection):
    """Connection 모델로부터 SSH 클라이언트 생성"""
    kwargs = {
        "host": conn.host,
        "port": conn.port,
        "username": conn.username,
        "known_hosts": None,
    }
    if conn.auth_method == "password" and conn.password_encrypted:
        kwargs["password"] = decrypt(conn.password_encrypted)
    elif conn.auth_method == "key" and conn.private_key_path:
        kwargs["client_keys"] = [conn.private_key_path]
    return await asyncssh.connect(**kwargs)


async def _run(ssh_conn, cmd: str, cwd: str) -> tuple[str, str, int]:
    full_cmd = f"cd {shlex.quote(cwd)} && {cmd}"
    result = await ssh_conn.run(full_cmd, check=False)
    return (result.stdout or ""), (result.stderr or ""), (result.returncode or 0)


# ── 상태 조회 ─────────────────────────────────────────────────────────────────

@router.get("/status")
async def git_status(
    conn_id: int = Query(...),
    path: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """git status --porcelain 결과 반환"""
    conn = await db.get(Connection, conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    ssh_conn = None
    try:
        ssh_conn = await _get_ssh(conn)
        stdout, stderr, rc = await _run(ssh_conn, "git status --porcelain=v1 2>&1", path)
        if rc != 0 and "not a git repository" in stdout + stderr:
            return {"is_git_repo": False, "files": []}

        files = []
        for line in stdout.splitlines():
            if len(line) < 4:
                continue
            xy = line[:2]
            fname = line[3:]
            # renamed: "old -> new" 형태
            if " -> " in fname:
                fname = fname.split(" -> ", 1)[1]
            x, y = xy[0], xy[1]
            staged = x not in (" ", "?", "!")
            unstaged = y not in (" ", "?", "!")
            untracked = xy == "??"
            files.append({
                "path": fname.strip(),
                "xy": xy,
                "staged": staged,
                "unstaged": unstaged,
                "untracked": untracked,
            })

        return {"is_git_repo": True, "files": files}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if ssh_conn:
            ssh_conn.close()


# ── Git Log ───────────────────────────────────────────────────────────────────

@router.get("/log")
async def git_log(
    conn_id: int = Query(...),
    path: str = Query(...),
    limit: int = Query(default=10),
    db: AsyncSession = Depends(get_db),
):
    """최근 커밋 로그 반환"""
    conn = await db.get(Connection, conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    ssh_conn = None
    try:
        ssh_conn = await _get_ssh(conn)
        fmt = "%H|%h|%s|%an|%ar|%D"
        cmd = f"git log --oneline -n {limit} --format='{fmt}' 2>&1"
        stdout, stderr, rc = await _run(ssh_conn, cmd, path)
        if rc != 0:
            return {"is_git_repo": False, "commits": []}

        commits = []
        for line in stdout.splitlines():
            parts = line.split("|", 5)
            if len(parts) < 5:
                continue
            commits.append({
                "hash": parts[0],
                "short_hash": parts[1],
                "message": parts[2],
                "author": parts[3],
                "relative_time": parts[4],
                "refs": parts[5] if len(parts) > 5 else "",
            })
        return {"is_git_repo": True, "commits": commits}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if ssh_conn:
            ssh_conn.close()


# ── Stage / Unstage ───────────────────────────────────────────────────────────

class StageRequest(BaseModel):
    conn_id: int
    path: str          # 작업 디렉토리
    files: list[str]   # 스테이지할 파일 경로 목록 (빈 리스트 = git add -A)
    unstage: bool = False


@router.post("/stage")
async def git_stage(req: StageRequest, db: AsyncSession = Depends(get_db)):
    conn = await db.get(Connection, req.conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    ssh_conn = None
    try:
        ssh_conn = await _get_ssh(conn)
        if req.unstage:
            if req.files:
                quoted = " ".join(shlex.quote(f) for f in req.files)
                cmd = f"git restore --staged {quoted}"
            else:
                cmd = "git restore --staged ."
        else:
            if req.files:
                quoted = " ".join(shlex.quote(f) for f in req.files)
                cmd = f"git add {quoted}"
            else:
                cmd = "git add -A"
        stdout, stderr, rc = await _run(ssh_conn, cmd, req.path)
        if rc != 0:
            raise HTTPException(status_code=400, detail=stderr or stdout)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if ssh_conn:
            ssh_conn.close()


# ── Commit ────────────────────────────────────────────────────────────────────

class CommitRequest(BaseModel):
    conn_id: int
    path: str
    message: str


@router.post("/commit")
async def git_commit(req: CommitRequest, db: AsyncSession = Depends(get_db)):
    conn = await db.get(Connection, req.conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    ssh_conn = None
    try:
        ssh_conn = await _get_ssh(conn)
        cmd = f"git commit -m {shlex.quote(req.message)}"
        stdout, stderr, rc = await _run(ssh_conn, cmd, req.path)
        if rc != 0:
            raise HTTPException(status_code=400, detail=stderr or stdout)
        return {"ok": True, "output": stdout}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if ssh_conn:
            ssh_conn.close()


# ── Push ──────────────────────────────────────────────────────────────────────

class PushRequest(BaseModel):
    conn_id: int
    path: str
    remote: str = "origin"
    branch: str = ""   # 빈 문자열이면 현재 브랜치


@router.post("/push")
async def git_push(req: PushRequest, db: AsyncSession = Depends(get_db)):
    conn = await db.get(Connection, req.conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    ssh_conn = None
    try:
        ssh_conn = await _get_ssh(conn)
        if req.branch:
            cmd = f"git push {shlex.quote(req.remote)} {shlex.quote(req.branch)}"
        else:
            cmd = f"git push {shlex.quote(req.remote)}"
        stdout, stderr, rc = await _run(ssh_conn, cmd, req.path)
        output = (stdout + "\n" + stderr).strip()
        if rc != 0:
            raise HTTPException(status_code=400, detail=output)
        return {"ok": True, "output": output}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if ssh_conn:
            ssh_conn.close()


# ── 현재 브랜치 조회 ──────────────────────────────────────────────────────────

@router.get("/branch")
async def git_branch(
    conn_id: int = Query(...),
    path: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    conn = await db.get(Connection, conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    ssh_conn = None
    try:
        ssh_conn = await _get_ssh(conn)
        stdout, _, rc = await _run(ssh_conn, "git branch --show-current 2>/dev/null", path)
        return {"branch": stdout.strip() if rc == 0 else ""}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if ssh_conn:
            ssh_conn.close()
