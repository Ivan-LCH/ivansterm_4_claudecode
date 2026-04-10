import { useState, useEffect } from "react";
import { useGit } from "../../hooks/useGit";
import type { GitFile } from "../../hooks/useGit";

interface GitPanelProps {
  connectionId: number;
  workingDir: string;
}

// xy 코드 → 사람이 읽을 수 있는 상태 + 색상
function fileStatusLabel(f: GitFile): { label: string; color: string } {
  const xy = f.xy;
  if (xy === "??") return { label: "U", color: "#10b981" };   // Untracked
  if (xy[0] === "A") return { label: "A", color: "#3b82f6" };  // Added
  if (xy[0] === "D" || xy[1] === "D") return { label: "D", color: "#ef4444" }; // Deleted
  if (xy[0] === "R") return { label: "R", color: "#8b5cf6" };  // Renamed
  if (xy[0] === "M" || xy[1] === "M") return { label: "M", color: "#f59e0b" }; // Modified
  return { label: xy.trim() || "?", color: "#71717a" };
}

export default function GitPanel({ connectionId, workingDir }: GitPanelProps) {
  const { status, commits, branch, loading, pushLoading, error, fetchStatus, stageFiles, commit, push } = useGit(connectionId, workingDir);
  const [commitMsg, setCommitMsg] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [logExpanded, setLogExpanded] = useState(false);
  const [committing, setCommitting] = useState(false);

  // 열릴 때 자동 새로고침
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleStage = async (files: string[], unstage = false) => {
    setActionError(null);
    try {
      await stageFiles(files, unstage);
      await fetchStatus();
    } catch (e) {
      setActionError(String(e));
    }
  };

  const handleCommit = async () => {
    if (!commitMsg.trim()) return;
    setCommitting(true);
    setActionError(null);
    setActionOk(null);
    try {
      await commit(commitMsg.trim());
      setCommitMsg("");
      setActionOk("커밋 완료!");
      await fetchStatus();
      setTimeout(() => setActionOk(null), 3000);
    } catch (e) {
      setActionError(String(e));
    } finally {
      setCommitting(false);
    }
  };

  const handlePush = async () => {
    setActionError(null);
    setActionOk(null);
    try {
      await push();
      setActionOk("Push 완료!");
      await fetchStatus();
      setTimeout(() => setActionOk(null), 3000);
    } catch (e) {
      setActionError(String(e));
    }
  };

  const handleCommitAndPush = async () => {
    if (!commitMsg.trim()) return;
    setCommitting(true);
    setActionError(null);
    setActionOk(null);
    try {
      await commit(commitMsg.trim());
      setCommitMsg("");
      await push();
      setActionOk("Commit & Push 완료!");
      await fetchStatus();
      setTimeout(() => setActionOk(null), 3000);
    } catch (e) {
      setActionError(String(e));
    } finally {
      setCommitting(false);
    }
  };

  if (loading && !status) {
    return <div className="text-xs text-[#6b7299] text-center py-4">Loading...</div>;
  }

  if (error) {
    return (
      <div className="px-3 py-2">
        <div className="text-xs text-[#ef4444]">{error}</div>
        <button onClick={fetchStatus} className="mt-1 text-xs text-[#3b82f6] hover:underline">재시도</button>
      </div>
    );
  }

  if (!status?.is_git_repo) {
    return (
      <div className="px-3 py-3 text-xs text-[#6b7299] text-center">
        Git 저장소가 아닙니다
        <div className="text-[10px] mt-1 text-[#52525b]">{workingDir}</div>
      </div>
    );
  }

  const stagedFiles = status.files.filter((f) => f.staged);
  const unstagedFiles = status.files.filter((f) => !f.staged);
  const changedCount = status.files.length;

  return (
    <div className="flex flex-col text-xs" style={{ maxHeight: "420px" }}>
      {/* 브랜치 + 새로고침 */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#2e3255]">
        <span className="text-[#93c5fd] font-mono text-[11px]">
          {branch ? `⎇ ${branch}` : "⎇ (detached)"}
        </span>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="text-[#6b7299] hover:text-[#b0b8d8] transition-colors disabled:opacity-50"
          title="새로고침"
        >
          {loading ? "…" : "↻"}
        </button>
      </div>

      <div className="overflow-y-auto flex-1 touch-scroll">
        {/* 변경 파일 없음 */}
        {changedCount === 0 && (
          <div className="text-[#6b7299] text-center py-3">변경 없음</div>
        )}

        {/* Staged */}
        {stagedFiles.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-3 py-1 bg-[#252840]">
              <span className="text-[#8b92b8] font-semibold uppercase tracking-wider text-[10px]">
                Staged ({stagedFiles.length})
              </span>
              <button
                onClick={() => handleStage(stagedFiles.map((f) => f.path), true)}
                className="text-[10px] text-[#6b7299] hover:text-[#ef4444] transition-colors"
                title="전체 unstage"
              >
                −all
              </button>
            </div>
            {stagedFiles.map((f) => {
              const { label, color } = fileStatusLabel(f);
              return (
                <div key={f.path} className="flex items-center gap-1.5 px-3 py-1 hover:bg-[#2e3255]/60 group">
                  <span className="font-bold shrink-0 w-3" style={{ color }}>{label}</span>
                  <span className="truncate text-[#c0c8e8] flex-1" title={f.path}>{f.path}</span>
                  <button
                    onClick={() => handleStage([f.path], true)}
                    className="opacity-0 group-hover:opacity-100 text-[10px] text-[#6b7299] hover:text-[#f59e0b] transition-all shrink-0"
                    title="Unstage"
                  >
                    −
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Unstaged / Untracked */}
        {unstagedFiles.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-3 py-1 bg-[#252840]">
              <span className="text-[#8b92b8] font-semibold uppercase tracking-wider text-[10px]">
                Changes ({unstagedFiles.length})
              </span>
              <button
                onClick={() => handleStage(unstagedFiles.map((f) => f.path))}
                className="text-[10px] text-[#6b7299] hover:text-[#3b82f6] transition-colors"
                title="전체 stage"
              >
                +all
              </button>
            </div>
            {unstagedFiles.map((f) => {
              const { label, color } = fileStatusLabel(f);
              return (
                <div key={f.path} className="flex items-center gap-1.5 px-3 py-1 hover:bg-[#2e3255]/60 group">
                  <span className="font-bold shrink-0 w-3" style={{ color }}>{label}</span>
                  <span className="truncate text-[#8b92b8] flex-1" title={f.path}>{f.path}</span>
                  <button
                    onClick={() => handleStage([f.path])}
                    className="opacity-0 group-hover:opacity-100 text-[10px] text-[#6b7299] hover:text-[#3b82f6] transition-all shrink-0"
                    title="Stage"
                  >
                    +
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* 에러 / 성공 메시지 */}
        {actionError && (
          <div className="mx-3 my-1 px-2 py-1.5 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded text-[#ef4444] text-[11px] leading-snug">
            {actionError}
          </div>
        )}
        {actionOk && (
          <div className="mx-3 my-1 px-2 py-1.5 bg-[#10b981]/10 border border-[#10b981]/30 rounded text-[#10b981] text-[11px]">
            {actionOk}
          </div>
        )}

        {/* 커밋 메시지 입력 */}
        <div className="px-3 py-2 border-t border-[#2e3255]">
          <textarea
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            placeholder="커밋 메시지 입력..."
            rows={2}
            className="w-full px-2 py-1.5 text-xs bg-[#1a1f35] border border-[#2e3255] rounded text-[#f4f4f5] placeholder-[#52525b] focus:outline-none focus:border-[#3b82f6] resize-none"
          />
          <div className="flex gap-1.5 mt-1.5">
            <button
              onClick={handleCommit}
              disabled={!commitMsg.trim() || committing || stagedFiles.length === 0}
              className="flex-1 py-1.5 text-xs font-medium bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] disabled:bg-[#2e3255] disabled:text-[#52525b] disabled:cursor-not-allowed transition-colors"
            >
              {committing ? "..." : "Commit"}
            </button>
            <button
              onClick={handleCommitAndPush}
              disabled={!commitMsg.trim() || committing || pushLoading || stagedFiles.length === 0}
              className="flex-1 py-1.5 text-xs font-medium bg-[#7c3aed] text-white rounded hover:bg-[#6d28d9] disabled:bg-[#2e3255] disabled:text-[#52525b] disabled:cursor-not-allowed transition-colors"
            >
              {committing || pushLoading ? "..." : "Commit+Push"}
            </button>
          </div>
          <button
            onClick={handlePush}
            disabled={pushLoading}
            className="w-full mt-1 py-1.5 text-xs font-medium bg-[#252840] text-[#b0b8d8] border border-[#2e3255] rounded hover:bg-[#2e3255] hover:text-[#f4f4f5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {pushLoading ? "Pushing..." : "Push only"}
          </button>
        </div>

        {/* Git Log */}
        <div className="border-t border-[#2e3255]">
          <button
            onClick={() => setLogExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[#8b92b8] hover:text-[#b0b8d8] transition-colors"
          >
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              Recent Commits
            </span>
            <span>{logExpanded ? "▾" : "▸"}</span>
          </button>
          {logExpanded && (
            <div>
              {commits.length === 0 && (
                <div className="text-[#52525b] text-center py-2">커밋 없음</div>
              )}
              {commits.map((c) => {
                const isPushed = c.refs.includes("origin/");
                return (
                  <div key={c.hash} className="px-3 py-1.5 border-b border-[#1e2030] hover:bg-[#2e3255]/40">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-[#6b7299] shrink-0">{c.short_hash}</span>
                      {isPushed ? (
                        <span className="text-[9px] text-[#10b981] shrink-0" title="GitHub에 Push됨">✓</span>
                      ) : (
                        <span className="text-[9px] text-[#f59e0b] shrink-0" title="로컬 커밋">↑</span>
                      )}
                      <span className="truncate text-[#c0c8e8]">{c.message}</span>
                    </div>
                    <div className="text-[#52525b] text-[10px] mt-0.5 ml-[42px]">
                      {c.author} · {c.relative_time}
                    </div>
                    {c.refs && (
                      <div className="text-[#3b82f6] text-[9px] mt-0.5 ml-[42px] truncate">{c.refs}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
