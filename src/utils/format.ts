/**
 * @fileoverview 格式化工具函数
 *
 * 本文件提供各种数据格式化函数，用于将原始数据转换为用户友好的展示格式。
 * 包括文件大小、时长、状态、坐标等数据的格式化处理。
 *
 * @module utils/format
 * @author MaaLogs Team
 * @license MIT
 */

import type { TaskInfo, NodeInfo, NextListItem } from "../types/logTypes";

/**
 * 将字节数转换为易读的文件大小字符串
 *
 * 根据文件大小自动选择合适的单位：
 * - 小于 1KB：显示字节
 * - 小于 1MB：显示 KB
 * - 其他：显示 MB
 *
 * @param {number} value - 字节数
 * @returns {string} 格式化后的大小字符串
 *
 * @example
 * formatSize(512); // '512 B'
 * formatSize(2048); // '2.0 KB'
 * formatSize(1536000); // '1.5 MB'
 */
export function formatSize(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 将毫秒时长转换为可读文本
 *
 * 根据时长自动选择合适的单位：
 * - 小于 1 秒：显示毫秒
 * - 小于 1 分钟：显示秒（保留两位小数）
 * - 其他：显示分钟和秒
 *
 * @param {number} value - 毫秒数
 * @returns {string} 格式化后的时长字符串
 *
 * @example
 * formatDuration(500); // '500 ms'
 * formatDuration(2500); // '2.50 s'
 * formatDuration(125000); // '2m 5.0s'
 */
export function formatDuration(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (value < 1000) return `${Math.round(value)} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest.toFixed(1)}s`;
}

/**
 * 任务状态中文化
 *
 * 将任务状态枚举值转换为中文显示文本。
 *
 * @param {TaskInfo["status"]} status - 任务状态
 * @returns {string} 中文状态文本
 *
 * @example
 * formatTaskStatus('succeeded'); // '成功'
 * formatTaskStatus('failed'); // '失败'
 * formatTaskStatus('running'); // '运行中'
 */
export function formatTaskStatus(status: TaskInfo["status"]): string {
  if (status === "succeeded") return "成功";
  if (status === "failed") return "失败";
  return "运行中";
}

/**
 * 任务时间拆分为日期和时间两部分
 *
 * 将完整的时间戳拆分为日期和时间两部分，便于 UI 分行显示。
 * 支持格式：YYYY-MM-DD HH:MM:SS 或 YYYY-MM-DD HH:MM
 *
 * @param {string} value - 时间字符串
 * @returns {{date: string, time: string}} 日期与时间片段
 *   - date: 日期部分（YYYY-MM-DD）
 *   - time: 时间部分（HH:MM:SS）
 *
 * @example
 * formatTaskTimeParts('2024-01-15 10:30:45.123');
 * // 返回 { date: '2024-01-15', time: '10:30:45' }
 *
 * formatTaskTimeParts('invalid');
 * // 返回 { date: 'invalid', time: '' }
 */
export function formatTaskTimeParts(value: string): { date: string; time: string } {
  if (!value) return { date: "", time: "" };
  const match = value.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?::(\d{2}))?/);
  if (match) {
    const seconds = match[3] ?? "00";
    return { date: match[1], time: `${match[2]}:${seconds}` };
  }
  return { date: value, time: "" };
}

/**
 * 识别/动作状态中文化
 *
 * 将节点执行状态转换为中文显示文本。
 *
 * @param {"success" | "failed"} status - 状态值
 * @returns {string} 中文状态文本
 *
 * @example
 * formatResultStatus('success'); // '成功'
 * formatResultStatus('failed'); // '失败'
 */
export function formatResultStatus(status: "success" | "failed"): string {
  return status === "success" ? "成功" : "失败";
}

/**
 * 组合 NextList 展示名称
 *
 * 根据条目的属性添加前缀标记：
 * - [JumpBack] 表示回跳节点
 * - [Anchor] 表示锚点节点
 *
 * @param {NextListItem} item - NextList 条目
 * @returns {string} 格式化后的展示字符串
 *
 * @example
 * formatNextName({ name: 'NextNode', jump_back: true, anchor: false });
 * // 返回 '[JumpBack] NextNode'
 *
 * formatNextName({ name: 'NextNode', jump_back: false, anchor: true });
 * // 返回 '[Anchor] NextNode'
 */
