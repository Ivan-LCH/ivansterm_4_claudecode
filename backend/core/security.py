from cryptography.fernet import Fernet
from backend.core.config import settings
from pathlib import Path


def _ensure_encryption_key() -> str:
    """ENCRYPTION_KEY가 없으면 자동 생성하여 .env에 저장"""
    if settings.ENCRYPTION_KEY:
        return settings.ENCRYPTION_KEY

    key = Fernet.generate_key().decode()
    env_path = Path(__file__).parent.parent.parent / ".env"

    # .env 파일에 키 추가
    lines = []
    if env_path.exists():
        lines = env_path.read_text().splitlines()

    # 기존 ENCRYPTION_KEY 라인 교체 또는 추가
    found = False
    for i, line in enumerate(lines):
        if line.startswith("ENCRYPTION_KEY"):
            lines[i] = f"ENCRYPTION_KEY={key}"
            found = True
            break
    if not found:
        lines.append(f"ENCRYPTION_KEY={key}")

    env_path.write_text("\n".join(lines) + "\n")
    settings.ENCRYPTION_KEY = key
    return key


def get_fernet() -> Fernet:
    key = _ensure_encryption_key()
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(plain_text: str) -> str:
    """평문을 암호화하여 반환"""
    if not plain_text:
        return ""
    return get_fernet().encrypt(plain_text.encode()).decode()


def decrypt(encrypted_text: str) -> str:
    """암호문을 복호화하여 반환"""
    if not encrypted_text:
        return ""
    return get_fernet().decrypt(encrypted_text.encode()).decode()
