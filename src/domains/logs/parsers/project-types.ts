/**
 * @fileoverview 项目解析器类型定义
 *
 * 本文件定义了项目解析器的核心接口。
 * 每个项目解析器封装了该项目的所有日志解析逻辑，
 * 包括主日志解析和辅助日志解析。
 *
 * @module parsers/project-types
 * @author MaaLogs Team
 * @license MIT
 */

import type { EventNotification, ControllerInfo } from "../types/logTypes";
import type { AuxLogParserInfo, AuxLogParserConfig, AuxLogParseResult } from "./types";

/**
 * 主日志解析结果
 *
 * @property {EventNotification[]} events - 事件通知列表
 * @property {ControllerInfo[]} controllers - 控制器信息列表
 * @property {string | null} baseDate - 基准日期
 * @property {Map<number, string>} identifierMap - 事件索引到 identifier 的映射
 */
export interface MainLogParseResult {
  events: EventNotification[];
  controllers: ControllerInfo[];
  baseDate: string | null;
  identifierMap: Map<number, string>;
}

/**
 * 主日志解析器配置
 *
 * @property {string} fileName - 文件名
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
  /**
   * 项目唯一标识符
   */
  readonly id: string;

  /**
   * 项目显示名称
   */
  readonly name: string;

  /**
   * 项目描述
   */
  readonly description: string;

  /**
   * 解析主日志
   *
   * 解析 maa.log 主日志文件，提取事件通知和控制器信息。
   *
   * @param {string[]} lines - 日志行数组
   * @param {MainLogParserConfig} config - 解析配置
   * @returns {MainLogParseResult} 解析结果
   */
  parseMainLog(lines: string[], config: MainLogParserConfig): MainLogParseResult;

  /**
   * 解析辅助日志
   *
   * 解析辅助日志文件（如 go-service.log、custom 日志等）。
   *
   * @param {string[]} lines - 日志行数组
   * @param {AuxLogParserConfig} config - 解析配置
   * @returns {AuxLogParseResult} 解析结果
   */
  parseAuxLog(lines: string[], config: AuxLogParserConfig): AuxLogParseResult;

  /**
   * 获取辅助日志解析器信息
   *
   * 返回用于 UI 显示的解析器信息。
   *
   * @returns {AuxLogParserInfo} 解析器信息
   */
  getAuxLogParserInfo(): AuxLogParserInfo;
}

/**
 * 项目解析器注册信息
 *
 * @property {ProjectParser} parser - 项目解析器实例
 * @property {boolean} enabled - 是否启用
 * @property {number} priority - 优先级（数值越大优先级越高）
 */
export interface ProjectParserRegistration {
  parser: ProjectParser;
  enabled: boolean;
  priority: number;
}
