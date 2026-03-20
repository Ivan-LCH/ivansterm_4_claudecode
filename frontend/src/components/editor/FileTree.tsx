import { useState, useEffect, useCallback } from "react";
import type { FileNode } from "../../types";

interface FileTreeProps {
  connectionId: number;
  rootPath: string;
  listDirectory: (path: string) => Promise<{ path: string; entries: FileNode[] }>;
  onFileSelect: (path: string, filename: string) => void;
}

// 파일 트리 아이템 (재귀)
function FileTreeItem({
  node,
  depth,
  listDirectory,
  onFileSelect,
}: {
  node: FileNode;
  depth: number;
  listDirectory: FileTreeProps["listDirectory"];
  onFileSelect: FileTreeProps["onFileSelect"];
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileNode[] | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div>
      <div
        onClick={toggle}
        className={`flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-[#313244]/50 transition-colors group ${
          !node.is_dir ? "text-[#cdd6f4]" : "text-[#89b4fa]"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        title={node.path}
      >
        {/* 아이콘 */}
        {node.is_dir ? (
          <span className="text-[10px] w-3 text-center shrink-0">
            {loading ? "⏳" : expanded ? "▾" : "▸"}
          </span>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className="text-[10px] shrink-0">
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
              listDirectory={listDirectory}
              onFileSelect={onFileSelect}
            />
          ))}
          {children.length === 0 && (
            <div
              className="text-[10px] text-[#585b70] italic"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            >
              (empty)
            </div>
          )}
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

export default function FileTree({ connectionId, rootPath, listDirectory, onFileSelect }: FileTreeProps) {
  const [rootNodes, setRootNodes] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedPath, setResolvedPath] = useState(rootPath);
  void connectionId; // listDirectory에 이미 바인딩됨

  const loadRoot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listDirectory(rootPath);
      setRootNodes(data.entries);
      setResolvedPath(data.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [listDirectory, rootPath]);

  useEffect(() => {
    loadRoot();
  }, [loadRoot]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-2 py-1 bg-[#181825] border-b border-[#313244] shrink-0">
        <span className="text-[10px] text-[#585b70] truncate" title={resolvedPath}>
          {resolvedPath}
        </span>
        <button
          onClick={loadRoot}
          className="text-[10px] text-[#585b70] hover:text-[#89b4fa] transition-colors shrink-0 ml-1"
          title="Refresh"
        >
          ↻
        </button>
      </div>

      {/* 파일 목록 */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {loading && rootNodes.length === 0 && (
          <div className="text-xs text-[#585b70] text-center py-4">Loading...</div>
        )}
        {error && (
          <div className="text-xs text-[#f38ba8] text-center py-4 px-2">{error}</div>
        )}
        {!loading && !error && rootNodes.length === 0 && (
          <div className="text-xs text-[#585b70] text-center py-4">(empty directory)</div>
        )}
        {rootNodes.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            depth={0}
            listDirectory={listDirectory}
            onFileSelect={onFileSelect}
          />
        ))}
      </div>
    </div>
  );
}
