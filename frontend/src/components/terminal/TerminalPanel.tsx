import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { useTerminal } from "../../hooks/useTerminal";
import type { TerminalSettings } from "../../types";

interface TerminalPanelProps {
  connectionId: number;
  terminalId?: string;
  settings: TerminalSettings;
  onDisconnect?: () => void;
  onStatusChange?: (disconnected: boolean) => void;
  reconnectSignal?: number;
  onBufferUpdate?: (lines: string[]) => void;
  autoFocus?: boolean;
}

export interface TerminalPanelRef {
  write: (data: string) => void;
  focus: () => void;
}

const TerminalPanel = forwardRef<TerminalPanelRef, TerminalPanelProps>(
  ({ connectionId, terminalId, settings, onDisconnect, onStatusChange, reconnectSignal, onBufferUpdate, autoFocus }, ref) => {
    const { containerRef, connect, disconnect, reconnect, focus, isDisconnected, terminalRef, wsRef } = useTerminal({
      connectionId,
      terminalId,
      settings,
      onDisconnect,
      onStatusChange,
      onBufferUpdate,
    });

    // 명령 전달용 ref 구현 (xterm.write + WebSocket 전송)
    useImperativeHandle(ref, () => ({
      write: (data: string) => {
        console.log(`[TerminalPanel] write called with data:`, data);
        // 1. 화면에 표시
        if (terminalRef.current) {
          console.log(`[TerminalPanel] Writing to xterm`);
          terminalRef.current.write(data);
        } else {
          console.log(`[TerminalPanel] Terminal ref not ready`);
        }
        // 2. WebSocket으로 실제 명령 전송
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          console.log(`[TerminalPanel] Sending via WebSocket`);
          wsRef.current.send(data);
        } else {
          console.log(`[TerminalPanel] WebSocket not ready`);
        }
      },
      focus: () => {
        terminalRef.current?.focus();
      },
    }), [terminalRef, wsRef]);

  // reconnectSignal이 변경되면 재연결 시도
  const prevSignalRef = useRef(reconnectSignal);
  useEffect(() => {
    if (reconnectSignal !== undefined && reconnectSignal !== prevSignalRef.current) {
      prevSignalRef.current = reconnectSignal;
      if (isDisconnected) {
        reconnect();
      }
    }
  }, [reconnectSignal, isDisconnected, reconnect]);

  useEffect(() => {
    // 약간의 딜레이로 DOM이 레이아웃 완료된 후 연결
    const timer = setTimeout(() => {
      connect();
      // autoFocus: 페이지 리프레시 시 활성 터미널로 포커스
      if (autoFocus) {
        setTimeout(() => focus(), 300);
      }
    }, 50);
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
);

TerminalPanel.displayName = "TerminalPanel";
export default TerminalPanel;
