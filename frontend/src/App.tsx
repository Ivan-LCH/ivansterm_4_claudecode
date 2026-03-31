import { useState, useEffect, useCallback, useRef } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { useConnections } from "./hooks/useConnections";
import { useTerminalSettings } from "./hooks/useTerminalSettings";
import { useEditorSettings } from "./hooks/useEditorSettings";
import ConnectionModal from "./components/common/ConnectionModal";
import SettingsModal from "./components/common/SettingsModal";
import Sidebar from "./components/layout/Sidebar";
import WorkspaceView from "./components/layout/WorkspaceView";
import StatusBar from "./components/layout/StatusBar";
import type { ConnectionInfo, ConnectionCreate, TransferStatus } from "./types";
import type { FileOpenRequest, TailLogRequest } from "./components/editor/EditorPanel";
import type { WorkspaceViewRef } from "./components/layout/WorkspaceView";

const SESSION_STORAGE_KEY = "ivansterm_sessions";
const CURRENT_SESSION_KEY = "ivansterm_current_session";
const SIDEBAR_SIZE_KEY = "ivansterm_sidebar_size";

function loadSidebarSize(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_SIZE_KEY);
    if (raw) return JSON.parse(raw) as number;
  } catch { /* ignore */ }
  return 14; // 기본값 (%)
}

interface Session {
  sessionId: string;        // 고유 세션 ID (같은 서버 + 다른 디렉토리 = 다른 세션)
  connectionId: number;     // DB 연결 ID (API 호출용)
  name: string;
  host: string;
  workingDir: string;
  serviceUrl?: string;      // 세션 시작 시 자동 오픈할 Web Preview URL
  disconnected?: boolean;
  tmuxNames?: string[];     // 실제 연결된 tmux 세션명 목록 (Close 시 일괄 kill용)
}

