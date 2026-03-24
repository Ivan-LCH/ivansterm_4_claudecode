import { useState, useRef, useEffect, useCallback } from "react";
import type { TerminalTheme } from "../../types";

interface LogViewerProps {
  connectionId: number;
  /** 초기 또는 외부에서 지정된 로그 파일 경로 */
  logFilePath?: string;
  /** 로그 경로 변경 시 부모에 알림 (레이아웃 저장용) */
  onLogPathChange?: (path: string) => void;
  /** 터미널 테마 (배경/글자색 동기화용) */
  terminalTheme?: TerminalTheme;
}

export default function LogViewer({ connectionId, logFilePath, onLogPathChange, terminalTheme }: LogViewerProps) {
  const [logPath, setLogPath] = useState(logFilePath || "");
  const [inputPath, setInputPath] = useState(logFilePath || "");
  const [logContent, setLogContent] = useState("");
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // 자동 스크롤
  useEffect(() => {
    if (autoScrollRef.current && logEndRef.current) {
      logEndRef.current.scrollIntoView();
    }
  }, [logContent]);

  // WebSocket 연결 관리
  const startTail = useCallback((pathOverride?: string) => {
    const targetPath = (pathOverride || inputPath).trim();
    if (!targetPath) return;

    // 기존 연결 정리
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/logtail?conn_id=${connectionId}`);

    ws.onopen = () => {
      setConnected(true);
      setLogContent("");
      setLogPath(targetPath);
      setInputPath(targetPath);
      onLogPathChange?.(targetPath);
      ws.send(JSON.stringify({ type: "start", path: targetPath }));
    };

    ws.onmessage = (event) => {
      setLogContent((prev) => {
        // 최대 50000자 유지 (메모리 관리)
        const next = prev + event.data;
        return next.length > 50000 ? next.slice(-40000) : next;
      });
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = () => {
      setConnected(false);
    };

    wsRef.current = ws;
  }, [connectionId, inputPath, onLogPathChange]);

  const stopTail = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: "stop" }));
      } catch {
        // 이미 닫힌 경우
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  // 마운트 시 초기 logFilePath가 있으면 자동 시작
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStarted.current && logFilePath) {
      autoStarted.current = true;
      startTail(logFilePath);
    }
  }, [logFilePath]); // eslint-disable-line react-hooks/exhaustive-deps

  // 외부에서 logFilePath 변경 시 (파일 트리 선택) 자동 tail 시작
  const prevExternalPath = useRef(logFilePath);
  useEffect(() => {
    if (logFilePath && logFilePath !== prevExternalPath.current) {
      prevExternalPath.current = logFilePath;
      startTail(logFilePath);
    }
  }, [logFilePath, startTail]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // 스크롤 이벤트 핸들러 (사용자가 위로 스크롤하면 자동 스크롤 해제)
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    autoScrollRef.current = atBottom;
  };

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: terminalTheme?.background || "#09090b" }}>
      {/* 상단 바: 경로 입력 + 시작/중지 */}
      <div className="flex items-center gap-1 px-2 py-1 bg-[#18181b] border-b border-[#3f3f46] shrink-0">
        <span className="text-xs text-[#71717a] shrink-0 font-medium">Log</span>
        <input
          type="text"
          value={inputPath}
          onChange={(e) => setInputPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") startTail();
          }}
          placeholder="/path/to/logfile.log"
          className="flex-1 px-1.5 py-0.5 text-xs bg-[#09090b] text-[#f4f4f5] border border-[#3f3f46] rounded outline-none focus:border-[#3b82f6] min-w-0"
        />
        {connected ? (
          <button
            onClick={stopTail}
            className="px-2.5 py-0.5 text-xs text-[#ef4444] hover:bg-[#ef4444]/10 rounded transition-colors shrink-0 font-medium"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={() => startTail()}
            disabled={!inputPath.trim()}
            className="px-2.5 py-0.5 text-xs text-[#10b981] hover:bg-[#10b981]/10 rounded transition-colors shrink-0 font-medium disabled:opacity-30"
          >
            Tail
          </button>
        )}
        {connected && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] shrink-0" title={`Tailing: ${logPath}`} />
        )}
      </div>

      {/* 로그 내용 */}
      <div
        className="flex-1 overflow-y-auto overflow-x-auto p-2 font-mono text-[11px] leading-4 whitespace-pre"
        style={{ color: terminalTheme?.foreground || "#a1a1aa" }}
        onScroll={handleScroll}
      >
        {!connected && !logContent && (
          <div className="text-[#52525b] text-center mt-4">
            Enter a log file path and press Tail to start watching
          </div>
        )}
        {logContent}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
