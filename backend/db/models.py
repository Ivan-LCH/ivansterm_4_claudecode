from sqlalchemy import Column, Integer, String, Text, DateTime, func
from backend.db.database import Base


class Connection(Base):
    __tablename__ = "connections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    host = Column(String(255), nullable=False)
    port = Column(Integer, default=22)
    username = Column(String(100), nullable=False)
    auth_method = Column(String(20), default="password")  # password | key
    password_encrypted = Column(Text, nullable=True)
    private_key_path = Column(Text, nullable=True)
    last_working_dir = Column(String(500), default="~")
    service_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), default="default")
    layout_state = Column(Text, default="{}")  # JSON
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class TransferHistory(Base):
    __tablename__ = "transfer_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    connection_id = Column(Integer, nullable=False)
    file_name = Column(String(500), nullable=False)
    direction = Column(String(10), nullable=False)  # UP | DOWN
    status = Column(String(20), default="IN_PROGRESS")  # SUCCESS | FAIL | IN_PROGRESS
    file_size = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
