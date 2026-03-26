<div align="center">
  <h1>🚀 IvansTerm 4 ClaudeCode</h1>
  <p><strong>A Next-Generation Web-based Remote Development Environment</strong></p>
  <p>SSH Terminal, SFTP File Editor, and Remote Server Management right in your browser.</p>
  
  <!-- Badges -->
  <p>
    <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version" />
    <img src="https://img.shields.io/badge/Python-3.11-3776AB.svg?logo=python&logoColor=white" alt="Python Version" />
    <img src="https://img.shields.io/badge/React-18-61DAFB.svg?logo=react&logoColor=white" alt="React" />
    <img src="https://img.shields.io/badge/Docker-Enabled-2496ED.svg?logo=docker&logoColor=white" alt="Docker" />
    <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License" />
  </p>
</div>

<hr/>

## 📖 Table of Contents
- [About the Project](#-about-the-project)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Usage Guide](#-usage-guide)
- [Architecture & Structure](#-architecture--structure)
- [API Documentation](#-api-documentation)
- [Contributing](#-contributing)
- [License](#-license)

## 💡 About the Project

**IvansTerm 4 ClaudeCode**는 AI와 함께 협업하는 현대적 개발 방식인 **바이브코딩(Vibe Coding)**에 최적화된 웹 기반 원격 통합 개발 환경입니다! 

브라우저 상에서 최첨단 SSH 터미널, SFTP 파일 에디터, 그리고 다이나믹한 워크스페이스 레이아웃을 제공합니다. 특히 **메인 터미널에서 `claude code`를 실행하여 코딩을 주도하게 하면서, 분할된 측면 패널에서는 `TO-DO-LIST.md`를 열고 작업 진척도를 관리하며, 또 다른 탭에서는 실시간 시스템 서버 로그(`tail -f`)를 화면 전환 없이 한눈에 모니터링**할 수 있도록 설계되었습니다. 

일반적인 터미널이나 여러 개의 코드 에디터를 오갈 필요 없이, IvansTerm 단일 창 하나로 가장 효율적인 AI 페어 프로그래밍 공간을 구성해 보세요.

### 📸 Screenshots

> **안내:** [여기에 프로젝트 스크린샷을 추가하여 UI를 자랑해 보세요!]

## ✨ Key Features

- **🌐 Browser-Based SSH Terminal** 
  - `xterm.js` 기반의 네이티브 수준 콘솔 경험 제공
  - 멀티 탭 및 화면 분할 지원
  - `tmux` 자동 연동 및 지수형 백오프(Exponential Backoff) 재연결 알고리즘
- **📝 Advanced File Editor**
  - VS Code의 핵심인 `Monaco Editor` 통합
  - 지연 로딩(Lazy-loading)을 지원하며 실시간 변경 감지가 가능한 SFTP 기반 파일 트리
- **📊 Real-time Log Viewer**
  - 비동기 `tail -f` 메커니즘을 사용한 실시간 로그 스트리밍 기능
- **📁 Drag & Drop File Transfer**
  - 드래그 앤 드롭 방식을 통한 간편한 파일 업로드 (최대 100MB 지원)
  - 우클릭 컨텍스트 메뉴를 통한 직관적인 다운로드
- **🖥️ Multi-Session Management**
  - 다수의 원격 서버에 동시 접속 지원
  - 세션 별 독립적인 워크스페이스 레이아웃 자동 저장 및 복원
- **🔍 Dynamic Web Preview**
  - 원격 서비스 및 포트를 브라우저 내 iframe 기반으로 즉시 미리보기
- **🤖 Vibe Coding Workspace (Claude Code Optimized)**
  - **터미널 × 에디터 × 로그 뷰어 복합 활용**: `claude code` 에이전트 구동을 메인으로 하면서, 진행 중인 `TO-DO-LIST.md` 작업 목록을 실시간 관리하고 백엔드 서버 로그를 동시에 모니터링하기 위한 완벽한 다이내믹 UI 패널 제공
  - Claude 통합(Expander)을 통해 AI의 응답 아이디어를 터미널 명령어 또는 에디터에 직관적으로 전송 및 실행 가능

## 🛠 Tech Stack

### Frontend
- **Framework:** React 18, TypeScript, Vite
- **Styling:** Tailwind CSS
- **Core Components:** Monaco Editor, xterm.js, react-resizable-panels

### Backend
- **Core:** Python 3.11, FastAPI, Uvicorn (Async ASGI)
- **Protocol:** asyncssh
- **Database:** SQLAlchemy + aiosqlite (SQLite)
- **Security:** cryptography (Fernet AES 암호화 모델)

### Infrastructure
- **Containerization:** Docker & Docker Compose
- **Networking:** HTTPS (Port `8099`), SSH Proxy (Port `1044`)

## 🚀 Getting Started

빠르게 로컬 환경에 구성하고 실행하는 방법을 안내합니다.

### Prerequisites

이 프로젝트를 실행하기 위해 시스템에 Docker 및 Docker Compose가 설치되어 있어야 합니다.
- [Get Docker](https://docs.docker.com/get-docker/)

### Installation & Run

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Ivan-LCH/ivansterm_4_claudecode.git
   cd ivansterm_4_claudecode
   ```

2. **Run with Docker Compose:**
   ```bash
   docker-compose up --build -d
   ```

3. **Access the application:**
   브라우저를 열고 다음 주소로 접속합니다:
   ```text
   https://localhost:8099
   ```
   *(자체 서명된 SSL 인증서를 사용하므로 브라우저 경고가 발생할 수 있습니다. 안전하게 넘어가기/무시 버튼을 통해 접근 가능합니다.)*

## 📖 Usage Guide

- **Connection Management:** 설정이나 접속 관리자에서 대상 서버의 SSH 정보를 추가합니다. 비밀번호 및 Private Key 등 민감한 정보는 내부적으로 구축된 SQLite 데이터베이스에 강력한 Fernet 알고리즘으로 암호화되어 안전하게 보관됩니다.
- **Layout Management:** 파일 트리, 에디터 및 터미널 패널의 경계를 마우스로 드래그하여 레이아웃 크기를 사용자 정의할 수 있습니다. 수정된 레이아웃은 세션별로 자동 임시 보관됩니다.
- **Hot Reloading / Re-deploying:** 개발 중 백엔드 코드를 수정했다면, 컨테이너 내부 환경에서 손쉽게 서버를 재기동할 수 있습니다.
  ```bash
  docker exec ivansterm bash -c "mkdir -p /app/logs && cd /app && bash start_server.sh >> /app/logs/server.log 2>&1"
  ```
- **Checking Logs:**
  ```bash
  docker exec ivansterm tail -f /app/logs/server.log
  ```

## 🏗 Architecture & Structure

핵심적인 디렉토리 구조 및 역할을 소개합니다:

```text
.
├── backend/                  # FastAPI Application
│   ├── api/                  # API Routers (세션, 파일, 터미널, 전송 등)
│   ├── core/                 # Config & Security (Fernet 암호화 포함)
│   ├── db/                   # Database ORM 모델 및 CRUD 작업
│   ├── services/             # 비즈니스 로직 (SSH 세션 매니저 등)
│   └── main.py               # Application 진입점(Entry Point)
│
├── frontend/                 # Vite + React Application
│   └── src/
│       ├── components/       # Layouts, Editors, Terminals, Modals 단위 등
│       ├── hooks/            # Custom React Hooks (상태 관리 로직)
│       ├── types/            # TypeScript Interface 정의부
│       └── App.tsx           # UI 진입점
│
├── docker-compose.yml        # 다중 컨테이너 오케스트레이션 구성
└── Dockerfile                # 컨테이너 이미지 빌드 스크립트 정의
```

## 📡 API Documentation

백엔드 구동 후 환경 내에서 Swagger UI를 통해 자동 생성된 고품질 API 문서를 확인할 수 있습니다. (`https://localhost:8099/docs`)
주요 API 구조는 다음과 같습니다.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET/POST/PUT/DELETE` | `/api/connections` | 서버 접속 정보 관리(CRUD) |
| `GET` | `/api/files/list` | 디렉토리 구조 목록 조회 |
| `GET` | `/api/files/read` | 원격지 파일 내용 읽기 |
| `PUT` | `/api/files/write` | 파일 내용 변경 및 저장 |
| `POST` | `/api/files/mkdir` | 새로운 디렉토리(폴더) 생성 |
| `DELETE` | `/api/files/delete` | 파일 또는 디렉토리 제거 |
| `POST` | `/api/transfer/upload` | 파일 업로드 동작 (최대 100MB 크기 제한) |
| `GET` | `/api/transfer/download` | 지정된 파일 다운로드 동작 |
| `GET/PUT` | `/api/workspace` | 패널 레이아웃 상태 저장 및 불러오기 |
| `WS` | `/ws/terminal?conn_id=` | WebSocket: SSH 인터랙티브 터미널 스트림 |
| `WS` | `/ws/logtail?conn_id=` | WebSocket: `tail -f` 로그 스트리밍 전송 |

## 🛡 Security & Environment

| Variable | Description |
|----------|-------------|
| `ENCRYPTION_KEY` | 백엔드 최초 구동 시 스스로 안전하게 생성하고 보관하는 보안 키 세트입니다. 모든 SSH Password와 Key 정보들은 파일에 저장되기 전에 이 키 기반 대칭형 AES 암호화를 거칩니다. |

**Database:**
모든 데이터는 `db_data/ivansterm.db` 경로의 단일 SQLite 저장소에서 관리됩니다.
- `connections`: 암호화된 커넥션 프로필 테이블
- `workspaces`: 세션별 UI 패널 사이즈 등의 상태 데이터 (JSON 매핑)
- `transfer_history`: 파일의 업/다운로드 이력 정보 열람 테이블

## 🤝 Contributing

오픈소스 생태계에 있어 여러분들의 기여는 항상 커다란 도움이 됩니다. 수정 사항이나 멋진 기능 제안이 있다면 주저없이 기여해 주세요!

1. Project Fork 하기
2. Feature Branch 생성하기 (`git checkout -b feature/AmazingFeature`)
3. 커밋 생성하기 (`git commit -m 'Add some AmazingFeature'`)
4. Branch로 푸시하기 (`git push origin feature/AmazingFeature`)
5. Pull Request 열기

## 📄 License

이 프로젝트는 자유롭게 활용 가능하도록 MIT License 등 명시된 라이센스를 따릅니다. 포함된 `LICENSE` 파일을 참조해 주세요.

---
<div align="center">
  <sub>Built with ❤️ by the IvansTerm Team.</sub>
</div>
