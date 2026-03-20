import { useState, useCallback, useRef, useEffect } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor as monacoEditor } from "monaco-editor";
import FileTree from "./FileTree";
import LogViewer from "./LogViewer";
import { useSFTP } from "../../hooks/useSFTP";
import type { EditorTab } from "../../types";
import type { WorkspaceLayout } from "../../hooks/useWorkspace";

interface EditorPanelProps {
  connectionId: number;
  workingDir: string;
  initialLayout?: WorkspaceLayout;
  onLayoutChange?: (patch: Partial<WorkspaceLayout>) => void;
}

// 에디터 뷰 모드: 탭(단일) / 분할(상하 2개)
type EditorViewMode = "tab" | "split";

// 파일 확장자 → Monaco 언어 매핑
function getLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    py: "python", js: "javascript", ts: "typescript", tsx: "typescript",
    jsx: "javascript", json: "json", md: "markdown", html: "html",
    css: "css", scss: "scss", less: "less", xml: "xml", yml: "yaml",
    yaml: "yaml", sh: "shell", bash: "shell", sql: "sql", go: "go",
    rs: "rust", java: "java", c: "c", cpp: "cpp", h: "c", hpp: "cpp",
    rb: "ruby", php: "php", txt: "plaintext", log: "plaintext",
    ini: "ini", toml: "ini", conf: "plaintext", cfg: "plaintext",
    dockerfile: "dockerfile", makefile: "makefile",
  };
  if (filename.toLowerCase() === "dockerfile") return "dockerfile";
  if (filename.toLowerCase() === "makefile") return "makefile";
  return map[ext] || "plaintext";
}

