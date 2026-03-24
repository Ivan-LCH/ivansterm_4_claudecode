import { useState, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import TerminalPanel from "../terminal/TerminalPanel";
import EditorPanel from "../editor/EditorPanel";
import { useWorkspace } from "../../hooks/useWorkspace";
import type { TerminalSettings, EditorSettings } from "../../types";
import type { WorkspaceLayout } from "../../hooks/useWorkspace";
import type { FileOpenRequest, TailLogRequest } from "../editor/EditorPanel";

interface TerminalEntry {
  id: string;
  label: string;
}

// 터미널 뷰 모드: 탭(단일) / 분할(수직 스택)
type TerminalViewMode = "tab" | "split";

interface WorkspaceViewProps {
  sessionId: string;
  connectionId: number;
  connectionName: string;
  workingDir: string;
  initialWebUrl?: string;
  terminalSettings: TerminalSettings;
  editorSettings: EditorSettings;
  onSessionStatusChange?: (disconnected: boolean) => void;
  reconnectSignal?: number;
  onTerminalPreview?: (lines: string[]) => void;
  fileOpenRequest?: FileOpenRequest | null;
  tailLogRequest?: TailLogRequest | null;
  onOpenFileTree?: () => void;
  webOpenRequest?: { url: string; ts: number } | null;
  autoFocus?: boolean;
}

// 터미널 번호 카운터
let terminalCounter = 1;

// 터미널 명령 전달용 ref type
export interface WorkspaceViewRef {
  sendCommandToTerminal: (terminalId: string, command: string) => void;
}

const WorkspaceViewComponent = forwardRef<WorkspaceViewRef, WorkspaceViewProps>(
  ({ sessionId, connectionId, connectionName: _name, workingDir, initialWebUrl, terminalSettings, editorSettings, onSessionStatusChange, reconnectSignal, onTerminalPreview, fileOpenRequest, tailLogRequest, onOpenFileTree, webOpenRequest, autoFocus }, ref) => {
    void _name;
    const { loadLayout, saveLayout } = useWorkspace(sessionId);
    const [terminals, setTerminals] = useState<TerminalEntry[]>([
      { id: `term_${connectionId}_${sessionId.slice(-8)}`, label: "Terminal 1" },
    ]);
    const [termViewMode, setTermViewMode] = useState<TerminalViewMode>("tab");
    const [activeTermId, setActiveTermId] = useState<string>(`term_${connectionId}_${sessionId.slice(-8)}`);
    const [layoutLoaded, setLayoutLoaded] = useState(false);

    // 터미널 refs (명령 전달용)
    const terminalRefsRef = useRef<Record<string, { write: (data: string) => void; focus: () => void }>>({});

  // Web 패널 상태
  const [webPanelVisible, setWebPanelVisible] = useState(false);
  const [webInputUrl, setWebInputUrl] = useState("");
  const [webIframeUrl, setWebIframeUrl] = useState("");

    // 터미널별 연결 상태 추적
    const termStatusRef = useRef<Record<string, boolean>>({});
    const handleTermStatusChange = useCallback((termId: string, disconnected: boolean) => {
      termStatusRef.current[termId] = disconnected;
      // 하나라도 끊어지면 세션 disconnected 표시
      const anyDisconnected = Object.values(termStatusRef.current).some((d) => d);
      onSessionStatusChange?.(anyDisconnected);
    }, [onSessionStatusChange]);

    // 명령 전달 ref 구현
    useImperativeHandle(ref, () => ({
      sendCommandToTerminal: (terminalId: string, command: string) => {
        console.log(`[WorkspaceView] sendCommandToTerminal called: ${terminalId} - ${command}`);
        const termRef = terminalRefsRef.current[terminalId];
        console.log(`[WorkspaceView] Found terminal ref:`, !!termRef);
        if (termRef?.write) {
          console.log(`[WorkspaceView] Writing to terminal: ${command}\r`);
          termRef.write(command + '\r');
          // 명령 전달 후 터미널 자동 포커스
          setTimeout(() => termRef.focus?.(), 50);
        } else {
          console.log(`[WorkspaceView] No terminal ref found for ${terminalId}`);
          console.log(`[WorkspaceView] Available terminals:`, Object.keys(terminalRefsRef.current));
        }
      },
    }), []);

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
      // Web 패널 URL 복원
      if (layout.webPanelUrl) {
        setWebInputUrl(layout.webPanelUrl);
        setWebIframeUrl(layout.webPanelUrl);
        setWebPanelVisible(layout.webPanelVisible ?? false);
      } else if (initialWebUrl) {
        // service_url 있으면 URL만 세팅 (자동 오픈 안 함 — 사용자가 직접 열도록)
        const url = initialWebUrl.startsWith("http") ? initialWebUrl : `http://${initialWebUrl}`;
        setWebInputUrl(url);
      }
      setLayoutLoaded(true);
    });
  }, [loadLayout]);

  // 사이드바 Web Open 요청 처리
  const lastWebOpenTs = useRef(0);
  useEffect(() => {
    if (!webOpenRequest || webOpenRequest.ts <= lastWebOpenTs.current) return;
    lastWebOpenTs.current = webOpenRequest.ts;
    const url = webOpenRequest.url;
    setWebInputUrl(url);
    setWebIframeUrl(url);
    setWebPanelVisible(true);
    persistLayout({ webPanelUrl: url, webPanelVisible: true });
  }, [webOpenRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  // Web 패널 URL 이동 핸들러
  const handleWebGo = useCallback(() => {
    let url = webInputUrl.trim();
    if (!url) return;
    if (!url.startsWith("http://") && !url.startsWith("https://")) url = "http://" + url;
    setWebInputUrl(url);
    setWebIframeUrl(url);
    persistLayout({ webPanelUrl: url, webPanelVisible: true });
  }, [webInputUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Web 패널 토글
  const toggleWebPanel = useCallback(() => {
    setWebPanelVisible((v) => {
      const next = !v;
      persistLayout({ webPanelVisible: next });
      return next;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addTerminal = () => {
    if (terminals.length >= 3) return;
    terminalCounter += 1;
    const id = `term_${connectionId}_${Date.now()}`;
    setTerminals((prev) => [...prev, { id, label: `Terminal ${terminalCounter}` }]);
    setActiveTermId(id);
  };

  const closeTerminal = useCallback((id: string) => {
    // ref에서 상태 정리
    delete termStatusRef.current[id];
    setTerminals((prev) => {
      if (prev.length <= 1) return prev;
      const newTerms = prev.filter((t) => t.id !== id);
      if (id === activeTermId) {
        setActiveTermId(newTerms[0]?.id ?? "");
      }
      return newTerms;
    });
    // 남은 터미널 상태로 세션 상태 재계산
    const anyDisconnected = Object.values(termStatusRef.current).some((d) => d);
    onSessionStatusChange?.(anyDisconnected);
  }, [activeTermId, onSessionStatusChange]);

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
    return <div className="flex-1 bg-[#09090b]" />;
  }

  return (
    <div className="flex-1 flex overflow-hidden relative">

      {/* Web 패널: visible일 때 절대 위치로 전체 덮기 (Editor/Terminal은 mount 유지) */}
      {webPanelVisible && (
        <div className="absolute inset-0 z-10 flex flex-col bg-[#09090b]">
          {/* Web 패널 헤더 */}
          <div className="flex items-center gap-1 px-2 py-0.5 bg-[#18181b] border-b border-[#3f3f46] shrink-0">
            <span className="text-[10px] text-[#52525b] shrink-0 select-none">Web</span>
            <input
              type="text"
              value={webInputUrl}
              onChange={(e) => setWebInputUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleWebGo(); }}
              placeholder="http://localhost:3000"
              className="flex-1 min-w-0 px-1.5 py-0.5 text-xs bg-[#27272a] border border-[#3f3f46] rounded text-[#f4f4f5] placeholder-[#52525b] focus:outline-none focus:border-[#3b82f6]"
            />
            <button
              onClick={handleWebGo}
              className="px-2 py-0.5 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors shrink-0"
            >
              Go
            </button>
            <button
              onClick={toggleWebPanel}
              className="text-base text-[#71717a] hover:text-[#ef4444] hover:bg-[#ef4444]/10 rounded px-1.5 transition-colors leading-none shrink-0"
              title="Close web panel"
            >
              ×
            </button>
          </div>
          {/* iframe */}
          {webIframeUrl ? (
            <iframe
              src={webIframeUrl}
              className="flex-1 w-full border-none bg-white"
              title="Web Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-[#52525b] text-xs">
              URL 입력 후 Go 클릭
            </div>
          )}
        </div>
      )}

      {/* Editor + Terminal: 항상 mount (SSH 연결 유지), web 패널 열리면 visibility:hidden */}
      <PanelGroup
        direction="horizontal"
        className="flex-1"
        style={{ visibility: webPanelVisible ? "hidden" : "visible" }}
        onLayout={handleMainResize}
      >
        {/* 좌측: Editor */}
        <Panel defaultSize={initialLayout.editorSplitSize ?? 50} minSize={15}>
          <EditorPanel
            connectionId={connectionId}
            workingDir={workingDir}
            initialLayout={initialLayout}
            onLayoutChange={persistLayout}
            editorSettings={editorSettings}
            terminalTheme={terminalSettings.theme}
            fileOpenRequest={fileOpenRequest}
            tailLogRequest={tailLogRequest}
            onOpenFileTree={onOpenFileTree}
          />
        </Panel>

        {/* 리사이즈 핸들 */}
        <PanelResizeHandle className="group relative w-1 hover:w-1.5 bg-[#3f3f46] hover:bg-[#3b82f6] transition-all cursor-col-resize">
          <div className="absolute inset-y-0 -left-1 -right-1" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-0.5 h-0.5 rounded-full bg-[#f4f4f5]" />
            <div className="w-0.5 h-0.5 rounded-full bg-[#f4f4f5]" />
            <div className="w-0.5 h-0.5 rounded-full bg-[#f4f4f5]" />
          </div>
        </PanelResizeHandle>

        {/* 우측: Terminal */}
        <Panel defaultSize={initialLayout.editorSplitSize ? (100 - initialLayout.editorSplitSize) : 50} minSize={15}>
        <div className="flex flex-col h-full">
          {/* 터미널 헤더 바 */}
          <div className="flex items-center gap-1 px-2 py-0.5 bg-[#18181b] border-b border-[#3f3f46] shrink-0">
            {termViewMode === "tab" ? (
              <div className="flex items-center gap-0 overflow-x-auto flex-1">
                {terminals.map((t) => (
                  <div
                    key={t.id}
                    className={`flex items-center gap-1 px-2.5 py-1 text-[15px] cursor-pointer border-r border-[#3f3f46] transition-colors ${
                      t.id === activeTermId
                        ? "text-[#f4f4f5] bg-[#09090b]"
                        : "text-[#52525b] hover:text-[#a1a1aa]"
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
                        className="text-xs text-[#71717a] hover:text-[#ef4444] hover:bg-[#ef4444]/10 rounded px-0.5 transition-colors"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-[15px] text-[#a1a1aa]">Terminal ({terminals.length}/3)</span>
            )}

            <button
              onClick={addTerminal}
              disabled={terminals.length >= 3}
              className="px-2 py-0.5 text-[15px] font-bold text-[#10b981] hover:bg-[#3f3f46] rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
              title="Add terminal"
            >
              +
            </button>

            {terminals.length >= 2 && (
              <button
                onClick={toggleTermViewMode}
                className={`px-2 py-1 text-[15px] transition-colors shrink-0 rounded hover:bg-[#3f3f46] ${
                  termViewMode === "split"
                    ? "text-[#3b82f6]"
                    : "text-[#52525b] hover:text-[#a1a1aa]"
                }`}
                title={termViewMode === "split" ? "Tab mode" : "Split mode"}
              >
                {termViewMode === "split" ? "⬒ Split" : "⬜ Tab"}
              </button>
            )}
          </div>

          {/* 터미널 영역 — 모든 터미널을 항상 mount 유지 (SSH 재접속 방지) */}
          <div className="flex-1 overflow-hidden relative">
            {terminals.map((t, idx) => {
              // split 모드: 상위 2개만 표시, 나머지 숨김
              // tab 모드: activeTermId만 표시
              const visibleInSplit = termViewMode === "split" && idx < 2;
              const visibleInTab = termViewMode === "tab" && t.id === activeTermId;
              const isVisible = visibleInSplit || visibleInTab;

              return (
                <div
                  key={t.id}
                  className="absolute inset-0 flex flex-col"
                  style={{
                    display: isVisible ? "flex" : "none",
                    // split 모드에서 상하 분할 위치
                    ...(termViewMode === "split" && idx < 2 ? {
                      position: "absolute",
                      top: idx === 0 ? 0 : "50%",
                      bottom: idx === 0 ? "50%" : 0,
                      left: 0,
                      right: 0,
                    } : {}),
                  }}
                >
                  {/* split 모드에서 터미널별 작은 헤더 */}
                  {termViewMode === "split" && terminals.length > 1 && idx < 2 && (
                    <div className="flex items-center justify-between px-2 py-0.5 bg-[#27272a] shrink-0">
                      <span className="text-[15px] text-[#71717a]">{t.label}</span>
                      <button
                        onClick={() => closeTerminal(t.id)}
                        className="text-sm text-[#52525b] hover:text-[#ef4444] transition-colors leading-none px-0.5"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {/* split 모드에서 상하 경계선 */}
                  {termViewMode === "split" && idx === 1 && (
                    <div className="h-0.5 bg-[#3f3f46] shrink-0" />
                  )}
                  <div className="flex-1 overflow-hidden">
                    <TerminalPanel
                      ref={(ref) => {
                        if (ref) {
                          terminalRefsRef.current[t.id] = ref;
                        }
                      }}
                      connectionId={connectionId}
                      terminalId={t.id}
                      settings={terminalSettings}
                      onDisconnect={() => closeTerminal(t.id)}
                      onStatusChange={(d) => handleTermStatusChange(t.id, d)}
                      reconnectSignal={reconnectSignal}
                      onBufferUpdate={idx === 0 ? onTerminalPreview : undefined}
                      autoFocus={idx === 0 && autoFocus}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </Panel>
      </PanelGroup>
    </div>
    );
  }
);

WorkspaceViewComponent.displayName = "WorkspaceView";
export default WorkspaceViewComponent;
