import { useState } from "react";
import { useConnections } from "./hooks/useConnections";
import { useTerminalSettings } from "./hooks/useTerminalSettings";
import ConnectionModal from "./components/common/ConnectionModal";
import SettingsModal from "./components/common/SettingsModal";
import Sidebar from "./components/layout/Sidebar";
import WorkspaceView from "./components/layout/WorkspaceView";
import type { ConnectionInfo, ConnectionCreate } from "./types";

interface Session {
  connectionId: number;
  name: string;
  host: string;
  workingDir: string;
}

function App() {
  const { connections, createConnection, deleteConnection, refresh } = useConnections();
  const { settings: terminalSettings, updateSettings, resetSettings } = useTerminalSettings();
  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentConnectionId, setCurrentConnectionId] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const openSession = (conn: ConnectionInfo) => {
    // 이미 열린 세션이면 전환만
    const existing = sessions.find((s) => s.connectionId === conn.id);
    if (existing) {
      setCurrentConnectionId(conn.id);
      return;
    }

    const session: Session = {
      connectionId: conn.id,
      name: conn.name,
      host: `${conn.username}@${conn.host}:${conn.port}`,
      workingDir: conn.last_working_dir || "~",
    };
    setSessions((prev) => [...prev, session]);
    setCurrentConnectionId(conn.id);
  };

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

  return (
    <div className="h-screen w-screen bg-[#1e1e2e] flex overflow-hidden">
      {/* 좌측 사이드바 */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        activeSessions={sessions}
        savedConnections={connections}
        currentConnectionId={currentConnectionId}
        onSelectSession={(connId) => setCurrentConnectionId(connId)}
        onConnectSaved={(conn) => openSession(conn)}
        onEditConnection={(conn) => setEditingConnection(conn)}
        onAddConnection={() => setShowModal(true)}
        onDeleteConnection={(id) => deleteConnection(id)}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* 메인 워크스페이스 — 세션별로 유지, 활성 세션만 표시 */}
      {/* visibility로 숨김 (display:none은 PanelGroup 크기 계산을 깨뜨림) */}
      <div className="flex-1 relative overflow-hidden">
        {sessions.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[#585b70]">
            <h1 className="text-2xl font-bold text-[#cdd6f4] mb-1">IvansTerm</h1>
            <p className="text-sm mb-6">Multi-Pane Remote Dev-Suite</p>
            <p className="text-xs">Select a server from the sidebar to connect</p>
          </div>
        )}
        {sessions.map((s) => {
          const isActive = s.connectionId === currentConnectionId;
          return (
            <div
              key={s.connectionId}
              className="absolute inset-0 flex"
              style={{
                visibility: isActive ? "visible" : "hidden",
                zIndex: isActive ? 1 : 0,
              }}
            >
              <WorkspaceView
                connectionId={s.connectionId}
                connectionName={s.name}
                workingDir={s.workingDir}
                terminalSettings={terminalSettings}
              />
            </div>
          );
        })}
      </div>

      {showModal && (
        <ConnectionModal onSubmit={handleCreateAndConnect} onClose={() => setShowModal(false)} />
      )}
      {editingConnection && (
        <ConnectionModal
          initialData={editingConnection}
          onSubmit={handleEditAndConnect}
          onClose={() => setEditingConnection(null)}
        />
      )}
      {showSettings && (
        <SettingsModal
          settings={terminalSettings}
          onUpdate={updateSettings}
          onReset={resetSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

export default App;
