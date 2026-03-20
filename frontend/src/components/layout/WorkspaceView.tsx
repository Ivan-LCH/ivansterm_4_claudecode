import { useState, useCallback, useEffect, useRef } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import TerminalPanel from "../terminal/TerminalPanel";
import EditorPanel from "../editor/EditorPanel";
import { useWorkspace } from "../../hooks/useWorkspace";
import type { TerminalSettings } from "../../types";
import type { WorkspaceLayout } from "../../hooks/useWorkspace";

interface TerminalEntry {
  id: string;
  label: string;
}

// 터미널 뷰 모드: 탭(단일) / 분할(수직 스택)
type TerminalViewMode = "tab" | "split";

interface WorkspaceViewProps {
  connectionId: number;
  connectionName: string;
  workingDir: string;
  terminalSettings: TerminalSettings;
}

// 터미널 번호 카운터
let terminalCounter = 1;

export default function WorkspaceView({ connectionId, connectionName: _name, workingDir, terminalSettings }: WorkspaceViewProps) {
  void _name;
  const { loadLayout, saveLayout } = useWorkspace();
  const [terminals, setTerminals] = useState<TerminalEntry[]>([
    { id: `term_${connectionId}_init`, label: "Terminal 1" },
  ]);
  const [termViewMode, setTermViewMode] = useState<TerminalViewMode>("split");
  const [activeTermId, setActiveTermId] = useState<string>(`term_${connectionId}_init`);
  const [layoutLoaded, setLayoutLoaded] = useState(false);

  // 복구할 레이아웃 상태 (EditorPanel에 전달)
  const [initialLayout, setInitialLayout] = useState<WorkspaceLayout>({});
  const layoutRef = useRef<WorkspaceLayout>({});

  // 레이아웃 저장 헬퍼
  const persistLayout = useCallback((patch: Partial<WorkspaceLayout>) => {
    layoutRef.current = { ...layoutRef.current, ...patch };
    saveLayout(layoutRef.current);
  }, [saveLayout]);

  // 초기 레이아웃 복구
  useEffect(() => {
    loadLayout().then((layout) => {
      layoutRef.current = layout;
      setInitialLayout(layout);
      if (layout.termViewMode) setTermViewMode(layout.termViewMode);
      setLayoutLoaded(true);
    });
  }, [loadLayout]);

  const addTerminal = () => {
    if (terminals.length >= 3) return;
    terminalCounter += 1;
    const id = `term_${connectionId}_${Date.now()}`;
    setTerminals((prev) => [...prev, { id, label: `Terminal ${terminalCounter}` }]);
    setActiveTermId(id);
  };

  const closeTerminal = useCallback((id: string) => {
    setTerminals((prev) => {
      if (prev.length <= 1) return prev;
      const newTerms = prev.filter((t) => t.id !== id);
      if (id === activeTermId) {
        setActiveTermId(newTerms[0]?.id ?? "");
      }
      return newTerms;
    });
  }, [activeTermId]);

  const toggleTermViewMode = () => {
    setTermViewMode((m) => {
      const next = m === "tab" ? "split" : "tab";
      persistLayout({ termViewMode: next });
      return next;
    });
  };

  // 좌우 패널 리사이즈 시 저장
  const handleMainResize = useCallback((sizes: number[]) => {
    if (sizes.length >= 2) {
      persistLayout({ editorSplitSize: sizes[0] });
    }
  }, [persistLayout]);

  if (!layoutLoaded) {
    return <div className="flex-1 bg-[#1e1e2e]" />;
  }

  return (
    <PanelGroup
      direction="horizontal"
      className="flex-1"
      onLayout={handleMainResize}
    >
      {/* 좌측: Editor */}
      <Panel
        defaultSize={initialLayout.editorSplitSize ?? 50}
        minSize={20}
      >
        <EditorPanel
          connectionId={connectionId}
          workingDir={workingDir}
          initialLayout={initialLayout}
          onLayoutChange={persistLayout}
        />
      </Panel>

      {/* 리사이즈 핸들 — 드래그 영역 넓히고 시각적으로 얇게 (3-3) */}
      <PanelResizeHandle className="group relative w-1 hover:w-1.5 bg-[#313244] hover:bg-[#89b4fa] transition-all cursor-col-resize">
        <div className="absolute inset-y-0 -left-1 -right-1" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-0.5 h-0.5 rounded-full bg-[#cdd6f4]" />
          <div className="w-0.5 h-0.5 rounded-full bg-[#cdd6f4]" />
          <div className="w-0.5 h-0.5 rounded-full bg-[#cdd6f4]" />
        </div>
      </PanelResizeHandle>

      {/* 우측: Terminal */}
      <Panel defaultSize={initialLayout.editorSplitSize ? (100 - initialLayout.editorSplitSize) : 50} minSize={20}>
        <div className="flex flex-col h-full">
          {/* 터미널 헤더 바 */}
          <div className="flex items-center gap-1 px-2 py-0.5 bg-[#181825] border-b border-[#313244] shrink-0">
            {termViewMode === "tab" ? (
              <div className="flex items-center gap-0 overflow-x-auto flex-1">
                {terminals.map((t) => (
                  <div
                    key={t.id}
                    className={`flex items-center gap-1 px-2 py-0.5 text-[10px] cursor-pointer border-r border-[#313244] transition-colors ${
                      t.id === activeTermId
                        ? "text-[#cdd6f4] bg-[#1e1e2e]"
                        : "text-[#585b70] hover:text-[#a6adc8]"
                    }`}
                    onClick={() => setActiveTermId(t.id)}
                  >
                    <span>{t.label}</span>
                    {terminals.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          closeTerminal(t.id);
                        }}
                        className="text-[10px] text-[#585b70] hover:text-[#f38ba8] transition-colors"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-xs text-[#a6adc8]">Terminal ({terminals.length}/3)</span>
            )}

            <button
              onClick={addTerminal}
              disabled={terminals.length >= 3}
              className="px-2 py-0.5 text-xs font-bold text-[#a6e3a1] hover:bg-[#313244] rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
              title="Add terminal"
            >
              +
            </button>

            {terminals.length >= 2 && (
              <button
                onClick={toggleTermViewMode}
                className={`px-1.5 py-0.5 text-[10px] transition-colors shrink-0 ${
                  termViewMode === "split"
                    ? "text-[#89b4fa]"
                    : "text-[#585b70] hover:text-[#a6adc8]"
                }`}
                title={termViewMode === "split" ? "Tab mode" : "Split mode"}
              >
                {termViewMode === "split" ? "⬒" : "⬜"}
              </button>
            )}
          </div>

          {/* 터미널 영역 */}
          {termViewMode === "tab" ? (
            <div className="flex-1 overflow-hidden relative">
              {terminals.map((t) => (
                <div
                  key={t.id}
                  className="absolute inset-0"
                  style={{ display: t.id === activeTermId ? "block" : "none" }}
                >
                  <TerminalPanel
                    connectionId={connectionId}
                    settings={terminalSettings}
                    onDisconnect={() => closeTerminal(t.id)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <PanelGroup direction="vertical" className="flex-1">
              {terminals.slice(0, 2).map((t, idx) => (
                <div key={t.id} className="contents">
                  {idx > 0 && (
                    <PanelResizeHandle className="group relative h-1 hover:h-1.5 bg-[#313244] hover:bg-[#89b4fa] transition-all cursor-row-resize">
                      <div className="absolute inset-x-0 -top-1 -bottom-1" />
                    </PanelResizeHandle>
                  )}
                  <Panel minSize={15}>
                    <div className="flex flex-col h-full">
                      {terminals.length > 1 && (
                        <div className="flex items-center justify-between px-2 py-0.5 bg-[#11111b] shrink-0">
                          <span className="text-[10px] text-[#585b70]">{t.label}</span>
                          <button
                            onClick={() => closeTerminal(t.id)}
                            className="text-[10px] text-[#585b70] hover:text-[#f38ba8] transition-colors"
                          >
                            x
                          </button>
                        </div>
                      )}
                      <div className="flex-1 overflow-hidden">
                        <TerminalPanel
                          connectionId={connectionId}
                          settings={terminalSettings}
                          onDisconnect={() => closeTerminal(t.id)}
                        />
                      </div>
                    </div>
                  </Panel>
                </div>
              ))}
            </PanelGroup>
          )}
        </div>
      </Panel>
    </PanelGroup>
  );
}
