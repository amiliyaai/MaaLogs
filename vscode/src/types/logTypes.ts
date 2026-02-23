export type LogLine = {
  timestamp: string;
  level: "DBG" | "INF" | "TRC" | "WRN" | "ERR";
  processId: string;
  threadId: string;
  sourceFile?: string;
  lineNumber?: string;
  functionName?: string;
  message: string;
  params: Record<string, unknown>;
  status?: "enter" | "leave";
  duration?: number;
  _lineNumber?: number;
};

export type EventNotification = {
  timestamp: string;
  level: string;
  message: string;
  details: Record<string, unknown>;
  fileName: string;
  processId: string;
  threadId: string;
  _lineNumber?: number;
};

export type AuxLogEntry = {
  key: string;
  source: string;
  timestamp: string;
  timestampMs?: number;
  level: string;
  message: string;
  identifier?: string;
  task_id?: number;
  entry?: string;
  caller?: string;
  details?: Record<string, unknown>;
  correlation?: {
    status: "matched" | "unmatched" | "failed";
    reason?: string;
    taskKey?: string;
    taskKeys?: string[];
    nodeId?: number;
    score?: number;
    keys?: string[];
    driftMs?: number;
  };
  fileName: string;
  lineNumber: number;
};

export type PipelineCustomActionInfo = {
  name: string;
  fileName: string;
};

export type NextListItem = {
  name: string;
  anchor: boolean;
  jump_back: boolean;
};

export type RecognitionAttempt = {
  reco_id: number;
  name: string;
  timestamp: string;
  status: "success" | "failed";
  reco_details?: RecognitionDetail;
  nested_nodes?: RecognitionAttempt[];
};

export type ActionAttempt = {
  action_id: number;
  name: string;
  timestamp: string;
  status: "success" | "failed";
  action_details?: ActionDetail;
  nested_actions?: ActionAttempt[];
};

export type NodeInfo = {
  node_id: number;
  name: string;
  timestamp: string;
  status: "success" | "failed";
  task_id: number;
  reco_details?: RecognitionDetail;
  action_details?: ActionDetail;
  focus?: unknown;
  next_list: NextListItem[];
  recognition_attempts: RecognitionAttempt[];
  nested_action_nodes?: ActionAttempt[];
  nested_recognition_in_action?: RecognitionAttempt[];
  node_details?: {
    action_id: number;
    completed: boolean;
    name: string;
    node_id: number;
    reco_id: number;
  };
};

export type RecognitionDetail = {
  reco_id: number;
  algorithm: string;
  box: [number, number, number, number] | null;
  detail: unknown;
  name: string;
};

export type ActionDetail = {
  action_id: number;
  action: string;
  box: [number, number, number, number];
  detail: unknown;
  name: string;
  success: boolean;
};

export type RawLine = {
  fileName: string;
  lineNumber: number;
  line: string;
};

export type SearchResult = {
  fileName: string;
  lineNumber: number;
  line: string;
  rawLine: string;
  matchStart: number;
  matchEnd: number;
  key: string;
};

export type NodeStat = {
  name: string;
  count: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  successCount: number;
  failCount: number;
  successRate: number;
};

export type TaskInfo = {
  key: string;
  fileName: string;
  task_id: number;
  entry: string;
  hash: string;
  uuid: string;
  start_time: string;
  end_time?: string;
  status: "running" | "succeeded" | "failed";
  nodes: NodeInfo[];
  processId: string;
  threadId: string;
  duration?: number;
  identifier?: string;
  controllerInfo?: ControllerInfo;
  _startEventIndex?: number;
  _endEventIndex?: number;
};

export type ControllerType = "adb" | "win32" | "unknown";

export type AdbScreencapMethod =
  | "EncodeToFileAndPull"
  | "Encode"
  | "RawWithGzip"
  | "RawByNetcat"
  | "MinicapDirect"
  | "MinicapStream"
  | "EmulatorExtras"
  | "Unknown";

export type AdbInputMethod =
  | "AdbShell"
  | "MinitouchAndAdbKey"
  | "Maatouch"
  | "EmulatorExtras"
  | "Unknown";

export type Win32ScreencapMethod =
  | "FramePool"
  | "PrintWindow"
  | "GDI"
  | "DXGI_DesktopDup_Window"
  | "ScreenDC"
  | "DXGI_DesktopDup"
  | "Unknown";

export type Win32InputMethod =
  | "Seize"
  | "SendMessage"
  | "PostMessage"
  | "LegacyEvent"
  | "PostThreadMessage"
  | "SendMessageWithCursorPos"
  | "PostMessageWithCursorPos"
  | "SendMessageWithWindowPos"
  | "PostMessageWithWindowPos"
  | "Unknown";

export type ControllerInfo = {
  type: ControllerType;
  processId: string;
  adbPath?: string;
  address?: string;
  screencapMethods?: AdbScreencapMethod[];
  inputMethods?: AdbInputMethod[];
  config?: Record<string, unknown>;
  screencapMethod?: Win32ScreencapMethod;
  mouseMethod?: Win32InputMethod;
  keyboardMethod?: Win32InputMethod;
  agentPath?: string;
  timestamp: string;
  fileName: string;
  lineNumber: number;
};

export type ParseResult = {
  tasks: TaskInfo[];
  rawLines: RawLine[];
  auxLogs: AuxLogEntry[];
  pipelineCustomActions: Record<string, PipelineCustomActionInfo[]>;
  controllerInfos: ControllerInfo[];
};
