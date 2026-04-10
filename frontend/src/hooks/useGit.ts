import { useState, useCallback } from "react";

export interface GitFile {
  path: string;
  xy: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export interface GitCommit {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  relative_time: string;
  refs: string;
}

export interface GitStatus {
  is_git_repo: boolean;
  files: GitFile[];
}

export function useGit(connectionId: number, workingDir: string) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [branch, setBranch] = useState("");
  const [loading, setLoading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!connectionId || !workingDir) return;
    setLoading(true);
    setError(null);
    try {
      const [statusRes, logRes, branchRes] = await Promise.all([
        fetch(`/api/git/status?conn_id=${connectionId}&path=${encodeURIComponent(workingDir)}`),
        fetch(`/api/git/log?conn_id=${connectionId}&path=${encodeURIComponent(workingDir)}&limit=7`),
        fetch(`/api/git/branch?conn_id=${connectionId}&path=${encodeURIComponent(workingDir)}`),
      ]);
      if (statusRes.ok) setStatus(await statusRes.json());
      if (logRes.ok) {
        const data = await logRes.json();
        setCommits(data.commits || []);
      }
      if (branchRes.ok) {
        const data = await branchRes.json();
        setBranch(data.branch || "");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [connectionId, workingDir]);

  const stageFiles = useCallback(async (files: string[], unstage = false) => {
    const res = await fetch("/api/git/stage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conn_id: connectionId, path: workingDir, files, unstage }),
    });
    if (!res.ok) throw new Error((await res.json()).detail || "Stage failed");
  }, [connectionId, workingDir]);

  const commit = useCallback(async (message: string) => {
    const res = await fetch("/api/git/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conn_id: connectionId, path: workingDir, message }),
    });
    if (!res.ok) throw new Error((await res.json()).detail || "Commit failed");
  }, [connectionId, workingDir]);

  const push = useCallback(async () => {
    setPushLoading(true);
    try {
      const res = await fetch("/api/git/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conn_id: connectionId, path: workingDir }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Push failed");
    } finally {
      setPushLoading(false);
    }
  }, [connectionId, workingDir]);

  return { status, commits, branch, loading, pushLoading, error, fetchStatus, stageFiles, commit, push };
}