export function formatNextName(item: NextListItem): string {
  let prefix = "";
  if (item.jump_back) prefix += "[JumpBack] ";
  if (item.anchor) prefix += "[Anchor] ";
  return prefix + item.name;
}

/**
 * 将坐标框格式化为字符串
 *
 * 将边界框数组转换为易读的坐标格式 [x, y, w, h]。
 *
 * @param {[number, number, number, number] | null | undefined} box - 坐标框数组
 * @returns {string} 格式化后的坐标字符串
 *
 * @example
 * formatBox([100, 200, 50, 80]); // '[100, 200, 50, 80]'
 * formatBox(null); // '-'
 */
export function formatBox(box: [number, number, number, number] | null | undefined): string {
  if (!box) return "-";
  return `[${box.join(", ")}]`;
}

/**
 * 将Custom日志等级映射为 UI 颜色类型
 *
 * 根据日志等级返回对应的 Naive UI Tag 类型，
 * 用于在界面上以不同颜色显示不同级别的日志。
 *
 * @param {string} level - 原始日志等级
 * @returns {"default" | "primary" | "info" | "success" | "warning" | "error"} Naive UI Tag 类型
 *
 * @example
 * formatAuxLevel('ERROR'); // 'error'（红色）
 * formatAuxLevel('WARN'); // 'warning'（黄色）
 * formatAuxLevel('INFO'); // 'info'（蓝色）
 */
export function formatAuxLevel(
  level: string
): "default" | "primary" | "info" | "success" | "warning" | "error" {
  const normalized = level.toLowerCase();
  if (normalized === "error") return "error";
  if (normalized === "warn" || normalized === "warning") return "warning";
  if (normalized === "info") return "info";
  if (normalized === "debug") return "default";
  return "default";
}

/**
 * 将Custom日志等级规范化为统一枚举
 *
 * 将各种形式的日志等级统一为标准枚举值，
 * 用于日志过滤功能。
 *
 * @param {string} level - 原始日志等级
 * @returns {string} 归一化等级（"error" | "warn" | "info" | "debug" | "other"）
 *
 * @example
 * normalizeAuxLevel('ERROR'); // 'error'
 * normalizeAuxLevel('WARNING'); // 'warn'
 * normalizeAuxLevel('DEBUG'); // 'debug'
 * normalizeAuxLevel('TRACE'); // 'other'
 */
export function normalizeAuxLevel(level: string): string {
  const normalized = level.toLowerCase();
  if (normalized === "error") return "error";
  if (normalized === "warn" || normalized === "warning") return "warn";
  if (normalized === "info") return "info";
  if (normalized === "debug") return "debug";
  return "other";
}

/**
 * 生成节点基础信息摘要
 *
 * 将节点的主要信息组合为简洁的摘要字符串，
 * 用于折叠面板的标题显示。
 *
 * @param {NodeInfo} node - 节点信息
 * @returns {string} 摘要字符串（格式：名称 · 状态 · 时间戳）
 *
 * @example
 * summarizeBase({
 *   name: 'StartButton',
 *   status: 'success',
 *   timestamp: '2024-01-15 10:30:45',
 *   ...
 * });
 * // 返回 'StartButton · 成功 · 2024-01-15 10:30:45'
 */
export function summarizeBase(node: NodeInfo): string {
  const name = node.name || String(node.node_id);
  return `${name} · ${formatResultStatus(node.status)} · ${node.timestamp}`;
}

/**
 * 生成识别尝试摘要
 *
 * 统计节点的识别尝试次数和成功率，
 * 用于折叠面板的标题显示。
 *
 * @param {NodeInfo} node - 节点信息
 * @returns {string} 摘要字符串（格式：X 次（成功 Y / 失败 Z））
 *
 * @example
 * summarizeRecognition({
 *   recognition_attempts: [
 *     { status: 'success' },
 *     { status: 'failed' },
 *     { status: 'success' }
 *   ],
 *   ...
 * });
 * // 返回 '3 次（成功 2 / 失败 1）'
 */
