import { useState, useCallback, useRef, useEffect } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor as monacoEditor } from "monaco-editor";
import LogViewer from "./LogViewer";
import { useSFTP } from "../../hooks/useSFTP";
import type { EditorTab, EditorSettings, TerminalTheme } from "../../types";
import type { WorkspaceLayout } from "../../hooks/useWorkspace";
import { EDITOR_THEME_PRESETS } from "../../hooks/useEditorSettings";

// 외부에서 파일 열기/로그 테일 요청용 타입
export interface FileOpenRequest {
  path: string;
  filename: string;
  ts: number; // 변경 감지용 타임스탬프
}

export interface TailLogRequest {
  path: string;
  ts: number;
}

interface EditorPanelProps {
  connectionId: number;
  workingDir: string;
  initialLayout?: WorkspaceLayout;
  onLayoutChange?: (patch: Partial<WorkspaceLayout>) => void;
  editorSettings?: EditorSettings;
  terminalTheme?: TerminalTheme;
  fileOpenRequest?: FileOpenRequest | null;
  tailLogRequest?: TailLogRequest | null;
  onOpenFileTree?: () => void;
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

export default function EditorPanel({ connectionId, workingDir: _workingDir, initialLayout, onLayoutChange, editorSettings, terminalTheme, fileOpenRequest, tailLogRequest, onOpenFileTree }: EditorPanelProps) {
  void _workingDir;
  const sftp = useSFTP(connectionId);
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [splitTabId, setSplitTabId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [viewMode, setViewMode] = useState<EditorViewMode>(initialLayout?.editorViewMode ?? "tab");
  const [logExpanded, setLogExpanded] = useState(initialLayout?.logExpanded ?? false);
  const [logFilePath, setLogFilePath] = useState<string | undefined>(initialLayout?.logFilePath);
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const splitEditorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const [focusedEditor, setFocusedEditor] = useState<"main" | "split">("main");
  const [reloadMessage, setReloadMessage] = useState<string | null>(null);

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

  // 파일 변경 감지: 주기적 폴링(5초) + 윈도우 포커스 복귀 시 서버 파일 체크 (2-4)
  // 활성 탭만 감시하여 불필요한 API 호출 방지 (2-1)
  const checkingRef = useRef(false);
  const checkFileChanges = useCallback(async () => {
    if (checkingRef.current) return;
    // 활성 탭만 체크 (비활성 탭은 스킵)
    const tabsToCheck = tabs.filter(
      (t) => t.id === activeTabId || (viewMode === "split" && t.id === splitTabId)
    );
    if (tabsToCheck.length === 0) return;
    checkingRef.current = true;
    try {
      const reloadedFiles: string[] = [];
      for (const tab of tabsToCheck) {
        if (tab.content !== tab.savedContent) continue; // 수정 중인 탭은 건너뜀
        try {
          const serverContent = await sftp.readFile(tab.path);
          if (serverContent !== tab.savedContent) {
            reloadedFiles.push(tab.filename);
            setTabs((prev) =>
              prev.map((t) =>
                t.id === tab.id
                  ? { ...t, content: serverContent, savedContent: serverContent }
                  : t
              )
            );
          }
        } catch {
          // 무시
        }
      }
      if (reloadedFiles.length > 0) {
        setReloadMessage(`Reloaded: ${reloadedFiles.join(", ")}`);
        setTimeout(() => setReloadMessage(null), 3000);
      }
    } finally {
      checkingRef.current = false;
    }
  }, [tabs, sftp, activeTabId, splitTabId, viewMode]);

  // 주기적 폴링 (5초마다)
  useEffect(() => {
    if (tabs.length === 0) return;
    const interval = setInterval(checkFileChanges, 5000);
    return () => clearInterval(interval);
  }, [tabs, checkFileChanges]);

  // 윈도우 포커스 복귀 시에도 즉시 체크
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
      // 마운트 시 자동 포커스 방지 — 터미널 포커스를 뺏지 않도록
      const activeEl = document.activeElement;
      if (activeEl && activeEl instanceof HTMLElement && !activeEl.closest(".monaco-editor")) {
        requestAnimationFrame(() => activeEl.focus());
      }
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
      // 마운트 시 자동 포커스 방지
      const activeEl = document.activeElement;
      if (activeEl && activeEl instanceof HTMLElement && !activeEl.closest(".monaco-editor")) {
        requestAnimationFrame(() => activeEl.focus());
      }
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

  // Monaco 커스텀 테마 초기 등록 (beforeMount에서 1회) + 인스턴스 저장
  const registerThemes = useCallback((monaco: Parameters<OnMount>[1]) => {
    monacoRef.current = monaco as unknown as typeof import("monaco-editor");
    Object.entries(EDITOR_THEME_PRESETS).forEach(([id, preset]) => {
      if (Object.keys(preset.colors).length > 0) {
        monaco.editor.defineTheme(id, {
          base: preset.base,
          inherit: true,
          rules: [],
          colors: preset.colors,
        });
      }
    });
  }, []);

  // 에디터 설정이 변경되면 모든 에디터 인스턴스에 반영 (포커스 유지)
  useEffect(() => {
    if (!editorSettings) return;
    const activeElement = document.activeElement;
    const opts: monacoEditor.IEditorOptions = {
      fontSize: editorSettings.fontSize,
      fontFamily: editorSettings.fontFamily,
      lineHeight: Math.round(editorSettings.fontSize * editorSettings.lineHeight),
      wordWrap: editorSettings.wordWrap,
      minimap: { enabled: editorSettings.minimap },
      renderLineHighlight: editorSettings.renderLineHighlight,
    };
    editorRef.current?.updateOptions(opts);
    splitEditorRef.current?.updateOptions(opts);
    // tabSize는 모델 옵션이므로 별도 적용
    editorRef.current?.getModel()?.updateOptions({ tabSize: editorSettings.tabSize });
    splitEditorRef.current?.getModel()?.updateOptions({ tabSize: editorSettings.tabSize });
    // 설정 변경 후 포커스가 에디터로 빼앗기지 않도록 복원
    if (activeElement && activeElement instanceof HTMLElement && !activeElement.closest(".monaco-editor")) {
      requestAnimationFrame(() => activeElement.focus());
    }
  }, [editorSettings]);

  // 테마 또는 커스텀 컬러 변경 시 Monaco 전역 테마 재정의 + 적용 (포커스 유지)
  useEffect(() => {
    if (!editorSettings?.theme || !monacoRef.current) return;
    const activeElement = document.activeElement;
    const themeId = editorSettings.theme;
    const preset = EDITOR_THEME_PRESETS[themeId];
    if (!preset) return;
    const monaco = monacoRef.current;
    const cc = editorSettings.customColors || {};
    const mergedColors = { ...preset.colors, ...Object.fromEntries(Object.entries(cc).filter(([, v]) => v)) };
    // 커스텀 컬러가 병합된 테마 재정의
    if (Object.keys(mergedColors).length > 0) {
      monaco.editor.defineTheme(themeId, {
        base: preset.base,
        inherit: true,
        rules: [],
        colors: mergedColors,
      });
    }
    monaco.editor.setTheme(themeId);
    if (activeElement && activeElement instanceof HTMLElement && !activeElement.closest(".monaco-editor")) {
      requestAnimationFrame(() => activeElement.focus());
    }
  }, [editorSettings?.theme, editorSettings?.customColors]);

  // 에디터 렌더링 헬퍼
  const renderEditor = (
    tab: EditorTab | null,
    onMount: OnMount,
    onChange: (v: string | undefined) => void,
    placeholder: string
  ) => {
    if (!tab) {
      return (
        <div className="h-full flex items-center justify-center text-[#52525b]">
          <div className="text-center">
            <div className="text-3xl mb-2 opacity-30">{`</>`}</div>
            <p className="text-xs">{placeholder}</p>
          </div>
        </div>
      );
    }

    const s = editorSettings;
    return (
      <Editor
        theme={s?.theme || "vs-dark"}
        language={tab.language}
        value={tab.content}
        onChange={onChange}
        onMount={onMount}
        beforeMount={(monaco) => registerThemes(monaco)}
        options={{
          fontSize: s?.fontSize ?? 13,
          fontFamily: s?.fontFamily ?? "'JetBrains Mono', monospace",
          lineHeight: s ? Math.round(s.fontSize * s.lineHeight) : undefined,
          minimap: { enabled: s?.minimap ?? false },
          scrollBeyondLastLine: false,
          wordWrap: s?.wordWrap ?? "on",
          automaticLayout: true,
          tabSize: s?.tabSize ?? 2,
          renderLineHighlight: s?.renderLineHighlight ?? "line",
          smoothScrolling: true,
          padding: { top: 8 },
        }}
      />
    );
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

  // 파일 트리에서 Tail Log 선택 시
  const handleTailLog = useCallback((path: string) => {
    setLogFilePath(path);
    if (!logExpanded) {
      setLogExpanded(true);
      persistEditorLayout({ logExpanded: true, logFilePath: path });
    } else {
      persistEditorLayout({ logFilePath: path });
    }
  }, [logExpanded, persistEditorLayout]);

  // 외부 파일 열기 요청 감지 (Sidebar FileTree → App → EditorPanel)
  const lastFileOpenTs = useRef(0);
  useEffect(() => {
    if (!fileOpenRequest || fileOpenRequest.ts <= lastFileOpenTs.current) return;
    lastFileOpenTs.current = fileOpenRequest.ts;
    openFile(fileOpenRequest.path, fileOpenRequest.filename);
  }, [fileOpenRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  // 외부 Tail Log 요청 감지
  const lastTailLogTs = useRef(0);
  useEffect(() => {
    if (!tailLogRequest || tailLogRequest.ts <= lastTailLogTs.current) return;
    lastTailLogTs.current = tailLogRequest.ts;
    handleTailLog(tailLogRequest.path);
  }, [tailLogRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  // LogViewer에서 경로 변경 시 레이아웃 저장
  const handleLogPathChange = useCallback((path: string) => {
    setLogFilePath(path);
    persistEditorLayout({ logFilePath: path });
  }, [persistEditorLayout]);

  return (
    <div className="flex flex-col h-full bg-[#09090b] relative">
      {/* 탭 바 */}
      <div className="flex items-center bg-[#18181b] border-b border-[#3f3f46] shrink-0 overflow-x-auto">
        {/* 에디터 탭들 */}
        {tabs.map((tab) => {
          const isDirty = tab.content !== tab.savedContent;
          const isActive = tab.id === activeTabId;
          const isSplit = viewMode === "split" && tab.id === splitTabId;
          return (
            <div
              key={tab.id}
              className={`flex items-center gap-1 px-3 py-1.5 text-[15px] cursor-pointer border-r border-[#3f3f46] shrink-0 transition-colors ${
                isActive
                  ? "bg-[#09090b] text-[#f4f4f5]"
                  : isSplit
                  ? "bg-[#09090b]/70 text-[#e4e4e7]"
                  : "text-[#52525b] hover:text-[#a1a1aa] hover:bg-[#09090b]/50"
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
                {isDirty && <span className="text-[#f59e0b] mr-0.5">●</span>}
                {isSplit && <span className="text-[#3b82f6] mr-0.5 text-[9px]">▼</span>}
                {tab.filename}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="text-[15px] text-[#71717a] hover:text-[#ef4444] hover:bg-[#ef4444]/10 rounded px-0.5 transition-colors ml-1"
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
              className={`px-2 text-[15px] ${
                saveStatus === "saving"
                  ? "text-[#f59e0b]"
                  : saveStatus === "saved"
                  ? "text-[#10b981]"
                  : "text-[#ef4444]"
              }`}
            >
              {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : "Save failed"}
            </span>
          )}

          {tabs.length >= 2 && (
            <button
              onClick={toggleViewMode}
              className={`px-2 py-1 text-[15px] font-medium transition-colors ${
                viewMode === "split"
                  ? "text-[#3b82f6]"
                  : "text-[#52525b] hover:text-[#a1a1aa]"
              }`}
              title={viewMode === "split" ? "Single view" : "Split view"}
            >
              {viewMode === "split" ? "⬒" : "⬜"}
            </button>
          )}

          <button
            onClick={onOpenFileTree}
            className="px-2 py-1 text-[12px] text-[#52525b] hover:text-[#a1a1aa] transition-colors"
            title="Open file tree"
          >
            Files
          </button>
          <button
            onClick={toggleLog}
            className={`px-2 py-1 text-[12px] transition-colors ${
              logExpanded
                ? "text-[#3b82f6]"
                : "text-[#52525b] hover:text-[#a1a1aa]"
            }`}
            title={logExpanded ? "Hide log viewer" : "Show log viewer"}
          >
            Log
          </button>
        </div>
      </div>

      {/* 메인: 에디터 + 로그 */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="vertical">
          {/* 에디터 영역 */}
              <Panel minSize={20}>
                {viewMode === "split" ? (
                  <PanelGroup direction="vertical">
                    <Panel minSize={20}>
                      {renderEditor(activeTab, handleEditorMount, handleEditorChange, "Select a file to edit")}
                    </Panel>
                    <PanelResizeHandle className="group relative h-0.5 hover:h-1 bg-[#3f3f46] hover:bg-[#3b82f6] transition-all cursor-row-resize">
                      <div className="absolute inset-x-0 -top-1 -bottom-1" />
                    </PanelResizeHandle>
                    <Panel minSize={20}>
                      <div className="flex flex-col h-full">
                        {tabs.length > 1 && (
                          <div className="flex items-center bg-[#27272a] border-b border-[#3f3f46] shrink-0 overflow-x-auto">
                            {tabs.map((tab) => (
                              <button
                                key={tab.id}
                                onClick={() => setSplitTabId(tab.id)}
                                className={`px-2 py-0.5 text-xs border-r border-[#3f3f46] transition-colors ${
                                  tab.id === splitTabId
                                    ? "text-[#f4f4f5] bg-[#09090b]"
                                    : "text-[#52525b] hover:text-[#a1a1aa]"
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
                  <PanelResizeHandle className="group relative h-0.5 hover:h-1 bg-[#3f3f46] hover:bg-[#3b82f6] transition-all cursor-row-resize">
                    <div className="absolute inset-x-0 -top-1 -bottom-1" />
                  </PanelResizeHandle>
                  <Panel defaultSize={initialLayout?.logPanelSize ?? 30} minSize={15} maxSize={60}>
                    <LogViewer
                      connectionId={connectionId}
                      logFilePath={logFilePath}
                      onLogPathChange={handleLogPathChange}
                      terminalTheme={terminalTheme}
                    />
                  </Panel>
                </>
              )}
        </PanelGroup>
      </div>

      {/* 파일 변경 감지 배너 알림 */}
      {reloadMessage && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50 px-5 py-2 bg-[#3b82f6] text-[#09090b] rounded-md shadow-lg text-sm font-medium pointer-events-none animate-bounce">
          ↻ {reloadMessage}
        </div>
      )}
    </div>
  );
}