// 고유 세션 ID 생성
function generateSessionId(connectionId: number): string {
  return `sess_${connectionId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// localStorage에서 세션 복원
function loadSavedSessions(): Session[] {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Session[];
      // 기존 데이터 마이그레이션: sessionId가 없으면 생성
      return parsed.map((s) => ({
        ...s,
        sessionId: s.sessionId || generateSessionId(s.connectionId),
      }));
    }
  } catch { /* ignore */ }
  return [];
}

function loadSavedCurrentSession(): string | null {
  try {
    const raw = localStorage.getItem(CURRENT_SESSION_KEY);
    if (raw) return JSON.parse(raw) as string;
  } catch { /* ignore */ }
  return null;
}

function App() {
  const { connections, createConnection, deleteConnection, refresh } = useConnections();
  const { settings: terminalSettings, updateSettings, resetSettings } = useTerminalSettings();
  const { settings: editorSettings, updateSettings: updateEditorSettings, resetSettings: resetEditorSettings } = useEditorSettings();
  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [closeConfirmSessionId, setCloseConfirmSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>(loadSavedSessions);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(loadSavedCurrentSession);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
  // 세션별 재연결 트리거 (숫자 증가 시 reconnect 시도)
  const [reconnectSignals, setReconnectSignals] = useState<Record<string, number>>({});
  // 파일 전송 상태 (StatusBar 표시용)
  const [transferStatus, setTransferStatus] = useState<TransferStatus | null>(null);
  // 세션별 터미널 프리뷰 (사이드바 미니 터미널용)
  const [terminalPreviews, setTerminalPreviews] = useState<Record<string, string[]>>({});
  // 사이드바 FileTree → EditorPanel 파일 열기/로그 요청 (세션별 격리)
  const [fileOpenRequests, setFileOpenRequests] = useState<Record<string, FileOpenRequest | null>>({});
  const [tailLogRequests, setTailLogRequests] = useState<Record<string, TailLogRequest | null>>({});
  // EditorPanel "Files" 버튼 → Sidebar Files 탭 열기 신호
  const [fileTreeOpenSignal, setFileTreeOpenSignal] = useState(0);
  // 세션별 알림 뱃지 카운트
  const [sessionNotifications, setSessionNotifications] = useState<Record<string, number>>({});
  // 세션별 마지막 알림 판단에 사용한 버퍼 내용 (중복 알림 방지)
  const sessionLastNotifiedBufferRef = useRef<Record<string, string>>({});
  // WorkspaceView refs (명령 전달용)
  const workspaceRefsRef = useRef<Record<string, WorkspaceViewRef>>({});
  // 세션별 활성 터미널 ID
  const [activeTerminalIds, setActiveTerminalIds] = useState<Record<string, string>>({});
  // 세션 목록 변경 시 localStorage에 저장 (disconnected 플래그 제외)
  useEffect(() => {
    const toSave = sessions.map(({ disconnected: _, ...rest }) => rest);
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toSave));
  }, [sessions]);

  // 현재 세션 ID 변경 시 localStorage에 저장 + 이전 세션의 파일/로그 요청 초기화
  useEffect(() => {
    if (currentSessionId !== null) {
      localStorage.setItem(CURRENT_SESSION_KEY, JSON.stringify(currentSessionId));
    } else {
      localStorage.removeItem(CURRENT_SESSION_KEY);
    }
    // 세션별 격리로 관리되므로 별도 초기화 불필요
  }, [currentSessionId]);

  // 복원된 세션 중 DB에 없는 연결은 제거 (connections 로드 후)
  useEffect(() => {
    if (connections.length === 0) return;
    setSessions((prev) => {
      const valid = prev.filter((s) => connections.some((c) => c.id === s.connectionId));
      if (valid.length !== prev.length) {
        // 현재 세션도 유효성 검사
        if (currentSessionId && !valid.some((s) => s.sessionId === currentSessionId)) {
          setCurrentSessionId(valid[0]?.sessionId ?? null);
        }
        return valid;
      }
      return prev;
    });
  }, [connections]); // eslint-disable-line react-hooks/exhaustive-deps

  // 새 세션 열기 (같은 서버 + 같은 디렉토리여도 항상 새 세션 생성)
  const openSession = useCallback((conn: ConnectionInfo) => {
    const sessionId = generateSessionId(conn.id);
    const session: Session = {
      sessionId,
      connectionId: conn.id,
      name: conn.name,
      host: `${conn.username}@${conn.host}:${conn.port}`,
      workingDir: conn.last_working_dir || "~",
      serviceUrl: conn.service_url || undefined,
    };
    setSessions((prev) => [...prev, session]);
    setCurrentSessionId(sessionId);

    // 새 세션 기본 파일/로그 자동 오픈: TO-DO-LIST.md (에디터), logs/server.log (로그뷰어)
    // 파일이 없으면 silent:true로 조용히 무시 → 빈 패널 표시
    const wd = conn.last_working_dir || "~";
    const sep = wd.endsWith("/") ? "" : "/";
    const ts = Date.now();
    setFileOpenRequests((prev) => ({
      ...prev,
      [sessionId]: { path: `${wd}${sep}TO-DO-LIST.md`, filename: "TO-DO-LIST.md", ts, silent: true },
    }));
    setTailLogRequests((prev) => ({
      ...prev,
      [sessionId]: { path: `${wd}${sep}logs/server.log`, ts },
    }));
  }, []);

  const handleCreateAndConnect = async (data: ConnectionCreate) => {
    let conn: ConnectionInfo;
    if ((data as any)._existingId) {
      const existingId = (data as any)._existingId;
      await refresh();
      conn = { ...data, id: existingId } as ConnectionInfo;
    } else {
      conn = await createConnection(data);
    }
    openSession(conn);
  };

  // 세션 연결 상태 변경 핸들러
  const handleSessionStatusChange = (sessionId: string, disconnected: boolean) => {
    setSessions((prev) =>
      prev.map((s) => (s.sessionId === sessionId ? { ...s, disconnected } : s))
    );
  };

  // 끊어진 세션 재연결
  const handleReconnectSession = (sessionId: string) => {
    setReconnectSignals((prev) => ({ ...prev, [sessionId]: (prev[sessionId] || 0) + 1 }));
    setCurrentSessionId(sessionId);
  };

  // 세션 닫기
  // × 버튼 클릭 시 확인 다이얼로그 표시
  const handleCloseSession = (sessionId: string) => {
    setCloseConfirmSessionId(sessionId);
  };

  // 실제 세션 제거 (tmux kill 여부 선택)
  const doCloseSession = (sessionId: string, killTmux: boolean) => {
    setCloseConfirmSessionId(null);
    if (killTmux) {
      const target = sessions.find((s) => s.sessionId === sessionId);
      if (target?.tmuxNames?.length && target?.connectionId) {
        target.tmuxNames.forEach((name) => {
          fetch(`/api/connections/${target.connectionId}/tmux-sessions/${encodeURIComponent(name)}`, {
            method: "DELETE",
          }).catch(() => {});
        });
      }
    }
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.sessionId !== sessionId);
      if (currentSessionId === sessionId) {
        setCurrentSessionId(remaining[0]?.sessionId ?? null);
      }
      return remaining;
    });
  };

  // 서버 편집 모달용 상태
  const [editingConnection, setEditingConnection] = useState<ConnectionInfo | null>(null);

  const handleEditAndConnect = async (data: ConnectionCreate) => {
    if (editingConnection) {
      // 기존 서버 업데이트
      await fetch(`/api/connections/${editingConnection.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      await refresh();
      const updatedConn = { ...data, id: editingConnection.id } as ConnectionInfo;
      openSession(updatedConn);
    }
  };

  const handleSaveAsNewAndConnect = async (data: ConnectionCreate) => {
    const conn = await createConnection(data);
    openSession(conn);
  };



  // 현재 활성 세션 정보
  const currentSession = sessions.find((s) => s.sessionId === currentSessionId) ?? null;

  return (
    <div className="h-screen w-screen bg-[#09090b] flex flex-col overflow-hidden">
      {/* 세션 닫기 확인 다이얼로그 */}
      {closeConfirmSessionId && (() => {
        const target = sessions.find((s) => s.sessionId === closeConfirmSessionId);
        return (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60">
            <div className="bg-[#18181b] border border-[#3f3f46] rounded-lg shadow-2xl w-[400px] max-w-[90vw]">
              <div className="px-5 py-4 border-b border-[#3f3f46]">
                <h2 className="text-sm font-semibold text-[#f4f4f5]">세션 닫기</h2>
                <p className="text-xs text-[#71717a] mt-1">
                  <span className="text-[#a1a1aa] font-medium">{target?.name}</span> 세션을 어떻게 닫으시겠습니까?
                </p>
              </div>
              <div className="px-5 py-4 flex flex-col gap-2">
                <button
                  onClick={() => doCloseSession(closeConfirmSessionId, false)}
                  className="w-full px-4 py-2.5 rounded bg-[#27272a] hover:bg-[#3f3f46] border border-[#3f3f46] text-left transition-colors"
                >
                  <div className="text-sm font-medium text-[#f4f4f5]">나가기</div>
                  <div className="text-xs text-[#71717a] mt-0.5">IvansTerm에서만 나갑니다. tmux 세션은 서버에 유지됩니다.</div>
                </button>
                <button
                  onClick={() => doCloseSession(closeConfirmSessionId, true)}
                  className="w-full px-4 py-2.5 rounded bg-[#27272a] hover:bg-[#3f3f46] border border-[#3f3f46] hover:border-[#ef4444]/50 text-left transition-colors"
                >
                  <div className="text-sm font-medium text-[#ef4444]">세션 종료</div>
                  <div className="text-xs text-[#71717a] mt-0.5">tmux 세션을 서버에서 완전히 종료합니다. 다른 클라이언트도 끊깁니다.</div>
                </button>
              </div>
              <div className="px-5 pb-4 flex justify-end">
                <button
                  onClick={() => setCloseConfirmSessionId(null)}
                  className="px-4 py-1.5 text-xs text-[#71717a] hover:text-[#a1a1aa] transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <PanelGroup direction="horizontal" className="flex-1 overflow-hidden">
        {/* 좌측 사이드바 Panel */}
        <Panel
          ref={sidebarPanelRef}
          defaultSize={loadSidebarSize()}
          minSize={8}
          maxSize={35}
          collapsible={true}
          collapsedSize={2.5}
          onCollapse={() => setSidebarCollapsed(true)}
          onExpand={() => setSidebarCollapsed(false)}
          onResize={(size) => {
            if (size > 3) {
              localStorage.setItem(SIDEBAR_SIZE_KEY, JSON.stringify(size));
            }
          }}
        >
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => {
            if (sidebarCollapsed) {
              sidebarPanelRef.current?.expand();
            } else {
              sidebarPanelRef.current?.collapse();
            }
          }}
          activeSessions={sessions}
          savedConnections={connections}
          currentSessionId={currentSessionId}
          terminalPreviews={terminalPreviews}
          sessionNotifications={sessionNotifications}
          activeTerminalIds={activeTerminalIds}
          onSelectSession={(sid) => {
            setCurrentSessionId(sid);
            setSessionNotifications((prev) => ({ ...prev, [sid]: 0 }));
            // 세션 전환 시 해당 세션 터미널 자동 포커스
            setTimeout(() => workspaceRefsRef.current[sid]?.focusActiveTerminal(), 50);
          }}
          onReconnectSession={handleReconnectSession}
          onCloseSession={handleCloseSession}
          onConnectSaved={(conn) => openSession(conn)}
          onEditConnection={(conn) => setEditingConnection(conn)}
          onAddConnection={() => setShowModal(true)}
          onDeleteConnection={(id) => deleteConnection(id)}
          onOpenSettings={() => setShowSettings(true)}
          onFileSelect={(path, filename) => {
            if (currentSessionId) setFileOpenRequests((prev) => ({ ...prev, [currentSessionId]: { path, filename, ts: Date.now() } }));
          }}
          onTailLog={(path) => {
            if (currentSessionId) setTailLogRequests((prev) => ({ ...prev, [currentSessionId]: { path, ts: Date.now() } }));
          }}
          onTransferStatus={setTransferStatus}
          fileTreeOpenSignal={fileTreeOpenSignal}

          onSendCommand={(terminalId, command) => {
            console.log(`[Sidebar] Sending command to terminal: ${terminalId} - ${command}`);
            if (currentSession) {
              const wsRef = workspaceRefsRef.current[currentSession.sessionId];
              console.log(`[Sidebar] Found workspace ref:`, !!wsRef);
              if (wsRef) {
                console.log(`[Sidebar] Calling sendCommandToTerminal`);
                wsRef.sendCommandToTerminal(terminalId, command);
              } else {
                console.log(`[Sidebar] No workspace ref found for session ${currentSession.sessionId}`);
              }
            } else {
              console.log(`[Sidebar] No current session`);
            }
          }}
        />
        </Panel>

        {/* 사이드바-메인 리사이즈 핸들 */}
        <PanelResizeHandle className="w-0.5 bg-[#3f3f46] hover:bg-[#3b82f6] cursor-col-resize transition-colors shrink-0" />

      {/* 메인 워크스페이스 Panel — 세션별로 유지, 활성 세션만 표시 */}
      <Panel>
      <div className="relative h-full overflow-hidden">
        {sessions.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[#52525b]">
            <h1 className="text-2xl font-bold text-[#f4f4f5] mb-1">IvansTerm</h1>
            <p className="text-sm mb-6">Multi-Pane Remote Dev-Suite</p>
            <p className="text-xs">Select a server from the sidebar to connect</p>
          </div>
        )}
        {sessions.map((s) => {
          const isActive = s.sessionId === currentSessionId;
          return (
            <div
              key={s.sessionId}
              className="absolute inset-0 flex"
              style={{
                visibility: isActive ? "visible" : "hidden",
                zIndex: isActive ? 1 : 0,
              }}
            >
              <WorkspaceView
                ref={(ref) => {
                  if (ref) {
                    workspaceRefsRef.current[s.sessionId] = ref;
                  }
                }}
                sessionId={s.sessionId}
                connectionId={s.connectionId}
                connectionName={s.name}
                workingDir={s.workingDir}
                initialWebUrl={s.serviceUrl}
                terminalSettings={terminalSettings}
                editorSettings={editorSettings}
                onSessionStatusChange={(d) => handleSessionStatusChange(s.sessionId, d)}
                reconnectSignal={reconnectSignals[s.sessionId] || 0}
                onTerminalPreview={(lines) => {
                  setTerminalPreviews((prev) => ({ ...prev, [s.sessionId]: lines }));

                  // Claude 완료 패턴 감지: 현재 활성 세션 제외, 새로 나타난 패턴만 1회 감지
                  if (s.sessionId !== currentSessionId) {
                    const currentContent = lines.join("\n");
                    const lastContent = sessionLastNotifiedBufferRef.current[s.sessionId] || "";
                    const hasPattern = /✓|completed|완료/.test(currentContent);
                    const hadPattern = /✓|completed|완료/.test(lastContent);
                    if (hasPattern && !hadPattern) {
                      setSessionNotifications((prev) => ({
                        ...prev,
                        [s.sessionId]: (prev[s.sessionId] || 0) + 1,
                      }));
                    }
                    if (currentContent !== lastContent) {
                      sessionLastNotifiedBufferRef.current[s.sessionId] = currentContent;
                    }
                  }

                }}
                fileOpenRequest={fileOpenRequests[s.sessionId] ?? null}
                tailLogRequest={tailLogRequests[s.sessionId] ?? null}
                onOpenFileTree={() => setFileTreeOpenSignal((n) => n + 1)}
                onActiveTerminalChange={(termId) => {
                  setActiveTerminalIds((prev) => ({ ...prev, [s.sessionId]: termId }));
                }}
                autoFocus={s.sessionId === currentSessionId}
                onTmuxNamesChanged={(tmuxNames) => {
                  setSessions((prev) =>
                    prev.map((sess) =>
                      sess.sessionId === s.sessionId ? { ...sess, tmuxNames } : sess
                    )
                  );
                }}
              />
            </div>
          );
        })}
      </div>
      </Panel>
      </PanelGroup>

      {/* 하단 상태 바 */}
      <StatusBar
        currentConnectionId={currentSession?.connectionId ?? null}
        currentSessionName={currentSession?.name ?? null}
        currentSessionHost={currentSession?.host ?? null}
        currentSessionDisconnected={currentSession?.disconnected ?? false}
        transferStatus={transferStatus}
      />

      {showModal && (
        <ConnectionModal onSubmit={handleCreateAndConnect} onClose={() => setShowModal(false)} />
      )}
      {editingConnection && (
        <ConnectionModal
          initialData={editingConnection}
          onSubmit={handleEditAndConnect}
          onSaveAsNew={handleSaveAsNewAndConnect}
          onClose={() => setEditingConnection(null)}
        />
      )}
      {showSettings && (
        <SettingsModal
          terminalSettings={terminalSettings}
          editorSettings={editorSettings}
          onUpdateTerminal={updateSettings}
          onUpdateEditor={updateEditorSettings}
          onResetTerminal={resetSettings}
          onResetEditor={resetEditorSettings}
          onClose={() => setShowSettings(false)}
          isMarkdownFile={false}
        />
      )}
    </div>
  );
}

export default App;
