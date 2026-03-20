import { useState, useEffect, useCallback } from "react";
import type { ConnectionInfo, ConnectionCreate } from "../types";

const API_BASE = "/api/connections";

export function useConnections() {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchConnections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API_BASE);
      if (res.ok) {
        setConnections(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch connections:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createConnection = useCallback(async (data: ConnectionCreate) => {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to create connection");
    const created = await res.json();
    setConnections((prev) => [...prev, created]);
    return created as ConnectionInfo;
  }, []);

  const deleteConnection = useCallback(async (id: number) => {
    const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete connection");
    setConnections((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const testConnection = useCallback(async (id: number) => {
    const res = await fetch(`${API_BASE}/${id}/test`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.detail || "Connection test failed");
    }
    return await res.json();
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  return { connections, loading, createConnection, deleteConnection, testConnection, refresh: fetchConnections };
}
