/**
 * @fileoverview 文件处理配置
 *
 * 本文件定义文件处理相关的所有配置项，包括：
 * - 浏览器环境下单个文件的大小限制
 * - ZIP 压缩包处理的条目数量和大小限制
 * - 支持导入的日志文件名称匹配模式
 * - 是否导入 maa.bak.log 配置
 *
 * 使用说明：
 * - FILE_CONFIG 用于控制文件导入的行为限制
 * - 合理设置这些值可以防止内存溢出和长时间处理
 *
 * @module config/file
 */

/**
 * 文件处理配置
 *
 * 控制文件导入和处理的各种限制参数
 *
 * @property {number} maxBrowserFileBytes - 浏览器环境下单个文件的最大字节数
 *   - 默认 80 MB (80 * 1024 * 1024 字节)
 *   - 浏览器内存限制，超过此大小的文件将被跳过
 *   - 桌面端（Tauri）无此限制
 * @property {number} maxZipEntries - ZIP 压缩包内最多处理的条目数
 *   - 默认 2000 个文件
 *   - 用于防止恶意或损坏的 ZIP 文件导致内存溢出
 *   - 超出限制时只处理前 N 个条目
 * @property {number} maxZipUncompressedBytes - ZIP 压缩包解压后的最大字节数
 *   - 默认 256 MB (256 * 1024 * 1024 字节)
 *   - 用于防止解压超大型 ZIP 文件导致内存不足
 *   - 超出限制时停止解压
 * @property {RegExp} logFilePattern - 支持导入的日志文件名称匹配模式
 *   - 正则表达式，用于匹配文件名
 *   - 匹配规则：
 *     - maa.log - MAA 主日志
 *     - go-service.log - Go Service 日志
 *     - YYYY-MM-DD.log - 按日期命名的日志（如 2024-01-01.log）
 *   - 不区分大小写（/i 标志）
 *
 * @example
 * // 调整配置以适应更大文件
 * const config = {
 *   maxBrowserFileBytes: 120 * 1024 * 1024,  // 120 MB
 *   maxZipEntries: 5000,                        // 更多条目
 *   maxZipUncompressedBytes: 512 * 1024 * 1024 // 512 MB
 * };
 *
 * @example
 * // 修改日志文件匹配模式
 * const config = {
 *   // 添加匹配 custom.log
 *   logFilePattern: /^(?:maa|go-service|custom|\d{4}-\d{2}-\d{2})\.log$/i
 * };
 */
export const FILE_CONFIG = {
  /** 浏览器环境下单个文件的最大字节数 (80 MB) */
  maxBrowserFileBytes: 80 * 1024 * 1024,
  /** ZIP 压缩包内最多处理的条目数 */
  maxZipEntries: 2000,
  /** ZIP 压缩包解压后的最大字节数 (256 MB) */
  maxZipUncompressedBytes: 256 * 1024 * 1024,
  /** 支持导入的日志文件名称匹配模式 */
  logFilePattern: /^(?:maa|go-service|\d{4}-\d{2}-\d{2})\.log$/i,
  /** 获取是否导入 maa.bak.log 的回调函数，由 App.vue 设置 */
  getImportMaaBakLog: (): boolean => false,
};

export function setImportMaaBakLogGetter(getter: () => boolean): void {
  FILE_CONFIG.getImportMaaBakLog = getter;
}
