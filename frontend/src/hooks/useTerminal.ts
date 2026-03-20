import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { TerminalSettings } from "../types";
import "xterm/css/xterm.css";

interface UseTerminalOptions {
  connectionId: number;
  settings: TerminalSettings;
  onDisconnect?: () => void;
}

// 지수 백오프 재연결 설정
const RECONNECT_BASE_DELAY = 1000;   // 초기 1초
const RECONNECT_MAX_DELAY = 30000;   // 최대 30초
const RECONNECT_MAX_RETRIES = 10;

export function useTerminal({ connectionId, settings, onDisconnect }: UseTerminalOptions) {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contextMenuCleanupRef = useRef<(() => void) | null>(null);
  const onDisconnectRef = useRef(onDisconnect);
  const settingsRef = useRef(settings);
  onDisconnectRef.current = onDisconnect;
  settingsRef.current = settings;

  // 재연결 상태 관리
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const intentionalCloseRef = useRef(false);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  // WebSocket만 재연결 (터미널 인스턴스 유지)
  const connectWs = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal || !containerRef.current) return;

    // 기존 WS 정리
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal?conn_id=${connectionId}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptRef.current = 0;
      if (reconnectAttemptRef.current === 0) {
        terminal.writeln("\x1b[32m● Connected\x1b[0m\r");
      } else {
        terminal.writeln("\r\n\x1b[32m● Reconnected\x1b[0m\r");
      }
      const { cols, rows } = terminal;
      ws.send(JSON.stringify({ type: "resize", cols, rows }));
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        terminal.write(new Uint8Array(event.data));
      } else {
        terminal.write(event.data);
      }
    };

    ws.onclose = (event) => {
      if (intentionalCloseRef.current) {
        terminal.writeln(`\r\n\x1b[31m● Disconnected (${event.code})\x1b[0m`);
        onDisconnectRef.current?.();
        return;
      }

      // 비정상 종료 → 재연결 시도
      const attempt = reconnectAttemptRef.current;
      if (attempt < RECONNECT_MAX_RETRIES) {
        const delay = Math.min(
          RECONNECT_BASE_DELAY * Math.pow(2, attempt),
          RECONNECT_MAX_DELAY
        );
        reconnectAttemptRef.current = attempt + 1;
        terminal.writeln(
          `\r\n\x1b[33m● Connection lost. Reconnecting in ${(delay / 1000).toFixed(0)}s... (${attempt + 1}/${RECONNECT_MAX_RETRIES})\x1b[0m`
        );
        reconnectTimerRef.current = setTimeout(() => connectWs(), delay);
      } else {
        terminal.writeln(`\r\n\x1b[31m● Disconnected. Max reconnection attempts reached.\x1b[0m`);
        onDisconnectRef.current?.();
      }
    };

    ws.onerror = () => {
      // onclose에서 재연결 처리
    };

    // 터미널 입력 → WS 전송 (기존 리스너 재등록 필요 없음 — onData는 terminal에 한 번만 등록)
  }, [connectionId]);

  const connect = useCallback(() => {
    if (!containerRef.current) return;
    if (terminalRef.current) return;

    intentionalCloseRef.current = false;
    reconnectAttemptRef.current = 0;

    const s = settingsRef.current;
    const terminal = new Terminal({
      cursorBlink: s.cursorBlink,
      cursorStyle: s.cursorStyle,
      fontSize: s.fontSize,
      fontFamily: s.fontFamily,
      lineHeight: s.lineHeight,
      scrollback: s.scrollback,
      rightClickSelectsWord: false,
      theme: s.theme,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    requestAnimationFrame(() => {
      try { fitAddon.fit(); } catch { /* ignore */ }
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // 터미널 입력 → WS
    terminal.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });

    // 리사이즈 → WS
    terminal.onResize(({ cols, rows }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    // 동기 클립보드 복사
    const syncCopyToClipboard = (text: string) => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    };

    // 우클릭: 선택 영역 있으면 복사, 없으면 붙여넣기
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const sel = terminal.getSelection();
      if (sel) {
        syncCopyToClipboard(sel);
        terminal.clearSelection();
      } else {
        navigator.clipboard?.readText().then((text) => {
          if (text && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(text);
          }
        }).catch(() => {});
      }
    };
    containerRef.current.addEventListener("contextmenu", handleContextMenu, { capture: true });
    const container = containerRef.current;
    contextMenuCleanupRef.current = () => container.removeEventListener("contextmenu", handleContextMenu);

    // WebSocket 연결
    connectWs();
  }, [connectionId, connectWs]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    clearReconnectTimer();
    contextMenuCleanupRef.current?.();
    contextMenuCleanupRef.current = null;
    wsRef.current?.close();
    terminalRef.current?.dispose();
    wsRef.current = null;
    terminalRef.current = null;
    fitAddonRef.current = null;
  }, [clearReconnectTimer]);

  // 설정 변경 시 열린 터미널에 실시간 반영
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.fontSize = settings.fontSize;
    terminal.options.fontFamily = settings.fontFamily;
    terminal.options.cursorBlink = settings.cursorBlink;
    terminal.options.cursorStyle = settings.cursorStyle;
    terminal.options.lineHeight = settings.lineHeight;
    terminal.options.scrollback = settings.scrollback;
    terminal.options.theme = settings.theme;
    try { fitAddonRef.current?.fit(); } catch { /* ignore */ }
  }, [settings]);

  // 컨테이너 리사이즈 감지
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddonRef.current?.fit();
      } catch {
        // ignore
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // 언마운트 시 정리
  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return { containerRef, connect, disconnect };
}
