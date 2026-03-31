import { useState, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import TerminalPanel from "../terminal/TerminalPanel";
import EditorPanel from "../editor/EditorPanel";
import TmuxSessionModal from "../common/TmuxSessionModal";
import { useWorkspace } from "../../hooks/useWorkspace";
import type { TerminalSettings, EditorSettings } from "../../types";
import type { WorkspaceLayout } from "../../hooks/useWorkspace";
import type { FileOpenRequest, TailLogRequest } from "../editor/EditorPanel";

interface TmuxSession {
  name: string;
  windows: number;
  attached: boolean;
  created: string;
}

interface TerminalEntry {
  id: string;
  label: string;
  tmuxName?: string;
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
  autoFocus?: boolean;
  onActiveTerminalChange?: (terminalId: string) => void;
  onTmuxNamesChanged?: (names: string[]) => void;
}

// 연결명 → tmux 허용 문자로 변환 (필터링·이름 생성 공통)
function getSafeName(connName: string): string {
  return connName.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "session";
}

// tmux에 허용되는 이름 생성: {서버명}_{MMDD-HHMM}
function generateTmuxName(connName: string): string {
  const safe = getSafeName(connName);
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${safe}_${mm}${dd}-${hh}${min}`;
}

// 터미널 번호 카운터
let terminalCounter = 1;

// 터미널 명령 전달용 ref type
export interface WorkspaceViewRef {
  sendCommandToTerminal: (terminalId: string, command: string) => void;
  focusActiveTerminal: () => void;
}

const WorkspaceViewComponent = forwardRef<WorkspaceViewRef, WorkspaceViewProps>(
  ({ sessionId, connectionId, connectionName, workingDir, initialWebUrl, terminalSettings, editorSettings, onSessionStatusChange, reconnectSignal, onTerminalPreview, fileOpenRequest, tailLogRequest, onOpenFileTree, autoFocus, onActiveTerminalChange, onTmuxNamesChanged }, ref) => {
    const { loadLayout, saveLayout } = useWorkspace(sessionId);

    // tmux 세션 선택 상태
    const [tmuxSessions, setTmuxSessions] = useState<TmuxSession[]>([]);
    const [tmuxModalOpen, setTmuxModalOpen] = useState(false);
    const [selectedTmux, setSelectedTmux] = useState<string>("");       // "" = 새세션, "name" = 이어받기
    const [tmuxChecked, setTmuxChecked] = useState(false);              // 조회 완료 여부

    // tmux 이름 확정 후 terminal 1에 반영 + 부모에 알림
    const resolveTmuxName = useCallback((name: string) => {
      setSelectedTmux(name);
      setTerminals((prev) => {
        const next = prev.map((t, idx) => idx === 0 ? { ...t, tmuxName: name } : t);
        onTmuxNamesChanged?.(next.map((t) => t.tmuxName).filter(Boolean) as string[]);
        return next;
      });
    }, [onTmuxNamesChanged]); // eslint-disable-line react-hooks/exhaustive-deps

    // 초기 마운트 시 tmux 세션 목록 조회 (현재 연결명 prefix 매칭만 필터링)
    useEffect(() => {
      fetch(`/api/connections/${connectionId}/tmux-sessions`)
        .then((r) => r.json())
        .then((data) => {
          const prefix = getSafeName(connectionName) + "_";
          const filtered = (data.sessions ?? []).filter((s: TmuxSession) => s.name.startsWith(prefix));
          if (filtered.length > 0) {
            setTmuxSessions(filtered);
            setTmuxModalOpen(true);
          } else {
            resolveTmuxName(generateTmuxName(connectionName));
            setTmuxChecked(true);
          }
        })
        .catch(() => {
          resolveTmuxName(generateTmuxName(connectionName));
          setTmuxChecked(true);
        });
    }, [connectionId]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleTmuxSelect = useCallback((sessionName: string) => {
      const resolved = sessionName || generateTmuxName(connectionName);
      resolveTmuxName(resolved);
      setTmuxModalOpen(false);
      setTmuxChecked(true);
    }, [connectionName, resolveTmuxName]);

    const handleTmuxDelete = useCallback((sessionName: string) => {
      fetch(`/api/connections/${connectionId}/tmux-sessions/${encodeURIComponent(sessionName)}`, { method: "DELETE" })
        .catch(() => {});
    }, [connectionId]);

    const [terminals, setTerminals] = useState<TerminalEntry[]>([
      { id: `term_${connectionId}_${sessionId.slice(-8)}`, label: "Terminal 1" },
    ]);
    const [termViewMode, setTermViewMode] = useState<TerminalViewMode>("tab");
    const [activeTermId, setActiveTermId] = useState<string>(`term_${connectionId}_${sessionId.slice(-8)}`);
    const activeTermIdRef = useRef(activeTermId);
    useEffect(() => {
      activeTermIdRef.current = activeTermId;
      onActiveTerminalChange?.(activeTermId);
    }, [activeTermId, onActiveTerminalChange]);
    const [layoutLoaded, setLayoutLoaded] = useState(false);

    // 터미널 refs (명령 전달용)
    const terminalRefsRef = useRef<Record<string, { write: (data: string) => void; focus: () => void }>>({});
    // 새 터미널 추가 시 마운트 후 자동 포커스용 ID
    const pendingFocusIdRef = useRef<string | null>(null);

  // Web 패널 상태
  const [webPanelVisible, setWebPanelVisible] = useState(false);
  const [webInputUrl, setWebInputUrl] = useState("");

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
        const termRef = terminalRefsRef.current[terminalId];
        if (termRef?.write) {
          termRef.write(command + '\r');
          setTimeout(() => termRef.focus?.(), 50);
        }
      },
      focusActiveTerminal: () => {
        const id = activeTermIdRef.current;
        setTimeout(() => terminalRefsRef.current[id]?.focus(), 100);
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
        setWebPanelVisible(layout.webPanelVisible ?? false);
      } else if (initialWebUrl) {
        // service_url 있으면 URL만 세팅 (자동 오픈 안 함 — 사용자가 직접 열도록)
        const url = initialWebUrl.startsWith("http") ? initialWebUrl : `http://${initialWebUrl}`;
        setWebInputUrl(url);
      }
      setLayoutLoaded(true);
    });
  }, [loadLayout]);

  // Web 패널 URL 이동 핸들러 (새 창으로 열기)
  const handleWebGo = useCallback(() => {
    let url = webInputUrl.trim();
    if (!url) return;
    if (!url.startsWith("http://") && !url.startsWith("https://")) url = "http://" + url;
    setWebInputUrl(url);
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [webInputUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Web 패널 토글
  const toggleWebPanel = useCallback(() => {
    setWebPanelVisible((v) => {
      const next = !v;
      persistLayout({ webPanelVisible: next });
      // 패널 닫힐 때 터미널 자동 포커스
      if (!next) {
        setTimeout(() => terminalRefsRef.current[activeTermIdRef.current]?.focus(), 100);
      }
      return next;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addTerminal = () => {
    if (terminals.length >= 3) return;
    terminalCounter += 1;
    const id = `term_${connectionId}_${Date.now()}`;
    const suffix = terminals.length + 1;  // 2 or 3
    const tmuxName = selectedTmux ? `${selectedTmux}-${suffix}` : undefined;
    pendingFocusIdRef.current = id;
    setTerminals((prev) => {
      const next = [...prev, { id, label: `Terminal ${terminalCounter}`, tmuxName }];
      onTmuxNamesChanged?.(next.map((t) => t.tmuxName).filter(Boolean) as string[]);
      return next;
    });
    setActiveTermId(id);
  };

  // 탭 클릭 시 해당 터미널로 포커스
  const handleSelectTerm = (id: string) => {
    setActiveTermId(id);
    setTimeout(() => terminalRefsRef.current[id]?.focus(), 50);
  };

  const closeTerminal = useCallback((id: string) => {
    delete termStatusRef.current[id];
    setTerminals((prev) => {
      if (prev.length <= 1) return prev;
      const newTerms = prev.filter((t) => t.id !== id);
      if (id === activeTermId) {
        const nextId = newTerms[0]?.id ?? "";
        setActiveTermId(nextId);
        // 닫힌 터미널이 활성이었으면 남은 터미널로 포커스
        setTimeout(() => terminalRefsRef.current[nextId]?.focus(), 50);
      }
      return newTerms;
    });
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
      {/* tmux 세션 선택 모달 */}
      {tmuxModalOpen && (
        <TmuxSessionModal sessions={tmuxSessions} onSelect={handleTmuxSelect} onDelete={handleTmuxDelete} />
      )}

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
          {/* URL 입력 후 새 창으로 열림 안내 */}
          <div className="flex-1 flex flex-col items-center justify-center text-[#52525b] text-xs gap-2">
            <span>URL을 입력하고 Go를 클릭하면 새 탭에서 열립니다</span>
            {webInputUrl && (
              <button
                onClick={handleWebGo}
                className="text-[#3b82f6] hover:underline break-all max-w-xs text-center"
                title={webInputUrl}
              >
                {webInputUrl}
              </button>
            )}
          </div>
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
                    onClick={() => handleSelectTerm(t.id)}
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

          {/* 터미널 영역 — tmux 세션 선택 완료 후 mount */}
          <div className="flex-1 overflow-hidden relative">
            {!tmuxChecked ? (
              <div className="flex items-center justify-center h-full text-[#52525b] text-xs">
                세션 확인 중…
              </div>
            ) : terminals.map((t, idx) => {
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
                    // display:none 대신 visibility+pointerEvents 조합 사용:
                    // display:none은 xterm 레이아웃 계산을 중단시켜 셀 크기 0 캐싱 유발
                    visibility: isVisible ? "visible" : "hidden",
                    pointerEvents: isVisible ? "auto" : "none",
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
                  <div className="flex-1 min-h-0 overflow-hidden flex flex-col relative">
                    <TerminalPanel
                      ref={(ref) => {
                        if (ref) {
                          terminalRefsRef.current[t.id] = ref;
                          // 새 터미널 추가 시 pendingFocus 처리
                          if (pendingFocusIdRef.current === t.id) {
                            pendingFocusIdRef.current = null;
                            setTimeout(() => ref.focus(), 300);
                          }
                        }
                      }}
                      connectionId={connectionId}
                      terminalId={t.id}
                      selectedTmux={t.tmuxName}
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
