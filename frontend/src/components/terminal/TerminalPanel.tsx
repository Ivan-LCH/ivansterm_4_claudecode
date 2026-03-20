import { useEffect } from "react";
import { useTerminal } from "../../hooks/useTerminal";
import type { TerminalSettings } from "../../types";

interface TerminalPanelProps {
  connectionId: number;
  settings: TerminalSettings;
  onDisconnect?: () => void;
}

export default function TerminalPanel({ connectionId, settings, onDisconnect }: TerminalPanelProps) {
  const { containerRef, connect, disconnect } = useTerminal({
    connectionId,
    settings,
    onDisconnect,
  });

  useEffect(() => {
    // 약간의 딜레이로 DOM이 레이아웃 완료된 후 연결
    const timer = setTimeout(() => connect(), 50);
    return () => {
      clearTimeout(timer);
      disconnect();
    };
  }, [connectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: settings.theme.background }}
    >
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden"
        style={{ padding: `${settings.padding}px` }}
      />
    </div>
  );
}
