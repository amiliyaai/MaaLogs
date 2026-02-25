/**
 * @fileoverview 日志工具模块
 *
 * 本模块提供 VSCode 插件的日志记录功能：
 * - 创建带模块名称的日志记录器
 * - 支持多级别日志（DEBUG, INFO, WARN, ERROR）
 * - 日志输出到 VSCode 输出面板
 * - 包含时间戳和追踪 ID
 *
 * @module utils/logger
 * @author MaaLogs Team
 * @license MIT
 */

import * as vscode from "vscode";
import { randomUUID } from "crypto";

/**
 * 日志记录器类
 *
 * 提供结构化的日志记录功能，每个实例对应一个输出面板
 * 日志包含时间戳、级别、追踪 ID、消息和上下文数据
 */
export class Logger {
  /** VSCode 输出通道 */
  private outputChannel: vscode.OutputChannel;

  /** 模块名称 */
  private module: string;

  /** 追踪 ID，用于关联日志 */
  private traceId: string;

  /**
   * 创建日志记录器
   *
   * @param module - 模块名称，用于标识日志来源
   */
  constructor(module: string) {
    this.module = module;
    // 创建以模块名称命名的输出面板
    this.outputChannel = vscode.window.createOutputChannel(`MaaLogs: ${module}`);
    // 生成随机追踪 ID
    this.traceId = randomUUID();
  }

  /**
   * 格式化日志消息
   *
   * 将日志级别、消息和可选数据格式化为 JSON 字符串
   *
   * @param level - 日志级别
   * @param message - 日志消息
   * @param data - 可选的上下文数据
   * @returns 格式化的 JSON 字符串
   */
  private formatMessage(level: string, message: string, data?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const context: Record<string, unknown> = {
      module: this.module,
    };
    if (data && Object.keys(data).length > 0) {
      context.data = data;
    }
    return JSON.stringify({
      timestamp,
      level,
      trace_id: this.traceId,
      message,
      context,
    });
  }

  /** 记录调试级别日志 */
  debug(message: string, data?: Record<string, unknown>): void {
    this.outputChannel.appendLine(this.formatMessage("DEBUG", message, data));
  }

  /** 记录信息级别日志 */
  info(message: string, data?: Record<string, unknown>): void {
    this.outputChannel.appendLine(this.formatMessage("INFO", message, data));
  }

  /** 记录警告级别日志 */
  warn(message: string, data?: Record<string, unknown>): void {
    this.outputChannel.appendLine(this.formatMessage("WARN", message, data));
  }

  /** 记录错误级别日志 */
  error(message: string, data?: Record<string, unknown>): void {
    this.outputChannel.appendLine(this.formatMessage("ERROR", message, data));
  }

  /** 显示输出面板 */
  show(): void {
    this.outputChannel.show();
  }

  /** 释放资源 */
  dispose(): void {
    this.outputChannel.dispose();
  }
}

/**
 * 创建日志记录器工厂函数
 *
 * @param module - 模块名称
 * @returns Logger 实例
 */
export function createLogger(module: string): Logger {
  return new Logger(module);
}
