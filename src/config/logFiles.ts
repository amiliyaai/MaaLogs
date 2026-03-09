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

/** 主日志文件名 */
export const MAIN_LOG_FILE = "maa.log";

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
 * 判断是否为 Maa 主日志文件
 *
 * @param filename - 文件名
 * @returns 是否为主日志文件
 */
export function isMainLogFile(filename: string): boolean {
  return filename.toLowerCase() === MAIN_LOG_FILE;
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
 * 判断文件是否应该被监控
 *
 * 监控规则：
 * 1. 排除备份文件（.bak）
 * 2. 包含主日志 maa.log
 * 3. 符合项目类型的辅助日志
 *
 * @param filename - 文件名
 * @param projectType - 项目类型
 * @returns 是否应该监控此文件
 */
export function shouldWatchFile(filename: string, projectType: string): boolean {
  const lower = filename.toLowerCase();

  if (isBackupFile(lower)) return false;
  if (isMainLogFile(lower)) return true;
  if (isAuxLogFile(lower, projectType)) return true;

  return false;
}
