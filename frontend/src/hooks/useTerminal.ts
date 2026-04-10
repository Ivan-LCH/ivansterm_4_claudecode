import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { TerminalSettings } from "../types";
import "xterm/css/xterm.css";

export interface XtermScrollInfo {
  viewportY: number;           // 현재 뷰포트 위치 (0=히스토리 최상단, max=현재 출력)
  total: number;               // 버퍼 전체 라인 수
  rows: number;                // 현재 터미널 행 수
  isAltBuffer: boolean;        // alt buffer 여부 (tmux 등 alternate screen)
  normalBufferTotal: number;   // normal 버퍼 라인 수 (alt 진입 시 히스토리 추정용)
  tmuxScrollPos?: { current: number; total: number };  // tmux copy-mode 위치 ([N/M] 파싱)
}

interface UseTerminalOptions {
  connectionId: number;
  terminalId?: string;
  selectedTmux?: string;
  settings: TerminalSettings;
  onDisconnect?: () => void;
  onStatusChange?: (disconnected: boolean) => void;
  onBufferUpdate?: (lines: string[]) => void;
  onScrollUpdate?: (info: XtermScrollInfo) => void;
}

// 지수 백오프 재연결 설정
const RECONNECT_BASE_DELAY = 1000;   // 초기 1초
const RECONNECT_MAX_DELAY = 30000;   // 최대 30초
const RECONNECT_MAX_RETRIES = 10;

