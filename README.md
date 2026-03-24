# IvansTerm

웹 기반 원격 개발 통합 환경. SSH 터미널 + SFTP 파일 에디터를 브라우저에서 사용할 수 있습니다.

## 주요 기능

- **SSH 터미널** — xterm.js 기반 멀티 터미널 (탭/분할), tmux 자동 연결, 지수 백오프 재연결
- **파일 에디터** — Monaco Editor, SFTP Lazy Loading 파일 트리, 실시간 변경 감지, 멀티 탭/분할
- **로그 뷰어** — `tail -f` 방식 실시간 로그 스트리밍
- **파일 전송** — 업로드(Drag & Drop / 버튼), 다운로드(우클릭 메뉴)
- **멀티 세션** — 여러 서버 동시 접속, 세션별 독립 레이아웃
- **Web Preview** — iframe 기반 원격 서비스 미리보기
- **Claude 통합** — Claude expander에서 터미널 명령 직접 전달

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| UI 컴포넌트 | Monaco Editor, xterm.js, react-resizable-panels |
| Backend | Python 3.11, FastAPI, Uvicorn (async) |
| SSH/SFTP | asyncssh |
| DB | SQLAlchemy + aiosqlite (SQLite) |
| 암호화 | cryptography (Fernet) |
| 인프라 | Docker (port 8099=HTTPS, 1044=SSH proxy) |

## 실행 방법

### 최초 실행

```bash
docker-compose up --build
```

### 코드 수정 후 재배포

컨테이너 내부에서 실행:

```bash
docker exec ivansterm bash -c "mkdir -p /app/logs && cd /app && bash start_server.sh >> /app/logs/server.log 2>&1"
```

### 로그 확인

```bash
docker exec ivansterm tail -f /app/logs/server.log
```

### 접속

브라우저에서 `https://<host>:8099` 접속 (자체 서명 인증서 경고 무시)

## 프로젝트 구조

```
backend/
├── api/              # API 라우터 (connections, files, transfer, terminal, logtail, workspace)
├── core/             # config, security (Fernet 암호화)
├── db/               # SQLAlchemy 모델, CRUD, database.py
├── services/         # SSH 세션 관리 (SSHManager)
└── main.py           # FastAPI 진입점

frontend/src/
├── components/
│   ├── layout/       # Sidebar, WorkspaceView, StatusBar
│   ├── editor/       # EditorPanel, FileTree, LogViewer
│   ├── terminal/     # TerminalPanel
│   └── common/       # ConnectionModal, SettingsModal
├── hooks/            # useTerminal, useSFTP, useWorkspace, useEditorSettings, ...
├── types/            # TypeScript 타입 정의
└── App.tsx
```

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET/POST/PUT/DELETE | `/api/connections` | 서버 접속 정보 CRUD |
| GET | `/api/files/list` | 디렉토리 목록 |
| GET | `/api/files/read` | 파일 읽기 |
| PUT | `/api/files/write` | 파일 저장 |
| POST | `/api/files/mkdir` | 디렉토리 생성 |
| DELETE | `/api/files/delete` | 파일/디렉토리 삭제 |
| POST | `/api/transfer/upload` | 파일 업로드 (최대 100MB) |
| GET | `/api/transfer/download` | 파일 다운로드 |
| GET | `/api/transfer/history` | 전송 이력 |
| GET/PUT | `/api/workspace` | 레이아웃 상태 저장/복원 |
| WS | `/ws/terminal?conn_id=` | SSH 터미널 |
| WS | `/ws/logtail?conn_id=` | 로그 tail |

## 환경 변수

| 변수 | 설명 |
|------|------|
| `ENCRYPTION_KEY` | Fernet 암호화 키 (최초 실행 시 자동 생성) |

## 데이터베이스

SQLite (`db_data/ivansterm.db`)

| 테이블 | 설명 |
|--------|------|
| `connections` | 서버 접속 정보 (암호화 저장) |
| `workspaces` | 세션별 레이아웃 상태 (JSON) |
| `transfer_history` | 파일 전송 이력 |
