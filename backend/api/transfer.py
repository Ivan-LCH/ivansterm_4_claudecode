from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
import asyncssh
import io
import os

from backend.db.database import get_db
from backend.db.models import Connection, TransferHistory
from backend.core.security import decrypt

router = APIRouter(prefix="/api/transfer", tags=["transfer"])

MAX_UPLOAD_SIZE = 100 * 1024 * 1024  # 100MB


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


@router.post("/upload")
async def upload_file(
    conn_id: int = Form(...),
    path: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """로컬 → 리모트 파일 업로드"""
    conn = await db.get(Connection, conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    # 파일 크기 체크
    content = await file.read()
    file_size = len(content)
    if file_size > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 100MB)")

    file_name = file.filename or "unknown"
    remote_path = f"{path.rstrip('/')}/{file_name}"

    # 전송 이력 기록
    history = TransferHistory(
        connection_id=conn_id,
        file_name=file_name,
        direction="UP",
        status="IN_PROGRESS",
        file_size=file_size,
    )
    db.add(history)
    await db.commit()
    await db.refresh(history)

    ssh_conn = None
    try:
        ssh_conn, sftp = await _get_sftp(conn)

        async with sftp.open(remote_path, "wb") as f:
            await f.write(content)

        # 성공 업데이트
        history.status = "SUCCESS"
        await db.commit()

        return {
            "status": "ok",
            "file_name": file_name,
            "remote_path": remote_path,
            "file_size": file_size,
        }

    except Exception as e:
        history.status = "FAIL"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
    finally:
        if ssh_conn:
            ssh_conn.close()


@router.get("/download")
async def download_file(
    conn_id: int = Query(...),
    path: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """리모트 → 로컬 파일 다운로드"""
    conn = await db.get(Connection, conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    file_name = os.path.basename(path)

    # 전송 이력 기록
    history = TransferHistory(
        connection_id=conn_id,
        file_name=file_name,
        direction="DOWN",
        status="IN_PROGRESS",
        file_size=0,
    )
    db.add(history)
    await db.commit()
    await db.refresh(history)

    ssh_conn = None
    try:
        ssh_conn, sftp = await _get_sftp(conn)

        # 파일 크기 확인
        attrs = await sftp.stat(path)
        file_size = attrs.size or 0

        # 파일 내용 읽기
        async with sftp.open(path, "rb") as f:
            content = await f.read()

        # 성공 업데이트
        history.file_size = file_size
        history.status = "SUCCESS"
        await db.commit()

        ssh_conn.close()
        ssh_conn = None

        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="{file_name}"',
                "Content-Length": str(file_size),
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        history.status = "FAIL"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")
    finally:
        if ssh_conn:
            ssh_conn.close()


@router.get("/history")
async def get_transfer_history(
    conn_id: int = Query(None),
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
):
    """전송 이력 조회"""
    query = select(TransferHistory).order_by(desc(TransferHistory.created_at)).limit(limit)
    if conn_id is not None:
        query = query.where(TransferHistory.connection_id == conn_id)

    result = await db.execute(query)
    rows = result.scalars().all()

    return [
        {
            "id": r.id,
            "connection_id": r.connection_id,
            "file_name": r.file_name,
            "direction": r.direction,
            "status": r.status,
            "file_size": r.file_size,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
