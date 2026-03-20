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

// 에디터 탭
export interface EditorTab {
  id: string;
  filename: string;
  path: string;
  content: string;
  savedContent: string;
  language: string;
}
