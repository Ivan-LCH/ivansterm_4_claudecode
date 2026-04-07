import { useState, useEffect, useCallback, useRef } from "react";
import type { FileNode, TransferStatus } from "../../types";

interface FileTreeProps {
  connectionId: number;
  rootPath: string;
  listDirectory: (path: string) => Promise<{ path: string; entries: FileNode[] }>;
  onFileSelect: (path: string, filename: string) => void;
  onTailLog?: (path: string) => void;
  onUploadComplete?: () => void;
  onTransferStatus?: (status: TransferStatus | null) => void;
  onPathResolved?: (path: string) => void;
  onRename?: (oldPath: string, newPath: string) => Promise<void>;
  onDelete?: (path: string) => Promise<void>;
  onMkdir?: (path: string) => Promise<void>;
  onCreateFile?: (path: string, content: string) => Promise<void>;
  dirsOnly?: boolean;
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i > 0 ? path.slice(0, i) : "/";
}

// 파일 트리 아이템 (재귀)
function FileTreeItem({
  node,
  depth,
  connectionId: _connectionId,
  listDirectory,
  onFileSelect,
  onTailLog,
  onDownload,
  onRename,
  onDelete,
  onMkdir,
  onCreateFile,
  onRefreshParent,
  dirsOnly,
}: {
  node: FileNode;
  depth: number;
  connectionId: number;
  listDirectory: FileTreeProps["listDirectory"];
  onFileSelect: FileTreeProps["onFileSelect"];
  onTailLog?: FileTreeProps["onTailLog"];
  onDownload?: (path: string, filename: string) => void;
  onRename?: (oldPath: string, newPath: string) => Promise<void>;
  onDelete?: (path: string) => Promise<void>;
  onMkdir?: (path: string) => Promise<void>;
  onCreateFile?: (path: string, content: string) => Promise<void>;
  onRefreshParent?: () => void;
  dirsOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [creatingType, setCreatingType] = useState<"file" | "folder" | null>(null);
  const [createValue, setCreateValue] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  const loadChildren = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listDirectory(node.path);
      setChildren(data.entries);
    } catch {
      setChildren([]);
    } finally {
      setLoading(false);
    }
  }, [listDirectory, node.path]);

  const toggle = async () => {
    if (isRenaming) return;
    if (!node.is_dir) {
      if (!dirsOnly) onFileSelect(node.path, node.name);
      return;
    }
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (children === null) await loadChildren();
    setExpanded(true);
  };

  // 외부 클릭 시 컨텍스트 메뉴 닫기
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    document.addEventListener("contextmenu", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("contextmenu", close);
    };
  }, [contextMenu]);

  // rename input 포커스
  useEffect(() => {
    if (isRenaming) setTimeout(() => renameInputRef.current?.select(), 0);
  }, [isRenaming]);

  // create input 포커스
  useEffect(() => {
    if (creatingType) setTimeout(() => createInputRef.current?.focus(), 0);
  }, [creatingType]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleRenameStart = () => {
    setRenameValue(node.name);
    setIsRenaming(true);
    setContextMenu(null);
  };

  const handleRenameConfirm = async () => {
    const trimmed = renameValue.trim();
    setIsRenaming(false);
    if (!trimmed || trimmed === node.name) return;
    const newPath = `${dirname(node.path)}/${trimmed}`;
    try {
      await onRename?.(node.path, newPath);
      onRefreshParent?.();
    } catch (e) {
      console.error("Rename failed:", e);
    }
  };

  const handleDelete = async () => {
    setContextMenu(null);
    try {
      await onDelete?.(node.path);
      onRefreshParent?.();
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  const handleCreateStart = async (type: "file" | "folder") => {
    setContextMenu(null);
    if (!expanded) {
      if (children === null) await loadChildren();
      setExpanded(true);
    }
    setCreatingType(type);
    setCreateValue("");
  };

  const handleCreateConfirm = async () => {
    const trimmed = createValue.trim();
    setCreatingType(null);
    setCreateValue("");
    if (!trimmed) return;
    const newPath = `${node.path}/${trimmed}`;
    try {
      if (creatingType === "folder") {
        await onMkdir?.(newPath);
      } else {
        await onCreateFile?.(newPath, "");
      }
      const data = await listDirectory(node.path);
      setChildren(data.entries);
    } catch (e) {
      console.error("Create failed:", e);
    }
  };

  // 아이템 간 Drag & Drop 이동
  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData("application/x-filetree", node.path);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!node.is_dir) return;
    if (!e.dataTransfer.types.includes("application/x-filetree")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (!node.is_dir) return;
    const srcPath = e.dataTransfer.getData("application/x-filetree");
    if (!srcPath || srcPath === node.path) return;
    const srcName = srcPath.split("/").pop() || "";
    const destPath = `${node.path}/${srcName}`;
    if (destPath === srcPath) return;
    try {
      await onRename?.(srcPath, destPath);
      onRefreshParent?.();
      if (expanded) {
        const data = await listDirectory(node.path);
        setChildren(data.entries);
      }
    } catch (e) {
      console.error("Move failed:", e);
    }
  };

  // dirsOnly 필터
  const displayChildren = dirsOnly
    ? (children ?? []).filter((c) => c.is_dir)
    : (children ?? []);

  return (
    <div>
      <div
        draggable
        onClick={toggle}
        onContextMenu={handleContextMenu}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-[#3f3f46]/50 transition-colors group ${
          !node.is_dir ? "text-[#f4f4f5]" : "text-[#3b82f6]"
        } ${isDragOver ? "bg-[#3b82f6]/20 ring-1 ring-inset ring-[#3b82f6]/50" : ""}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        title={node.path}
      >
        {node.is_dir ? (
          <span className="text-xs w-3 text-center shrink-0">
            {loading ? "⏳" : expanded ? "▾" : "▸"}
          </span>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className="text-xs shrink-0">
          {node.is_dir ? (expanded ? "📂" : "📁") : fileIcon(node.name)}
        </span>
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameConfirm();
              if (e.key === "Escape") setIsRenaming(false);
              e.stopPropagation();
            }}
            onBlur={handleRenameConfirm}
            className="text-xs flex-1 bg-[#27272a] border border-[#3b82f6] rounded px-1 outline-none text-[#f4f4f5] min-w-0"
          />
        ) : (
          <span className="text-xs truncate">{node.name}</span>
        )}
      </div>

      {/* 하위 노드 */}
      {expanded && (
        <div>
          {/* 새 항목 생성 입력 */}
          {creatingType && (
            <div
              className="flex items-center gap-1 px-2 py-0.5"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            >
              <span className="text-xs shrink-0">
                {creatingType === "folder" ? "📁" : "📄"}
              </span>
              <input
                ref={createInputRef}
                value={createValue}
                onChange={(e) => setCreateValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateConfirm();
                  if (e.key === "Escape") {
                    setCreatingType(null);
                    setCreateValue("");
                  }
                  e.stopPropagation();
                }}
                onBlur={handleCreateConfirm}
                placeholder={creatingType === "folder" ? "folder name" : "file name"}
                className="text-xs flex-1 bg-[#27272a] border border-[#3b82f6] rounded px-1 outline-none text-[#f4f4f5] min-w-0"
              />
            </div>
          )}
          {displayChildren.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              connectionId={_connectionId}
              listDirectory={listDirectory}
              onFileSelect={onFileSelect}
              onTailLog={onTailLog}
              onDownload={onDownload}
              onRename={onRename}
              onDelete={onDelete}
              onMkdir={onMkdir}
              onCreateFile={onCreateFile}
              onRefreshParent={async () => {
                const data = await listDirectory(node.path);
                setChildren(data.entries);
              }}
              dirsOnly={dirsOnly}
            />
          ))}
          {!creatingType && displayChildren.length === 0 && !loading && (
            <div
              className="text-xs text-[#52525b] italic"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            >
              (empty)
            </div>
          )}
        </div>
      )}

      {/* 컨텍스트 메뉴 */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-[#09090b] border border-[#3f3f46] rounded shadow-lg py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {node.is_dir ? (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handleCreateStart("file"); }}
                className="w-full text-left px-3 py-1 text-xs text-[#f4f4f5] hover:bg-[#3f3f46] transition-colors"
              >
                New File
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleCreateStart("folder"); }}
                className="w-full text-left px-3 py-1 text-xs text-[#f4f4f5] hover:bg-[#3f3f46] transition-colors"
              >
                New Folder
              </button>
            </>
          ) : (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onFileSelect(node.path, node.name); setContextMenu(null); }}
                className="w-full text-left px-3 py-1 text-xs text-[#f4f4f5] hover:bg-[#3f3f46] transition-colors"
              >
                Open in Editor
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDownload?.(node.path, node.name); setContextMenu(null); }}
                className="w-full text-left px-3 py-1 text-xs text-[#3b82f6] hover:bg-[#3f3f46] transition-colors"
              >
                Download
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onTailLog?.(node.path); setContextMenu(null); }}
                className="w-full text-left px-3 py-1 text-xs text-[#10b981] hover:bg-[#3f3f46] transition-colors"
              >
                Tail Log
              </button>
            </>
          )}
          <div className="border-t border-[#3f3f46] my-0.5" />
          <button
            onClick={(e) => { e.stopPropagation(); handleRenameStart(); }}
            className="w-full text-left px-3 py-1 text-xs text-[#f4f4f5] hover:bg-[#3f3f46] transition-colors"
          >
            Rename
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            className="w-full text-left px-3 py-1 text-xs text-[#ef4444] hover:bg-[#3f3f46] transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// 파일 확장자별 아이콘
function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const iconMap: Record<string, string> = {
    py: "🐍", js: "📜", ts: "📜", tsx: "📜", jsx: "📜",
    json: "📋", md: "📝", txt: "📄", yml: "⚙️", yaml: "⚙️",
    sh: "⚡", bash: "⚡", conf: "⚙️", cfg: "⚙️", ini: "⚙️",
    html: "🌐", css: "🎨", sql: "🗃️", xml: "📰",
    log: "📊", env: "🔒", dockerfile: "🐳",
  };
  if (name.toLowerCase() === "dockerfile") return "🐳";
  return iconMap[ext] || "📄";
}