export default function EditorPanel({ connectionId, workingDir, initialLayout, onLayoutChange }: EditorPanelProps) {
  const sftp = useSFTP(connectionId);
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [splitTabId, setSplitTabId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [fileTreeCollapsed, setFileTreeCollapsed] = useState(initialLayout?.fileTreeCollapsed ?? false);
  const [viewMode, setViewMode] = useState<EditorViewMode>(initialLayout?.editorViewMode ?? "tab");
  const [logExpanded, setLogExpanded] = useState(initialLayout?.logExpanded ?? false);
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const splitEditorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const [focusedEditor, setFocusedEditor] = useState<"main" | "split">("main");

  // 초기 레이아웃에서 파일 복구
  const initialFilesLoaded = useRef(false);
  useEffect(() => {
    if (initialFilesLoaded.current || !initialLayout?.openFiles?.length) return;
    initialFilesLoaded.current = true;

    const loadFiles = async () => {
      for (const path of initialLayout.openFiles!) {
        const filename = path.split("/").pop() || path;
        try {
          const content = await sftp.readFile(path);
          const tab: EditorTab = {
            id: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            filename,
            path,
            content,
            savedContent: content,
            language: getLanguage(filename),
          };
          setTabs((prev) => {
            if (prev.some((t) => t.path === path)) return prev;
            return [...prev, tab];
          });
          // 활성 파일 복구
          if (path === initialLayout.activeFilePath) {
            setActiveTabId(tab.id);
          }
        } catch {
          // 파일 열기 실패 무시 (삭제됐을 수 있음)
        }
      }
    };
    loadFiles();
  }, [initialLayout, sftp]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const splitTab = tabs.find((t) => t.id === splitTabId) ?? null;

  // 레이아웃 변경 시 저장
  const persistEditorLayout = useCallback((patch: Partial<WorkspaceLayout>) => {
    onLayoutChange?.(patch);
  }, [onLayoutChange]);

  // 탭 변경 시 열린 파일 목록 저장
  useEffect(() => {
    if (!initialFilesLoaded.current && initialLayout?.openFiles?.length) return;
    const paths = tabs.map((t) => t.path);
    const activePath = activeTab?.path;
    persistEditorLayout({ openFiles: paths, activeFilePath: activePath });
  }, [tabs, activeTab, persistEditorLayout, initialLayout]);

  // 파일 변경 감지: 윈도우 포커스 복귀 시 서버 파일 체크 (2-4)
  const checkFileChanges = useCallback(async () => {
    for (const tab of tabs) {
      if (tab.content !== tab.savedContent) continue;
      try {
        const serverContent = await sftp.readFile(tab.path);
        if (serverContent !== tab.savedContent) {
          const reload = confirm(
            `"${tab.filename}" has been modified on the server.\nReload the file?`
          );
          if (reload) {
            setTabs((prev) =>
              prev.map((t) =>
                t.id === tab.id
                  ? { ...t, content: serverContent, savedContent: serverContent }
                  : t
              )
            );
          } else {
            setTabs((prev) =>
              prev.map((t) =>
                t.id === tab.id ? { ...t, savedContent: serverContent } : t
              )
            );
          }
        }
      } catch {
        // 무시
      }
    }
  }, [tabs, sftp]);

  useEffect(() => {
    const onFocus = () => {
      if (tabs.length > 0) checkFileChanges();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [tabs, checkFileChanges]);

  // 파일 열기
  const openFile = useCallback(
    async (path: string, filename: string) => {
      const existing = tabs.find((t) => t.path === path);
      if (existing) {
        setActiveTabId(existing.id);
        return;
      }

      try {
        const content = await sftp.readFile(path);
        const tab: EditorTab = {
          id: `tab_${Date.now()}`,
          filename,
          path,
          content,
          savedContent: content,
          language: getLanguage(filename),
        };
        setTabs((prev) => [...prev, tab]);
        setActiveTabId(tab.id);
      } catch (e) {
        alert(`Failed to open file: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [tabs, sftp]
  );

  // 파일 저장
  const saveFile = useCallback(
    async (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;

      setSaveStatus("saving");
      try {
        await sftp.writeFile(tab.path, tab.content);
        setTabs((prev) =>
          prev.map((t) => (t.id === tabId ? { ...t, savedContent: t.content } : t))
        );
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    },
    [tabs, sftp]
  );

  // 탭 닫기
  const closeTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (tab && tab.content !== tab.savedContent) {
        if (!confirm(`"${tab.filename}" has unsaved changes. Close anyway?`)) return;
      }

      setTabs((prev) => {
        const newTabs = prev.filter((t) => t.id !== tabId);
        if (activeTabId === tabId) {
          const idx = prev.findIndex((t) => t.id === tabId);
          const nextTab = newTabs[Math.min(idx, newTabs.length - 1)];
          setActiveTabId(nextTab?.id ?? null);
        }
        if (splitTabId === tabId) {
          setSplitTabId(null);
        }
        return newTabs;
      });
    },
    [tabs, activeTabId, splitTabId]
  );

  // 에디터 내용 변경
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (!activeTabId || value === undefined) return;
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, content: value } : t))
      );
    },
    [activeTabId]
  );

  const handleSplitEditorChange = useCallback(
    (value: string | undefined) => {
      if (!splitTabId || value === undefined) return;
      setTabs((prev) =>
        prev.map((t) => (t.id === splitTabId ? { ...t, content: value } : t))
      );
    },
    [splitTabId]
  );

  // 최신 saveFile ref
  const saveRef = useRef<() => void>(() => {});
  useEffect(() => {
    saveRef.current = () => {
      if (focusedEditor === "split" && splitTabId) {
        saveFile(splitTabId);
      } else if (activeTabId) {
        saveFile(activeTabId);
      }
    };
  }, [activeTabId, splitTabId, focusedEditor, saveFile]);

  const handleEditorMount: OnMount = useCallback(
    (editor) => {
      editorRef.current = editor;
      editor.addAction({
        id: "save-file",
        label: "Save File",
        // eslint-disable-next-line no-bitwise
        keybindings: [2048 | 49],
        run: () => saveRef.current(),
      });
      editor.onDidFocusEditorWidget(() => setFocusedEditor("main"));
    },
    []
  );

  const handleSplitEditorMount: OnMount = useCallback(
    (editor) => {
      splitEditorRef.current = editor;
      editor.addAction({
        id: "save-file",
        label: "Save File",
        // eslint-disable-next-line no-bitwise
        keybindings: [2048 | 49],
        run: () => saveRef.current(),
      });
      editor.onDidFocusEditorWidget(() => setFocusedEditor("split"));
    },
    []
  );

  // 분할 모드 전환 시 split 탭 자동 설정
  useEffect(() => {
    if (viewMode === "split" && !splitTabId && tabs.length >= 2) {
      const other = tabs.find((t) => t.id !== activeTabId);
      if (other) setSplitTabId(other.id);
    }
  }, [viewMode, splitTabId, tabs, activeTabId]);

  // 에디터 렌더링 헬퍼
  const renderEditor = (
    tab: EditorTab | null,
    onMount: OnMount,
    onChange: (v: string | undefined) => void,
    placeholder: string
  ) => {
    if (!tab) {
      return (
        <div className="h-full flex items-center justify-center text-[#585b70]">
          <div className="text-center">
            <div className="text-3xl mb-2 opacity-30">{`</>`}</div>
            <p className="text-xs">{placeholder}</p>
          </div>
        </div>
      );
    }
    return (
      <Editor
        theme="vs-dark"
        language={tab.language}
        value={tab.content}
        onChange={onChange}
        onMount={onMount}
        options={{
          fontSize: 13,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          automaticLayout: true,
          tabSize: 2,
          renderLineHighlight: "line",
          smoothScrolling: true,
          padding: { top: 8 },
        }}
      />
    );
  };

  // 파일 트리 토글 + 레이아웃 저장
  const toggleFileTree = () => {
    setFileTreeCollapsed((p) => {
      const next = !p;
      persistEditorLayout({ fileTreeCollapsed: next });
      return next;
    });
  };

  // 에디터 뷰 모드 토글 + 레이아웃 저장
  const toggleViewMode = () => {
    setViewMode((m) => {
      const next = m === "tab" ? "split" : "tab";
      persistEditorLayout({ editorViewMode: next });
      return next as EditorViewMode;
    });
  };

  // 로그 뷰어 토글 + 레이아웃 저장
  const toggleLog = () => {
    setLogExpanded((p) => {
      const next = !p;
      persistEditorLayout({ logExpanded: next });
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e]">
      {/* 탭 바 */}
      <div className="flex items-center bg-[#181825] border-b border-[#313244] shrink-0 overflow-x-auto">
        {/* 파일 트리 토글 */}
        <button
          onClick={toggleFileTree}
          className="px-2 py-1.5 text-[10px] text-[#585b70] hover:text-[#89b4fa] shrink-0 transition-colors"
          title={fileTreeCollapsed ? "Show file tree" : "Hide file tree"}
        >
          {fileTreeCollapsed ? "☰" : "◀"}
        </button>

        {/* 에디터 탭들 */}
        {tabs.map((tab) => {
          const isDirty = tab.content !== tab.savedContent;
          const isActive = tab.id === activeTabId;
          const isSplit = viewMode === "split" && tab.id === splitTabId;
          return (
            <div
              key={tab.id}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs cursor-pointer border-r border-[#313244] shrink-0 transition-colors ${
                isActive
                  ? "bg-[#1e1e2e] text-[#cdd6f4]"
                  : isSplit
                  ? "bg-[#1e1e2e]/70 text-[#bac2de]"
                  : "text-[#585b70] hover:text-[#a6adc8] hover:bg-[#1e1e2e]/50"
              }`}
              onClick={() => setActiveTabId(tab.id)}
              onContextMenu={(e) => {
                if (viewMode === "split") {
                  e.preventDefault();
                  setSplitTabId(tab.id);
                }
              }}
            >
              <span className="truncate max-w-[120px]">
                {isDirty && <span className="text-[#f9e2af] mr-0.5">●</span>}
                {isSplit && <span className="text-[#89b4fa] mr-0.5 text-[9px]">▼</span>}
                {tab.filename}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="text-[10px] text-[#585b70] hover:text-[#f38ba8] transition-colors ml-1"
              >
                ×
              </button>
            </div>
          );
        })}

        {/* 우측 컨트롤 */}
        <div className="ml-auto flex items-center shrink-0">
          {saveStatus !== "idle" && (
            <span
              className={`px-2 text-[10px] ${
                saveStatus === "saving"
                  ? "text-[#f9e2af]"
                  : saveStatus === "saved"
                  ? "text-[#a6e3a1]"
                  : "text-[#f38ba8]"
              }`}
            >
              {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : "Save failed"}
            </span>
          )}

          {tabs.length >= 2 && (
            <button
              onClick={toggleViewMode}
              className={`px-2 py-1 text-[10px] transition-colors ${
                viewMode === "split"
                  ? "text-[#89b4fa]"
                  : "text-[#585b70] hover:text-[#a6adc8]"
              }`}
              title={viewMode === "split" ? "Single view" : "Split view"}
            >
              {viewMode === "split" ? "⬒" : "⬜"}
            </button>
          )}

          <button
            onClick={toggleLog}
            className={`px-2 py-1 text-[10px] transition-colors ${
              logExpanded
                ? "text-[#89b4fa]"
                : "text-[#585b70] hover:text-[#a6adc8]"
            }`}
            title={logExpanded ? "Hide log viewer" : "Show log viewer"}
          >
            Log
          </button>
        </div>
      </div>

      {/* 메인: 파일 트리 + 에디터 + 로그 */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* 파일 트리 */}
          {!fileTreeCollapsed && (
            <>
              <Panel defaultSize={initialLayout?.fileTreeSize ?? 25} minSize={15} maxSize={50}>
                <FileTree
                  connectionId={connectionId}
                  rootPath={workingDir}
                  listDirectory={sftp.listDirectory}
                  onFileSelect={openFile}
                />
              </Panel>
              <PanelResizeHandle className="group relative w-0.5 hover:w-1 bg-[#313244] hover:bg-[#89b4fa] transition-all cursor-col-resize">
                <div className="absolute inset-y-0 -left-1 -right-1" />
              </PanelResizeHandle>
            </>
          )}

          {/* 에디터 + 로그 영역 */}
          <Panel minSize={30}>
            <PanelGroup direction="vertical">
              {/* 에디터 영역 */}
              <Panel minSize={20}>
                {viewMode === "split" ? (
                  <PanelGroup direction="vertical">
                    <Panel minSize={20}>
                      {renderEditor(activeTab, handleEditorMount, handleEditorChange, "Select a file to edit")}
                    </Panel>
                    <PanelResizeHandle className="group relative h-0.5 hover:h-1 bg-[#313244] hover:bg-[#89b4fa] transition-all cursor-row-resize">
                      <div className="absolute inset-x-0 -top-1 -bottom-1" />
                    </PanelResizeHandle>
                    <Panel minSize={20}>
                      <div className="flex flex-col h-full">
                        {tabs.length > 1 && (
                          <div className="flex items-center bg-[#11111b] border-b border-[#313244] shrink-0 overflow-x-auto">
                            {tabs.map((tab) => (
                              <button
                                key={tab.id}
                                onClick={() => setSplitTabId(tab.id)}
                                className={`px-2 py-0.5 text-[10px] border-r border-[#313244] transition-colors ${
                                  tab.id === splitTabId
                                    ? "text-[#cdd6f4] bg-[#1e1e2e]"
                                    : "text-[#585b70] hover:text-[#a6adc8]"
                                }`}
                              >
                                {tab.filename}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex-1 overflow-hidden">
                          {renderEditor(splitTab, handleSplitEditorMount, handleSplitEditorChange, "Right-click a tab or select below")}
                        </div>
                      </div>
                    </Panel>
                  </PanelGroup>
                ) : (
                  renderEditor(activeTab, handleEditorMount, handleEditorChange, "Select a file to edit")
                )}
              </Panel>

              {/* 로그 뷰어 */}
              {logExpanded && (
                <>
                  <PanelResizeHandle className="group relative h-0.5 hover:h-1 bg-[#313244] hover:bg-[#89b4fa] transition-all cursor-row-resize">
                    <div className="absolute inset-x-0 -top-1 -bottom-1" />
                  </PanelResizeHandle>
                  <Panel defaultSize={initialLayout?.logPanelSize ?? 30} minSize={15} maxSize={60}>
                    <LogViewer connectionId={connectionId} />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
