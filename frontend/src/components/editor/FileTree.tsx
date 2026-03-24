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
}

// 파일 트리 아이템 (재귀)
function FileTreeItem({
  node,
  depth,
  connectionId,
  listDirectory,
  onFileSelect,
  onTailLog,
  onDownload,
}: {
  node: FileNode;
  depth: number;
  connectionId: number;
  listDirectory: FileTreeProps["listDirectory"];
  onFileSelect: FileTreeProps["onFileSelect"];
  onTailLog?: FileTreeProps["onTailLog"];
  onDownload?: (path: string, filename: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const toggle = async () => {
    if (!node.is_dir) {
      onFileSelect(node.path, node.name);
      return;
    }

    if (expanded) {
      setExpanded(false);
      return;
    }

    // Lazy Loading: 처음 열 때만 로드
    if (children === null) {
      setLoading(true);
      try {
        const data = await listDirectory(node.path);
        setChildren(data.entries);
      } catch {
        setChildren([]);
      } finally {
        setLoading(false);
      }
    }
    setExpanded(true);
  };

  // 새로고침 (디렉토리 열린 상태에서 다시 로드)
  const refresh = async () => {
    if (!node.is_dir || !expanded) return;
    setLoading(true);
    try {
      const data = await listDirectory(node.path);
      setChildren(data.entries);
    } catch {
      // 조용히 실패
    } finally {
      setLoading(false);
    }
  };
  void refresh; // 향후 컨텍스트 메뉴에서 사용

  // 컨텍스트 메뉴 닫기 (외부 클릭)
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

  const handleContextMenu = (e: React.MouseEvent) => {
    if (node.is_dir) return; // 파일만 컨텍스트 메뉴
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div>
      <div
        onClick={toggle}
        onContextMenu={handleContextMenu}
        className={`flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-[#3f3f46]/50 transition-colors group ${
          !node.is_dir ? "text-[#f4f4f5]" : "text-[#3b82f6]"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        title={node.path}
      >
        {/* 아이콘 */}
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
        <span className="text-xs truncate">{node.name}</span>
      </div>

      {/* 하위 노드 렌더링 */}
      {expanded && children && (
        <div>
          {children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              connectionId={connectionId}
              listDirectory={listDirectory}
              onFileSelect={onFileSelect}
              onTailLog={onTailLog}
              onDownload={onDownload}
            />
          ))}
          {children.length === 0 && (
            <div
              className="text-xs text-[#52525b] italic"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            >
              (empty)
            </div>
          )}
        </div>
      )}

      {/* 우클릭 컨텍스트 메뉴 */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-[#09090b] border border-[#3f3f46] rounded shadow-lg py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFileSelect(node.path, node.name);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1 text-xs text-[#f4f4f5] hover:bg-[#3f3f46] transition-colors"
          >
            Open in Editor
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownload?.(node.path, node.name);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1 text-xs text-[#3b82f6] hover:bg-[#3f3f46] transition-colors"
          >
            Download
          </button>
          <div className="border-t border-[#3f3f46] my-0.5" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTailLog?.(node.path);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1 text-xs text-[#10b981] hover:bg-[#3f3f46] transition-colors"
          >
            Tail Log
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

export default function FileTree({ connectionId, rootPath, listDirectory, onFileSelect, onTailLog, onUploadComplete, onTransferStatus, onPathResolved }: FileTreeProps) {
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

        const res = await fetch("/api/transfer/upload", {
          method: "POST",
          body: formData,
        });

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
      onTransferStatus?.({
        fileName: `${failCount} failed`,
        direction: "upload",
        state: "fail",
      });
    }

    // 상태 메시지 3초 후 제거
    setTimeout(() => {
      setUploadStatus(null);
      onTransferStatus?.(null);
    }, 3000);

    // 파일 트리 새로고침
    loadRoot();
    onUploadComplete?.();
  }, [connectionId, resolvedPath, loadRoot, onUploadComplete, onTransferStatus]);

  // Drag & Drop 핸들러
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setDragOver(false);
    }
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
          {/* 업로드 버튼 */}
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
            e.target.value = ""; // 같은 파일 재선택 가능하도록
          }
        }}
      />

      {/* 업로드 상태 표시 */}
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {loading && rootNodes.length === 0 && (
          <div className="text-xs text-[#52525b] text-center py-4">Loading...</div>
        )}
        {error && (
          <div className="text-xs text-[#ef4444] text-center py-4 px-2">{error}</div>
        )}
        {!loading && !error && rootNodes.length === 0 && (
          <div className="text-xs text-[#52525b] text-center py-4">(empty directory)</div>
        )}
        {rootNodes.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            depth={0}
            connectionId={connectionId}
            listDirectory={listDirectory}
            onFileSelect={onFileSelect}
            onTailLog={onTailLog}
            onDownload={handleDownload}
          />
        ))}
      </div>

      {/* Drag & Drop 오버레이 */}
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
