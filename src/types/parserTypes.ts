/**
 * @fileoverview 解析器类型定义
 *
 * 本文件定义了解析器系统的核心接口和类型。
 * 包括辅助日志解析器和项目解析器的类型定义。
 *
 * @module types/parserTypes
 * @author MaaLogs Team
 * @license MIT
 */

import type { AuxLogEntry, EventNotification, ControllerInfo, RecognitionDetail, ActionDetail, NextListItem, RecognitionAttempt } from "./logTypes";

export type { AuxLogEntry, EventNotification, ControllerInfo, RecognitionDetail, ActionDetail, NextListItem, RecognitionAttempt };

/**
 * 辅助日志解析器信息
 *
 * 用于在 UI 中显示解析器列表。
 */
export interface AuxLogParserInfo {
  /** 解析器唯一标识符 */
  id: string;
  /** 解析器显示名称 */
  name: string;
  /** 解析器描述 */
  description?: string;
}

/**
 * Custom日志解析器配置
 */
export interface AuxLogParserConfig {
  /** 当前解析的文件名 */
  fileName: string;
}

/**
 * 辅助日志解析结果
 */
export interface AuxLogParseResult {
  /** 解析后的日志条目 */
  entries: AuxLogEntry[];
}

/**
 * 辅助日志解析器接口
 *
 * 用于解析 go-service 等Custom日志文件。
 */
export interface AuxLogParser {
  /** 解析器唯一标识符 */
  readonly id: string;
  /** 解析器显示名称 */
  readonly name: string;
  /** 解析器描述 */
  readonly description: string;
  /**
   * 解析日志行
   * @param lines - 日志行数组
   * @param config - 解析配置
   * @returns 解析结果
   */
  parse(lines: string[], config: AuxLogParserConfig): AuxLogParseResult;
}

/**
 * 主日志解析结果
 */
export interface MainLogParseResult {
  events: EventNotification[];
  controllers: ControllerInfo[];
  identifierMap: Map<number, string>;
}

/**
 * 主日志解析器配置
 */
export interface MainLogParserConfig {
  fileName: string;
}

/**
 * 项目解析器接口
 *
 * 定义项目解析器必须实现的方法。
 * 每个项目解析器封装了该项目的所有日志解析逻辑。
 *
 * @example
 * const m9aParser: ProjectParser = {
 *   id: 'm9a',
 *   name: 'M9A',
 *   description: 'M9A 项目日志解析器',
 *   parseMainLog: (lines, config) => { ... },
 *   parseAuxLog: (lines, config) => { ... },
 *   getAuxLogParserInfo: () => { ... }
 * };
 */
export interface ProjectParser {
  /** 项目唯一标识符 */
  readonly id: string;
  /** 项目显示名称 */
  readonly name: string;
  /** 项目描述 */
  readonly description: string;
  /**
   * 解析主日志
   *
   * 解析 maa.log 主日志文件，提取事件通知和控制器信息。
   *
   * @param lines - 日志行数组
   * @param config - 解析配置
   * @returns 解析结果
   */
  parseMainLog(lines: string[], config: MainLogParserConfig): MainLogParseResult;
  /**
   * 解析辅助日志
   *
   * 解析辅助日志文件（如 go-service.log、custom 日志等）。
   *
   * @param lines - 日志行数组
   * @param config - 解析配置
   * @returns 解析结果
   */
  parseAuxLog(lines: string[], config: AuxLogParserConfig): AuxLogParseResult;
  /**
   * 获取辅助日志解析器信息
   *
   * 返回用于 UI 显示的解析器信息。
   *
   * @returns 解析器信息
   */
  getAuxLogParserInfo(): AuxLogParserInfo;
}

/**
 * 项目解析器注册信息
 */
export interface ProjectParserRegistration {
  parser: ProjectParser;
  enabled: boolean;
  priority: number;
}
