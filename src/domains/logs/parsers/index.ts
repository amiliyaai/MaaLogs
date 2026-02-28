/**
 * @fileoverview 解析器模块入口
 *
 * 本文件是解析器模块的主入口点，负责：
 * - 导出项目解析器注册表
 * - 导出项目解析器实现
 * - 导出日志关联功能
 * - 导出公共解析工具
 *
 * @module parsers
 * @author MaaLogs Team
 * @license MIT
 */

// 导出项目解析器注册表
export * from "./project-registry";

// 导出公共解析工具
export * from "./shared";

// 导出项目解析器实现
export { m9aProjectParser } from "./projects/m9a";
export { maaEndProjectParser } from "./projects/maaend";

// 导出日志关联功能
export * from "./correlate";
