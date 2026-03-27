import { useState } from "react";
import type { TerminalSettings, EditorSettings, EditorCustomColors } from "../../types";
import { THEME_PRESETS, FONT_OPTIONS } from "../../hooks/useTerminalSettings";
import { EDITOR_THEME_PRESETS, EDITOR_FONT_OPTIONS } from "../../hooks/useEditorSettings";

interface SettingsModalProps {
  terminalSettings: TerminalSettings;
  editorSettings: EditorSettings;
  onUpdateTerminal: (patch: Partial<TerminalSettings>) => void;
  onUpdateEditor: (patch: Partial<EditorSettings>) => void;
  onResetTerminal: () => void;
  onResetEditor: () => void;
  onClose: () => void;
  isMarkdownFile?: boolean;
}

type Section = "terminal" | "editor";
type TerminalTab = "theme" | "font" | "cursor";
type EditorTab = "theme" | "font" | "options";

export default function SettingsModal({
  terminalSettings,
  editorSettings,
  onUpdateTerminal,
  onUpdateEditor,
  onResetTerminal,
  onResetEditor,
  onClose,
  isMarkdownFile = false,
}: SettingsModalProps) {
  const [section, setSection] = useState<Section>("terminal");
  const [termTab, setTermTab] = useState<TerminalTab>("theme");
  const [editorTab, setEditorTab] = useState<EditorTab>("theme");

  // 현재 선택된 터미널 테마 프리셋 이름
  const currentTermPreset = Object.entries(THEME_PRESETS).find(
    ([, theme]) => theme.background === terminalSettings.theme.background && theme.foreground === terminalSettings.theme.foreground
  )?.[0] || "Custom";

  // 폰트 이름만 표시용으로 추출
  const fontDisplayName = (font: string) => font.replace(/'/g, "").split(",")[0].trim();

  // 현재 에디터 테마의 배경색
  const currentEditorTheme = EDITOR_THEME_PRESETS[editorSettings.theme];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[#09090b] border border-[#3f3f46] rounded-xl w-[560px] max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#3f3f46]">
          <h2 className="text-[#f4f4f5] font-bold text-base">Settings</h2>
          <button onClick={onClose} className="text-[#52525b] hover:text-[#ef4444] transition-colors text-lg leading-none">&times;</button>
        </div>

        {/* 섹션 선택: Terminal / Editor */}
        <div className="flex border-b border-[#3f3f46]">
          {(["terminal", "editor"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`flex-1 py-2.5 text-xs font-medium text-center transition-colors ${
                section === s
                  ? "text-[#3b82f6] border-b-2 border-[#3b82f6] bg-[#18181b]"
                  : "text-[#52525b] hover:text-[#a1a1aa]"
              }`}
            >
              {s === "terminal" ? "Terminal" : "Editor"}
            </button>
          ))}
        </div>

        {/* ── Terminal 설정 ── */}
        {section === "terminal" && (
          <>
            {/* 서브 탭 */}
            <div className="flex border-b border-[#3f3f46]">
              {(["theme", "font", "cursor"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setTermTab(tab)}
                  className={`flex-1 py-2 text-xs text-center transition-colors ${
                    termTab === tab
                      ? "text-[#f4f4f5] border-b-2 border-[#3b82f6]"
                      : "text-[#52525b] hover:text-[#a1a1aa]"
                  }`}
                >
                  {tab === "theme" ? "Theme" : tab === "font" ? "Font" : "Cursor"}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {termTab === "theme" && (
                <>
                  <label className="text-xs text-[#a1a1aa] block mb-2">Theme Preset</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(THEME_PRESETS).map(([name, theme]) => (
                      <button
                        key={name}
                        onClick={() => onUpdateTerminal({ theme })}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-left ${
                          currentTermPreset === name
                            ? "border-[#3b82f6] bg-[#3f3f46]"
                            : "border-[#3f3f46] hover:border-[#3f3f46]"
                        }`}
                      >
                        <div
                          className="w-8 h-8 rounded flex items-center justify-center text-[10px] font-mono shrink-0 border border-[#3f3f46]"
                          style={{ backgroundColor: theme.background, color: theme.foreground }}
                        >
                          Aa
                        </div>
                        <div>
                          <div className="text-xs text-[#f4f4f5]">{name}</div>
                          <div className="flex gap-0.5 mt-0.5">
                            {[theme.red, theme.green, theme.yellow, theme.blue, theme.magenta, theme.cyan].map((c, i) => (
                              <div key={i} className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c }} />
                            ))}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* 커스텀 색상 편집 */}
                  <div className="pt-2 border-t border-[#3f3f46]">
                    <label className="text-xs text-[#a1a1aa] block mb-2">Custom Colors</label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ["background", "Background"],
                        ["foreground", "Foreground"],
                        ["cursor", "Cursor"],
                        ["selectionBackground", "Selection"],
                        ["black", "Black"],
                        ["red", "Red"],
                        ["green", "Green"],
                        ["yellow", "Yellow"],
                        ["blue", "Blue"],
                        ["magenta", "Magenta"],
                        ["cyan", "Cyan"],
                        ["white", "White"],
                      ] as const).map(([key, label]) => (
                        <div key={key} className="flex items-center gap-2">
                          <input
                            type="color"
                            value={terminalSettings.theme[key as keyof typeof terminalSettings.theme] || "#000000"}
                            onChange={(e) => onUpdateTerminal({ theme: { ...terminalSettings.theme, [key]: e.target.value } })}
                            className="w-6 h-6 rounded border border-[#3f3f46] cursor-pointer bg-transparent shrink-0"
                          />
                          <span className="text-[11px] text-[#a1a1aa]">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="text-xs text-[#a1a1aa] block mb-1">
                      Terminal Padding: <span className="text-[#f4f4f5]">{terminalSettings.padding}px</span>
                    </label>
                    <input
                      type="range" min={0} max={24} step={2}
                      value={terminalSettings.padding}
                      onChange={(e) => onUpdateTerminal({ padding: Number(e.target.value) })}
                      className="w-full accent-[#3b82f6]"
                    />
                    <div className="flex justify-between text-[10px] text-[#52525b]">
                      <span>0px</span><span>24px</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-[#a1a1aa] block mb-1">Scrollback Lines</label>
                    <input
                      type="number" min={100} max={10000} step={100}
                      value={terminalSettings.scrollback}
                      onChange={(e) => onUpdateTerminal({ scrollback: Number(e.target.value) || 1000 })}
                      className="w-full px-3 py-1.5 bg-[#3f3f46] border border-[#3f3f46] rounded text-sm text-[#f4f4f5] focus:border-[#3b82f6] focus:outline-none"
                    />
                  </div>
                </>
              )}

              {termTab === "font" && (
                <>
                  <div>
                    <label className="text-xs text-[#a1a1aa] block mb-1">Font Family</label>
                    <div className="space-y-1">
                      {FONT_OPTIONS.map((font) => (
                        <button
                          key={font}
                          onClick={() => onUpdateTerminal({ fontFamily: font })}
                          className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                            terminalSettings.fontFamily === font
                              ? "bg-[#3f3f46] text-[#f4f4f5] border border-[#3b82f6]"
                              : "text-[#a1a1aa] hover:bg-[#3f3f46]/50 border border-transparent"
                          }`}
                          style={{ fontFamily: font }}
                        >
                          {fontDisplayName(font)}
                          <span className="text-[#52525b] text-xs ml-2">— The quick brown fox jumps</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-[#a1a1aa] block mb-1">
                      Font Size: <span className="text-[#f4f4f5]">{terminalSettings.fontSize}px</span>
                    </label>
                    <input
                      type="range" min={10} max={24} step={1}
                      value={terminalSettings.fontSize}
                      onChange={(e) => onUpdateTerminal({ fontSize: Number(e.target.value) })}
                      className="w-full accent-[#3b82f6]"
                    />
                    <div className="flex justify-between text-[10px] text-[#52525b]">
                      <span>10px</span><span>24px</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-[#a1a1aa] block mb-1">
                      Line Height: <span className="text-[#f4f4f5]">{terminalSettings.lineHeight.toFixed(1)}</span>
                    </label>
                    <input
                      type="range" min={1.0} max={2.0} step={0.1}
                      value={terminalSettings.lineHeight}
                      onChange={(e) => onUpdateTerminal({ lineHeight: Number(e.target.value) })}
                      className="w-full accent-[#3b82f6]"
                    />
                    <div className="flex justify-between text-[10px] text-[#52525b]">
                      <span>1.0</span><span>2.0</span>
                    </div>
                  </div>
                </>
              )}

              {termTab === "cursor" && (
                <>
                  <div>
                    <label className="text-xs text-[#a1a1aa] block mb-2">Cursor Style</label>
                    <div className="flex gap-2">
                      {(["block", "underline", "bar"] as const).map((style) => (
                        <button
                          key={style}
                          onClick={() => onUpdateTerminal({ cursorStyle: style })}
                          className={`flex-1 py-2 rounded text-xs text-center transition-colors border ${
                            terminalSettings.cursorStyle === style
                              ? "border-[#3b82f6] bg-[#3f3f46] text-[#f4f4f5]"
                              : "border-[#3f3f46] text-[#52525b] hover:border-[#3f3f46]"
                          }`}
                        >
                          <div className="flex items-end justify-center h-5 mb-1">
                            {style === "block" && <div className="w-3 h-4 bg-current" />}
                            {style === "underline" && <div className="w-3 h-0.5 bg-current" />}
                            {style === "bar" && <div className="w-0.5 h-4 bg-current" />}
                          </div>
                          {style.charAt(0).toUpperCase() + style.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-xs text-[#a1a1aa]">Cursor Blink</label>
                    <button
                      onClick={() => onUpdateTerminal({ cursorBlink: !terminalSettings.cursorBlink })}
                      className={`w-10 h-5 rounded-full transition-colors relative ${
                        terminalSettings.cursorBlink ? "bg-[#3b82f6]" : "bg-[#3f3f46]"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                          terminalSettings.cursorBlink ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* 터미널 미리보기 */}
            <div className="px-5 pb-3">
              <label className="text-[10px] text-[#52525b] block mb-1">Preview</label>
              <div
                className="rounded-lg p-3 font-mono text-xs border border-[#3f3f46] overflow-hidden"
                style={{
                  backgroundColor: terminalSettings.theme.background,
                  color: terminalSettings.theme.foreground,
                  fontFamily: terminalSettings.fontFamily,
                  fontSize: `${Math.min(terminalSettings.fontSize, 14)}px`,
                  lineHeight: terminalSettings.lineHeight,
                }}
              >
                <span style={{ color: terminalSettings.theme.green }}>user@server</span>
                <span style={{ color: terminalSettings.theme.foreground }}>:</span>
                <span style={{ color: terminalSettings.theme.blue }}>~/project</span>
                <span style={{ color: terminalSettings.theme.foreground }}>$ </span>
                <span style={{ color: terminalSettings.theme.yellow }}>ls -la</span>
                <br />
                <span style={{ color: terminalSettings.theme.cyan }}>drwxr-xr-x</span>
                {"  "}
                <span style={{ color: terminalSettings.theme.foreground }}>README.md  src/  package.json</span>
                <br />
                <span style={{ color: terminalSettings.theme.red }}>Error:</span>
                <span style={{ color: terminalSettings.theme.foreground }}> file not found</span>
              </div>
            </div>

            {/* 하단 버튼 */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-[#3f3f46]">
              <button onClick={onResetTerminal} className="text-xs text-[#71717a] hover:text-[#ef4444] transition-colors">
                Reset Terminal
              </button>
              <button onClick={onClose} className="px-4 py-1.5 text-xs bg-[#3b82f6] text-[#09090b] rounded hover:bg-[#74c7ec] transition-colors font-medium">
                Done
              </button>
            </div>
          </>
        )}

        {/* ── Editor 설정 ── */}
        {section === "editor" && (
          <>
            {isMarkdownFile ? (
              <>
                <div className="flex-1 flex items-center justify-center p-8">
                  <div className="text-center">
                    <div className="text-4xl mb-3 opacity-40">📄</div>
                    <p className="text-sm text-[#a1a1aa] mb-2">Markdown 파일</p>
                    <p className="text-xs text-[#52525b]">이 파일은 기본 스타일로만 표시됩니다.</p>
                    <p className="text-xs text-[#52525b]">설정이 적용되지 않습니다.</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* 서브 탭 */}
                <div className="flex border-b border-[#3f3f46]">
                  {(["theme", "font", "options"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setEditorTab(tab)}
                      className={`flex-1 py-2 text-[11px] text-center transition-colors ${
                        editorTab === tab
                          ? "text-[#f4f4f5] border-b-2 border-[#3b82f6]"
                          : "text-[#52525b] hover:text-[#a1a1aa]"
                      }`}
                    >
                      {tab === "theme" ? "Theme" : tab === "font" ? "Font" : "Options"}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {editorTab === "theme" && (
                <>
                  <label className="text-xs text-[#a1a1aa] block mb-2">Editor Theme</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(EDITOR_THEME_PRESETS).map(([id, preset]) => (
                      <button
                        key={id}
                        onClick={() => onUpdateEditor({ theme: id })}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-left ${
                          editorSettings.theme === id
                            ? "border-[#3b82f6] bg-[#3f3f46]"
                            : "border-[#3f3f46] hover:border-[#3f3f46]"
                        }`}
                      >
                        <div
                          className="w-10 h-8 rounded flex items-center justify-center text-[9px] font-mono shrink-0 border border-[#3f3f46]"
                          style={{
                            backgroundColor: preset.colors["editor.background"] || (preset.base === "vs" ? "#ffffff" : preset.base === "hc-black" ? "#000000" : "#1e1e1e"),
                            color: preset.colors["editor.foreground"] || (preset.base === "vs" ? "#000000" : "#d4d4d4"),
                          }}
                        >
                          {"</>"}
                        </div>
                        <div className="text-xs text-[#f4f4f5] leading-tight">{preset.label}</div>
                      </button>
                    ))}
                  </div>

                  {/* 커스텀 색상 편집 */}
                  <div className="pt-2 border-t border-[#3f3f46]">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-[#a1a1aa]">Custom Colors</label>
                      {Object.values(editorSettings.customColors).some(Boolean) && (
                        <button
                          onClick={() => onUpdateEditor({ customColors: {} })}
                          className="text-xs text-[#71717a] hover:text-[#ef4444] transition-colors"
                        >
                          Reset Colors
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ["editor.background", "Background"],
                        ["editor.foreground", "Foreground"],
                        ["editorCursor.foreground", "Cursor"],
                        ["editor.selectionBackground", "Selection"],
                        ["editor.lineHighlightBackground", "Line Highlight"],
                        ["editorLineNumber.foreground", "Line Number"],
                        ["editorLineNumber.activeForeground", "Active Line No."],
                      ] as [keyof EditorCustomColors, string][]).map(([key, label]) => {
                        const presetColor = currentEditorTheme?.colors[key] || "";
                        const customVal = editorSettings.customColors[key];
                        const displayVal = customVal || presetColor || (
                          key === "editor.background"
                            ? (currentEditorTheme?.base === "vs" ? "#ffffff" : currentEditorTheme?.base === "hc-black" ? "#000000" : "#1e1e1e")
                            : key === "editor.foreground"
                            ? (currentEditorTheme?.base === "vs" ? "#000000" : "#d4d4d4")
                            : "#888888"
                        );
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <input
                              type="color"
                              value={displayVal}
                              onChange={(e) =>
                                onUpdateEditor({
                                  customColors: { ...editorSettings.customColors, [key]: e.target.value },
                                })
                              }
                              className="w-6 h-6 rounded border border-[#3f3f46] cursor-pointer bg-transparent shrink-0"
                            />
                            <span className={`text-[11px] ${customVal ? "text-[#f4f4f5]" : "text-[#a1a1aa]"}`}>
                              {label}
                              {customVal && <span className="text-[#3b82f6] ml-0.5">*</span>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {editorTab === "font" && (
                <>
                  <div>
                    <label className="text-xs text-[#a1a1aa] block mb-1">Font Family</label>
                    <div className="space-y-1">
                      {EDITOR_FONT_OPTIONS.map((font) => (
                        <button
                          key={font}
                          onClick={() => onUpdateEditor({ fontFamily: font })}
                          className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                            editorSettings.fontFamily === font
                              ? "bg-[#3f3f46] text-[#f4f4f5] border border-[#3b82f6]"
                              : "text-[#a1a1aa] hover:bg-[#3f3f46]/50 border border-transparent"
                          }`}
                          style={{ fontFamily: font }}
                        >
                          {fontDisplayName(font)}
                          <span className="text-[#52525b] text-xs ml-2">— function hello() {"{"} return 42; {"}"}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-[#a1a1aa] block mb-1">
                      Font Size: <span className="text-[#f4f4f5]">{editorSettings.fontSize}px</span>
                    </label>
                    <input
                      type="range" min={10} max={24} step={1}
                      value={editorSettings.fontSize}
                      onChange={(e) => onUpdateEditor({ fontSize: Number(e.target.value) })}
                      className="w-full accent-[#3b82f6]"
                    />
                    <div className="flex justify-between text-[10px] text-[#52525b]">
                      <span>10px</span><span>24px</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-[#a1a1aa] block mb-1">
                      Line Height: <span className="text-[#f4f4f5]">{editorSettings.lineHeight.toFixed(1)}</span>
                    </label>
                    <input
                      type="range" min={1.0} max={2.5} step={0.1}
                      value={editorSettings.lineHeight}
                      onChange={(e) => onUpdateEditor({ lineHeight: Number(e.target.value) })}
                      className="w-full accent-[#3b82f6]"
                    />
                    <div className="flex justify-between text-[10px] text-[#52525b]">
                      <span>1.0</span><span>2.5</span>
                    </div>
                  </div>
                </>
              )}

              {editorTab === "options" && (
                <>
                  <div>
                    <label className="text-xs text-[#a1a1aa] block mb-1">Tab Size</label>
                    <div className="flex gap-2">
                      {[2, 4, 8].map((size) => (
                        <button
                          key={size}
                          onClick={() => onUpdateEditor({ tabSize: size })}
                          className={`flex-1 py-2 rounded text-xs text-center transition-colors border ${
                            editorSettings.tabSize === size
                              ? "border-[#3b82f6] bg-[#3f3f46] text-[#f4f4f5]"
                              : "border-[#3f3f46] text-[#52525b] hover:border-[#3f3f46]"
                          }`}
                        >
                          {size} spaces
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-[#a1a1aa] block mb-1">Word Wrap</label>
                    <div className="flex gap-2">
                      {(["on", "off"] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => onUpdateEditor({ wordWrap: mode })}
                          className={`flex-1 py-2 rounded text-xs text-center transition-colors border ${
                            editorSettings.wordWrap === mode
                              ? "border-[#3b82f6] bg-[#3f3f46] text-[#f4f4f5]"
                              : "border-[#3f3f46] text-[#52525b] hover:border-[#3f3f46]"
                          }`}
                        >
                          {mode === "on" ? "On" : "Off"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-xs text-[#a1a1aa]">Minimap</label>
                    <button
                      onClick={() => onUpdateEditor({ minimap: !editorSettings.minimap })}
                      className={`w-10 h-5 rounded-full transition-colors relative ${
                        editorSettings.minimap ? "bg-[#3b82f6]" : "bg-[#3f3f46]"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                          editorSettings.minimap ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  <div>
                    <label className="text-xs text-[#a1a1aa] block mb-1">Line Highlight</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["none", "gutter", "line", "all"] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => onUpdateEditor({ renderLineHighlight: mode })}
                          className={`py-1.5 rounded text-xs text-center transition-colors border ${
                            editorSettings.renderLineHighlight === mode
                              ? "border-[#3b82f6] bg-[#3f3f46] text-[#f4f4f5]"
                              : "border-[#3f3f46] text-[#52525b] hover:border-[#3f3f46]"
                          }`}
                        >
                          {mode.charAt(0).toUpperCase() + mode.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

                {/* 에디터 미리보기 */}
                <div className="px-5 pb-3">
                  <label className="text-[10px] text-[#52525b] block mb-1">Preview</label>
                  {(() => {
                    const cc = editorSettings.customColors;
                    const previewBg = cc["editor.background"] || currentEditorTheme?.colors["editor.background"] || (currentEditorTheme?.base === "vs" ? "#ffffff" : "#1e1e1e");
                    const previewFg = cc["editor.foreground"] || currentEditorTheme?.colors["editor.foreground"] || (currentEditorTheme?.base === "vs" ? "#000000" : "#d4d4d4");
                    const previewLineNum = cc["editorLineNumber.foreground"] || currentEditorTheme?.colors["editorLineNumber.foreground"] || (currentEditorTheme?.base === "vs" ? "#999999" : "#858585");
                    const previewLineHl = cc["editor.lineHighlightBackground"] || currentEditorTheme?.colors["editor.lineHighlightBackground"];
                    const isLight = currentEditorTheme?.base === "vs";
                    return (
                      <div
                        className="rounded-lg p-3 font-mono text-xs border border-[#3f3f46] overflow-hidden"
                        style={{
                          backgroundColor: previewBg,
                          color: previewFg,
                          fontFamily: editorSettings.fontFamily,
                          fontSize: `${Math.min(editorSettings.fontSize, 14)}px`,
                          lineHeight: editorSettings.lineHeight,
                        }}
                      >
                        <span style={{ color: previewLineNum }}>1</span>{"  "}
                        <span style={{ color: isLight ? "#0000ff" : "#569cd6" }}>function</span>{" "}
                        <span style={{ color: isLight ? "#795e26" : "#dcdcaa" }}>greet</span>
                        {"(name) {"}
                        <br />
                        <div style={{ backgroundColor: previewLineHl, margin: "0 -12px", padding: "0 12px", display: "inline-block", width: "calc(100% + 24px)" }}>
                          <span style={{ color: previewLineNum }}>2</span>{"    "}
                          <span style={{ color: isLight ? "#0000ff" : "#c586c0" }}>return</span>{" "}
                          <span style={{ color: isLight ? "#a31515" : "#ce9178" }}>{"`Hello, ${name}!`"}</span>
                        </div>
                        <span style={{ color: previewLineNum }}>3</span>{"  }{"}
                      </div>
                    );
                  })()}
                </div>

                {/* 하단 버튼 */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-[#3f3f46]">
                  <button onClick={onResetEditor} className="text-xs text-[#71717a] hover:text-[#ef4444] transition-colors">
                    Reset Editor
                  </button>
                  <button onClick={onClose} className="px-4 py-1.5 text-xs bg-[#3b82f6] text-[#09090b] rounded hover:bg-[#74c7ec] transition-colors font-medium">
                    Done
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
