#!/bin/bash
echo "========================================"
echo "  IvansTerm - Starting Server"
echo "========================================"

# 0. 기존 서버 종료 (uvicorn + worker 전체 강제 종료)
PID_FILE="/app/server.pid"
rm -f "$PID_FILE"
echo "[0/3] Stopping all server processes..."
pkill -9 -f "uvicorn" 2>/dev/null || true
pkill -9 -f "spawn_main" 2>/dev/null || true
sleep 2

# 1. Frontend Build
echo "[1/3] Building Frontend..."
cd /app/frontend
npm run build

# 2. Copy build output to static directory
echo "[2/3] Copying build to /app/static/"
cd /app
rm -rf /app/static
cp -r /app/frontend/dist /app/static

# 3. Start Backend (PID 저장, 백그라운드)
echo "[3/3] Starting Backend Server..."
mkdir -p logs
setsid nohup python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload \
    --ssl-keyfile /app/ssl/key.pem --ssl-certfile /app/ssl/cert.pem >> logs/server.log 2>&1 &
echo $! > "$PID_FILE"

echo "========================================"
echo "  Deployment Complete!"
echo "  Server PID: $(cat $PID_FILE)"
echo "  Logs: logs/server.log"
echo "  To follow logs: tail -f logs/server.log"
echo "========================================"
