/**
 * @fileoverview 应用常量定义
 *
 * 本文件定义项目中使用的所有常量，包括：
 * - 日志文件名常量
 * - 文件扩展名常量
 * - 日志级别常量
 * - 其他应用级常量
 *
 * 使用常量替代 Magic Strings 可以：
 * - 提高代码可读性
 * - 便于统一修改
 * - 减少拼写错误
 *
 * @module config/constants
 */

/** 日志文件名常量 */
export const LOG_FILE_NAMES = {
  /** MAA 主日志文件名 */
  MAA_LOG: "maa.log",
  /** MAA 备份日志文件名 */
  MAA_BAK_LOG: "maa.bak.log",
  /** Go Service 日志文件名 */
  GO_SERVICE_LOG: "go-service.log",
} as const;

/** 文件扩展名常量 */
export const FILE_EXTENSIONS = {
  /** 日志文件扩展名 */
  LOG: ".log",
  /** JSON 文件扩展名 */
  JSON: ".json",
  /** JSONC (JSON with Comments) 文件扩展名 */
  JSONC: ".jsonc",
} as const;

/** 日志级别常量 */
export const LOG_LEVELS = {
  /** 信息级别 */
  INFO: "INFO",
  /** 调试级别 */
  DEBUG: "DEBUG",
  /** 警告级别 */
  WARN: "WRN",
  /** 错误级别 */
  ERROR: "ERR",
  /** 跟踪级别 */
  TRACE: "TRC",
  /** 致命级别 */
  FATAL: "FTL",
} as const;

/** 日志来源标识常量 */
export const LOG_SOURCES = {
  /** Go Service 来源 */
  GO_SERVICE: "go-service",
  /** M9A 来源 */
  M9A: "m9a",
  /** 自定义来源 */
  CUSTOM: "custom",
} as const;

export type LogFileName = (typeof LOG_FILE_NAMES)[keyof typeof LOG_FILE_NAMES];
export type FileExtension = (typeof FILE_EXTENSIONS)[keyof typeof FILE_EXTENSIONS];
export type LogLevel = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS];
export type LogSource = (typeof LOG_SOURCES)[keyof typeof LOG_SOURCES];
