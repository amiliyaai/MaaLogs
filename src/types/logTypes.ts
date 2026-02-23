/**
 * @fileoverview MaaLogs 日志类型定义
 *
 * 本文件定义了 MaaLogs 应用程序中使用的所有核心数据类型。
 * 这些类型用于表示日志解析结果、任务信息、节点详情等数据结构。
 *
 * @module types/logTypes
 * @author MaaLogs Team
 * @license MIT
 */

/**
 * 用户选择的文件信息
 *
 * 表示用户通过文件选择器或拖拽操作导入的文件元数据。
 * 包含文件的基本属性以及原始 File 对象引用。
 *
 * @property {string} name - 文件名（包含扩展名）
 * @property {number} size - 文件大小（字节）
 * @property {string} type - 文件 MIME 类型或扩展名
 * @property {File} file - 原始浏览器 File 对象，用于读取文件内容
 *
 * @example
 * const selectedFile: SelectedFile = {
 *   name: 'maa.log',
 *   size: 1024000,
 *   type: 'text/plain',
 *   file: new File(['...'], 'maa.log')
 * };
 */
export type SelectedFile = {
  name: string;
  size: number;
  type: string;
  file: File;
};

/**
 * 解析后的日志行结构
 *
 * 表示从 maa.log 文件中解析出的单行日志数据。
 * Maa 日志格式为方括号分隔的结构化文本，包含时间戳、级别、进程/线程信息等。
 *
 * @property {string} timestamp - 日志时间戳（格式：YYYY-MM-DD HH:MM:SS.mmm）
 * @property {'DBG' | 'INF' | 'TRC' | 'WRN' | 'ERR'} level - 日志级别
 *   - DBG: 调试信息
 *   - INF: 普通信息
 *   - TRC: 追踪信息
 *   - WRN: 警告信息
 *   - ERR: 错误信息
 * @property {string} processId - 进程标识符
 * @property {string} threadId - 线程标识符
 * @property {string} [sourceFile] - 源代码文件名（可选）
 * @property {string} [lineNumber] - 源代码行号（可选）
 * @property {string} [functionName] - 函数名称（可选）
 * @property {string} message - 日志消息内容
 * @property {Record<string, any>} params - 从消息中提取的键值对参数
 * @property {'enter' | 'leave'} [status] - 函数进入/离开状态标记
 * @property {number} [duration] - 函数执行耗时（毫秒）
 * @property {number} [_lineNumber] - 在源文件中的行号（内部使用）
 *
 * @example
 * const logLine: LogLine = {
 *   timestamp: '2024-01-15 10:30:45.123',
 *   level: 'INF',
 *   processId: 'P1234',
 *   threadId: 'T5678',
 *   message: 'Task started',
 *   params: { task_id: 1 }
 * };
 */
export type LogLine = {
  timestamp: string;
  level: "DBG" | "INF" | "TRC" | "WRN" | "ERR";
  processId: string;
  threadId: string;
  sourceFile?: string;
  lineNumber?: string;
  functionName?: string;
  message: string;
  params: Record<string, any>;
  status?: "enter" | "leave";
  duration?: number;
  _lineNumber?: number;
};

/**
 * 事件通知结构
 *
 * 表示 Maa 框架发出的 OnEventNotify 事件数据。
 * 这些事件用于追踪任务生命周期、节点执行状态等关键操作。
 *
 * @property {string} timestamp - 事件发生时间戳
 * @property {string} level - 日志级别
 * @property {string} message - 事件消息类型（如 "Tasker.Task.Starting"）
 * @property {Record<string, any>} details - 事件详细参数
 * @property {string} fileName - 事件来源文件名
 * @property {string} processId - 进程标识符
 * @property {string} threadId - 线程标识符
 * @property {number} [_lineNumber] - 在源文件中的行号（内部使用）
 *
 * @example
 * const event: EventNotification = {
 *   timestamp: '2024-01-15 10:30:45.123',
 *   level: 'INF',
 *   message: 'Tasker.Task.Starting',
 *   details: { task_id: 1, entry: 'MainTask' },
 *   fileName: 'maa.log',
 *   processId: 'P1234',
 *   threadId: 'T5678'
 * };
 */
export type EventNotification = {
  timestamp: string;
  level: string;
  message: string;
  details: Record<string, any>;
  fileName: string;
  processId: string;
  threadId: string;
  _lineNumber?: number;
};

