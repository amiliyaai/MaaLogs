/**
 * @fileoverview 解析器配置
 *
 * 本文件定义日志解析器相关的所有配置项，包括：
 * - 项目识别模式配置
 * - 日志关联配置（时间窗口、匹配策略开关）
 * - 日志解析配置（分块大小、批处理大小）
 * - 加密配置（PBKDF2 密钥派生迭代次数）
 *
 * 使用说明：
 * - PROJECT_PATTERNS 用于从日志中识别项目类型
 * - CorrelationConfig 用于控制 Custom 日志与主日志的关联行为
 * - PARSER_CONFIG 控制解析性能和内存使用
 * - CRYPTO_CONFIG 控制加密安全级别
 *
 * @module config/parser
 */

import type { ProjectType } from "@/parsers/baseParser";

/**
 * 项目识别模式配置
 *
 * 通过 Working 目录路径中的关键词识别项目类型
 *
 * @property {string} keyword - 路径中的关键词（大小写不敏感）
 * @property {ProjectType} project - 对应的项目类型
 *
 * @example
 * // 日志行: [Logger] Working F:/etc/M9A-v3.18.0
 * // 匹配关键词 "M9A" -> 返回 "m9a"
 */
export const PROJECT_PATTERNS: { keyword: string; project: ProjectType }[] = [
  { keyword: "M9A", project: "m9a" },
  { keyword: "MaaEnd", project: "maaend" },
];

/**
 * 根据项目类型获取对应的 parser ID
 *
 * @param projectType - 项目类型
 * @returns parser ID，未知项目类型返回 null
 *
 * @example
 * getProjectParserId("m9a");     // returns "m9a"
 * getProjectParserId("maaend");  // returns "maaend"
 * getProjectParserId("unknown"); // returns null
 */
export function getProjectParserId(projectType: ProjectType): string | null {
  if (projectType === "unknown") return null;
  if (projectType === "m9a") return "m9a";
  return "maaend";
}

/**
 * 辅助日志文件匹配模式配置
 *
 * 每个项目类型对应一个正则表达式，用于匹配该项目的辅助日志文件
 */
export const AUX_LOG_PATTERNS: Record<string, RegExp> = {
  m9a: /^(\d{4}-\d{2}-\d{2})\.log$/i,
  maaend: /^go-service\.log$/i,
};

/**
 * 日志关联配置接口
 *
 * 控制 Custom 辅助日志（如 go-service 日志）与主任务日志的关联行为
 *
 * @property {number} timeWindowMs - 时间窗口大小（毫秒）
 *   - 用于在时间维度上匹配日志条目
 *   - 较大的值可以匹配到更多日志，但可能降低精度
 * @property {boolean} enableIdentifierMatch - 是否启用 identifier 匹配
 *   - 通过 identifier（任务标识符）精确关联日志
 * @property {boolean} enableTaskIdMatch - 是否启用 task_id 匹配
 *   - 通过任务 ID 精确关联日志
 * @property {boolean} enableTimeWindowMatch - 是否启用时间窗口匹配
 *   - 通过时间戳在任务执行时间范围内匹配日志
 * @property {boolean} enableKeywordMatch - 是否启用关键词匹配
 *   - 通过节点名称、ROI 等关键词匹配日志
 *
 * @example
 * // 自定义关联配置
 * const config: CorrelationConfig = {
 *   timeWindowMs: 10000,       // 10秒时间窗口
 *   enableIdentifierMatch: true,
 *   enableTaskIdMatch: true,
 *   enableTimeWindowMatch: true,
 *   enableKeywordMatch: false   // 禁用关键词匹配
 * };
 */
export interface CorrelationConfig {
  timeWindowMs: number;
  enableIdentifierMatch: boolean;
  enableTaskIdMatch: boolean;
  enableTimeWindowMatch: boolean;
  enableKeywordMatch: boolean;
}

/**
 * 默认日志关联配置
 *
 * 提供开箱即用的关联策略，默认启用所有匹配方式
 * - 5秒时间窗口，平衡精度和召回率
 * - 启用所有匹配策略，最大化关联成功率
 *
 * @example
 * // 使用默认配置
 * import { DEFAULT_CORRELATION_CONFIG } from "../config/parser";
 * const result = correlateAuxLogsWithTasks(entries, tasks, DEFAULT_CORRELATION_CONFIG);
 */
export const DEFAULT_CORRELATION_CONFIG: CorrelationConfig = {
  timeWindowMs: 5000,
  enableIdentifierMatch: true,
  enableTaskIdMatch: true,
  enableTimeWindowMatch: true,
  enableKeywordMatch: true,
};

/**
 * 日志解析器配置
 *
 * 控制日志解析过程的性能和内存使用
 *
 * @property {number} chunkSize - 分块大小
 *   - 每次处理的文件行数
 *   - 较大的值可以提高解析速度，但会增加内存占用
 *   - 500 行约占用几 MB 内存
 * @property {number} batchSize - 批处理大小
 *   - 每次关联处理的日志条目数
 *   - 用于控制单次处理的日志量，避免内存溢出
 *   - 1000 条约占用几十 MB 内存
 *
 * @example
 * // 调整解析配置以适应大文件
 * const config = {
 *   chunkSize: 1000,   // 增大分块
 *   batchSize: 2000    // 增大批处理
 * };
 */
export const PARSER_CONFIG = {
  chunkSize: 500,
  batchSize: 1000,
};

/**
 * 加密配置
 *
 * 控制敏感数据加密的安全级别
 *
 * @property {number} iterations - PBKDF2 密钥派生迭代次数
 *   - 值越高越安全，但加密/解密速度越慢
 *   - 100000 是 OWASP 推荐的最小值
 *   - 一般建议 100000-600000 之间，根据性能需求调整
 *
 * @example
 * // 提高安全级别（性能较慢）
 * const cryptoConfig = {
 *   iterations: 600000
 * };
 *
 * // 降低安全级别（速度更快，但不推荐）
 * const cryptoConfig = {
 *   iterations: 10000
 * };
 */
export const CRYPTO_CONFIG = {
  iterations: 100000,
};
