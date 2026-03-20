import { useCallback } from "react";
import type { FileNode } from "../types";

// SFTP API 통신 훅
export function useSFTP(connectionId: number) {
  const listDirectory = useCallback(
    async (path: string): Promise<{ path: string; entries: FileNode[] }> => {
      const params = new URLSearchParams({
        conn_id: String(connectionId),
        path,
      });
      const res = await fetch(`/api/files/list?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Failed to list directory");
      }
      return res.json();
    },
    [connectionId]
  );

  const readFile = useCallback(
    async (path: string): Promise<string> => {
      const params = new URLSearchParams({
        conn_id: String(connectionId),
        path,
      });
      const res = await fetch(`/api/files/read?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Failed to read file");
      }
      const data = await res.json();
      return data.content;
    },
    [connectionId]
  );

  const writeFile = useCallback(
    async (path: string, content: string): Promise<void> => {
      const res = await fetch("/api/files/write", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conn_id: connectionId, path, content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Failed to write file");
      }
    },
    [connectionId]
  );

  const mkdir = useCallback(
    async (path: string): Promise<void> => {
      const res = await fetch("/api/files/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conn_id: connectionId, path }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Failed to create directory");
      }
    },
    [connectionId]
  );

  const deleteFile = useCallback(
    async (path: string): Promise<void> => {
      const params = new URLSearchParams({
        conn_id: String(connectionId),
        path,
      });
      const res = await fetch(`/api/files/delete?${params}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Failed to delete");
      }
    },
    [connectionId]
  );

  return { listDirectory, readFile, writeFile, mkdir, deleteFile };
}