/**
 * 辅助日志条目
 *
 * 表示从 go-service 或其他辅助日志源解析出的日志条目。
 * 这些日志可以与主任务进行关联，提供更详细的执行上下文。
 *
 * @property {string} key - 日志唯一标识符（格式：文件名-行号）
 * @property {string} source - 日志来源标识（如 "go-service", "loguru"）
 * @property {string} timestamp - 日志时间戳
 * @property {number} [timestampMs] - 毫秒级时间戳（用于时间窗口匹配）
 * @property {string} level - 日志级别（DEBUG, INFO, WARN, ERROR 等）
 * @property {string} message - 日志消息内容
 * @property {string} [identifier] - Agent 会话标识符（UUID 格式）
 * @property {number} [task_id] - 关联的任务 ID
 * @property {string} [entry] - 任务入口名称
 * @property {string} [caller] - 调用者信息（文件名:行号）
 * @property {Record<string, any>} [details] - 额外的结构化数据
 * @property {AuxLogCorrelation} [correlation] - 与任务的关联信息
 * @property {string} fileName - 日志来源文件名
 * @property {number} lineNumber - 在源文件中的行号
 *
 * @example
 * const auxLog: AuxLogEntry = {
 *   key: 'go-service.log-123',
 *   source: 'go-service',
 *   timestamp: '2024-01-15 10:30:45.123',
 *   level: 'INFO',
 *   message: 'Recognition succeeded',
 *   identifier: 'abc123-def456-...',
 *   task_id: 1,
 *   fileName: 'go-service.log',
 *   lineNumber: 123
 * };
 */
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
  details?: Record<string, any>;
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

/**
 * Pipeline Custom Action 信息
 *
 * 表示从 Pipeline JSON 配置文件中提取的自定义动作定义。
 * 用于将节点名称映射到对应的 Custom Action 实现。
 *
 * @property {string} name - Custom Action 名称
 * @property {string} fileName - 定义该 Action 的配置文件名
 *
 * @example
 * const customAction: PipelineCustomActionInfo = {
 *   name: 'MyCustomAction',
 *   fileName: 'pipeline.json'
 * };
 */
export type PipelineCustomActionInfo = {
  name: string;
  fileName: string;
};

/**
 * NextList 条目
 *
 * 表示 Pipeline 节点执行成功后的后续节点列表项。
 * NextList 决定了任务执行的流程走向。
 *
 * @property {string} name - 目标节点名称
 * @property {boolean} anchor - 是否为锚点节点
 *   锚点节点在任务中断后可以作为恢复点
 * @property {boolean} jump_back - 是否需要回跳执行
 *   回跳节点会在特定条件下重新执行之前的节点
 *
 * @example
 * const nextItem: NextListItem = {
 *   name: 'NextNode',
 *   anchor: false,
 *   jump_back: true
 * };
 */
export type NextListItem = {
  name: string;
  anchor: boolean;
  jump_back: boolean;
};

/**
 * 识别尝试记录
 *
 * 记录单次识别操作的结果和详情。
 * 一个节点可能包含多次识别尝试（重试机制）。
 *
 * @property {number} reco_id - 识别操作唯一标识符
 * @property {string} name - 识别目标名称
 * @property {string} timestamp - 识别发生时间戳
 * @property {'success' | 'failed'} status - 识别结果状态
 * @property {RecognitionDetail} [reco_details] - 识别详细信息
 * @property {RecognitionAttempt[]} [nested_nodes] - 嵌套的子识别节点
 */
export type RecognitionAttempt = {
  reco_id: number;
  name: string;
  timestamp: string;
  status: "success" | "failed";
  reco_details?: RecognitionDetail;
  nested_nodes?: RecognitionAttempt[];
};

/**
 * 动作尝试记录
 *
 * 记录单次动作执行的结果和详情。
 * 动作是识别成功后执行的具体操作（点击、滑动等）。
 *
 * @property {number} action_id - 动作操作唯一标识符
 * @property {string} name - 动作名称
 * @property {string} timestamp - 动作发生时间戳
 * @property {'success' | 'failed'} status - 动作执行状态
 * @property {ActionDetail} [action_details] - 动作详细信息
 * @property {ActionAttempt[]} [nested_actions] - 嵌套的子动作
 */
export type ActionAttempt = {
  action_id: number;
  name: string;
  timestamp: string;
  status: "success" | "failed";
  action_details?: ActionDetail;
  nested_actions?: ActionAttempt[];
};

/**
 * 节点信息
 *
 * 表示 Pipeline 执行过程中的单个节点状态。
 * 节点是任务执行的基本单元，包含识别和动作两个阶段。
 *
 * @property {number} node_id - 节点唯一标识符
 * @property {string} name - 节点名称
 * @property {string} timestamp - 节点执行时间戳
 * @property {'success' | 'failed'} status - 节点执行状态
 * @property {number} task_id - 所属任务 ID
 * @property {RecognitionDetail} [reco_details] - 最终识别详情
 * @property {ActionDetail} [action_details] - 最终动作详情
 * @property {any} [focus] - Focus 数据（用于调试）
 * @property {NextListItem[]} next_list - 后续节点列表
 * @property {RecognitionAttempt[]} recognition_attempts - 识别尝试历史
 * @property {ActionAttempt[]} [nested_action_nodes] - 嵌套动作节点
 * @property {RecognitionAttempt[]} [nested_recognition_in_action] - 动作中的嵌套识别
 * @property {Object} [node_details] - 节点配置详情
 */