export function useTerminal({ connectionId, terminalId, selectedTmux, settings, onDisconnect, onStatusChange, onBufferUpdate, onScrollUpdate }: UseTerminalOptions) {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contextMenuCleanupRef = useRef<(() => void) | null>(null);
  const onDisconnectRef = useRef(onDisconnect);
  const onStatusChangeRef = useRef(onStatusChange);
  const onBufferUpdateRef = useRef(onBufferUpdate);
  const onScrollUpdateRef = useRef(onScrollUpdate);
  const settingsRef = useRef(settings);
  const bufferThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDisconnected, setIsDisconnected] = useState(false);
  onDisconnectRef.current = onDisconnect;
  onStatusChangeRef.current = onStatusChange;
  onBufferUpdateRef.current = onBufferUpdate;
  onScrollUpdateRef.current = onScrollUpdate;
  settingsRef.current = settings;

  // 터미널 버퍼에서 마지막 N줄 추출 (미니 프리뷰용)
  const extractBuffer = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal || !onBufferUpdateRef.current) return;
    const buf = terminal.buffer.active;
    const totalRows = buf.length;
    const viewportRows = terminal.rows;
    // 화면에 보이는 마지막 줄 기준으로 추출
    const PREVIEW_LINES = 8;
    const startRow = Math.max(0, totalRows - viewportRows);
    const endRow = totalRows;
    const lines: string[] = [];
    for (let i = Math.max(startRow, endRow - PREVIEW_LINES); i < endRow; i++) {
      const line = buf.getLine(i);
      lines.push(line ? line.translateToString(true) : "");
    }
    onBufferUpdateRef.current(lines);
  }, []);

  // throttle된 버퍼 업데이트 스케줄
  const scheduleBufferUpdate = useCallback(() => {
    if (bufferThrottleRef.current) return; // 이미 스케줄됨
    bufferThrottleRef.current = setTimeout(() => {
      bufferThrottleRef.current = null;
      extractBuffer();
    }, 1500);
  }, [extractBuffer]);

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
    const sid = terminalId ? `&session_id=${encodeURIComponent(terminalId)}` : "";
    const tmuxParam = selectedTmux ? `&selected_tmux=${encodeURIComponent(selectedTmux)}` : "";
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal?conn_id=${connectionId}${sid}${tmuxParam}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      const wasReconnect = reconnectAttemptRef.current > 0;
      reconnectAttemptRef.current = 0;
      setIsDisconnected(false);
      onStatusChangeRef.current?.(false);
      if (wasReconnect) {
        terminal.writeln("\r\n\x1b[32m● Reconnected\x1b[0m\r");
      } else {
        terminal.writeln("\x1b[32m● Connected\x1b[0m\r");
      }
      const { cols, rows } = terminal;
      ws.send(JSON.stringify({ type: "resize", cols, rows }));
    };

    // ── tmux copy-mode 위치 인디케이터 파싱 ──────────────────────────────────
    let lastTmuxPosKey: string | null = null;

    const scanTmuxScrollPos = (): { current: number; total: number } | null => {
      if (terminal.buffer.active.type !== 'alternate') return null;
      // 상단 2줄 우측 끝에서 [N/M] 또는 N/M 패턴 검색 (tmux copy-mode 인디케이터)
      for (let row = 0; row < Math.min(2, terminal.rows); row++) {
        const line = terminal.buffer.active.getLine(row);
        if (!line) continue;
        const text = line.translateToString(true).trimEnd();
        const tail = text.slice(-20);
        const match = tail.match(/(\d+)\/(\d+)/);
        if (match) {
          const current = parseInt(match[1], 10);
          const total = parseInt(match[2], 10);
          if (total > 0 && current <= total) return { current, total };
        }
      }
      return null;
    };

    ws.onmessage = (event) => {
      const afterWrite = () => {
        // alt buffer: tmux copy-mode 위치 파싱 → 스크롤바 동기화
        if (terminal.buffer.active.type === 'alternate') {
          const pos = scanTmuxScrollPos();
          const posKey = pos ? `${pos.current}/${pos.total}` : 'none';
          if (posKey !== lastTmuxPosKey) {
            lastTmuxPosKey = posKey;
            onScrollUpdateRef.current?.({
              viewportY: 0, total: 0,
              rows: terminal.rows,
              isAltBuffer: true,
              normalBufferTotal: terminal.buffer.normal.length,
              tmuxScrollPos: pos ?? undefined,
            });
          }
        }
        scheduleBufferUpdate();
      };

      if (event.data instanceof ArrayBuffer) {
        terminal.write(new Uint8Array(event.data), afterWrite);
      } else {
        // 서버 ping 메시지 무시
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "ping") return;
        } catch { /* 일반 텍스트 */ }
        terminal.write(event.data, afterWrite);
      }
    };

    ws.onclose = (event) => {
      if (intentionalCloseRef.current) {
        terminal.writeln(`\r\n\x1b[31m● Disconnected (${event.code})\x1b[0m`);
        onDisconnectRef.current?.();
        return;
      }

      // SSH 세션 정상 종료 (exit/logout) → code=1000, 재연결 하지 않음
      if (event.code === 1000) {
        terminal.writeln(`\r\n\x1b[33m● SSH session ended. Click to reconnect.\x1b[0m`);
        setIsDisconnected(true);
        onStatusChangeRef.current?.(true);
        onDisconnectRef.current?.();
        return;
      }

      // 비정상 종료 → 즉시 disconnected 상태 보고 + 재연결 시도
      setIsDisconnected(true);
      onStatusChangeRef.current?.(true);

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
        terminal.writeln(`\r\n\x1b[31m● Disconnected. Click session to reconnect.\x1b[0m`);
      }
    };

    ws.onerror = () => {
      // onclose에서 재연결 처리
    };

    // 터미널 입력 → WS 전송 (기존 리스너 재등록 필요 없음 — onData는 terminal에 한 번만 등록)
  }, [connectionId, terminalId]);

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

    // fit() 호출: RAF + 지연 fallback (레이아웃 안정화 대기)
    const doFit = () => {
      try { fitAddon.fit(); } catch { /* ignore */ }
    };
    requestAnimationFrame(doFit);
    setTimeout(doFit, 200);
    setTimeout(doFit, 1000);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // open() 직후 fontSize 재할당: display:none 등으로 셀 크기가 0으로 캐싱됐을 경우 강제 재측정
    // xterm.js는 terminal.open() 시 cell 크기를 측정하는데, 컨테이너가 보이지 않으면 0으로 캐싱됨
    const cachedSize = s.fontSize;
    terminal.options.fontSize = cachedSize + 0.001;
    requestAnimationFrame(() => {
      terminal.options.fontSize = cachedSize;
    });

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

    // 스크롤 위치 변경 감지 (normal buffer에서만 정확한 값 제공)
    terminal.onScroll((pos) => {
      if (terminal.buffer.active.type !== 'alternate') {
        onScrollUpdateRef.current?.({
          viewportY: pos,
          total: terminal.buffer.active.length,
          rows: terminal.rows,
          isAltBuffer: false,
          normalBufferTotal: terminal.buffer.normal.length,
        });
      }
    });

    // normal ↔ alt buffer 전환 감지 (tmux 진입/이탈)
    terminal.buffer.onBufferChange((buf) => {
      onScrollUpdateRef.current?.({
        viewportY: terminal.buffer.normal.viewportY,
        total: terminal.buffer.normal.length,
        rows: terminal.rows,
        isAltBuffer: buf.type === 'alternate',
        normalBufferTotal: terminal.buffer.normal.length,
      });
    });

    // ── 클립보드 복사 (execCommand 폴백 포함) ──────────────────────────────
    const execCopy = (text: string) => {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch { /* ignore */ }
    };

    const copyToClipboard = (text: string) => {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => execCopy(text));
      } else {
        execCopy(text);
      }
    };

    // ── 선택 텍스트 저장 (onSelectionChange는 user gesture 바깥이므로 저장만) ──
    let pendingSelectionText = '';

    const selChangeSub = terminal.onSelectionChange(() => {
      const sel = terminal.getSelection();
      if (sel) {
        pendingSelectionText = sel;
        // secure context (HTTPS/localhost)에서는 최근 interaction이 있으면 동작할 수 있음
        copyToClipboard(sel);
      } else {
        pendingSelectionText = '';
      }
    });

    // ── keyup: Shift 릴리즈 시 저장된 텍스트 복사 (user gesture 컨텍스트) ──
    // Shift+드래그 완료 흐름: mouseup → xterm 선택 확정 → onSelectionChange → Shift keyup
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        const sel = terminal.getSelection() || pendingSelectionText;
        if (sel) {
          copyToClipboard(sel);
          pendingSelectionText = '';
        }
      }
    };

    // ── mouseup: 즉시 복사 시도 (user gesture 컨텍스트) ──
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const sel = terminal.getSelection();
      if (sel) {
        copyToClipboard(sel);
        pendingSelectionText = '';
        return;
      }
      // 선택이 아직 확정 안 됨 → onSelectionChange가 pendingSelectionText에 저장
      // → Shift keyup에서 user gesture 컨텍스트로 복사
    };

    // ── 우클릭: 선택 있으면 복사, 없으면 붙여넣기 ──
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const sel = terminal.getSelection();
      if (sel) {
        copyToClipboard(sel);
        terminal.clearSelection();
      } else {
        navigator.clipboard?.readText().then((text) => {
          if (text && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(text);
          }
        }).catch(() => {});
      }
    };

    // ── keydown capture ──
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      // Ctrl+V: xterm \x16 차단 → 브라우저 paste 이벤트 정상 발생
      if (isMod && !e.shiftKey && key === 'v') {
        e.stopPropagation();
        return;
      }
      // Ctrl+Shift+V: 보조 붙여넣기
      if (isMod && e.shiftKey && key === 'v') {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard?.readText().then((text) => {
          if (text && wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(text);
        }).catch(() => {});
        return;
      }
      // Ctrl+Shift+C: 복사 단축키
      if (isMod && e.shiftKey && key === 'c') {
        e.preventDefault();
        e.stopPropagation();
        const sel = terminal.getSelection() || window.getSelection()?.toString();
        if (sel) copyToClipboard(sel);
        return;
      }
    };

    containerRef.current.addEventListener('keyup', handleKeyUp, { capture: true });
    containerRef.current.addEventListener('mouseup', handleMouseUp, { capture: true });
    containerRef.current.addEventListener('keydown', handleKeyDown, { capture: true });
    containerRef.current.addEventListener("contextmenu", handleContextMenu, { capture: true });


    const container = containerRef.current;
    contextMenuCleanupRef.current = () => {
      selChangeSub.dispose();
      container.removeEventListener('keyup', handleKeyUp, { capture: true });
      container.removeEventListener('mouseup', handleMouseUp, { capture: true });
      container.removeEventListener('keydown', handleKeyDown, { capture: true });
      container.removeEventListener("contextmenu", handleContextMenu, { capture: true });
    };

    // WebSocket 연결
    connectWs();
  }, [connectionId, connectWs]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    clearReconnectTimer();
    if (bufferThrottleRef.current) {
      clearTimeout(bufferThrottleRef.current);
      bufferThrottleRef.current = null;
    }
    contextMenuCleanupRef.current?.();
    contextMenuCleanupRef.current = null;
    wsRef.current?.close();
    terminalRef.current?.dispose();
    wsRef.current = null;
    terminalRef.current = null;
    fitAddonRef.current = null;
  }, [clearReconnectTimer]);

  // 재연결: 끊어진 상태에서 WebSocket만 다시 연결
  const reconnect = useCallback(() => {
    if (!terminalRef.current) return;
    intentionalCloseRef.current = false;
    reconnectAttemptRef.current = 0;
    clearReconnectTimer();
    terminalRef.current.writeln("\r\n\x1b[33m● Reconnecting...\x1b[0m");
    connectWs();
  }, [connectWs, clearReconnectTimer]);

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

  const focus = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  return { containerRef, connect, disconnect, reconnect, focus, isDisconnected, terminalRef, wsRef };
}
