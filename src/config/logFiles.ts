/**
 * @fileoverview 日志文件配置
 *
 * 本文件定义了日志文件监控相关的配置和工具函数，包括：
 * - 主日志文件匹配规则
 * - 辅助日志文件匹配规则（按项目类型区分）
 * - 日期格式处理
 * - 文件过滤规则
 * - 监控性能参数
 *
 * @module config/logFiles
 */

import { AUX_LOG_PATTERNS } from "./parser";

import type { LogMode } from "../types/logTypes";

/**
 * 日志文件命名规范
 *
 * 旧版（legacy）：maa.log - 统一的单一日志文件
 * 新版（split）：maafw.log + maafw_agent.log - 分离的客户端/服务端日志
 */
export const MAIN_LOG_FILENAMES = {
  /** 旧版统一日志文件名 */
  LEGACY_MAIN: "maa.log",
  /** 新版主框架日志（Client端） */
  NEW_MAIN: "maafw.log",
  /** 新版Agent执行日志（Server端） */
  AGENT: "maafw_agent.log",
} as const;

/**
 * 主日志文件名校验正则（兼容新旧版本）
 * 匹配: maa.log, maafw.log
 */
export const MAIN_LOG_PATTERN = /^(maa|maafw)\.log$/i;

/**
 * Agent日志文件名校验正则
 * 匹配: maafw_agent.log
 */
export const AGENT_LOG_PATTERN = /^maafw_agent\.log$/i;

/**
 * 日志监控配置项
 *
 * @property MAX_INITIAL_READ_SIZE - 初始化时单文件最大读取字节数（默认 10MB）
 *   超过此大小的文件将只读取最后 MAX_INITIAL_READ_SIZE 字节
 *   用于避免启动时处理过大的历史日志文件
 *
 * @property POLL_INTERVAL_MS - 文件轮询检测间隔（毫秒）
 *   定时检查文件是否有新增内容
 *   建议值：1000-5000ms，过低会增加系统开销
 *
 * @property MAX_LINE_LENGTH - 单行日志最大字符数
 *   超过此长度的行将被截断处理
 *   用于防止异常日志导致内存问题
 */
export const LOG_WATCHER_CONFIG = {
  MAX_INITIAL_READ_SIZE: 1024 * 1024 * 10,
  POLL_INTERVAL_MS: 2000,
  MAX_LINE_LENGTH: 4096,
} as const;

/**
 * 获取当前日期字符串（YYYY-MM-DD 格式）
 *
 * @returns 当前日期字符串，用于匹配 M9A 项目的日期日志文件
 *
 * @example
 * // 返回 "2026-03-09"
 * getTodayDate();
 */
