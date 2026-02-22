import { writeTextFile, rename, exists, mkdir, readTextFile } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

export type LoggerContext = {
  userId?: string;
  threadId?: string;
};

export type LogEntry = {
  timestamp: string;
  level: LogLevel;
  module: string;
  threadId: string;
  userId: string;
  message: string;
  data?: unknown;
};

export interface LoggerConfig {
  logLevel: LogLevel;
  logPath: string;
  rotationSize: number; // in bytes
  rotationCount: number;
}

const LOG_STORE_KEY = "maaLogs:runtime";
const LOG_ARCHIVE_KEY = "maaLogs:archive";
const MAX_ACTIVE_ENTRIES = 2000;
const MAX_ARCHIVE_ENTRIES = 8000;
const FLUSH_INTERVAL_MS = 800;

let context: Required<LoggerContext> = {
  userId: "anonymous",
  threadId: "ui"
};

let buffer: LogEntry[] = [];
let flushTimer: number | null = null;
let config: LoggerConfig | null = null;
let currentLogSize = 0;

/**
 * 获取 ISO 时间戳。
 * @returns ISO 格式时间字符串
 */
function nowIso() {
  return new Date().toISOString();
}

/**
 * 将日志条目格式化为字符串。
 * @param entry 日志条目
 * @returns 格式化后的文本
 */
function formatEntry(entry: LogEntry) {
  const header = `[${entry.timestamp}][${entry.level}][${entry.module}][${entry.threadId}][${entry.userId}]`;
  if (entry.data === undefined) return `${header} ${entry.message}`;
  try {
    return `${header} ${entry.message} ${JSON.stringify(entry.data)}`;
  } catch {
    return `${header} ${entry.message} [unserializable]`;
  }
}

/**
 * 读取 localStorage 中的日志数组。
 * @param key 存储键
 * @returns 日志字符串数组
 */
function readStore(key: string) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 写入日志数组到 localStorage。
 * @param key 存储键
 * @param value 日志字符串数组
 */
function writeStore(key: string, value: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

/**
 * 将超出阈值的日志移入归档区。
 * @param entries 当前日志列表
 * @returns 处理后的当前日志
 */
function rotateIfNeeded(entries: string[]) {
  if (entries.length <= MAX_ACTIVE_ENTRIES) return entries;
  const overflow = entries.length - MAX_ACTIVE_ENTRIES;
  const archive = readStore(LOG_ARCHIVE_KEY);
  const moved = entries.splice(0, overflow);
  const updatedArchive = archive.concat(moved).slice(-MAX_ARCHIVE_ENTRIES);
  writeStore(LOG_ARCHIVE_KEY, updatedArchive);
  return entries;
}

/**
 * 初始化日志系统。
 * @param cfg 配置对象
 */
async function prepareLogPath(logPath: string) {
  if (!(await exists(logPath))) {
    await mkdir(logPath, { recursive: true });
  }
  const logFile = await join(logPath, "app.log");
  if (await exists(logFile)) {
    const content = await readTextFile(logFile);
    currentLogSize = new Blob([content]).size;
  } else {
    currentLogSize = 0;
  }
}

export async function init(cfg: LoggerConfig) {
  config = cfg;
  try {
    await prepareLogPath(config.logPath);
  } catch (e) {
    try {
      const fallbackPath = await join(await appDataDir(), "logs");
      config = { ...cfg, logPath: fallbackPath };
      await prepareLogPath(fallbackPath);
      console.warn("日志目录不可写，已切换到应用数据目录:", fallbackPath);
    } catch (fallbackError) {
      console.error("日志文件系统初始化失败:", fallbackError);
    }
  }
}

/**
 * 执行日志轮转。
 */
async function rotateLogFiles() {
  if (!config) return;
  try {
    const logFile = await join(config.logPath, "app.log");
    if (!(await exists(logFile))) return;

    // Shift existing rotated logs
    for (let i = config.rotationCount - 1; i >= 1; i--) {
      const current = await join(config.logPath, `app.${i}.log`);
      const next = await join(config.logPath, `app.${i + 1}.log`);
      if (await exists(current)) {
        await rename(current, next);
      }
    }

    // Rename current log to .1.log
    const firstRotation = await join(config.logPath, "app.1.log");
    await rename(logFile, firstRotation);

    currentLogSize = 0;
  } catch (e) {
    console.error("日志轮转失败:", e);
  }
}

/**
 * 将日志写入文件系统。
 * @param lines 日志行
 */
async function writeToFile(lines: string[]) {
  if (!config) return;
  try {
    const logFile = await join(config.logPath, "app.log");
    const content = lines.join("\n") + "\n";
    const size = new Blob([content]).size;

    if (currentLogSize + size > config.rotationSize) {
      await rotateLogFiles();
    }

    await writeTextFile(logFile, content, { append: true });
    currentLogSize += size;
  } catch (e) {
    console.error("写入日志文件失败:", e);
  }
}

/**
 * 将缓冲日志写入本地存储和文件系统。
 */
function flushBuffer() {
  if (buffer.length === 0) return;
  const lines = buffer.map(formatEntry);
  const linesCopy = [...lines]; // Copy for file writing
  buffer = [];

  // Write to localStorage
  const current = readStore(LOG_STORE_KEY);
  const merged = rotateIfNeeded(current.concat(lines));
  writeStore(LOG_STORE_KEY, merged);

  // Write to file system
  if (config) {
    writeToFile(linesCopy);
  }
}

/**
 * 计划异步刷盘，避免频繁写入。
 */
function scheduleFlush() {
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    flushBuffer();
  }, FLUSH_INTERVAL_MS);
}

/**
 * 写入一条日志并输出到控制台。
 * @param level 日志等级
 * @param module 模块名
 * @param message 日志内容
 * @param data 结构化数据
 */
function emit(level: LogLevel, module: string, message: string, data?: unknown) {
  const entry: LogEntry = {
    timestamp: nowIso(),
    level,
    module,
    threadId: context.threadId,
    userId: context.userId,
    message,
    data
  };
  buffer.push(entry);
  scheduleFlush();
  const consoleFn =
    level === "ERROR" || level === "FATAL"
      ? console.error
      : level === "WARN"
      ? console.warn
      : console.log;
  consoleFn(formatEntry(entry));
}

/**
 * 更新日志上下文信息，用于后续日志自动填充 userId 与 threadId。
 * @param next 需要覆盖的上下文片段
 */
export function setLoggerContext(next: LoggerContext) {
  context = {
    userId: next.userId ?? context.userId,
    threadId: next.threadId ?? context.threadId
  };
}

/**
 * 创建带模块名的日志记录器。
 * @param module 业务模块名称
 * @returns 具备不同级别输出的日志对象
 */
export function createLogger(module: string) {
  return {
    debug: (message: string, data?: unknown) => emit("DEBUG", module, message, data),
    info: (message: string, data?: unknown) => emit("INFO", module, message, data),
    warn: (message: string, data?: unknown) => emit("WARN", module, message, data),
    error: (message: string, data?: unknown) => emit("ERROR", module, message, data),
    fatal: (message: string, data?: unknown) => emit("FATAL", module, message, data),
    init // Export init here to be accessible via logger instance if needed, but better export top level
  };
}

/**
 * 立即将缓冲区日志写入本地存储。
 */
export function flushLogs() {
  flushBuffer();
}