export function summarizeRecognition(node: NodeInfo): string {
  const attempts = node.recognition_attempts || [];
  if (attempts.length === 0) return "无";
  const successCount = attempts.filter(item => item.status === "success").length;
  return `${attempts.length} 次（成功 ${successCount} / 失败 ${attempts.length - successCount}）`;
}

/**
 * 生成嵌套动作摘要
 *
 * 统计节点的嵌套动作节点数量和成功率，
 * 用于折叠面板的标题显示。
 *
 * @param {NodeInfo} node - 节点信息
 * @returns {string} 摘要字符串（格式：X 个（成功 Y / 失败 Z））
 *
 * @example
 * summarizeNestedActions({
 *   nested_action_nodes: [
 *     { status: 'success' },
 *     { status: 'success' }
 *   ],
 *   ...
 * });
 * // 返回 '2 个（成功 2 / 失败 0）'
 */
export function summarizeNestedActions(node: NodeInfo): string {
  const items = node.nested_action_nodes || [];
  if (items.length === 0) return "无";
  const successCount = items.filter(item => item.status === "success").length;
  return `${items.length} 个（成功 ${successCount} / 失败 ${items.length - successCount}）`;
}

/**
 * 生成 NextList 摘要
 *
 * 统计节点后续列表的条目数量，
 * 用于折叠面板的标题显示。
 *
 * @param {NodeInfo} node - 节点信息
 * @returns {string} 摘要字符串（格式：X 个 或 "无"）
 *
 * @example
 * summarizeNextList({ next_list: [{ name: 'A' }, { name: 'B' }], ... });
 * // 返回 '2 个'
 */
export function summarizeNextList(node: NodeInfo): string {
  const length = node.next_list?.length || 0;
  return length > 0 ? `${length} 个` : "无";
}

/**
 * 生成节点详情摘要
 *
 * 提取节点配置中的名称或 ID，
 * 用于折叠面板的标题显示。
 *
 * @param {NodeInfo} node - 节点信息
 * @returns {string} 摘要字符串
 *
 * @example
 * summarizeNodeDetail({
 *   node_details: { name: 'MyNode', node_id: 1, ... },
 *   ...
 * });
 * // 返回 'MyNode'
 */
export function summarizeNodeDetail(node: NodeInfo): string {
  if (!node.node_details) return "无";
  return `${node.node_details.name || node.node_details.node_id}`;
}

/**
 * 生成 Focus 摘要
 *
 * 检查节点是否包含 Focus 数据，
 * 用于折叠面板的标题显示。
 *
 * @param {NodeInfo} node - 节点信息
 * @returns {string} 摘要字符串（"有" 或 "无"）
 *
 * @example
 * summarizeFocus({ focus: { ... }, ... }); // '有'
 * summarizeFocus({ focus: null, ... }); // '无'
 */
export function summarizeFocus(node: NodeInfo): string {
  return node.focus ? "有" : "无";
}

/**
 * 分割匹配文本
 *
 * 将搜索匹配的文本行分割为三部分：
 * 匹配前的文本、匹配的文本、匹配后的文本。
 * 用于在搜索结果中高亮显示匹配部分。
 *
 * @param {string} line - 原始行内容
 * @param {number} start - 匹配起始位置
 * @param {number} end - 匹配结束位置
 * @returns {{before: string, match: string, after: string}} 分割后的文本片段
 *
 * @example
 * splitMatch('Hello World', 0, 5);
 * // 返回 { before: '', match: 'Hello', after: ' World' }
 *
 * splitMatch('Hello World', 6, 11);
 * // 返回 { before: 'Hello ', match: 'World', after: '' }
 */
export function splitMatch(
  line: string,
  start: number,
  end: number
): { before: string; match: string; after: string } {
  return {
    before: line.slice(0, start),
    match: line.slice(start, end),
    after: line.slice(end)
  };
}
