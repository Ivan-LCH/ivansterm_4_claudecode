# IvansTerm - Claude Code Guidelines

## Project Overview
웹 기반 원격 개발 통합 환경 (SSH 터미널 + SFTP 파일 편집). 단일 사용자 앱.

## Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
  - UI: Monaco Editor, xterm.js, react-resizable-panels
- **Backend**: Python 3.11 + FastAPI + Uvicorn (async)
  - SSH/SFTP: asyncssh
  - DB: SQLAlchemy + aiosqlite (SQLite)
  - Security: cryptography (Fernet)
- **Infra**: Docker (port 8099=web, 1044=ssh)

## Project Structure
```
backend/
├── api/              # API 라우터 (connections, files, transfer, workspace, terminal)
├── core/             # config, security(암호화), ssh/sftp manager
├── db/               # SQLAlchemy 모델, CRUD, database.py
├── services/         # SSH/SFTP 세션 관리 서비스
└── main.py           # FastAPI 진입점

frontend/src/
├── components/
│   ├── layout/       # 패널 레이아웃, 상단/하단 바
│   ├── editor/       # Monaco Editor, 파일 트리
│   ├── terminal/     # xterm.js 터미널
│   └── common/       # 모달, 버튼 등 공통 UI
├── hooks/            # useSSH, useSFTP, usePanel 등
├── context/          # ConnectionContext, PanelContext
├── App.tsx
├── main.tsx
└── index.css
```

## API Endpoints
- `GET/POST/PUT/DELETE /api/connections` — 접속 관리
- `GET /api/files/list`, `GET /api/files/read`, `PUT /api/files/write`, `POST /api/files/mkdir`, `DELETE /api/files/delete` — SFTP 파일
- `POST /api/transfer/upload`, `GET /api/transfer/download`, `GET /api/transfer/history` — 파일 전송
- `GET/PUT /api/workspace` — 레이아웃 상태
- `WS /ws/terminal?conn_id={id}` — SSH 터미널

## Database Tables
- `connections`: id, name, host, port, username, auth_method, private_key_path
- `workspaces`: id, name, layout_state (JSON)
- `transfer_history`: id, file_name, direction, status, created_at, file_size

## Key Conventions
- 한국어 주석/문서, 영어 코드(변수명, 함수명)
- Backend API prefix: `/api/`
- WebSocket prefix: `/ws/`
- DB 파일: `db_data/ivansterm.db`
- 암호화 키: `.env`의 `ENCRYPTION_KEY` (최초 실행 시 자동 생성)
- 프론트엔드 빌드 결과물: `/static` 디렉토리에 서빙
- 패널 최대 6개 (좌우 각 3개)

## Build & Run
```bash
# 빌드 + 배포 (항상 컨테이너 안에서 실행)
docker exec ivansterm bash -c "cd /app && bash start_server.sh"
# start_server.sh가 자동으로: 기존 서버 종료 → 프론트 빌드 → static 복사 → 백엔드 시작
# 로그: 컨테이너 내 /app/logs/server.log

# 최초 컨테이너 생성
docker-compose up --build
```

## Implementation Phases
1. SSH 터미널 (WebSocket + PTY + xterm.js)
2. SFTP 파일 탐색 (트리 + Lazy Loading)
3. Monaco Editor 통합 (파일 열기/저장)
4. 동적 패널 레이아웃 (react-resizable-panels)
5. 연결 관리 (DB CRUD + 암호화)
6. 파일 전송 (업/다운로드 + 진행률)

## Reference Docs
- `docs/3단계_기술_규격_및_API.md` — API 상세 스펙
- `docs/4단계_구현_상세_가이드.md` — 구현 로직 상세
- `docs/2단계_시스템_설계서.md` — 아키텍처 & DB 설계
