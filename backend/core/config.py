from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Encryption
    ENCRYPTION_KEY: str = ""

    # Database
    DB_PATH: str = str(Path(__file__).parent.parent.parent / "db_data" / "ivansterm.db")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