export type NodeInfo = {
  node_id: number;
  name: string;
  timestamp: string;
  status: "success" | "failed";
  task_id: number;
  reco_details?: RecognitionDetail;
  action_details?: ActionDetail;
  focus?: any;
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

/**
 * 识别详情
 *
 * 包含识别操作的完整结果数据。
 *
 * @property {number} reco_id - 识别操作 ID
 * @property {string} algorithm - 使用的识别算法名称
 * @property {[number, number, number, number] | null} box - 识别区域边界框 [x, y, w, h]
 * @property {any} detail - 算法特定的详细数据
 * @property {string} name - 识别目标名称
 */
export type RecognitionDetail = {
  reco_id: number;
  algorithm: string;
  box: [number, number, number, number] | null;
  detail: any;
  name: string;
};

/**
 * 动作详情
 *
 * 包含动作执行的完整结果数据。
 *
 * @property {number} action_id - 动作操作 ID
 * @property {string} action - 动作类型（Click, Swipe, Custom 等）
 * @property {[number, number, number, number]} box - 动作目标区域
 * @property {any} detail - 动作特定的详细数据
 * @property {string} name - 动作名称
 * @property {boolean} success - 动作是否执行成功
 */
export type ActionDetail = {
  action_id: number;
  action: string;
  box: [number, number, number, number];
  detail: any;
  name: string;
  success: boolean;
};

/**
 * 原始日志行
 *
 * 表示从日志文件读取的原始行数据，用于文本搜索功能。
 *
 * @property {string} fileName - 来源文件名
 * @property {number} lineNumber - 行号（从 1 开始）
 * @property {string} line - 原始行内容
 */
export type RawLine = {
  fileName: string;
  lineNumber: number;
  line: string;
};

/**
 * 搜索结果
 *
 * 表示文本搜索的匹配结果。
 *
 * @property {string} fileName - 匹配所在文件名
 * @property {number} lineNumber - 匹配所在行号
 * @property {string} line - 处理后的行内容（可能隐藏了调试信息）
 * @property {string} rawLine - 原始行内容
 * @property {number} matchStart - 匹配起始位置
 * @property {number} matchEnd - 匹配结束位置
 * @property {string} key - 结果唯一标识符
 */
export type SearchResult = {
  fileName: string;
  lineNumber: number;
  line: string;
  rawLine: string;
  matchStart: number;
  matchEnd: number;
  key: string;
};

/**
 * 节点统计数据
 *
 * 用于统计面板展示的节点性能指标。
 *
 * @property {string} name - 节点名称
 * @property {number} count - 执行次数
 * @property {number} totalDuration - 累计耗时（毫秒）
 * @property {number} avgDuration - 平均耗时（毫秒）
 * @property {number} minDuration - 最小耗时（毫秒）
 * @property {number} maxDuration - 最大耗时（毫秒）
 * @property {number} successCount - 成功次数
 * @property {number} failCount - 失败次数
 * @property {number} successRate - 成功率（百分比）
 */
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

/**
 * 任务信息
 *
 * 表示一个完整的 Maa 任务执行记录。
 * 任务是 Pipeline 执行的顶层单元，包含多个顺序执行的节点。
 *
 * @property {string} key - 任务唯一标识符（内部生成）
 * @property {string} fileName - 任务来源文件名
 * @property {number} task_id - Maa 框架分配的任务 ID
 * @property {string} entry - 任务入口节点名称
 * @property {string} hash - Pipeline 配置哈希值
 * @property {string} uuid - 任务 UUID
 * @property {string} start_time - 任务开始时间
 * @property {string} [end_time] - 任务结束时间
 * @property {'running' | 'succeeded' | 'failed'} status - 任务状态
 * @property {NodeInfo[]} nodes - 任务包含的节点列表
 * @property {string} processId - 进程标识符
 * @property {string} threadId - 线程标识符
 * @property {number} [duration] - 任务总耗时（毫秒）
 * @property {string} [identifier] - Agent 会话标识符
 * @property {number} [_startEventIndex] - 起始事件索引（内部使用）
 * @property {number} [_endEventIndex] - 结束事件索引（内部使用）
 *
 * @example
 * const task: TaskInfo = {
 *   key: 'task-0',
 *   fileName: 'maa.log',
 *   task_id: 1,
 *   entry: 'MainTask',
 *   hash: 'abc123',
 *   uuid: 'def456-...',
 *   start_time: '2024-01-15 10:30:45.123',
 *   status: 'succeeded',
 *   nodes: [],
 *   processId: 'P1234',
 *   threadId: 'T5678',
 *   duration: 5000
 * };
 */
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

/**
 * 控制器类型枚举
 *
 * 表示 Maa 框架支持的控制器类型。
 *
 * @property {'adb' | 'win32' | 'unknown'} type - 控制器类型
 *   - adb: Android Debug Bridge 控制器（模拟器/真机）
 *   - win32: Windows 窗口控制器（桌面应用）
 *   - unknown: 未知类型
 */
export type ControllerType = "adb" | "win32" | "unknown";

/**
 * ADB 截图方式枚举
 *
 * 定义 ADB 控制器支持的截图方式。
 *
 * @see https://github.com/MaaXYZ/MaaFramework/blob/main/include/MaaFramework/MaaDef.h
 */
export type AdbScreencapMethod =
  | "EncodeToFileAndPull"
  | "Encode"
  | "RawWithGzip"
  | "RawByNetcat"
  | "MinicapDirect"
  | "MinicapStream"
  | "EmulatorExtras"
  | "Unknown";

/**
 * ADB 输入方式枚举
 *
 * 定义 ADB 控制器支持的输入方式。
 *
 * @see https://github.com/MaaXYZ/MaaFramework/blob/main/include/MaaFramework/MaaDef.h
 */
export type AdbInputMethod =
  | "AdbShell"
  | "MinitouchAndAdbKey"
  | "Maatouch"
  | "EmulatorExtras"
  | "Unknown";

/**
 * Win32 截图方式枚举
 *
 * 定义 Win32 控制器支持的截图方式。
 *
 * @see https://github.com/MaaXYZ/MaaFramework/blob/main/source/MaaWin32ControlUnit/Screencap/Screencap.h
 */
export type Win32ScreencapMethod =
  | "FramePool"
  | "PrintWindow"
  | "GDI"
  | "DXGI_DesktopDup_Window"
  | "ScreenDC"
  | "DXGI_DesktopDup"
  | "Unknown";

/**
 * Win32 输入方式枚举
 *
 * 定义 Win32 控制器支持的鼠标和键盘输入方式。
 *
 * @see https://github.com/MaaXYZ/MaaFramework/blob/main/source/MaaWin32ControlUnit/Input/Input.h
 */
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

/**
 * 控制器信息
 *
 * 表示从日志中解析出的控制器配置信息。
 * 控制器负责截图和输入操作，是任务执行的基础。
 *
 * @property {ControllerType} type - 控制器类型（ADB/Win32）
 * @property {string} [adbPath] - ADB 可执行文件路径（仅 ADB 控制器）
 * @property {string} [address] - 设备地址（仅 ADB 控制器，如 127.0.0.1:16384）
 * @property {AdbScreencapMethod[]} [screencapMethods] - 支持的截图方式列表（ADB）
 * @property {AdbInputMethod[]} [inputMethods] - 支持的输入方式列表（ADB）
 * @property {Record<string, unknown>} [config] - 额外配置（如 MuMu 模拟器配置）
 * @property {Win32ScreencapMethod} [screencapMethod] - 当前使用的截图方式（Win32）
 * @property {Win32InputMethod} [mouseMethod] - 鼠标输入方式（Win32）
 * @property {Win32InputMethod} [keyboardMethod] - 键盘输入方式（Win32）
 * @property {string} [agentPath] - Agent 二进制文件路径
 * @property {string} timestamp - 控制器创建时间戳
 * @property {string} fileName - 日志来源文件名
 * @property {number} lineNumber - 日志所在行号
 *
 * @example
 * // ADB 控制器信息
 * const adbController: ControllerInfo = {
 *   type: 'adb',
 *   adbPath: 'C:/Program Files/.../adb.exe',
 *   address: '127.0.0.1:16384',
 *   screencapMethods: ['MuMuPlayer12'],
 *   inputMethods: ['EmulatorExtras'],
 *   config: { extras: { mumu: { enable: true, index: 0 } } },
 *   timestamp: '2024-01-15 10:30:45.123',
 *   fileName: 'maa.log',
 *   lineNumber: 100
 * };
 *
 * // Win32 控制器信息
 * const win32Controller: ControllerInfo = {
 *   type: 'win32',
 *   screencapMethod: 'FramePool',
 *   mouseMethod: 'PostMessage',
 *   keyboardMethod: 'PostMessage',
 *   timestamp: '2024-01-15 10:30:45.123',
 *   fileName: 'maa.log',
 *   lineNumber: 100
 * };
 */
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
