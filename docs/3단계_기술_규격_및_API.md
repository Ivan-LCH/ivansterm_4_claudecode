# 03. 기술 규격 및 API (Technical Specs & API)

본 문서는 IvansTerm의 통신 규격 및 주요 API 명세를 정의합니다.

---

## 1. 기본 규격
- **Protocol**: HTTP / HTTPS
- **Format**: JSON (Input/Output)
- **Real-time**: WebSocket (터미널 양방향 통신)
- **Authentication**: 없음 (단일 사용자 환경). 추후 필요 시 확장 가능.

---

## 2. 주요 API 카테고리

### 2.1 접속 관리 (Connections)
- `GET /api/connections`: 저장된 접속 정보 목록 조회
- `POST /api/connections`: 새 접속 정보 등록
- `PUT /api/connections/{id}`: 접속 정보 수정
- `DELETE /api/connections/{id}`: 접속 정보 삭제
- `POST /api/connections/{id}/test`: 접속 테스트 (연결 가능 여부 확인)

### 2.2 파일 관리 (Files — SFTP)
- `GET /api/files/list?conn_id={id}&path={path}`: 리모트 디렉토리 목록 조회 (파일 트리용)
- `GET /api/files/read?conn_id={id}&path={path}`: 리모트 파일 내용 읽기 (에디터 로딩)
- `PUT /api/files/write`: 리모트 파일 내용 저장 (Ctrl+S 시 호출)
- `POST /api/files/mkdir`: 리모트 디렉토리 생성
- `DELETE /api/files/delete`: 리모트 파일/디렉토리 삭제

### 2.3 파일 전송 (Transfer)
- `POST /api/transfer/upload`: 로컬 → 리모트 파일 업로드 (Drag & Drop)
- `GET /api/transfer/download?conn_id={id}&path={path}`: 리모트 → 로컬 파일 다운로드
- `GET /api/transfer/history`: 전송 이력 조회
  - 응답 필드: `id`, `file_name`, `direction` (UP/DOWN), `status` (SUCCESS/FAIL/IN_PROGRESS), `created_at`, `file_size`

### 2.4 작업 환경 (Workspace)
- `GET /api/workspace`: 현재 작업 환경 설정 조회 (레이아웃 상태)
  - 단일 사용자 앱이므로 workspace는 항상 단일 레코드(`id=1`)로 관리. 파라미터 없이 호출.
- `PUT /api/workspace`: 작업 환경 설정 저장 (패널 배치, 열린 파일 등)
  - 패널 구성 변경 시 자동 호출 (debounce 적용).

### 2.5 SSH 터미널 (WebSocket)
- `WS /ws/terminal?conn_id={id}`: SSH 터미널 WebSocket 연결
  - **Client → Server**: 키 입력 데이터 (stdin)
  - **Server → Client**: 터미널 출력 데이터 (stdout/stderr)
  - **Resize Event**: 터미널 크기 변경 시 PTY 크기 동기화

---

## 3. 상세 응답 규격
- **성공**: `200 OK` 또는 `201 Created`와 함께 데이터 반환.
- **실패**:
  - `400 Bad Request`: 잘못된 요청 파라미터.
  - `404 Not Found`: 파일/접속 정보를 찾을 수 없음.
  - `422 Unprocessable Entity`: 파라미터 유효성 검사 실패.
  - `500 Internal Server Error`: SSH/SFTP 연결 실패 또는 서버 내부 오류.
  - `502 Bad Gateway`: 리모트 서버 연결 불가.