export function getTodayDate(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

/**
 * 根据项目类型获取辅助日志文件匹配正则
 *
 * @param projectType - 项目类型（m9a | maaend | unknown）
 * @returns 匹配正则表达式，未知项目类型返回 null
 *
 * @example
 * // M9A 项目：匹配 "2026-03-09.log"
 * getAuxLogPattern("m9a");
 *
 * @example
 * // MaaEnd 项目：匹配 "go-service.log"
 * getAuxLogPattern("maaend");
 */
export function getAuxLogPattern(projectType: string): RegExp | null {
  const pattern = AUX_LOG_PATTERNS[projectType];
  if (!pattern) return null;

  if (projectType === "m9a") {
    return new RegExp(`^${getTodayDate()}\\.log$`, "i");
  }
  return pattern;
}

/**
 * 判断是否为 Maa 主日志文件（兼容新旧版本）
 *
 * @param filename - 文件名
 * @returns 是否为主日志文件（maa.log 或 maafw.log）
 */
export function isMainLogFile(filename: string): boolean {
  return MAIN_LOG_PATTERN.test(filename);
}

/**
 * 判断是否为 Agent 日志文件
 *
 * @param filename - 文件名
 * @returns 是否为 Agent 日志文件（maafw_agent.log）
 */
export function isAgentLogFile(filename: string): boolean {
  return AGENT_LOG_PATTERN.test(filename);
}

/**
 * 检测日志文件对应的来源类型
 *
 * @param filename - 文件名
 * @returns 日志来源类型：'main' | 'agent' | 'aux'
 */
export function detectLogSource(filename: string): "main" | "agent" | "aux" {
  if (isMainLogFile(filename)) return "main";
  if (isAgentLogFile(filename)) return "agent";
  return "aux";
}

/**
 * 判断是否为项目辅助日志文件
 *
 * @param filename - 文件名
 * @param projectType - 项目类型
 * @returns 是否为辅助日志文件
 */
export function isAuxLogFile(filename: string, projectType: string): boolean {
  const pattern = getAuxLogPattern(projectType);
  return pattern ? pattern.test(filename) : false;
}

/**
 * 判断是否为备份文件
 *
 * @param filename - 文件名
 * @returns 是否为备份文件（包含 .bak）
 */
export function isBackupFile(filename: string): boolean {
  return filename.toLowerCase().includes(".bak");
}

/**
 * 检测日志模式
 *
 * 根据传入的文件名列表判断使用的日志模式：
 * - split: 新版分离模式（同时存在 maafw.log 和 maafw_agent.log）
 * - legacy: 旧版统一模式（只有 maa.log）
 *
 * 优先级：split > legacy
 * 即当存在新版日志时，忽略旧版日志
 *
 * @param filenames - 日志文件名列表
 * @returns 日志模式：'split' | 'legacy'
 *
 * @example
 * // 新版模式
 * detectLogMode(['maafw.log', 'maafw_agent.log']); // returns 'split'
 *
 * @example
 * // 旧版模式
 * detectLogMode(['maa.log', 'go-service.log']); // returns 'legacy'
 */
export function detectLogMode(filenames: string[]): LogMode {
  const lowerNames = filenames.map((f) => f.toLowerCase());
  const hasNewMain = lowerNames.includes(MAIN_LOG_FILENAMES.NEW_MAIN.toLowerCase());
  const hasAgent = lowerNames.includes(MAIN_LOG_FILENAMES.AGENT.toLowerCase());

  if (hasNewMain && hasAgent) {
    return "split";
  }
  return "legacy";
}

/**
 * 根据日志模式过滤应该监控的文件
 *
 * 优先级规则：
 * - split 模式：优先使用 maafw.log + maafw_agent.log，忽略 maa.log
 * - legacy 模式：使用 maa.log
 *
 * @param filenames - 所有候选文件名列表
 * @param projectType - 项目类型（用于辅助日志过滤）
 * @returns 应该监控的文件名列表
 */
export function filterFilesByLogMode(
  filenames: string[],
  projectType: string
): string[] {
  const mode = detectLogMode(filenames);

  if (mode === "split") {
    return filenames.filter((filename) => {
      const lower = filename.toLowerCase();
      if (lower === MAIN_LOG_FILENAMES.LEGACY_MAIN.toLowerCase()) return false;
      if (isMainLogFile(lower)) return true;
      if (isAgentLogFile(lower)) return true;
      if (isAuxLogFile(lower, projectType)) return true;
      return false;
    });
  }

  return filenames.filter((filename) => shouldWatchFile(filename, projectType));
}

/**
 * 判断文件是否应该被监控
 *
 * 监控规则：
 * 1. 排除备份文件（.bak）
 * 2. 包含主日志（maa.log 或 maafw.log）
 * 3. 包含 Agent 日志（maafw_agent.log）
 * 4. 符合项目类型的辅助日志
 *
 * @param filename - 文件名
 * @param projectType - 项目类型
 * @returns 是否应该监控此文件
 */
export function shouldWatchFile(filename: string, projectType: string): boolean {
  const lower = filename.toLowerCase();

  if (isBackupFile(lower)) return false;
  if (isMainLogFile(lower)) return true;
  if (isAgentLogFile(lower)) return true;
  if (isAuxLogFile(lower, projectType)) return true;

  return false;
}
