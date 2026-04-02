import { useCallback, useRef } from "react";

const API_BASE = "/api/workspace";
const LOCAL_KEY_PREFIX = "ivansterm_layout_";

export interface WorkspaceLayout {
  editorSplitSize?: number;       // 좌우 에디터-터미널 비율 (0-100)
  fileTreeSize?: number;          // 파일 트리 패널 크기 (0-100)
  fileTreeCollapsed?: boolean;    // 파일 트리 접힘 여부
  editorViewMode?: "tab" | "split";  // 에디터 뷰 모드
  logExpanded?: boolean;          // 로그 뷰어 열림 여부
  logPanelSize?: number;          // 로그 패널 크기
  termViewMode?: "tab" | "split"; // 터미널 뷰 모드
  openFiles?: string[];           // 열린 파일 경로 목록
  activeFilePath?: string;        // 활성 파일 경로
  logFilePath?: string;           // 로그 뷰어에서 열린 파일 경로
  webPanelUrl?: string;           // Web 패널 URL
  webPanelVisible?: boolean;      // Web 패널 표시 여부
  editorCollapsed?: boolean;      // 에디터 패널 숨김 여부
}

export function useWorkspace(sessionId?: string) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storageKey = sessionId ? `${LOCAL_KEY_PREFIX}${sessionId}` : null;

  // 레이아웃 상태 조회 — connectionId가 있으면 localStorage 우선, 없으면 DB
  const loadLayout = useCallback(async (): Promise<WorkspaceLayout> => {
    // sessionId별 localStorage에서 로드
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          return JSON.parse(raw) as WorkspaceLayout;
        }
      } catch { /* ignore */ }
      // sessionId가 있는데 localStorage에 없으면 → 새 세션이므로 빈 레이아웃 반환
      // (DB의 글로벌 레이아웃을 상속하지 않음)
      return {};
    }

    // sessionId 없이 호출된 경우에만 DB fallback (기존 호환)
    try {
      const res = await fetch(API_BASE);
      if (!res.ok) return {};
      const data = await res.json();
      return (data.layout_state as WorkspaceLayout) || {};
    } catch {
      return {};
    }
  }, [storageKey]);

  // 레이아웃 상태 저장 (debounce 500ms) — localStorage + DB
  const saveLayout = useCallback((layout: WorkspaceLayout) => {
    // localStorage에 즉시 저장 (connectionId별)
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(layout));
      } catch { /* ignore */ }
    }

    // DB에도 저장 (debounce)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await fetch(API_BASE, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layout_state: layout }),
        });
      } catch {
        // 저장 실패 무시
      }
    }, 500);
  }, [storageKey]);

  return { loadLayout, saveLayout };
}
