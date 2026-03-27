import { useState, useEffect, useRef } from "react";
import type { ConnectionInfo, TransferStatus } from "../../types";
import FileTree from "../editor/FileTree";
import { useSFTP } from "../../hooks/useSFTP";

interface ActiveSession {
  sessionId: string;
  connectionId: number;
  name: string;
  host: string;
  workingDir: string;
  disconnected?: boolean;
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeSessions: ActiveSession[];
  savedConnections: ConnectionInfo[];
  currentSessionId: string | null;
  terminalPreviews: Record<string, string[]>;
  sessionNotifications?: Record<string, number>;
  activeTerminalIds?: Record<string, string>;
  onSelectSession: (sessionId: string) => void;
  onReconnectSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onConnectSaved: (conn: ConnectionInfo) => void;
  onEditConnection: (conn: ConnectionInfo) => void;
  onAddConnection: () => void;
  onDeleteConnection: (id: number) => void;
  onOpenSettings: () => void;
  onFileSelect?: (path: string, filename: string) => void;
  onTailLog?: (path: string) => void;
  onTransferStatus?: (status: TransferStatus | null) => void;
  fileTreeOpenSignal?: number;
  onSendCommand?: (terminalId: string, command: string) => void;
}

type TabType = "sessions" | "servers";

// 단축키 모달
function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const sections = [
    {
      title: "터미널 (Terminal)",
      shortcuts: [
        { keys: ["Ctrl+Shift+C"], desc: "복사 (Copy)" },
        { keys: ["Ctrl+Shift+V"], desc: "붙여넣기 (Paste)" },
        { keys: ["Shift+드래그"], desc: "텍스트 선택 후 자동 복사" },
        { keys: ["우클릭"], desc: "컨텍스트 메뉴 (붙여넣기)" },
        { keys: ["Ctrl+L"], desc: "화면 지우기 (Clear)" },
        { keys: ["Ctrl+C"], desc: "실행 중 프로세스 종료" },
        { keys: ["Ctrl+Z"], desc: "백그라운드로 보내기 (Suspend)" },
        { keys: ["Ctrl+D"], desc: "EOF / 세션 종료" },
        { keys: ["Ctrl+A"], desc: "커서를 줄 처음으로" },
        { keys: ["Ctrl+E"], desc: "커서를 줄 끝으로" },
      ],
    },
    {
      title: "에디터 (Monaco Editor)",
      shortcuts: [
        { keys: ["Ctrl+S"], desc: "파일 저장" },
        { keys: ["Ctrl+F"], desc: "찾기 (Find)" },
        { keys: ["Ctrl+H"], desc: "찾기/바꾸기 (Replace)" },
        { keys: ["Ctrl+G"], desc: "특정 줄로 이동" },
        { keys: ["Ctrl+Z"], desc: "실행 취소 (Undo)" },
        { keys: ["Ctrl+Shift+Z"], desc: "다시 실행 (Redo)" },
        { keys: ["Shift+Alt+F"], desc: "코드 포맷" },
        { keys: ["Alt+↑/↓"], desc: "줄 이동" },
        { keys: ["Ctrl+/"], desc: "주석 토글" },
        { keys: ["Ctrl+D"], desc: "단어 선택 / 다중 커서" },
      ],
    },
    {
      title: "패널 / 앱 (Panel)",
      shortcuts: [
        { keys: ["Ctrl+클릭"], desc: "새 터미널 패널 추가" },
        { keys: ["드래그"], desc: "패널 크기 조절" },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-[#1c1c1f] border border-[#3f3f46] rounded-lg shadow-2xl w-[400px] max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3f3f46] shrink-0">
          <span className="text-sm font-semibold text-[#f4f4f5]">⌨️ 단축키 안내</span>
          <button
            onClick={onClose}
            className="text-[#71717a] hover:text-[#f4f4f5] transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>
        {/* 내용 */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4">
          {sections.map((sec) => (
            <div key={sec.title}>
              <div className="text-[11px] font-semibold text-[#3b82f6] uppercase tracking-wider mb-2">
                {sec.title}
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {sec.shortcuts.map((s) => (
                    <tr key={s.desc} className="border-b border-[#27272a] last:border-0">
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {s.keys.map((k) => (
                          <kbd
                            key={k}
                            className="inline-block px-1.5 py-0.5 mr-1 bg-[#27272a] border border-[#52525b] rounded text-[10px] text-[#e4e4e7] font-mono"
                          >
                            {k}
                          </kbd>
                        ))}
                      </td>
                      <td className="py-1.5 text-[#a1a1aa]">{s.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-[#3f3f46] shrink-0">
          <button
            onClick={onClose}
            className="w-full py-1.5 text-xs bg-[#3f3f46] text-[#a1a1aa] rounded hover:bg-[#52525b] transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// 세션 컨텍스트 헤더 (Files / Web Preview expander 공통)
function SessionContextHeader({ session }: { session: ActiveSession }) {
  return (
    <div className="px-3 py-1.5 bg-[#27272a] border-b border-[#3f3f46] shrink-0">
      <div className="text-[10px] truncate" title={`${session.name} @ ${session.workingDir}`}>
        <span className="text-[#93c5fd] font-medium">{session.name}</span>
        <span className="text-[#52525b]"> @ </span>
        <span className="text-[#71717a]">{session.workingDir || "~"}</span>
      </div>
    </div>
  );
}

export default function Sidebar({
  collapsed,
  onToggle,
  activeSessions,
  savedConnections,
  currentSessionId,
  terminalPreviews,
  onSelectSession,
  onReconnectSession,
  onCloseSession,
  onEditConnection,
  onAddConnection,
  onDeleteConnection,
  onOpenSettings,
  onFileSelect,
  onTailLog,
  onTransferStatus,
  fileTreeOpenSignal,
  onSendCommand,
  sessionNotifications = {},
  activeTerminalIds = {},
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>(activeSessions.length > 0 ? "sessions" : "servers");
  const [filesExpanded, setFilesExpanded] = useState(false);
  const [webExpanded, setWebExpanded] = useState(false);
  const [claudeExpanded, setClaudeExpanded] = useState(false);
  const [claudeCommand, setClaudeCommand] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // 세션별 Web Preview URL (키: sessionId)
  const [webUrls, setWebUrls] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("ivansterm_web_urls") || "{}"); } catch { return {}; }
  });

  const currentSession = activeSessions.find((s) => s.sessionId === currentSessionId);
  const webInputUrl = currentSessionId ? (webUrls[currentSessionId] ?? "") : "";
  const sftp = useSFTP(currentSession?.connectionId ?? 0);

  const handleWebOpen = () => {
    if (!currentSessionId) return;
    let url = webInputUrl.trim();
    if (!url) return;
    if (!url.startsWith("http://") && !url.startsWith("https://")) url = "http://" + url;
    const updated = { ...webUrls, [currentSessionId]: url };
    setWebUrls(updated);
    try { localStorage.setItem("ivansterm_web_urls", JSON.stringify(updated)); } catch { /* ignore */ }
    // iframe 대신 새 창으로 열기 (스트리밍 성능 개선)
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // 세션이 새로 추가되면 자동으로 Sessions 탭으로 전환
  const prevSessionCountRef = useRef(activeSessions.length);
  useEffect(() => {
    if (activeSessions.length > prevSessionCountRef.current) {
      setActiveTab("sessions");
    }
    prevSessionCountRef.current = activeSessions.length;
  }, [activeSessions.length]);

  // 외부에서 Files expander 열기 요청 (EditorPanel "Files" 버튼 클릭)
  const prevFileTreeSignalRef = useRef(fileTreeOpenSignal ?? 0);
  useEffect(() => {
    if (fileTreeOpenSignal && fileTreeOpenSignal !== prevFileTreeSignalRef.current) {
      prevFileTreeSignalRef.current = fileTreeOpenSignal;
      setActiveTab("sessions");
      setFilesExpanded(true);
    }
  }, [fileTreeOpenSignal]);


  if (collapsed) {
    return (
      <div className="w-full h-full bg-[#18181b] flex flex-col items-center py-2 overflow-hidden">
        <button
          onClick={onToggle}
          className="text-[#a1a1aa] hover:text-[#3b82f6] text-lg mb-4"
          title="Expand sidebar"
        >
          &raquo;
        </button>
        <button
          onClick={() => { onToggle(); setActiveTab("sessions"); }}
          className="text-xs text-[#52525b] hover:text-[#3b82f6] mt-2 transition-colors"
          title="Sessions"
        >
          {activeSessions.length}
        </button>
        {/* Settings 버튼 (하단 고정) */}
        <button
          onClick={onOpenSettings}
          className="mt-auto text-[#52525b] hover:text-[#3b82f6] transition-colors"
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-[#18181b] flex flex-col overflow-hidden">
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#3f3f46]">
        <span className="text-[#3b82f6] font-bold text-sm">IvansTerm</span>
        <button
          onClick={onToggle}
          className="text-[#a1a1aa] hover:text-[#3b82f6] text-sm"
          title="Collapse sidebar"
        >
          &laquo;
        </button>
      </div>

      {/* 탭 전환: Sess | Svrs */}
      <div className="flex border-b border-[#3f3f46]">
        {(["sessions", "servers"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 text-[13px] font-medium text-center transition-colors ${
              activeTab === tab
                ? "text-[#f4f4f5] border-b-2 border-[#3b82f6]"
                : "text-[#52525b] hover:text-[#a1a1aa]"
            }`}
          >
            {tab === "sessions" ? "Sessions" : "Servers"}
          </button>
        ))}
      </div>

      {/* 탭 내용 */}
      <div className="flex-1 overflow-hidden min-h-0">

        {/* Sessions 탭 */}
        {activeTab === "sessions" && (
          <div className="flex flex-col h-full">
            {/* 세션 목록 (스크롤) */}
            <div className="flex-1 overflow-y-auto py-1 min-h-0">
              {activeSessions.length === 0 && (
                <p className="text-[#52525b] text-xs text-center py-4">No active sessions</p>
              )}
              {activeSessions.map((s) => {
                const isCurrent = s.sessionId === currentSessionId;

                return (
                  <div
                    key={s.sessionId}
                    className={`relative px-3 py-2 cursor-pointer transition-all ${
                      s.disconnected
                        ? "bg-[#ef4444]/10 text-[#ef4444] border-l-[3px] border-[#ef4444]"
                        : isCurrent
                          ? "bg-[#1e3a5f] text-[#f4f4f5] border-l-[3px] border-[#3b82f6]"
                          : "text-[#71717a] hover:bg-[#3f3f46]/40 hover:text-[#a1a1aa] border-l-[3px] border-transparent"
                    }`}
                    onClick={() => {
                      if (s.disconnected) {
                        onReconnectSession(s.sessionId);
                        return;
                      }
                      onSelectSession(s.sessionId);
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        s.disconnected ? "bg-[#ef4444]"
                        : isCurrent ? "bg-[#3b82f6] shadow-[0_0_6px_rgba(59,130,246,0.8)]"
                        : "bg-[#10b981]"
                      }`} />
                      {/* 활성 세션은 폰트 크기 크게 */}
                      <span className={`truncate font-semibold ${isCurrent ? "text-[15px] text-white" : "text-[13px]"}`}>
                        {s.name}
                        {(sessionNotifications[s.sessionId] ?? 0) > 0 && (
                          <span className="ml-1 text-[10px] font-bold text-[#fbbf24] bg-[#92400e] px-1.5 py-0.5 rounded-full inline-block">
                            ({sessionNotifications[s.sessionId]})
                          </span>
                        )}
                      </span>
                      <span className="ml-auto flex items-center gap-1">
                        {s.disconnected && (
                          <span className="text-xs text-[#ef4444] font-semibold">reconnect</span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); onCloseSession(s.sessionId); }}
                          className="text-base text-[#71717a] hover:text-[#ef4444] hover:bg-[#ef4444]/10 rounded px-1 transition-colors leading-none"
                          title="Close session"
                        >
                          ×
                        </button>
                      </span>
                    </div>
                    {/* host */}
                    <div className={`text-xs ml-[22px] truncate ${isCurrent ? "text-[#93c5fd]" : "text-[#52525b]"}`}>
                      {s.host}
                    </div>
                    {/* workingDir */}
                    <div
                      className={`text-xs ml-[22px] truncate ${isCurrent ? "text-[#93c5fd]" : "text-[#52525b]"}`}
                      title={s.workingDir}
                    >
                      {s.workingDir || "~"}
                    </div>
                    {/* 미니 터미널 프리뷰 */}
                    {terminalPreviews[s.sessionId] && terminalPreviews[s.sessionId].length > 0 && (
                      <div
                        className="mt-1 mx-1 rounded overflow-hidden bg-[#27272a] border border-[#3f3f46]/50"
                        style={{ height: "44px" }}
                      >
                        <pre
                          className="px-1 py-0.5 text-[#7f849c] overflow-hidden whitespace-pre leading-[5.5px] select-none"
                          style={{ fontSize: "4px", fontFamily: "monospace" }}
                        >
                          {terminalPreviews[s.sessionId].join("\n")}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 단축키 안내 버튼 */}
            <div className="border-t border-[#3f3f46] shrink-0">
              <button
                onClick={() => setShortcutsOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] text-[#fbbf24] hover:text-[#fde68a] hover:bg-[#3f3f46]/50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.001M10 8h.001M14 8h.001M18 8h.001M8 12h.001M12 12h.001M16 12h.001M7 16h10"/></svg>
                단축키 안내!
              </button>
            </div>

            {/* Files expander */}
            <div className="border-t border-[#3f3f46] shrink-0">
              <button
                onClick={() => setFilesExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-[#a1a1aa] hover:text-[#e4e4e7] hover:bg-[#3f3f46]/50 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  Files
                </span>
                <span>{filesExpanded ? "▾" : "▸"}</span>
              </button>
              {filesExpanded && (
                <div className="flex flex-col" style={{ maxHeight: "280px" }}>
                  {currentSession && !currentSession.disconnected ? (
                    <>
                      <SessionContextHeader session={currentSession} />
                      <div className="overflow-y-auto flex-1">
                        <FileTree
                          connectionId={currentSession.connectionId}
                          rootPath={currentSession.workingDir}
                          listDirectory={sftp.listDirectory}
                          onFileSelect={(path, filename) => onFileSelect?.(path, filename)}
                          onTailLog={(path) => onTailLog?.(path)}
                          onTransferStatus={onTransferStatus}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-[#52525b] text-xs text-center py-3">
                      {activeSessions.length === 0 ? "No active sessions" : "Session disconnected"}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Web Preview expander */}
            <div className="border-t border-[#3f3f46] shrink-0">
              <button
                onClick={() => setWebExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-[#a1a1aa] hover:text-[#e4e4e7] hover:bg-[#3f3f46]/50 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  Web Preview
                </span>
                <span>{webExpanded ? "▾" : "▸"}</span>
              </button>
              {webExpanded && (
                <div className="flex flex-col">
                  {currentSession && <SessionContextHeader session={currentSession} />}
                  <div className="px-3 pb-3 pt-2 flex flex-col gap-2">
                    <input
                      type="text"
                      value={webInputUrl}
                      onChange={(e) => {
                        if (!currentSessionId) return;
                        const updated = { ...webUrls, [currentSessionId]: e.target.value };
                        setWebUrls(updated);
                        try { localStorage.setItem("ivansterm_web_urls", JSON.stringify(updated)); } catch { /* ignore */ }
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") handleWebOpen(); }}
                      placeholder="http://localhost:3000"
                      className="w-full px-2 py-1.5 text-xs bg-[#27272a] border border-[#3f3f46] rounded text-[#f4f4f5] placeholder-[#52525b] focus:outline-none focus:border-[#3b82f6]"
                    />
                    <button
                      onClick={handleWebOpen}
                      className="w-full py-1.5 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors"
                    >
                      Open
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Claude expander */}
            <div className="border-t border-[#3f3f46] shrink-0">
              <button
                onClick={() => setClaudeExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-[#a1a1aa] hover:text-[#e4e4e7] hover:bg-[#3f3f46]/50 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  Claude
                </span>
                <span>{claudeExpanded ? "▾" : "▸"}</span>
              </button>
              {claudeExpanded && (
                <div className="flex flex-col">
                  {currentSession && <SessionContextHeader session={currentSession} />}
                  <div className="px-3 pt-2 pb-3 flex flex-col gap-2">
                    {/* 프리셋 버튼 */}
                    <div className="flex flex-wrap gap-1">
                      {[
                        { label: "claude", cmd: "claude" },
                        { label: "resume", cmd: "claude --resume" },
                        { label: "telegram", cmd: "claude --channels plugin:telegram@claude-plugins-official" },
                        { label: "pwd", cmd: "pwd" },
                      ].map((preset) => (
                        <button
                          key={preset.cmd}
                          onClick={() => {
                            if (currentSession) {
                              const termId = `term_${currentSession.connectionId}_${currentSession.sessionId.slice(-8)}`;
                              onSendCommand?.(termId, preset.cmd);
                              setClaudeCommand("");
                            }
                          }}
                          className="text-[9px] px-2 py-1 bg-[#27272a] text-[#93c5fd] border border-[#3b82f6] rounded hover:bg-[#3b82f6] hover:text-white transition-colors"
                          title={preset.cmd}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    {/* 입력 창 */}
                    <input
                      type="text"
                      value={claudeCommand}
                      onChange={(e) => setClaudeCommand(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && currentSession && claudeCommand.trim()) {
                          const termId = activeTerminalIds[currentSession.sessionId] || `term_${currentSession.connectionId}_${currentSession.sessionId.slice(-8)}`;
                          onSendCommand?.(termId, claudeCommand);
                          setClaudeCommand("");
                        }
                      }}
                      placeholder="명령어 입력"
                      className="w-full px-2 py-1.5 text-xs bg-[#27272a] border border-[#3f3f46] rounded text-[#f4f4f5] placeholder-[#52525b] focus:outline-none focus:border-[#3b82f6]"
                      disabled={!currentSession || currentSession.disconnected}
                    />
                    {/* Send 버튼 */}
                    <button
                      onClick={() => {
                        if (currentSession && claudeCommand.trim()) {
                          const termId = activeTerminalIds[currentSession.sessionId] || `term_${currentSession.connectionId}_${currentSession.sessionId.slice(-8)}`;
                          onSendCommand?.(termId, claudeCommand);
                          setClaudeCommand("");
                        }
                      }}
                      disabled={!currentSession || currentSession.disconnected || !claudeCommand.trim()}
                      className="w-full py-1.5 text-xs bg-[#10b981] text-white rounded hover:bg-[#059669] disabled:bg-[#52525b] disabled:cursor-not-allowed transition-colors"
                    >
                      Send
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Servers 탭 */}
        {activeTab === "servers" && (
          <div className="py-1 overflow-y-auto h-full">
            {savedConnections.map((conn) => {
              const isActive = activeSessions.some((s) => s.connectionId === conn.id);
              return (
                <div
                  key={conn.id}
                  className="px-3 py-2 hover:bg-[#3f3f46]/50 transition-colors group"
                >
                  <div
                    className="cursor-pointer"
                    onClick={() => onEditConnection(conn)}
                  >
                    <div className="text-[13px] font-medium text-[#a1a1aa] flex items-center gap-1.5">
                      {conn.name}
                      {isActive && (
                        <span className="text-[9px] font-semibold text-[#3b82f6] bg-[#1e3a5f] px-1 py-0.5 rounded shrink-0 leading-none">
                          open
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#71717a] truncate">
                      {conn.username}@{conn.host}:{conn.port}
                    </div>
                    {conn.last_working_dir && conn.last_working_dir !== "~" && (
                      <div className="text-xs text-[#71717a] truncate">{conn.last_working_dir}</div>
                    )}
                  </div>
                  <button
                    onClick={() => onDeleteConnection(conn.id)}
                    className="text-xs text-[#71717a] hover:text-[#ef4444] hover:bg-[#ef4444]/10 rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-all mt-0.5"
                  >
                    delete
                  </button>
                </div>
              );
            })}
            <button
              onClick={onAddConnection}
              className="w-full px-3 py-2.5 text-xs font-medium text-[#71717a] hover:text-[#3b82f6] hover:bg-[#3f3f46]/50 text-center transition-colors"
            >
              + Add Server
            </button>
          </div>
        )}
      </div>

      {/* 하단 Settings 버튼 */}
      <div className="border-t border-[#3f3f46] shrink-0">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-[#71717a] hover:text-[#3b82f6] hover:bg-[#3f3f46]/50 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Settings
        </button>
      </div>
    </div>
  );
}
