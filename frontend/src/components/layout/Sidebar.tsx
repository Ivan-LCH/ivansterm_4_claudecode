import { useState, useEffect, useRef } from "react";
import type { ConnectionInfo, TransferStatus } from "../../types";
import FileTree from "../editor/FileTree";
import { useSFTP } from "../../hooks/useSFTP";
import GitPanel from "../git/GitPanel";

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
        className="bg-[#1e2030] border border-[#2e3255] rounded-lg shadow-2xl w-[400px] max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2e3255] shrink-0">
          <span className="text-sm font-semibold text-[#f4f4f5]">⌨️ 단축키 안내</span>
          <button
            onClick={onClose}
            className="text-[#8b92b8] hover:text-[#f4f4f5] transition-colors text-lg leading-none"
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
                            className="inline-block px-1.5 py-0.5 mr-1 bg-[#252840] border border-[#52525b] rounded text-[10px] text-[#e4e4e7] font-mono"
                          >
                            {k}
                          </kbd>
                        ))}
                      </td>
                      <td className="py-1.5 text-[#b0b8d8]">{s.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-[#2e3255] shrink-0">
          <button
            onClick={onClose}
            className="w-full py-1.5 text-xs bg-[#2e3255] text-[#b0b8d8] rounded hover:bg-[#3a4070] transition-colors"
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
    <div className="px-3 py-1.5 bg-[#252840] border-b border-[#2e3255] shrink-0">
      <div className="text-[10px] truncate" title={`${session.name} @ ${session.workingDir}`}>
        <span className="text-[#93c5fd] font-medium">{session.name}</span>
        <span className="text-[#6b7299]"> @ </span>
        <span className="text-[#8b92b8]">{session.workingDir || "~"}</span>
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
  const [gitExpanded, setGitExpanded] = useState(false);
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
      <div className="w-full h-full bg-[#1e2030] flex flex-col items-center py-2 overflow-hidden">
        <button
          onClick={onToggle}
          className="text-[#b0b8d8] hover:text-[#3b82f6] text-lg mb-4"
          title="Expand sidebar"
        >
          &raquo;
        </button>
        <button
          onClick={() => { onToggle(); setActiveTab("sessions"); }}
          className="text-xs text-[#6b7299] hover:text-[#3b82f6] mt-2 transition-colors"
          title="Sessions"
        >
          {activeSessions.length}
        </button>
        {/* Settings 버튼 (하단 고정) */}
        <button
          onClick={onOpenSettings}
          className="mt-auto text-[#6b7299] hover:text-[#3b82f6] transition-colors"
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-[#1e2030] flex flex-col overflow-hidden">
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2e3255]">
        <span className="text-[#3b82f6] font-bold text-sm">IvansTerm</span>
        <button
          onClick={onToggle}
          className="text-[#b0b8d8] hover:text-[#3b82f6] text-sm"
          title="Collapse sidebar"
        >
          &laquo;
        </button>
      </div>

      {/* 탭 전환: Sess | Svrs */}
      <div className="flex border-b border-[#2e3255]">
        {(["sessions", "servers"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-[13px] font-medium text-center transition-colors ${
              activeTab === tab
                ? "text-[#f4f4f5] border-b-2 border-[#3b82f6] bg-[#3b82f6]/5"
                : "text-[#8b92b8] hover:text-[#e4e4e7] hover:bg-[#2e3255]/70"
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
            <div className="flex-1 overflow-y-auto py-1 min-h-0 touch-scroll">
              {activeSessions.length === 0 && (
                <p className="text-[#6b7299] text-xs text-center py-4">No active sessions</p>
              )}
              {activeSessions.map((s) => {
                const isCurrent = s.sessionId === currentSessionId;

                return (
                  <div
                    key={s.sessionId}
                    className={`relative px-3 py-2.5 cursor-pointer transition-all ${
                      s.disconnected
                        ? "bg-[#ef4444]/10 text-[#ef4444] border-l-[3px] border-[#ef4444]"
                        : isCurrent
                          ? "bg-[#1e3a5f]/80 text-[#f4f4f5] border-l-[3px] border-[#3b82f6] shadow-[inset_0_0_12px_rgba(59,130,246,0.08)]"
                          : "text-[#b0b8d8] hover:bg-[#2e3255]/80 hover:text-[#e4e4e7] hover:border-l-[3px] hover:border-[#3b82f6]/40 border-l-[3px] border-transparent"
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
                          className="text-base text-[#8b92b8] hover:text-[#ef4444] hover:bg-[#ef4444]/10 rounded px-1 transition-colors leading-none"
                          title="Close session"
                        >
                          ×
                        </button>
                      </span>
                    </div>
                    {/* host */}
                    <div className={`text-xs ml-[22px] truncate ${isCurrent ? "text-[#93c5fd]" : "text-[#8b92b8]"}`}>
                      {s.host}
                    </div>
                    {/* workingDir */}
                    <div
                      className={`text-xs ml-[22px] truncate ${isCurrent ? "text-[#93c5fd]" : "text-[#8b92b8]"}`}
                      title={s.workingDir}
                    >
                      {s.workingDir || "~"}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 단축키 안내 버튼 */}
            <div className="border-t border-[#2e3255] shrink-0">
              <button
                onClick={() => setShortcutsOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] text-[#fbbf24] hover:text-[#fde68a] hover:bg-[#2e3255]/70 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.001M10 8h.001M14 8h.001M18 8h.001M8 12h.001M12 12h.001M16 12h.001M7 16h10"/></svg>
                단축키 안내!
              </button>
            </div>

            {/* Files expander */}
            <div className="border-t border-[#2e3255] shrink-0">
              <button
                onClick={() => setFilesExpanded((v) => !v)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs transition-colors ${
                  filesExpanded ? "text-[#3b82f6]" : "text-[#b0b8d8] hover:text-[#e4e4e7]"
                }`}
                style={filesExpanded ? { backgroundColor: "rgba(59,130,246,0.13)" } : undefined}
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  Files
                </span>
                <span className="text-[10px]">{filesExpanded ? "▾" : "▸"}</span>
              </button>
              {filesExpanded && (
                <div>
                  {currentSession && !currentSession.disconnected ? (
                    <>
                      <SessionContextHeader session={currentSession} />
                      <div style={{ height: "260px" }}>
                        <FileTree
                          connectionId={currentSession.connectionId}
                          rootPath={currentSession.workingDir}
                          listDirectory={sftp.listDirectory}
                          onFileSelect={(path, filename) => onFileSelect?.(path, filename)}
                          onTailLog={(path) => onTailLog?.(path)}
                          onTransferStatus={onTransferStatus}
                          onRename={sftp.renameFile}
                          onDelete={sftp.deleteFile}
                          onMkdir={sftp.mkdir}
                          onCreateFile={(path, content) => sftp.writeFile(path, content)}
                          dirsOnly={false}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-[#6b7299] text-xs text-center py-3">
                      {activeSessions.length === 0 ? "No active sessions" : "Session disconnected"}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Git expander */}
            <div className="border-t border-[#2e3255] shrink-0">
              <button
                onClick={() => setGitExpanded((v) => !v)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs transition-colors ${
                  gitExpanded ? "text-[#f97316]" : "text-[#b0b8d8] hover:text-[#e4e4e7]"
                }`}
                style={gitExpanded ? { backgroundColor: "rgba(249,115,22,0.13)" } : undefined}
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>
                  Source Control
                </span>
                <span className="text-[10px]">{gitExpanded ? "▾" : "▸"}</span>
              </button>
              {gitExpanded && (
                <div>
                  {currentSession && !currentSession.disconnected ? (
                    <>
                      <SessionContextHeader session={currentSession} />
                      <GitPanel
                        connectionId={currentSession.connectionId}
                        workingDir={currentSession.workingDir}
                      />
                    </>
                  ) : (
                    <p className="text-[#6b7299] text-xs text-center py-3">
                      {activeSessions.length === 0 ? "No active sessions" : "Session disconnected"}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Web Preview expander */}
            <div className="border-t border-[#2e3255] shrink-0">
              <button
                onClick={() => setWebExpanded((v) => !v)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs transition-colors ${
                  webExpanded ? "text-[#3b82f6]" : "text-[#b0b8d8] hover:text-[#e4e4e7]"
                }`}
                style={webExpanded ? { backgroundColor: "rgba(59,130,246,0.13)" } : undefined}
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  Web Preview
                </span>
                <span className="text-[10px]">{webExpanded ? "▾" : "▸"}</span>
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
                      className="w-full px-2 py-1.5 text-xs bg-[#252840] border border-[#2e3255] rounded text-[#f4f4f5] placeholder-[#52525b] focus:outline-none focus:border-[#3b82f6]"
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
            <div className="border-t border-[#2e3255] shrink-0">
              <button
                onClick={() => setClaudeExpanded((v) => !v)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs transition-colors ${
                  claudeExpanded ? "text-[#f59e0b]" : "text-[#b0b8d8] hover:text-[#e4e4e7]"
                }`}
                style={claudeExpanded ? { backgroundColor: "rgba(245,158,11,0.13)" } : undefined}
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  Claude
                </span>
                <span className="text-[10px]">{claudeExpanded ? "▾" : "▸"}</span>
              </button>
              {claudeExpanded && (
                <div className="flex flex-col">
                  {currentSession && <SessionContextHeader session={currentSession} />}
                  <div className="px-3 pt-2 pb-3 flex flex-col gap-2">
                    {/* 프리셋 버튼: Telegram + ESC */}
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => {
                          if (currentSession) {
                            const termId = activeTerminalIds[currentSession.sessionId] || `term_${currentSession.connectionId}_${currentSession.sessionId.slice(-8)}`;
                            onSendCommand?.(termId, "claude --channels plugin:telegram@claude-plugins-official");
                            setClaudeCommand("");
                          }
                        }}
                        disabled={!currentSession || currentSession.disconnected}
                        className="text-[9px] px-2 py-1 bg-[#252840] text-[#93c5fd] border border-[#3b82f6] rounded hover:bg-[#3b82f6] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        title="claude --channels plugin:telegram@claude-plugins-official"
                      >
                        telegram
                      </button>
                      <button
                        onClick={() => {
                          if (currentSession) {
                            const termId = activeTerminalIds[currentSession.sessionId] || `term_${currentSession.connectionId}_${currentSession.sessionId.slice(-8)}`;
                            onSendCommand?.(termId, '\x1b');
                          }
                        }}
                        disabled={!currentSession || currentSession.disconnected}
                        className="text-[9px] px-2 py-1 bg-[#252840] text-[#f87171] border border-[#ef4444] rounded hover:bg-[#ef4444] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        title="ESC 키 전송"
                      >
                        ESC
                      </button>
                    </div>
                    {/* 방향키 버튼 */}
                    {(() => {
                      const sendKey = (seq: string) => {
                        if (!currentSession) return;
                        const termId = activeTerminalIds[currentSession.sessionId] || `term_${currentSession.connectionId}_${currentSession.sessionId.slice(-8)}`;
                        onSendCommand?.(termId, seq);
                      };
                      const btnCls = "flex items-center justify-center w-6 h-6 bg-[#252840] text-[#b0b8d8] border border-[#3b82f6]/40 rounded hover:bg-[#3b82f6]/30 hover:text-white disabled:opacity-40 transition-colors text-[10px] select-none";
                      const disabled = !currentSession || currentSession.disconnected;
                      return (
                        <div className="flex flex-col items-center gap-0.5">
                          <button onPointerDown={(e) => { e.preventDefault(); sendKey('\x1b[A'); }} disabled={disabled} className={btnCls} title="↑">▲</button>
                          <div className="flex gap-0.5">
                            <button onPointerDown={(e) => { e.preventDefault(); sendKey('\x1b[D'); }} disabled={disabled} className={btnCls} title="←">◀</button>
                            <button onPointerDown={(e) => { e.preventDefault(); sendKey('\x1b[B'); }} disabled={disabled} className={btnCls} title="↓">▼</button>
                            <button onPointerDown={(e) => { e.preventDefault(); sendKey('\x1b[C'); }} disabled={disabled} className={btnCls} title="→">▶</button>
                          </div>
                        </div>
                      );
                    })()}
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
                      className="w-full px-2 py-1.5 text-xs bg-[#252840] border border-[#2e3255] rounded text-[#f4f4f5] placeholder-[#52525b] focus:outline-none focus:border-[#3b82f6]"
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
          <div className="py-1 overflow-y-auto h-full touch-scroll">
            {savedConnections.map((conn) => {
              const isActive = activeSessions.some((s) => s.connectionId === conn.id);
              return (
                <div
                  key={conn.id}
                  className={`px-3 py-2.5 transition-colors group border-l-[3px] ${
                    isActive
                      ? "border-[#10b981] hover:brightness-110"
                      : "border-transparent hover:bg-[#2e3255]/80 hover:border-[#2e3255]"
                  }`}
                  style={isActive ? { backgroundColor: "rgba(16,185,129,0.09)" } : undefined}
                >
                  <div
                    className="cursor-pointer"
                    onClick={() => onEditConnection(conn)}
                  >
                    <div className={`text-[13px] font-medium flex items-center gap-1.5 ${isActive ? "text-[#e4e4e7]" : "text-[#b0b8d8]"}`}>
                      {conn.name}
                      {isActive && (
                        <span className="text-[9px] font-semibold text-[#10b981] px-1.5 py-0.5 rounded shrink-0 leading-none border border-[#10b981]" style={{ backgroundColor: "rgba(16,185,129,0.18)" }}>
                          open
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#8b92b8] truncate mt-0.5">
                      {conn.username}@{conn.host}:{conn.port}
                    </div>
                    {conn.last_working_dir && conn.last_working_dir !== "~" && (
                      <div className="text-xs text-[#6b7299] truncate">{conn.last_working_dir}</div>
                    )}
                  </div>
                  <button
                    onClick={() => onDeleteConnection(conn.id)}
                    className="text-[11px] text-[#6b7299] hover:text-[#ef4444] hover:bg-[#ef4444]/10 rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-all mt-1"
                  >
                    delete
                  </button>
                </div>
              );
            })}
            <button
              onClick={onAddConnection}
              className="w-full px-3 py-3 text-xs font-medium text-[#3b82f6] hover:text-[#60a5fa] hover:bg-[#3b82f6]/10 text-center transition-colors border-t border-[#2e3255] mt-1"
            >
              + Add Server
            </button>
          </div>
        )}
      </div>

      {/* 하단 Settings 버튼 */}
      <div className="border-t border-[#2e3255] shrink-0">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-3 py-3 text-xs font-medium text-[#b0b8d8] hover:text-[#3b82f6] hover:bg-[#2e3255]/80 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Settings
        </button>
      </div>
    </div>
  );
}
