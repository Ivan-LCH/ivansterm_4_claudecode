import { useState } from "react";
import type { ConnectionInfo } from "../../types";

interface ActiveSession {
  connectionId: number;
  name: string;
  host: string;
  workingDir: string;
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeSessions: ActiveSession[];
  savedConnections: ConnectionInfo[];
  currentConnectionId: number | null;
  onSelectSession: (connectionId: number) => void;
  onConnectSaved: (conn: ConnectionInfo) => void;
  onEditConnection: (conn: ConnectionInfo) => void;
  onAddConnection: () => void;
  onDeleteConnection: (id: number) => void;
  onOpenSettings: () => void;
}

type TabType = "sessions" | "servers";

export default function Sidebar({
  collapsed,
  onToggle,
  activeSessions,
  savedConnections,
  currentConnectionId,
  onSelectSession,
  onEditConnection,
  onAddConnection,
  onDeleteConnection,
  onOpenSettings,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>(activeSessions.length > 0 ? "sessions" : "servers");
  const [infoSessionId, setInfoSessionId] = useState<number | null>(null);

  if (collapsed) {
    return (
      <div className="w-10 bg-[#181825] border-r border-[#313244] flex flex-col items-center py-2 shrink-0">
        <button
          onClick={onToggle}
          className="text-[#a6adc8] hover:text-[#89b4fa] text-lg mb-4"
          title="Expand sidebar"
        >
          &raquo;
        </button>
        {/* 아이콘으로 활성 세션 수 표시 */}
        <div className="text-xs text-[#585b70] mt-2" title="Active sessions">
          {activeSessions.length}
        </div>
        {/* 설정 버튼 (하단 고정) */}
        <button
          onClick={onOpenSettings}
          className="mt-auto text-[#585b70] hover:text-[#89b4fa] transition-colors"
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-56 bg-[#181825] border-r border-[#313244] flex flex-col shrink-0">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#313244]">
        <span className="text-[#89b4fa] font-bold text-sm">IvansTerm</span>
        <button
          onClick={onToggle}
          className="text-[#a6adc8] hover:text-[#89b4fa] text-sm"
          title="Collapse sidebar"
        >
          &laquo;
        </button>
      </div>

      {/* 탭 전환 */}
      <div className="flex border-b border-[#313244]">
        <button
          onClick={() => setActiveTab("sessions")}
          className={`flex-1 py-1.5 text-xs text-center transition-colors ${
            activeTab === "sessions"
              ? "text-[#cdd6f4] border-b-2 border-[#89b4fa]"
              : "text-[#585b70] hover:text-[#a6adc8]"
          }`}
        >
          Sessions
        </button>
        <button
          onClick={() => setActiveTab("servers")}
          className={`flex-1 py-1.5 text-xs text-center transition-colors ${
            activeTab === "servers"
              ? "text-[#cdd6f4] border-b-2 border-[#89b4fa]"
              : "text-[#585b70] hover:text-[#a6adc8]"
          }`}
        >
          Servers
        </button>
      </div>

      {/* 탭 내용 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === "sessions" ? (
          <div className="py-1">
            {activeSessions.length === 0 && (
              <p className="text-[#585b70] text-xs text-center py-4">No active sessions</p>
            )}
            {activeSessions.map((s) => {
              const isCurrent = s.connectionId === currentConnectionId;
              const showInfo = infoSessionId === s.connectionId;
              const matchedConn = savedConnections.find((c) => c.id === s.connectionId);
              return (
                <div
                  key={s.connectionId}
                  className={`relative px-3 py-2 cursor-pointer transition-colors ${
                    isCurrent
                      ? "bg-[#313244] text-[#cdd6f4]"
                      : "text-[#a6adc8] hover:bg-[#313244]/50"
                  }`}
                  onClick={() => {
                    if (isCurrent) {
                      // 이미 활성 세션이면 info 토글
                      setInfoSessionId(showInfo ? null : s.connectionId);
                    } else {
                      // 다른 세션이면 전환
                      onSelectSession(s.connectionId);
                      setInfoSessionId(null);
                    }
                  }}
                >
                  <div className="text-xs font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#a6e3a1] shrink-0" />
                    {s.name}
                    {isCurrent && (
                      <span className="ml-auto text-[10px] text-[#585b70]" title="Click to view info">
                        {showInfo ? "▾" : "▸"}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#585b70] ml-3 truncate">{s.host}</div>
                  {s.workingDir && s.workingDir !== "~" && (
                    <div className="text-[10px] text-[#45475a] ml-3 truncate">{s.workingDir}</div>
                  )}
                  {/* 인라인 세션 정보 (읽기 전용) */}
                  {showInfo && (
                    <div className="mt-2 ml-3 p-2 bg-[#11111b] rounded border border-[#313244] space-y-1">
                      <div>
                        <span className="text-[10px] text-[#585b70]">Host: </span>
                        <span className="text-[10px] text-[#cdd6f4]">{s.host}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#585b70]">Working Dir: </span>
                        <span className="text-[10px] text-[#cdd6f4]">{s.workingDir || "~"}</span>
                      </div>
                      {matchedConn && (
                        <div>
                          <span className="text-[10px] text-[#585b70]">Auth: </span>
                          <span className="text-[10px] text-[#cdd6f4]">{matchedConn.auth_method === "key" ? "Private Key" : "Password"}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-1">
            {savedConnections.map((conn) => {
              const isActive = activeSessions.some((s) => s.connectionId === conn.id);
              return (
                <div
                  key={conn.id}
                  className="px-3 py-2 hover:bg-[#313244]/50 transition-colors group"
                >
                  <div
                    className="cursor-pointer"
                    onClick={() => onEditConnection(conn)}
                  >
                    <div className="text-xs font-medium text-[#a6adc8] flex items-center gap-1.5">
                      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#a6e3a1] shrink-0" />}
                      {conn.name}
                    </div>
                    <div className="text-[10px] text-[#585b70] truncate">
                      {conn.username}@{conn.host}:{conn.port}
                    </div>
                    {conn.last_working_dir && conn.last_working_dir !== "~" && (
                      <div className="text-[10px] text-[#45475a] truncate">{conn.last_working_dir}</div>
                    )}
                  </div>
                  <button
                    onClick={() => onDeleteConnection(conn.id)}
                    className="text-[10px] text-[#585b70] hover:text-[#f38ba8] opacity-0 group-hover:opacity-100 transition-all mt-0.5"
                  >
                    delete
                  </button>
                </div>
              );
            })}
            <button
              onClick={onAddConnection}
              className="w-full px-3 py-2 text-xs text-[#585b70] hover:text-[#89b4fa] text-center transition-colors"
            >
              + Add Server
            </button>
          </div>
        )}
      </div>

      {/* 하단 Settings 버튼 */}
      <div className="border-t border-[#313244] shrink-0">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#585b70] hover:text-[#89b4fa] hover:bg-[#313244]/50 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Settings
        </button>
      </div>
    </div>
  );
}
