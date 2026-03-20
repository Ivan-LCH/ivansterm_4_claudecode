from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import asyncssh

from backend.db.database import get_db
from backend.db.models import Connection
from backend.core.security import encrypt, decrypt

router = APIRouter(prefix="/api/connections", tags=["connections"])


# --- Schemas ---

class ConnectionCreate(BaseModel):
    name: str
    host: str
    port: int = 22
    username: str
    auth_method: str = "password"  # password | key
    password: Optional[str] = None
    private_key_path: Optional[str] = None
    last_working_dir: str = "~"


class ConnectionUpdate(ConnectionCreate):
    pass


class ConnectionOut(BaseModel):
    id: int
    name: str
    host: str
    port: int
    username: str
    auth_method: str
    private_key_path: Optional[str] = None
    last_working_dir: str = "~"

    model_config = {"from_attributes": True}


# --- Endpoints ---

@router.get("", response_model=list[ConnectionOut])
async def list_connections(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Connection).order_by(Connection.id))
    return result.scalars().all()


@router.post("", response_model=ConnectionOut, status_code=201)
async def create_connection(data: ConnectionCreate, db: AsyncSession = Depends(get_db)):
    conn = Connection(
        name=data.name,
        host=data.host,
        port=data.port,
        username=data.username,
        auth_method=data.auth_method,
        password_encrypted=encrypt(data.password) if data.password else None,
        private_key_path=data.private_key_path,
        last_working_dir=data.last_working_dir,
    )
    db.add(conn)
    await db.commit()
    await db.refresh(conn)
    return conn


@router.get("/{conn_id}", response_model=ConnectionOut)
async def get_connection(conn_id: int, db: AsyncSession = Depends(get_db)):
    conn = await db.get(Connection, conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    return conn


@router.put("/{conn_id}", response_model=ConnectionOut)
async def update_connection(conn_id: int, data: ConnectionUpdate, db: AsyncSession = Depends(get_db)):
    conn = await db.get(Connection, conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    conn.name = data.name
    conn.host = data.host
    conn.port = data.port
    conn.username = data.username
    conn.auth_method = data.auth_method
    conn.private_key_path = data.private_key_path
    conn.last_working_dir = data.last_working_dir
    if data.password:
        conn.password_encrypted = encrypt(data.password)

    await db.commit()
    await db.refresh(conn)
    return conn


@router.delete("/{conn_id}")
async def delete_connection(conn_id: int, db: AsyncSession = Depends(get_db)):
    conn = await db.get(Connection, conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    await db.delete(conn)
    await db.commit()
    return {"detail": "Deleted"}


@router.post("/{conn_id}/test")
async def test_connection(conn_id: int, db: AsyncSession = Depends(get_db)):
    """SSH 접속 테스트"""
    conn = await db.get(Connection, conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    try:
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

        async with asyncssh.connect(**kwargs) as _:
            pass

        return {"status": "ok", "message": "Connection successful"}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Connection failed: {str(e)}")
