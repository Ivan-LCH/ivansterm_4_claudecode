import { useState } from "react";
import type { ConnectionCreate } from "../../types";

interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

interface ConnectionModalProps {
  initialData?: {
    id: number;
    name: string;
    host: string;
    port: number;
    username: string;
    auth_method: "password" | "key";
    private_key_path?: string;
    last_working_dir: string;
  };
  onSubmit: (data: ConnectionCreate) => Promise<void>;
  onClose: () => void;
}

export default function ConnectionModal({ initialData, onSubmit, onClose }: ConnectionModalProps) {
  const isEditMode = !!initialData;
  const [form, setForm] = useState<ConnectionCreate>({
    name: initialData?.name || "",
    host: initialData?.host || "",
    port: initialData?.port || 22,
    username: initialData?.username || "root",
    auth_method: initialData?.auth_method || "password",
    password: "",
    private_key_path: initialData?.private_key_path || "",
    last_working_dir: initialData?.last_working_dir || "~",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 디렉토리 브라우저 상태
  const [browsing, setBrowsing] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [tempConnId, setTempConnId] = useState<number | null>(null);

  const update = (field: keyof ConnectionCreate, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // 임시 접속 생성 후 디렉토리 브라우저 열기
  const handleBrowse = async () => {
    if (!form.host || !form.username) {
      setError("Host and Username are required to browse");
      return;
    }
    setError("");
    setBrowseLoading(true);

    try {
      let connId: number;

      if (isEditMode && initialData) {
        // 편집 모드: 기존 접속 ID 사용 (먼저 현재 폼 내용으로 업데이트)
        await fetch(`/api/connections/${initialData.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        connId = initialData.id;
        setTempConnId(connId);
      } else {
        // 신규 모드: 임시 접속 정보 저장
        const res = await fetch("/api/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error("Failed to create connection");
        const conn = await res.json();
        connId = conn.id;
        setTempConnId(connId);
      }

      // 디렉토리 조회
      await loadDirectory(connId, form.last_working_dir || "~");
      setBrowsing(true);
    } catch (err: any) {
      setError(err.message || "Failed to connect");
    } finally {
      setBrowseLoading(false);
    }
  };

  const loadDirectory = async (connId: number, path: string) => {
    setBrowseLoading(true);
    try {
      const res = await fetch(`/api/files/list?conn_id=${connId}&path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error("Failed to list directory");
      const data = await res.json();
      setCurrentPath(data.path);
      setEntries(data.entries);
    } catch (err: any) {
      setError(err.message || "Failed to browse");
    } finally {
      setBrowseLoading(false);
    }
  };

  const navigateTo = (path: string) => {
    if (tempConnId) loadDirectory(tempConnId, path);
  };

  const navigateUp = () => {
    const parent = currentPath.replace(/\/[^/]+\/?$/, "") || "/";
    navigateTo(parent);
  };

  const selectDirectory = async () => {
    // 선택한 디렉토리로 working_dir 설정
    const updatedForm = { ...form, last_working_dir: currentPath };
    setForm(updatedForm);

    if (tempConnId) {
      // 기존 임시 접속 업데이트
      await fetch(`/api/connections/${tempConnId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedForm),
      });
    }

    setBrowsing(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (tempConnId) {
        // 이미 접속이 생성되어 있으면 업데이트 후 사용
        await fetch(`/api/connections/${tempConnId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        // onSubmit에 id를 포함해서 전달하기 위해 기존 것을 사용
        await onSubmit({ ...form, _existingId: tempConnId } as any);
      } else {
        await onSubmit(form);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async () => {
    // 모달 닫을 때 브라우저만 열고 제출 안 한 임시 접속 삭제 (편집 모드에서는 삭제하지 않음)
    if (tempConnId && !submitting && !isEditMode) {
      try {
        await fetch(`/api/connections/${tempConnId}`, { method: "DELETE" });
      } catch { /* 무시 */ }
    }
    onClose();
  };

  const inputClass = "w-full px-3 py-2 bg-[#313244] text-[#cdd6f4] border border-[#45475a] rounded focus:outline-none focus:border-[#89b4fa]";

  // 디렉토리 브라우저 뷰
  if (browsing) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={handleClose}>
        <div
          className="bg-[#1e1e2e] border border-[#313244] rounded-lg p-6 w-full max-w-lg shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-lg font-semibold text-[#cdd6f4] mb-2">Select Working Directory</h2>

          {/* 현재 경로 */}
          <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-[#313244] rounded text-sm text-[#cdd6f4]">
            <button
              onClick={navigateUp}
              className="text-[#89b4fa] hover:text-[#74c7ec] shrink-0"
              title="Parent directory"
            >
              ..
            </button>
            <span className="truncate flex-1">{currentPath}</span>
          </div>

          {/* 디렉토리 목록 */}
          <div className="h-64 overflow-y-auto border border-[#313244] rounded mb-3">
            {browseLoading ? (
              <div className="flex items-center justify-center h-full text-[#a6adc8] text-sm">
                Loading...
              </div>
            ) : (
              entries.map((entry) => (
                <div
                  key={entry.path}
                  onClick={() => entry.is_dir && navigateTo(entry.path)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm border-b border-[#313244] last:border-0 ${
                    entry.is_dir
                      ? "text-[#89b4fa] cursor-pointer hover:bg-[#313244]"
                      : "text-[#585b70]"
                  }`}
                >
                  <span className="shrink-0 w-4 text-center">
                    {entry.is_dir ? "/" : " "}
                  </span>
                  <span className="truncate">{entry.name}</span>
                </div>
              ))
            )}
            {!browseLoading && entries.length === 0 && (
              <div className="flex items-center justify-center h-full text-[#585b70] text-sm">
                Empty directory
              </div>
            )}
          </div>

          {error && <p className="text-[#f38ba8] text-sm mb-2">{error}</p>}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setBrowsing(false)}
              className="px-4 py-2 text-sm text-[#a6adc8] hover:text-[#cdd6f4] transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={selectDirectory}
              className="px-4 py-2 text-sm bg-[#89b4fa] text-[#1e1e2e] rounded hover:bg-[#74c7ec] transition-colors"
            >
              Select: {currentPath}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 접속 정보 입력 폼
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={handleClose}>
      <div
        className="bg-[#1e1e2e] border border-[#313244] rounded-lg p-6 w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-[#cdd6f4] mb-4">{isEditMode ? "Edit Connection" : "New Connection"}</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm text-[#a6adc8] mb-1">Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="My Server"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-sm text-[#a6adc8] mb-1">Host</label>
              <input
                type="text"
                required
                value={form.host}
                onChange={(e) => update("host", e.target.value)}
                placeholder="192.168.1.100"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-[#a6adc8] mb-1">Port</label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => update("port", parseInt(e.target.value) || 22)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-[#a6adc8] mb-1">Username</label>
            <input
              type="text"
              required
              value={form.username}
              onChange={(e) => update("username", e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm text-[#a6adc8] mb-1">Auth Method</label>
            <select
              value={form.auth_method}
              onChange={(e) => update("auth_method", e.target.value)}
              className={inputClass}
            >
              <option value="password">Password</option>
              <option value="key">Private Key</option>
            </select>
          </div>

          {form.auth_method === "password" ? (
            <div>
              <label className="block text-sm text-[#a6adc8] mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                className={inputClass}
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm text-[#a6adc8] mb-1">Private Key Path</label>
              <input
                type="text"
                value={form.private_key_path}
                onChange={(e) => update("private_key_path", e.target.value)}
                placeholder="/root/.ssh/id_rsa"
                className={inputClass}
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-[#a6adc8] mb-1">Working Directory</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.last_working_dir}
                onChange={(e) => update("last_working_dir", e.target.value)}
                placeholder="~ (home directory)"
                className={inputClass}
              />
              <button
                type="button"
                onClick={handleBrowse}
                disabled={browseLoading}
                className="px-3 py-2 text-sm bg-[#45475a] text-[#cdd6f4] rounded hover:bg-[#585b70] transition-colors shrink-0 disabled:opacity-50"
              >
                {browseLoading ? "..." : "Browse"}
              </button>
            </div>
          </div>

          {error && <p className="text-[#f38ba8] text-sm">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm text-[#a6adc8] hover:text-[#cdd6f4] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-[#89b4fa] text-[#1e1e2e] rounded hover:bg-[#74c7ec] transition-colors disabled:opacity-50"
            >
              {submitting ? "Saving..." : isEditMode ? "Save & Connect" : "Save & Connect"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
