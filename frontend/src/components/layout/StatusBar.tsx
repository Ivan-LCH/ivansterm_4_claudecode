import { useState, useEffect } from "react";
import type { TransferStatus } from "../../types";

interface StatusBarProps {
  /** 현재 활성 세션의 연결 ID (없으면 null) */
  currentConnectionId: number | null;
  /** 현재 활성 세션 이름 */
  currentSessionName: string | null;
  /** 현재 활성 세션 호스트 */
  currentSessionHost: string | null;
  /** 현재 세션 연결 끊김 여부 */
  currentSessionDisconnected: boolean;
  /** 파일 전송 상태 */
  transferStatus?: TransferStatus | null;
}

interface ServerStatus {
  uptime_seconds: number;
  session_count: number;
}

// 업타임을 사람이 읽기 좋은 형식으로 변환
function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

// 현재 시간 포맷 (HH:MM:SS)
function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour12: false });
}

// 파일 크기 포맷
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function StatusBar({
  currentConnectionId,
  currentSessionName,
  currentSessionHost,
  currentSessionDisconnected,
  transferStatus,
}: StatusBarProps) {
  const [now, setNow] = useState(new Date());
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);

  // 현재 시간 매초 갱신
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 서버 상태 주기적 폴링 (10초)
  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/server-status");
        if (res.ok && !cancelled) {
          setServerStatus(await res.json());
        }
      } catch {
        // 서버 연결 실패 시 null 유지
        if (!cancelled) setServerStatus(null);
      }
    };
    fetchStatus();
    const timer = setInterval(fetchStatus, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const isConnected = currentConnectionId !== null && !currentSessionDisconnected;

  return (
    <div className="h-7 min-h-[28px] bg-[#18181b] border-t border-[#3f3f46] flex items-center px-3 text-xs text-[#a1a1aa] select-none shrink-0">
      {/* 좌측: SSH 연결 상태 */}
      <div className="flex items-center gap-3">
        {/* 연결 인디케이터 */}
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              isConnected
                ? "bg-[#10b981]"
                : currentConnectionId
                  ? "bg-[#ef4444]"
                  : "bg-[#52525b]"
            }`}
          />
          {currentConnectionId ? (
            <span className={isConnected ? "text-[#f4f4f5]" : "text-[#ef4444]"}>
              {currentSessionName}
              <span className="text-[#6c7086] ml-1">({currentSessionHost})</span>
              {currentSessionDisconnected && (
                <span className="text-[#ef4444] ml-1">- Disconnected</span>
              )}
            </span>
          ) : (
            <span className="text-[#52525b]">No connection</span>
          )}
        </div>

        {/* 활성 세션 수 */}
        {serverStatus && (
          <span className="text-[#6c7086]">
            Sessions: {serverStatus.session_count}
          </span>
        )}
      </div>

      {/* 중앙: 전송 상태 */}
      {transferStatus && (
        <div className="flex items-center gap-1.5 ml-4">
          {transferStatus.state === "progress" ? (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-[#f59e0b] animate-pulse" />
              <span className="text-[#f59e0b]">
                {transferStatus.direction === "upload" ? "↑" : "↓"}{" "}
                {transferStatus.fileName}
                {transferStatus.total && transferStatus.total > 1
                  ? ` (${transferStatus.current}/${transferStatus.total})`
                  : ""}
                {transferStatus.fileSize ? ` ${formatSize(transferStatus.fileSize)}` : ""}
              </span>
            </>
          ) : transferStatus.state === "success" ? (
            <>
              <span className="text-[#10b981]">
                {transferStatus.direction === "upload" ? "↑" : "↓"}{" "}
                {transferStatus.fileName}
                {transferStatus.fileSize ? ` (${formatSize(transferStatus.fileSize)})` : ""} — Done
              </span>
            </>
          ) : (
            <>
              <span className="text-[#ef4444]">
                {transferStatus.direction === "upload" ? "↑" : "↓"}{" "}
                {transferStatus.fileName} — Failed
              </span>
            </>
          )}
        </div>
      )}

      {/* 우측: 서버 업타임 + 시간 */}
      <div className="ml-auto flex items-center gap-4">
        {serverStatus ? (
          <span className="text-[#6c7086]">
            Uptime: {formatUptime(serverStatus.uptime_seconds)}
          </span>
        ) : (
          <span className="text-[#ef4444]">Server offline</span>
        )}
        <span className="text-[#f4f4f5]">{formatTime(now)}</span>
      </div>
    </div>
  );
}
