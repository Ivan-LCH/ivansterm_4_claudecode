// 접속 정보
export interface ConnectionInfo {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_method: "password" | "key";
  private_key_path?: string;
  last_working_dir: string;
  service_url?: string;
}

export interface ConnectionCreate {
  name: string;
  host: string;
  port: number;
  username: string;
  auth_method: "password" | "key";
  password?: string;
  private_key_path?: string;
  last_working_dir: string;
  service_url?: string;
}

// 터미널 설정
export interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
}

export interface TerminalSettings {
  fontSize: number;
  fontFamily: string;
  cursorStyle: "block" | "underline" | "bar";
  cursorBlink: boolean;
  scrollback: number;
  lineHeight: number;
  padding: number;
  theme: TerminalTheme;
}

// 패널
export interface PanelInfo {
  id: string;
  type: "terminal" | "editor";
  connectionId?: number;
  title: string;
}

// 파일 트리 노드
export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  children?: FileNode[];
  expanded?: boolean;
  loading?: boolean;
}

// 에디터 커스텀 컬러
export interface EditorCustomColors {
  "editor.background"?: string;
  "editor.foreground"?: string;
  "editor.lineHighlightBackground"?: string;
  "editor.selectionBackground"?: string;
  "editorCursor.foreground"?: string;
  "editorLineNumber.foreground"?: string;
  "editorLineNumber.activeForeground"?: string;
}

// 에디터 설정
export interface EditorSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  tabSize: number;
  wordWrap: "on" | "off" | "wordWrapColumn";
  minimap: boolean;
  renderLineHighlight: "none" | "gutter" | "line" | "all";
  theme: string; // Monaco 테마 이름
  customColors: EditorCustomColors;
}

// 파일 전송 상태 (StatusBar 표시용)
export interface TransferStatus {
  fileName: string;
  direction: "upload" | "download";
  state: "progress" | "success" | "fail";
  fileSize?: number;
  /** 다중 파일 업로드 시 진행 카운트 */
  current?: number;
  total?: number;
}

// 에디터 탭
export interface EditorTab {
  id: string;
  filename: string;
  path: string;
  content: string;
  savedContent: string;
  language: string;
}
