import { useState, useCallback } from "react";
import type { EditorSettings } from "../types";

// Monaco 기본 제공 테마 + 커스텀 테마
export const EDITOR_THEME_PRESETS: Record<string, { label: string; base: "vs-dark" | "vs" | "hc-black"; colors: Record<string, string> }> = {
  "ivansterm-pure-black": {
    label: "Pure Black",
    base: "vs-dark",
    colors: {
      "editor.background": "#000000",
      "editor.foreground": "#ffffff",
      "editor.lineHighlightBackground": "#1a1a1a",
      "editor.selectionBackground": "#333333",
      "editorCursor.foreground": "#ffffff",
      "editorLineNumber.foreground": "#555555",
      "editorLineNumber.activeForeground": "#ffffff",
    },
  },
  "ivansterm-catppuccin": {
    label: "Catppuccin Mocha",
    base: "vs-dark",
    colors: {
      "editor.background": "#1e1e2e",
      "editor.foreground": "#cdd6f4",
      "editor.lineHighlightBackground": "#313244",
      "editor.selectionBackground": "#585b70",
      "editorCursor.foreground": "#f5e0dc",
      "editorLineNumber.foreground": "#585b70",
      "editorLineNumber.activeForeground": "#cdd6f4",
    },
  },
  "ivansterm-dracula": {
    label: "Dracula",
    base: "vs-dark",
    colors: {
      "editor.background": "#282a36",
      "editor.foreground": "#f8f8f2",
      "editor.lineHighlightBackground": "#44475a",
      "editor.selectionBackground": "#44475a",
      "editorCursor.foreground": "#f8f8f2",
      "editorLineNumber.foreground": "#6272a4",
      "editorLineNumber.activeForeground": "#f8f8f2",
    },
  },
  "ivansterm-one-dark": {
    label: "One Dark",
    base: "vs-dark",
    colors: {
      "editor.background": "#282c34",
      "editor.foreground": "#abb2bf",
      "editor.lineHighlightBackground": "#2c313c",
      "editor.selectionBackground": "#3e4451",
      "editorCursor.foreground": "#528bff",
      "editorLineNumber.foreground": "#495162",
      "editorLineNumber.activeForeground": "#abb2bf",
    },
  },
  "ivansterm-solarized": {
    label: "Solarized Dark",
    base: "vs-dark",
    colors: {
      "editor.background": "#002b36",
      "editor.foreground": "#839496",
      "editor.lineHighlightBackground": "#073642",
      "editor.selectionBackground": "#073642",
      "editorCursor.foreground": "#93a1a1",
      "editorLineNumber.foreground": "#586e75",
      "editorLineNumber.activeForeground": "#93a1a1",
    },
  },
  "ivansterm-nord": {
    label: "Nord",
    base: "vs-dark",
    colors: {
      "editor.background": "#2e3440",
      "editor.foreground": "#d8dee9",
      "editor.lineHighlightBackground": "#3b4252",
      "editor.selectionBackground": "#434c5e",
      "editorCursor.foreground": "#d8dee9",
      "editorLineNumber.foreground": "#4c566a",
      "editorLineNumber.activeForeground": "#d8dee9",
    },
  },
  "ivansterm-tokyo-night": {
    label: "Tokyo Night",
    base: "vs-dark",
    colors: {
      "editor.background": "#1a1b26",
      "editor.foreground": "#a9b1d6",
      "editor.lineHighlightBackground": "#292e42",
      "editor.selectionBackground": "#33467c",
      "editorCursor.foreground": "#c0caf5",
      "editorLineNumber.foreground": "#3b4261",
      "editorLineNumber.activeForeground": "#a9b1d6",
    },
  },
  "ivansterm-gruvbox": {
    label: "Gruvbox Dark",
    base: "vs-dark",
    colors: {
      "editor.background": "#282828",
      "editor.foreground": "#ebdbb2",
      "editor.lineHighlightBackground": "#3c3836",
      "editor.selectionBackground": "#504945",
      "editorCursor.foreground": "#ebdbb2",
      "editorLineNumber.foreground": "#665c54",
      "editorLineNumber.activeForeground": "#ebdbb2",
    },
  },
  "vs-dark": {
    label: "VS Dark (Default)",
    base: "vs-dark",
    colors: {},
  },
  "vs": {
    label: "VS Light",
    base: "vs",
    colors: {},
  },
  "hc-black": {
    label: "High Contrast",
    base: "hc-black",
    colors: {},
  },
};

export const EDITOR_FONT_OPTIONS = [
  "'JetBrains Mono', monospace",
  "'Fira Code', monospace",
  "'Cascadia Code', monospace",
  "'Source Code Pro', monospace",
  "'Ubuntu Mono', monospace",
  "'Courier New', monospace",
  "monospace",
];

const STORAGE_KEY = "ivansterm_editor_settings";

const DEFAULT_SETTINGS: EditorSettings = {
  fontSize: 13,
  fontFamily: "'JetBrains Mono', monospace",
  lineHeight: 1.4,
  tabSize: 2,
  wordWrap: "on",
  minimap: false,
  renderLineHighlight: "line",
  theme: "ivansterm-catppuccin",
  customColors: {},
};

function loadSettings(): EditorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

export function useEditorSettings() {
  const [settings, setSettings] = useState<EditorSettings>(loadSettings);

  const updateSettings = useCallback((patch: Partial<EditorSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  return { settings, updateSettings, resetSettings };
}
