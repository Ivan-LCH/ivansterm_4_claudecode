from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
import asyncssh

from backend.db.database import get_db
from backend.db.models import Connection
from backend.core.security import decrypt

router = APIRouter(prefix="/api/files", tags=["files"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


class FileWriteRequest(BaseModel):
    conn_id: int
    path: str
    content: str


class MkdirRequest(BaseModel):
    conn_id: int
    path: str


async def _get_sftp(conn: Connection):
    """Connection 모델로부터 SFTP 클라이언트 생성"""
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

    ssh_conn = await asyncssh.connect(**kwargs)
    sftp = await ssh_conn.start_sftp_client()
    return ssh_conn, sftp


@router.get("/list")
async def list_directory(
    conn_id: int = Query(...),
    path: str = Query(default="~"),
    db: AsyncSession = Depends(get_db),
):
    """원격 디렉토리 목록 조회"""
    conn = await db.get(Connection, conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    ssh_conn = None
    try:
        ssh_conn, sftp = await _get_sftp(conn)

        # ~ 처리
        if path == "~":
            path = await sftp.realpath(".")

        entries = []
        for entry in await sftp.readdir(path):
            name = entry.filename
            if name in (".", ".."):
                continue
            attrs = entry.attrs
            is_dir = attrs.type == asyncssh.FILEXFER_TYPE_DIRECTORY if attrs.type is not None else False
            entries.append({
                "name": name,
                "path": f"{path.rstrip('/')}/{name}",
                "is_dir": is_dir,
                "size": attrs.size or 0,
            })

        # 디렉토리 먼저, 이름순 정렬
        entries.sort(key=lambda e: (not e["is_dir"], e["name"].lower()))

        return {"path": path, "entries": entries}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SFTP error: {str(e)}")
    finally:
        if ssh_conn:
            ssh_conn.close()


@router.get("/read")
async def read_file(
    conn_id: int = Query(...),
    path: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """원격 파일 내용 읽기"""
    conn = await db.get(Connection, conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    ssh_conn = None
    try:
        ssh_conn, sftp = await _get_sftp(conn)

        # 파일 크기 확인
        attrs = await sftp.stat(path)
        if attrs.size and attrs.size > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="File too large (max 10MB)")

        async with sftp.open(path, "r") as f:
            content = await f.read()

        # 바이너리 파일 감지
        if isinstance(content, bytes):
            try:
                content = content.decode("utf-8")
            except UnicodeDecodeError:
                raise HTTPException(status_code=422, detail="Binary file cannot be opened in editor")

        return {"content": content}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SFTP error: {str(e)}")
    finally:
        if ssh_conn:
            ssh_conn.close()


@router.put("/write")
async def write_file(
    data: FileWriteRequest,
    db: AsyncSession = Depends(get_db),
):
    """원격 파일 저장"""
    conn = await db.get(Connection, data.conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    ssh_conn = None
    try:
        ssh_conn, sftp = await _get_sftp(conn)

        async with sftp.open(data.path, "w") as f:
            await f.write(data.content)

        return {"status": "ok"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SFTP error: {str(e)}")
    finally:
        if ssh_conn:
            ssh_conn.close()


@router.post("/mkdir")
async def mkdir(
    data: MkdirRequest,
    db: AsyncSession = Depends(get_db),
):
    """원격 디렉토리 생성"""
    conn = await db.get(Connection, data.conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    ssh_conn = None
    try:
        ssh_conn, sftp = await _get_sftp(conn)
        await sftp.mkdir(data.path)
        return {"status": "ok"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SFTP error: {str(e)}")
    finally:
        if ssh_conn:
            ssh_conn.close()


@router.delete("/delete")
async def delete_file(
    conn_id: int = Query(...),
    path: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """원격 파일/디렉토리 삭제"""
    conn = await db.get(Connection, conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    ssh_conn = None
    try:
        ssh_conn, sftp = await _get_sftp(conn)

        attrs = await sftp.stat(path)
        if attrs.type == asyncssh.FILEXFER_TYPE_DIRECTORY:
            await sftp.rmtree(path)
        else:
            await sftp.remove(path)

        return {"status": "ok"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SFTP error: {str(e)}")
    finally:
        if ssh_conn:
            ssh_conn.close()
