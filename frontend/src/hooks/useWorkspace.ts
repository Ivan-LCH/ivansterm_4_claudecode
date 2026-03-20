import { useCallback, useRef } from "react";

const API_BASE = "/api/workspace";

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
}

export function useWorkspace() {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 레이아웃 상태 조회
  const loadLayout = useCallback(async (): Promise<WorkspaceLayout> => {
    try {
      const res = await fetch(API_BASE);
      if (!res.ok) return {};
      const data = await res.json();
      return (data.layout_state as WorkspaceLayout) || {};
    } catch {
      return {};
    }
  }, []);

  // 레이아웃 상태 저장 (debounce 500ms)
  const saveLayout = useCallback((layout: WorkspaceLayout) => {
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
  }, []);

  return { loadLayout, saveLayout };
}