// 파일 크기 포맷
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function FileTree({
  connectionId, rootPath, listDirectory, onFileSelect, onTailLog,
  onUploadComplete, onTransferStatus, onPathResolved,
  onRename, onDelete, onMkdir, onCreateFile, dirsOnly,
}: FileTreeProps) {
  const [rootNodes, setRootNodes] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedPath, setResolvedPath] = useState(rootPath);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const onPathResolvedRef = useRef(onPathResolved);
  useEffect(() => { onPathResolvedRef.current = onPathResolved; }, [onPathResolved]);

  const loadRoot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listDirectory(rootPath);
      setRootNodes(data.entries);
      setResolvedPath(data.path);
      onPathResolvedRef.current?.(data.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [listDirectory, rootPath]);

  useEffect(() => {
    loadRoot();
  }, [loadRoot]);

  // 다운로드 핸들러
  const handleDownload = useCallback(async (path: string, filename: string) => {
    onTransferStatus?.({ fileName: filename, direction: "download", state: "progress" });
    try {
      const res = await fetch(`/api/transfer/download?conn_id=${connectionId}&path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        onTransferStatus?.({ fileName: filename, direction: "download", state: "fail" });
        setTimeout(() => onTransferStatus?.(null), 3000);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onTransferStatus?.({ fileName: filename, direction: "download", state: "success", fileSize: blob.size });
      setTimeout(() => onTransferStatus?.(null), 3000);
    } catch {
      onTransferStatus?.({ fileName: filename, direction: "download", state: "fail" });
      setTimeout(() => onTransferStatus?.(null), 3000);
    }
  }, [connectionId, onTransferStatus]);

  // 업로드 핸들러
  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setUploadStatus(null);

    const fileArray = Array.from(files);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      onTransferStatus?.({
        fileName: file.name,
        direction: "upload",
        state: "progress",
        fileSize: file.size,
        current: i + 1,
        total: fileArray.length,
      });

      try {
        const formData = new FormData();
        formData.append("conn_id", String(connectionId));
        formData.append("path", resolvedPath);
        formData.append("file", file);

        const res = await fetch("/api/transfer/upload", { method: "POST", body: formData });
        if (res.ok) {
          successCount++;
        } else {
          const data = await res.json().catch(() => ({ detail: "Upload failed" }));
          console.error(`Upload failed for ${file.name}: ${data.detail}`);
          failCount++;
        }
      } catch (e) {
        console.error(`Upload error for ${file.name}:`, e);
        failCount++;
      }
    }

    setUploading(false);

    const totalSize = fileArray.reduce((s, f) => s + f.size, 0);
    if (failCount === 0) {
      setUploadStatus(`${successCount} file${successCount > 1 ? "s" : ""} uploaded (${formatSize(totalSize)})`);
      onTransferStatus?.({
        fileName: fileArray.length === 1 ? fileArray[0].name : `${successCount} files`,
        direction: "upload",
        state: "success",
        fileSize: totalSize,
      });
    } else {
      setUploadStatus(`${successCount} uploaded, ${failCount} failed`);
      onTransferStatus?.({ fileName: `${failCount} failed`, direction: "upload", state: "fail" });
    }

    setTimeout(() => { setUploadStatus(null); onTransferStatus?.(null); }, 3000);
    loadRoot();
    onUploadComplete?.();
  }, [connectionId, resolvedPath, loadRoot, onUploadComplete, onTransferStatus]);

  // 로컬 파일 Drag & Drop 업로드 핸들러
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    // 로컬 파일 드래그만 오버레이 표시 (서버 파일 이동 DnD 제외)
    if (e.dataTransfer.types.includes("Files") && !e.dataTransfer.types.includes("application/x-filetree")) {
      setDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  // dirsOnly 필터 (root level)
  const displayRootNodes = dirsOnly ? rootNodes.filter((n) => n.is_dir) : rootNodes;

  return (
    <div
      className="flex flex-col h-full overflow-hidden relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-2 py-1 bg-[#18181b] border-b border-[#3f3f46] shrink-0">
        <span className="text-xs text-[#71717a] truncate" title={resolvedPath}>
          {resolvedPath}
        </span>
        <div className="flex items-center gap-1 shrink-0 ml-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs text-[#71717a] hover:text-[#10b981] hover:bg-[#3f3f46] rounded px-1 transition-colors"
            title="Upload file"
            disabled={uploading}
          >
            ↑
          </button>
          <button
            onClick={loadRoot}
            className="text-xs text-[#71717a] hover:text-[#3b82f6] hover:bg-[#3f3f46] rounded px-1 transition-colors"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      {/* 숨겨진 파일 입력 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            uploadFiles(e.target.files);
            e.target.value = "";
          }
        }}
      />

      {/* 업로드 상태 */}
      {(uploading || uploadStatus) && (
        <div className={`px-2 py-1 text-xs border-b border-[#3f3f46] shrink-0 ${
          uploading ? "text-[#f59e0b] bg-[#f59e0b]/5" :
          uploadStatus?.includes("failed") ? "text-[#ef4444] bg-[#ef4444]/5" :
          "text-[#10b981] bg-[#10b981]/5"
        }`}>
          {uploading ? "Uploading..." : uploadStatus}
        </div>
      )}

      {/* 파일 목록 */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1 overscroll-contain">
        {loading && rootNodes.length === 0 && (
          <div className="text-xs text-[#52525b] text-center py-4">Loading...</div>
        )}
        {error && (
          <div className="text-xs text-[#ef4444] text-center py-4 px-2">{error}</div>
        )}
        {!loading && !error && displayRootNodes.length === 0 && (
          <div className="text-xs text-[#52525b] text-center py-4">(empty directory)</div>
        )}
        {displayRootNodes.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            depth={0}
            connectionId={connectionId}
            listDirectory={listDirectory}
            onFileSelect={onFileSelect}
            onTailLog={onTailLog}
            onDownload={handleDownload}
            onRename={onRename}
            onDelete={onDelete}
            onMkdir={onMkdir}
            onCreateFile={onCreateFile}
            onRefreshParent={loadRoot}
            dirsOnly={dirsOnly}
          />
        ))}
      </div>

      {/* 로컬 파일 Drag & Drop 오버레이 */}
      {dragOver && (
        <div className="absolute inset-0 bg-[#3b82f6]/10 border-2 border-dashed border-[#3b82f6] rounded flex items-center justify-center z-40 pointer-events-none">
          <div className="text-center">
            <div className="text-2xl mb-1">↑</div>
            <p className="text-xs text-[#3b82f6] font-medium">Drop files to upload</p>
            <p className="text-xs text-[#6c7086] mt-0.5">{resolvedPath}</p>
          </div>
        </div>
      )}
    </div>
  );
}
