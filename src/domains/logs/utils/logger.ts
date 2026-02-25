/**
 * @fileoverview 应用程序日志系统
 *
 * 本文件实现了一个完整的客户端日志系统，支持：
 * - 多级别日志输出（DEBUG, INFO, WARN, ERROR, FATAL）
 * - 日志持久化到 localStorage 和文件系统
 * - 日志轮转（按大小自动分割）
 * - 模块化日志记录器
 * - 异步批量写入优化
 *
 * @module utils/logger
 * @author MaaLogs Team
 * @license MIT
 */

import { writeTextFile, rename, exists, mkdir, readTextFile } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";

/**
 * 日志级别枚举
 *
 * 定义支持的日志级别，按严重程度递增：
 * - DEBUG: 调试信息，仅开发时使用
 * - INFO: 普通信息，记录正常操作
 * - WARN: 警告信息，记录潜在问题
 * - ERROR: 错误信息，记录可恢复的错误
 * - FATAL: 致命错误，记录不可恢复的错误
 */
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

/**
 * 日志上下文信息
 *
 * 用于在日志条目中自动填充的上下文数据。
 */
export type LoggerContext = {
  userId?: string;
  threadId?: string;
  traceId?: string;
};

/**
 * 日志条目结构
 *
 * 表示单条日志记录的完整数据。
 */
export type LogEntry = {
  timestamp: string;
  level: LogLevel;
  trace_id: string;
  message: string;
  context: Record<string, unknown>;
};

/**
 * 日志系统配置
 *
 * @property {LogLevel} logLevel - 最低日志级别
 * @property {string} logPath - 日志文件存储路径
 * @property {number} rotationSize - 日志轮转大小阈值（字节）
 * @property {number} rotationCount - 保留的历史日志文件数量
 */
export interface LoggerConfig {
  logLevel: LogLevel;
  logPath: string;
  rotationSize: number;
  rotationCount: number;
}

// ============================================
// 常量定义
// ============================================

/** 运行时日志存储键 */
const LOG_STORE_KEY = "maaLogs:runtime";
/** 归档日志存储键 */
const LOG_ARCHIVE_KEY = "maaLogs:archive";
/** 运行时日志最大条目数 */
const MAX_ACTIVE_ENTRIES = 2000;
/** 归档日志最大条目数 */
const MAX_ARCHIVE_ENTRIES = 8000;
/** 异步刷盘间隔（毫秒） */
const FLUSH_INTERVAL_MS = 800;

// ============================================
// 模块级状态
// ============================================

/** 当前日志上下文 */
let context: Required<LoggerContext> = {
  userId: "anonymous",
  threadId: "ui",
  traceId: "trace"
};

/** 日志缓冲区 */
let buffer: LogEntry[] = [];
/** 刷盘定时器 */
let flushTimer: number | null = null;
/** 日志配置 */
let config: LoggerConfig | null = null;
/** 当前日志文件大小 */
let currentLogSize = 0;

// ============================================
// 内部工具函数
// ============================================

/**
 * 获取 ISO 格式的当前时间戳
 *
 * @returns {string} ISO 格式时间字符串
 */
function nowIso() {
  return new Date().toISOString();
}

/**
 * 将日志条目格式化为字符串
 *
 * 格式：[timestamp][level][module][threadId][userId] message [data]
 *
 * @param {LogEntry} entry - 日志条目
 * @returns {string} 格式化后的日志文本
 */
function formatEntry(entry: LogEntry) {
  try {
    return JSON.stringify(entry);
  } catch {
    return JSON.stringify({
      timestamp: entry.timestamp,
      level: entry.level,
      trace_id: entry.trace_id,
      message: entry.message,
      context: {
        module: entry.context.module
      }
    });
  }
}

/**
 * 从 localStorage 读取日志数组
 *
 * @param {string} key - 存储键
 * @returns {string[]} 日志字符串数组
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
 * 将日志数组写入 localStorage
 *
 * @param {string} key - 存储键
 * @param {string[]} value - 日志字符串数组
 */
function writeStore(key: string, value: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储失败时静默忽略
    return;
  }
}

/**
 * 将超出阈值的日志移入归档区
 *
 * 当运行时日志超过最大条目数时，将旧日志移至归档区。
 * 归档区也有上限，超出时删除最旧的日志。
 *
 * @param {string[]} entries - 当前日志列表
 * @returns {string[]} 处理后的当前日志
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
 * 准备日志目录并初始化日志文件大小
 *
 * 检查日志目录是否存在，不存在则创建。
 * 读取现有日志文件以确定当前大小。
 *
 * @param {string} logPath - 日志目录路径
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

// ============================================
// 公共 API
// ============================================

/**
 * 初始化日志系统
 *
 * 设置日志配置并准备日志目录。
 * 如果配置的目录不可写，会尝试使用应用数据目录作为后备。
 *
 * @param {LoggerConfig} cfg - 日志配置对象
 * @returns {Promise<void>}
 *
 * @example
 * await init({
 *   logLevel: 'INFO',
 *   logPath: '/path/to/logs',
 *   rotationSize: 10 * 1024 * 1024, // 10MB
 *   rotationCount: 5
 * });
 */
