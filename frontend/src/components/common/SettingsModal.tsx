import { useState } from "react";
import type { TerminalSettings } from "../../types";
import { THEME_PRESETS, FONT_OPTIONS } from "../../hooks/useTerminalSettings";

interface SettingsModalProps {
  settings: TerminalSettings;
  onUpdate: (patch: Partial<TerminalSettings>) => void;
  onReset: () => void;
  onClose: () => void;
}

export default function SettingsModal({ settings, onUpdate, onReset, onClose }: SettingsModalProps) {
  // 현재 선택된 프리셋 이름 찾기
  const currentPreset = Object.entries(THEME_PRESETS).find(
    ([, theme]) => theme.background === settings.theme.background && theme.foreground === settings.theme.foreground
  )?.[0] || "Custom";

  const [activeTab, setActiveTab] = useState<"font" | "cursor" | "theme">("theme");

  // 폰트 이름만 표시용으로 추출
  const fontDisplayName = (font: string) => font.replace(/'/g, "").split(",")[0].trim();

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[#1e1e2e] border border-[#313244] rounded-xl w-[520px] max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#313244]">
          <h2 className="text-[#cdd6f4] font-bold text-sm">Settings</h2>
          <button onClick={onClose} className="text-[#585b70] hover:text-[#f38ba8] transition-colors text-lg leading-none">&times;</button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-[#313244]">
          {(["theme", "font", "cursor"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-xs text-center transition-colors ${
                activeTab === tab
                  ? "text-[#cdd6f4] border-b-2 border-[#89b4fa]"
                  : "text-[#585b70] hover:text-[#a6adc8]"
              }`}
            >
              {tab === "theme" ? "Theme" : tab === "font" ? "Font" : "Cursor"}
            </button>
          ))}
        </div>

        {/* 내용 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === "theme" && (
            <>
              {/* 테마 프리셋 그리드 */}
              <label className="text-xs text-[#a6adc8] block mb-2">Theme Preset</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(THEME_PRESETS).map(([name, theme]) => (
                  <button
                    key={name}
                    onClick={() => onUpdate({ theme })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-left ${
                      currentPreset === name
                        ? "border-[#89b4fa] bg-[#313244]"
                        : "border-[#313244] hover:border-[#45475a]"
                    }`}
                  >
                    {/* 미니 프리뷰 */}
                    <div
                      className="w-8 h-8 rounded flex items-center justify-center text-[10px] font-mono shrink-0 border border-[#45475a]"
                      style={{ backgroundColor: theme.background, color: theme.foreground }}
                    >
                      Aa
                    </div>
                    <div>
                      <div className="text-xs text-[#cdd6f4]">{name}</div>
                      <div className="flex gap-0.5 mt-0.5">
                        {[theme.red, theme.green, theme.yellow, theme.blue, theme.magenta, theme.cyan].map((c, i) => (
                          <div key={i} className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* 터미널 여백 */}
              <div className="pt-2">
                <label className="text-xs text-[#a6adc8] block mb-1">
                  Terminal Padding: <span className="text-[#cdd6f4]">{settings.padding}px</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={24}
                  step={2}
                  value={settings.padding}
                  onChange={(e) => onUpdate({ padding: Number(e.target.value) })}
                  className="w-full accent-[#89b4fa]"
                />
                <div className="flex justify-between text-[10px] text-[#585b70]">
                  <span>0px</span><span>24px</span>
                </div>
              </div>

              {/* 스크롤백 */}
              <div>
                <label className="text-xs text-[#a6adc8] block mb-1">Scrollback Lines</label>
                <input
                  type="number"
                  min={100}
                  max={10000}
                  step={100}
                  value={settings.scrollback}
                  onChange={(e) => onUpdate({ scrollback: Number(e.target.value) || 1000 })}
                  className="w-full px-3 py-1.5 bg-[#313244] border border-[#45475a] rounded text-sm text-[#cdd6f4] focus:border-[#89b4fa] focus:outline-none"
                />
              </div>
            </>
          )}

          {activeTab === "font" && (
            <>
              {/* 폰트 종류 */}
              <div>
                <label className="text-xs text-[#a6adc8] block mb-1">Font Family</label>
                <div className="space-y-1">
                  {FONT_OPTIONS.map((font) => (
                    <button
                      key={font}
                      onClick={() => onUpdate({ fontFamily: font })}
                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                        settings.fontFamily === font
                          ? "bg-[#313244] text-[#cdd6f4] border border-[#89b4fa]"
                          : "text-[#a6adc8] hover:bg-[#313244]/50 border border-transparent"
                      }`}
                      style={{ fontFamily: font }}
                    >
                      {fontDisplayName(font)}
                      <span className="text-[#585b70] text-xs ml-2">— The quick brown fox jumps</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 폰트 크기 */}
              <div>
                <label className="text-xs text-[#a6adc8] block mb-1">
                  Font Size: <span className="text-[#cdd6f4]">{settings.fontSize}px</span>
                </label>
                <input
                  type="range"
                  min={10}
                  max={24}
                  step={1}
                  value={settings.fontSize}
                  onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
                  className="w-full accent-[#89b4fa]"
                />
                <div className="flex justify-between text-[10px] text-[#585b70]">
                  <span>10px</span><span>24px</span>
                </div>
              </div>

              {/* 줄 높이 */}
              <div>
                <label className="text-xs text-[#a6adc8] block mb-1">
                  Line Height: <span className="text-[#cdd6f4]">{settings.lineHeight.toFixed(1)}</span>
                </label>
                <input
                  type="range"
                  min={1.0}
                  max={2.0}
                  step={0.1}
                  value={settings.lineHeight}
                  onChange={(e) => onUpdate({ lineHeight: Number(e.target.value) })}
                  className="w-full accent-[#89b4fa]"
                />
                <div className="flex justify-between text-[10px] text-[#585b70]">
                  <span>1.0</span><span>2.0</span>
                </div>
              </div>
            </>
          )}

          {activeTab === "cursor" && (
            <>
              {/* 커서 스타일 */}
              <div>
                <label className="text-xs text-[#a6adc8] block mb-2">Cursor Style</label>
                <div className="flex gap-2">
                  {(["block", "underline", "bar"] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => onUpdate({ cursorStyle: style })}
                      className={`flex-1 py-2 rounded text-xs text-center transition-colors border ${
                        settings.cursorStyle === style
                          ? "border-[#89b4fa] bg-[#313244] text-[#cdd6f4]"
                          : "border-[#313244] text-[#585b70] hover:border-[#45475a]"
                      }`}
                    >
                      {/* 커서 시각적 표현 */}
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

              {/* 커서 깜빡임 */}
              <div className="flex items-center justify-between">
                <label className="text-xs text-[#a6adc8]">Cursor Blink</label>
                <button
                  onClick={() => onUpdate({ cursorBlink: !settings.cursorBlink })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    settings.cursorBlink ? "bg-[#89b4fa]" : "bg-[#45475a]"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                      settings.cursorBlink ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </>
          )}
        </div>

        {/* 미리보기 */}
        <div className="px-5 pb-3">
          <label className="text-[10px] text-[#585b70] block mb-1">Preview</label>
          <div
            className="rounded-lg p-3 font-mono text-xs border border-[#313244] overflow-hidden"
            style={{
              backgroundColor: settings.theme.background,
              color: settings.theme.foreground,
              fontFamily: settings.fontFamily,
              fontSize: `${Math.min(settings.fontSize, 14)}px`,
              lineHeight: settings.lineHeight,
            }}
          >
            <span style={{ color: settings.theme.green }}>user@server</span>
            <span style={{ color: settings.theme.foreground }}>:</span>
            <span style={{ color: settings.theme.blue }}>~/project</span>
            <span style={{ color: settings.theme.foreground }}>$ </span>
            <span style={{ color: settings.theme.yellow }}>ls -la</span>
            <br />
            <span style={{ color: settings.theme.cyan }}>drwxr-xr-x</span>
            {"  "}
            <span style={{ color: settings.theme.foreground }}>README.md  src/  package.json</span>
            <br />
            <span style={{ color: settings.theme.red }}>Error:</span>
            <span style={{ color: settings.theme.foreground }}> file not found</span>
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#313244]">
          <button
            onClick={onReset}
            className="text-xs text-[#585b70] hover:text-[#f38ba8] transition-colors"
          >
            Reset to Default
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs bg-[#89b4fa] text-[#1e1e2e] rounded hover:bg-[#74c7ec] transition-colors font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
