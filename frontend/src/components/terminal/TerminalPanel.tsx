import { useEffect, useRef, forwardRef, useImperativeHandle, useState, useCallback } from "react";
import { useTerminal } from "../../hooks/useTerminal";
import type { XtermScrollInfo } from "../../hooks/useTerminal";
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

// 커스텀 스크롤바 상수
const SCROLLBAR_W = 10;        // 스크롤바 너비 (px)
const MIN_THUMB_RATIO = 0.08;  // 썸 최소 높이 비율
const MAX_THUMB_RATIO = 0.90;  // 썸 최대 높이 비율

const TerminalPanel = forwardRef<TerminalPanelRef, TerminalPanelProps>(
  ({ connectionId, terminalId, settings, onDisconnect, onStatusChange, reconnectSignal, onBufferUpdate, autoFocus }, ref) => {

    // onBufferUpdate를 래핑해 스크롤 상태 동기화 (순서 중요: useTerminal 호출 전에 ref 생성)
    const bufferUpdateWrapRef = useRef<((lines: string[]) => void) | null>(null);
    const scrollUpdateWrapRef = useRef<((info: XtermScrollInfo) => void) | null>(null);

    const { containerRef, connect, disconnect, reconnect, focus, isDisconnected, terminalRef, wsRef } = useTerminal({
      connectionId,
      terminalId,
      settings,
      onDisconnect,
      onStatusChange,
      onBufferUpdate: (lines) => bufferUpdateWrapRef.current?.(lines),
      onScrollUpdate: (info) => scrollUpdateWrapRef.current?.(info),
    });

    // 명령 전달용 ref 구현
    useImperativeHandle(ref, () => ({
      write: (data: string) => {
        if (terminalRef.current) terminalRef.current.write(data);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(data);
        }
      },
      focus: () => terminalRef.current?.focus(),
    }), [terminalRef, wsRef]);

    // ── 커스텀 스크롤바 상태 ──────────────────────────────────────────────────
    const [thumbTop, setThumbTop] = useState(0.75);
    const [thumbRatio, setThumbRatio] = useState(0.25);
    const [isScrolledBack, setIsScrolledBack] = useState(false);
    const trackRef = useRef<HTMLDivElement>(null);

    // alt buffer (tmux) 상태
    const isAltBufferRef = useRef(false);

    // ── xterm 실제 스크롤 정보 수신 핸들러 ───────────────────────────────────
    scrollUpdateWrapRef.current = (info: XtermScrollInfo) => {
      if (!info.isAltBuffer) {
        // Normal buffer: 실제 xterm 데이터로 정확한 스크롤바
        isAltBufferRef.current = false;
        const maxScroll = Math.max(1, info.total - info.rows);
        const ratio = Math.max(MIN_THUMB_RATIO, Math.min(MAX_THUMB_RATIO, info.rows / Math.max(1, info.total)));
        const top = info.total <= info.rows
          ? (1 - ratio)   // 컨텐츠가 화면보다 적으면 항상 바닥
          : (info.viewportY / maxScroll) * (1 - ratio);
        setThumbRatio(ratio);
        setThumbTop(top);
        setIsScrolledBack(info.viewportY < maxScroll - 3);
      } else {
        // Alt buffer (tmux): copy-mode 인디케이터 [N/M] 기반 정확한 위치
        isAltBufferRef.current = true;
        const rows = info.rows || 24;
        if (info.tmuxScrollPos) {
          // tmux가 보고한 실제 위치 사용 (예: 12/1709)
          const { current, total } = info.tmuxScrollPos;
          const ratio = Math.max(MIN_THUMB_RATIO, Math.min(MAX_THUMB_RATIO, rows / Math.max(1, total)));
          // current=0 → 바닥 (최신), current=total → 최상단 (가장 오래된)
          const top = total > 0
            ? (1 - current / total) * (1 - ratio)
            : (1 - ratio);
          setThumbRatio(ratio);
          setThumbTop(top);
          setIsScrolledBack(current > 5);
        } else {
          // copy-mode 아님 → 바닥 위치
          setThumbRatio(0.25);
          setThumbTop(0.75);
          setIsScrolledBack(false);
        }
      }
    };

    // bufferUpdate 래퍼
    bufferUpdateWrapRef.current = (lines: string[]) => {
      onBufferUpdate?.(lines);
    };

    // xterm 뷰포트에 합성 WheelEvent 발송 (드래그 시 tmux에 스크롤 전달)
    const dispatchWheelScroll = useCallback((lines: number) => {
      if (!containerRef.current) return;
      const viewport = containerRef.current.querySelector('.xterm-viewport');
      if (!viewport) return;
      const count = Math.min(Math.abs(Math.round(lines)), 15);
      const deltaY = lines > 0 ? -120 : 120;
      for (let i = 0; i < count; i++) {
        viewport.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaY,
          deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        }));
      }
    }, [containerRef]);

    // ── 스크롤바 드래그 핸들러 ──────────────────────────────────────────────
    // Normal buffer: terminal.scrollToLine()으로 xterm 직접 이동 (정확한 동기화)
    // Alt buffer (tmux): thumb가 마우스를 따라가고, 비례적 wheel 이벤트 발송
    const handleTrackMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!trackRef.current) return;

      const startY = e.clientY;
      const trackH = trackRef.current.clientHeight;
      const isAlt = isAltBufferRef.current;
      // 드래그 시작 시점의 thumb 상태 캡처
      const startThumbTop = thumbTop;
      const startThumbRatio = thumbRatio;
      let lastClientY = startY;

      const onMove = (me: MouseEvent) => {
        const dragPx = me.clientY - startY; // positive = 아래로

        if (isAlt) {
          // ── Alt buffer (tmux): wheel 이벤트 발송 → tmux가 처리 → 인디케이터 업데이트 ──
          const incDelta = me.clientY - lastClientY;
          if (Math.abs(incDelta) >= 3) {
            const wheelCount = Math.max(1, Math.round(Math.abs(incDelta) / 3));
            dispatchWheelScroll(incDelta > 0 ? -wheelCount : wheelCount);
            lastClientY = me.clientY;
          }
        } else {
          // ── Normal buffer: xterm 스크롤 위치 직접 설정 (정확한 동기화) ──
          const terminal = terminalRef.current;
          if (!terminal) return;
          const total = terminal.buffer.active.length;
          const rows = terminal.rows;
          const maxScroll = Math.max(1, total - rows);
          const maxTop = Math.max(0.01, 1 - startThumbRatio);

          const newTop = Math.max(0, Math.min(maxTop, startThumbTop + dragPx / trackH));
          const newViewportY = Math.round((newTop / maxTop) * maxScroll);
          terminal.scrollToLine(newViewportY);
          // onScroll 콜백이 thumb 위치를 자동 업데이트
        }
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }, [dispatchWheelScroll, thumbTop, thumbRatio, terminalRef]);

    // ── reconnectSignal 처리 ────────────────────────────────────────────────
    const prevSignalRef = useRef(reconnectSignal);
    useEffect(() => {
      if (reconnectSignal !== undefined && reconnectSignal !== prevSignalRef.current) {
        prevSignalRef.current = reconnectSignal;
        if (isDisconnected) {
          reconnect();
          // 재연결 후 포커스
          setTimeout(() => terminalRef.current?.focus(), 500);
        }
      }
    }, [reconnectSignal, isDisconnected, reconnect]);

    useEffect(() => {
      const timer = setTimeout(() => {
        connect();
        if (autoFocus) setTimeout(() => focus(), 300);
      }, 50);
      return () => {
        clearTimeout(timer);
        disconnect();
      };
    }, [connectionId]); // eslint-disable-line react-hooks/exhaustive-deps

    const p = settings.padding;

    return (
      <div
        className="absolute inset-0"
        style={{ backgroundColor: settings.theme.background }}
      >
        {/* xterm 컨테이너: 우측에 스크롤바 공간 확보 */}
        <div
          style={{
            position: "absolute",
            top: p,
            right: p + SCROLLBAR_W + 3,
            bottom: p,
            left: p,
          }}
        >
          <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
        </div>

        {/* 커스텀 스크롤바 트랙 */}
        <div
          ref={trackRef}
          onMouseDown={handleTrackMouseDown}
          title="스크롤 (드래그)"
          style={{
            position: "absolute",
            top: p,
            right: p,
            bottom: p,
            width: SCROLLBAR_W,
            backgroundColor: "rgba(255,255,255,0.05)",
            borderRadius: 4,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          {/* 썸(thumb) */}
          <div
            style={{
              position: "absolute",
              left: 2,
              right: 2,
              height: `${thumbRatio * 100}%`,
              top: `${thumbTop * 100}%`,
              backgroundColor: isScrolledBack ? "#7a7a7a" : "#4a4a4a",
              borderRadius: 3,
              transition: "top 0.08s ease, background-color 0.15s ease",
              cursor: "grab",
            }}
          />
        </div>
      </div>
    );
  }
);

TerminalPanel.displayName = "TerminalPanel";
export default TerminalPanel;
