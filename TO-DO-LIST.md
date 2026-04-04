# IvansTerm - TO-DO LIST

> **범례:** `[ ]` 미완료 | `[/]` 진행중 | `[O]` 완료 | `[S]` 보류 | `[C]` 확인완료

---

## 1. 🖥️ SSH 터미널 (Terminal)

- 최근 항목 없음

---

## 2. 📝 리모트 파일 에디터 (Editor)

- 최근 항목 없음

---

## 3. 📂 파일 탐색 & 관리 (File Explorer & Management)

- **[ ] 3-1.** File Manager UI 기본 기능 추가 (Create, Delete, Rename, Move)
  - 파일 우클릭 메뉴 확장: tail, download, editor 외에 new file, new folder, delete, rename, move 추가
  - 드래그앤드롭으로 파일/폴더 이동 기능
  - 폴더 우클릭: new file, new folder, delete, rename, move

- **[ ] 3-2.** 서버 연결 시 기본 디렉토리 선택 → 파일 목록 미표시 기능 추가
  - 서버리스트에서 연결 선택 시 기본 디렉토리(홈 디렉토리)만 표시
  - 파일은 표시하지 않음 (디렉토리만 트리 구조로 보여주기)

---

## 4. 🔲 동적 패널 레이아웃 (Panel Layout)

- **[O] 4-1.** 에디터/로그 패널 숨기기 토글
  - 터미널 헤더에 `«` / `»` 버튼으로 에디터 패널 숨김/표시 전환
  - 숨긴 상태에서 터미널이 전체 너비 차지
  - 상태를 레이아웃에 저장하여 세션 복원 시 유지

---

## 5. 📂 파일 전송 (File Transfer)

- 최근 항목 없음

---

## 6. 🔌 접속 및 세션 관리 (Connection & Session)

- 최근 항목 없음

---

## 7. 🎨 UI 고도화 (UI/UX Enhancement)

- **[ ] 7-1.** 전체 컬러 스킴 개편 및 가시성 향상
  - 기존 다크 테마 유지하면서 더 명확한 색상 대비 추가
  - 액션 버튼 (commit, push 등) 강조 색상 보강
  - 활성/비활성 상태 시각적 구분 강화
  - 호버(Hover) 효과 더욱 명확하게

- **[ ] 7-2.** 모바일 환경 스크롤 기능 개선 및 확인
  - 사이드바(Sidebar) 스크롤 동작 확인 및 개선
  - 파일 트리(FileTree) 모바일 터치 스크롤 지원
  - 터미널 로그 스크롤 (xterm.js) 모바일 호환성 확인
  - 패널 리사이즈 제스처 모바일 최적화 필요 여부 확인

---

## 8. 🤖 Claude 통합 (Claude Integration)

- **[O] 8-1.** Claude 사이드바 ESC 버튼 추가
  - `pwd` 프리셋 버튼 제거, `ESC` 버튼 추가
  - 클릭 시 터미널로 실제 ESC 문자(`\x1b`) 전송 (엔터 없이)
  - 모바일에서 Claude 사용 중 ESC 입력 불가 문제 해소

---

## 9. 🔀 Git & Repository 관리 (Git & Repository Management)

- **[ ] 9-1.** Source Control 패널 추가 (Files 아래)
  - 현재 작업 디렉토리의 Git 변경 파일 목록 표시 (unstaged changes)
  - 파일별로 `+` 버튼으로 개별 stage 또는 전체 선택 기능
  - 변경 유형 아이콘 표시 (Modified, Added, Deleted 등)
  
- **[ ] 9-2.** Commit & Push 워크플로우
  - 자동 커밋 메시지 생성 (LLM 또는 규칙 기반)
  - Commit 메시지 입력/수정 가능
  - "Commit & Push" 버튼으로 한 번에 실행
  - Push 진행 상황 표시 (로딩 + 완료/에러)
  
- **[ ] 9-3.** Git Log 표시 (최근 3-5개 커밋)
  - 커밋 해시 (short), 메시지, 작성자, 시간 표시
  - 최신 커밋이 위에 표시되도록 정렬
  - GitHub에 Push 완료 여부 시각적 표시

---

## 10. 🚀 운영 관리 및 배포 (Deployment & Operations)

- 최근 항목 없음

---

> 📝 완료된 과거 이력은 `TO-DO-ARCHIVE.md` 파일에서 확인하세요.
>
> 🔄 **섹션 번호 정렬:**
> 1. 🖥️ SSH 터미널 (Terminal)
> 2. 📝 리모트 파일 에디터 (Editor)
> 3. 📂 파일 탐색 & 관리 (File Explorer & Management)
> 4. 🔲 동적 패널 레이아웃 (Panel Layout)
> 5. 📂 파일 전송 (File Transfer)
> 6. 🔌 접속 및 세션 관리 (Connection & Session)
> 7. 🎨 UI 고도화 (UI/UX Enhancement)
> 8. 🤖 Claude 통합 (Claude Integration)
> 9. 🔀 Git & Repository 관리 (Git & Repository Management) ← NEW
> 10. 🚀 운영 관리 및 배포 (Deployment & Operations)
