#!/bin/bash
set -e

echo "[Entrypoint] Starting IvansTerm container setup..."

# 1. Load environment variables
if [ -f /app/.env ]; then
    set -a
    source /app/.env
    set +a
fi

# 2. Create db_data directory if not exists
mkdir -p /app/db_data

# 3. SSL 자체 서명 인증서 생성 (없을 때만)
SSL_DIR="/app/ssl"
if [ ! -f "$SSL_DIR/cert.pem" ]; then
    echo "[Entrypoint] Generating self-signed SSL certificate..."
    mkdir -p "$SSL_DIR"
    openssl req -x509 -newkey rsa:2048 -keyout "$SSL_DIR/key.pem" -out "$SSL_DIR/cert.pem" \
        -days 3650 -nodes -subj "/CN=ivansterm"
fi

# 4. Start SSH Daemon (Main foreground process to keep container running)
echo "[Entrypoint] Starting SSH Daemon..."
exec /usr/sbin/sshd -D
