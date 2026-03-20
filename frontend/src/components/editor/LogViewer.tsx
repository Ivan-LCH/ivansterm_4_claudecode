import { useState, useRef, useEffect, useCallback } from "react";

interface LogViewerProps {
  connectionId: number;
}

export default function LogViewer({ connectionId }: LogViewerProps) {
  const [logPath, setLogPath] = useState("");
  const [inputPath, setInputPath] = useState("");
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
  const startTail = useCallback(() => {
    if (!inputPath.trim()) return;

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
      setLogPath(inputPath.trim());
      ws.send(JSON.stringify({ type: "start", path: inputPath.trim() }));
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
  }, [connectionId, inputPath]);

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
    <div className="flex flex-col h-full bg-[#11111b]">
      {/* 상단 바: 경로 입력 + 시작/중지 */}
      <div className="flex items-center gap-1 px-2 py-1 bg-[#181825] border-b border-[#313244] shrink-0">
        <span className="text-[10px] text-[#585b70] shrink-0">Log</span>
        <input
          type="text"
          value={inputPath}
          onChange={(e) => setInputPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") startTail();
          }}
          placeholder="/path/to/logfile.log"
          className="flex-1 px-1.5 py-0.5 text-[11px] bg-[#1e1e2e] text-[#cdd6f4] border border-[#313244] rounded outline-none focus:border-[#89b4fa] min-w-0"
        />
        {connected ? (
          <button
            onClick={stopTail}
            className="px-2 py-0.5 text-[10px] text-[#f38ba8] hover:bg-[#313244] rounded transition-colors shrink-0"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={startTail}
            disabled={!inputPath.trim()}
            className="px-2 py-0.5 text-[10px] text-[#a6e3a1] hover:bg-[#313244] rounded transition-colors shrink-0 disabled:opacity-30"
          >
            Tail
          </button>
        )}
        {connected && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#a6e3a1] shrink-0" title={`Tailing: ${logPath}`} />
        )}
      </div>

      {/* 로그 내용 */}
      <div
        className="flex-1 overflow-y-auto overflow-x-auto p-2 font-mono text-[11px] text-[#a6adc8] leading-4 whitespace-pre"
        onScroll={handleScroll}
      >
        {!connected && !logContent && (
          <div className="text-[#585b70] text-center mt-4">
            Enter a log file path and press Tail to start watching
          </div>
        )}
        {logContent}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