export async function init(cfg: LoggerConfig) {
  config = cfg;
  try {
    await prepareLogPath(config.logPath);
  } catch {
    // 尝试使用后备路径
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
 * 执行日志文件轮转
 *
 * 当日志文件超过大小阈值时，执行轮转操作：
 * 1. 将现有的轮转日志文件编号后移（app.1.log -> app.2.log）
 * 2. 将当前日志文件重命名为 app.1.log
 * 3. 重置当前日志文件大小计数
 */
async function rotateLogFiles() {
  if (!config) return;
  try {
    const logFile = await join(config.logPath, "app.log");
    if (!(await exists(logFile))) return;

    // 后移现有的轮转日志
    for (let i = config.rotationCount - 1; i >= 1; i--) {
      const current = await join(config.logPath, `app.${i}.log`);
      const next = await join(config.logPath, `app.${i + 1}.log`);
      if (await exists(current)) {
        await rename(current, next);
      }
    }

    // 将当前日志重命名为 .1.log
    const firstRotation = await join(config.logPath, "app.1.log");
    await rename(logFile, firstRotation);

    currentLogSize = 0;
  } catch (e) {
    console.error("日志轮转失败:", e);
  }
}

/**
 * 将日志写入文件系统
 *
 * 追加写入日志到文件，如果超过大小阈值则触发轮转。
 *
 * @param {string[]} lines - 日志行数组
 */
async function writeToFile(lines: string[]) {
  if (!config) return;
  try {
    const logFile = await join(config.logPath, "app.log");
    const content = lines.join("\n") + "\n";
    const size = new Blob([content]).size;

    // 检查是否需要轮转
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
 * 将缓冲日志写入本地存储和文件系统
 *
 * 批量处理缓冲区中的日志，提高写入效率。
 */
function flushBuffer() {
  if (buffer.length === 0) return;
  const lines = buffer.map(formatEntry);
  const linesCopy = [...lines]; // 复制用于文件写入
  buffer = [];

  // 写入 localStorage
  const current = readStore(LOG_STORE_KEY);
  const merged = rotateIfNeeded(current.concat(lines));
  writeStore(LOG_STORE_KEY, merged);

  // 写入文件系统
  if (config) {
    writeToFile(linesCopy);
  }
}

/**
 * 计划异步刷盘
 *
 * 使用定时器延迟刷盘操作，避免频繁写入。
 */
function scheduleFlush() {
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    flushBuffer();
  }, FLUSH_INTERVAL_MS);
}

/**
 * 写入一条日志并输出到控制台
 *
 * 这是日志系统的核心函数，创建日志条目并加入缓冲区。
 * 同时根据日志级别输出到浏览器控制台。
 *
 * @param {LogLevel} level - 日志级别
 * @param {string} module - 模块名
 * @param {string} message - 日志内容
 * @param {unknown} [data] - 结构化数据
 */
function emit(level: LogLevel, module: string, message: string, data?: unknown) {
  const logContext: Record<string, unknown> = {
    module,
    thread_id: context.threadId,
    user_id: context.userId
  };
  if (data !== undefined) {
    logContext.data = data;
  }
  const entry: LogEntry = {
    timestamp: nowIso(),
    level,
    trace_id: context.traceId,
    message,
    context: logContext
  };
  buffer.push(entry);
  scheduleFlush();

  // 输出到控制台
  const consoleFn =
    level === "ERROR" || level === "FATAL"
      ? console.error
      : level === "WARN"
      ? console.warn
      : console.log;
  consoleFn(formatEntry(entry));
}

/**
 * 更新日志上下文信息
 *
 * 设置的上下文信息会自动填充到后续所有日志条目中。
 *
 * @param {LoggerContext} next - 需要覆盖的上下文片段
 *
 * @example
 * setLoggerContext({ userId: 'user123', threadId: 'main' });
 */
export function setLoggerContext(next: LoggerContext) {
  context = {
    userId: next.userId ?? context.userId,
    threadId: next.threadId ?? context.threadId,
    traceId: next.traceId ?? context.traceId
  };
}

/**
 * 创建带模块名的日志记录器
 *
 * 返回一个日志对象，所有方法都会自动填充模块名。
 * 这是推荐的日志使用方式。
 *
 * @param {string} module - 业务模块名称
 * @returns {Object} 具备不同级别输出的日志对象
 *   - debug: 输出 DEBUG 级别日志
 *   - info: 输出 INFO 级别日志
 *   - warn: 输出 WARN 级别日志
 *   - error: 输出 ERROR 级别日志
 *   - fatal: 输出 FATAL 级别日志
 *
 * @example
 * const logger = createLogger('MyModule');
 * logger.info('操作成功', { taskId: 123 });
 * logger.error('操作失败', { error: 'Network timeout' });
 */
export function createLogger(module: string) {
  return {
    debug: (message: string, data?: unknown) => emit("DEBUG", module, message, data),
    info: (message: string, data?: unknown) => emit("INFO", module, message, data),
    warn: (message: string, data?: unknown) => emit("WARN", module, message, data),
    error: (message: string, data?: unknown) => emit("ERROR", module, message, data),
    fatal: (message: string, data?: unknown) => emit("FATAL", module, message, data),
    init
  };
}

/**
 * 立即将缓冲区日志写入本地存储
 *
 * 通常在应用退出前调用，确保所有日志都已持久化。
 *
 * @example
 * // 在应用关闭前
 * await flushLogs();
 */
export function flushLogs() {
  flushBuffer();
}
