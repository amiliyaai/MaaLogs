/**
 * @fileoverview 文件处理工具函数
 *
 * 本文件提供文件选择、拖拽处理、文件读取等核心功能。
 * 支持浏览器环境和 Tauri 桌面环境，能够处理普通文件、ZIP 压缩包和文件夹。
 *
 * @module utils/file
 * @author MaaLogs Team
 * @license MIT
 */

import { convertFileSrc } from "@tauri-apps/api/core";
import { readDir, readTextFile, readFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { unzipSync } from "fflate";
import type { SelectedFile, PipelineCustomActionInfo } from "../types/logTypes";
import { parsePipelineCustomActions } from "./parse";

/**
 * 推断文件类型，优先使用浏览器提供的 MIME 类型
 *
 * 当浏览器无法提供 MIME 类型时，根据文件扩展名进行推断。
 * 这是一个辅助函数，用于在文件元数据中记录文件类型。
 *
 * @param {File} file - 目标文件对象
 * @returns {string} 文件类型字符串（MIME 类型或扩展名）
 *
 * @example
 * const file = new File([''], 'test.log', { type: 'text/plain' });
 * getFileType(file); // 返回 'text/plain'
 *
 * const file2 = new File([''], 'test.json');
 * getFileType(file2); // 返回 'json'
 */
export function getFileType(file: File): string {
  if (file.type) return file.type;
  const parts = file.name.split(".");
  if (parts.length < 2) return "unknown";
  const extension = parts.pop();
  return extension ? extension.toLowerCase() : "unknown";
}

/**
 * 从路径中提取文件名
 *
 * 支持正斜杠和反斜杠两种路径分隔符，
 * 兼容 Windows 和 Unix 风格的文件路径。
 *
 * @param {string} path - 文件路径
 * @returns {string} 文件名（路径最后一部分）
 *
 * @example
 * getFileNameFromPath('/home/user/logs/maa.log'); // 返回 'maa.log'
 * getFileNameFromPath('C:\\Users\\logs\\maa.log'); // 返回 'maa.log'
 */
export function getFileNameFromPath(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] || path;
}

/**
 * 判断是否处于 Tauri 桌面应用环境
 *
 * 通过检查全局对象中是否存在 Tauri 特有的属性来判断运行环境。
 * Tauri 应用会在 window 对象上注入 __TAURI__ 或 __TAURI_INTERNALS__。
 *
 * @returns {boolean} 如果是 Tauri 环境返回 true，否则返回 false
 *
 * @example
 * if (isTauriEnv()) {
 *   // 使用 Tauri 特有的文件系统 API
 *   const content = await readTextFile('/path/to/file');
 * } else {
 *   // 使用浏览器标准的 File API
 *   const content = await file.text();
 * }
 */
export function isTauriEnv(): boolean {
  const win = window as Window & {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return !!win.__TAURI__ || !!win.__TAURI_INTERNALS__;
}

/**
 * 过滤支持的日志/配置文件
 *
 * 从文件列表中筛选出应用支持的文件类型：
 * - .log - 日志文件
 * - .json - JSON 配置文件
 * - .jsonc - 带注释的 JSON 配置文件
 *
 * @param {File[]} fileList - 原始文件列表
 * @returns {File[]} 可解析的文件列表
 *
 * @example
 * const files = [
 *   new File([''], 'maa.log'),
 *   new File([''], 'image.png'),
 *   new File([''], 'config.json')
 * ];
 * filterLogFiles(files); // 返回 maa.log 和 config.json
 */
export function filterLogFiles(fileList: File[]): File[] {
  return fileList.filter(file => {
    const lower = file.name.toLowerCase();
    return lower.endsWith(".log") || lower.endsWith(".json") || lower.endsWith(".jsonc");
  });
}

/**
 * 展开拖拽/选择的文件，处理 ZIP 压缩包内的日志
 *
 * 此函数处理以下情况：
 * 1. 普通日志/配置文件 - 直接添加到结果
 * 2. ZIP 压缩包 - 解压并提取其中的 maa.log 或 go-service.log
 *
 * 对于 ZIP 文件，只提取特定的日志文件，避免处理无关内容。
 *
 * @param {File[]} fileList - 文件列表（可能包含 ZIP 文件）
 * @returns {Promise<File[]>} 展开后的文件列表
 *
 * @example
 * // 处理包含 ZIP 的文件列表
 * const files = await expandSelectedFiles([
 *   new File(['...'], 'logs.zip'),
 *   new File(['...'], 'config.json')
 * ]);
 * // 返回 ZIP 中提取的日志文件 + config.json
 */
export async function expandSelectedFiles(fileList: File[]): Promise<File[]> {
  /**
   * 判断文件是否为支持的日志/配置文件
   * @param {string} name - 文件名
   * @returns {boolean} 是否支持
   */
  const allowFile = (name: string): boolean => {
    const lower = name.toLowerCase();
    return lower.endsWith(".log") || lower.endsWith(".json") || lower.endsWith(".jsonc");
  };

  /**
   * 判断 ZIP 条目是否为需要提取的日志文件
   * 只提取 maa.log 和 go-service.log，避免处理其他文件
   * @param {string} name - ZIP 条目名称
   * @returns {boolean} 是否需要提取
   */
  const allowZipEntry = (name: string): boolean => {
    const lower = name.toLowerCase();
    return lower === "maa.log" || lower === "go-service.log";
  };

  const outFiles: File[] = [];

  for (const file of fileList) {
    const lowerName = file.name.toLowerCase();

    // 处理 ZIP 压缩包
    if (lowerName.endsWith(".zip")) {
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const zip = unzipSync(buf);
        const decoder = new TextDecoder("utf-8");

        for (const [entryName, data] of Object.entries(zip)) {
          const entryBaseName = getFileNameFromPath(entryName);
          if (!allowZipEntry(entryBaseName)) continue;

          const text = decoder.decode(data as Uint8Array);
          outFiles.push(new File([text], entryBaseName, { type: "text/plain" }));
        }
      } catch {
        // ZIP 解析失败，跳过此文件
        continue;
      }
      continue;
    }

    // 处理普通文件
    if (allowFile(file.name)) {
      outFiles.push(file);
    }
  }

  return outFiles;
}

/**
 * 处理 Tauri 拖拽路径，支持文件夹、ZIP 与单文件
 *
 * 此函数用于 Tauri 桌面环境，处理从系统文件管理器拖入的路径。
 * 支持以下场景：
 * 1. 单个日志文件 - 直接读取
 * 2. ZIP 压缩包 - 解压并提取日志
 * 3. 文件夹 - 递归查找其中的 maa.log 和 go-service.log
 *
 * @param {string[]} paths - 选中的路径列表
 * @returns {Promise<{files: File[], errors: string[], hasDirectory: boolean}>} 处理后的状态信息
 *   - files: 解析出的文件列表
 *   - errors: 处理过程中的错误信息
 *   - hasDirectory: 是否包含文件夹
 *
 * @example
 * // 用户拖入一个文件夹
 * const result = await applySelectedPaths(['/home/user/logs']);
 * console.log(result.files); // 包含 maa.log 和 go-service.log
 */
export async function applySelectedPaths(paths: string[]): Promise<{
  files: File[];
  errors: string[];
  hasDirectory: boolean;
}> {
  /**
   * 判断文件是否为支持的日志/配置文件
   * @param {string} name - 文件名
   * @returns {boolean} 是否支持
   */
  const allowFile = (name: string): boolean => {
    const lower = name.toLowerCase();
    return lower.endsWith(".log") || lower.endsWith(".json") || lower.endsWith(".jsonc");
  };

  /**
   * 判断文件夹中的文件是否为需要提取的日志文件
   * @param {string} name - 文件名
   * @returns {boolean} 是否需要提取
   */
  const allowDirectoryFile = (name: string): boolean => {
    const lower = name.toLowerCase();
    return lower === "maa.log" || lower === "go-service.log";
  };

  const decoder = new TextDecoder("utf-8");
  const outFiles: File[] = [];
  const errors: string[] = [];
  let hasDirectory = false;

  /**
   * 递归收集文件夹中的日志文件
   * @param {string} dirPath - 文件夹路径
   * @returns {Promise<boolean>} 是否成功读取文件夹
   */
  async function collectDir(dirPath: string): Promise<boolean> {
    try {
      const rootEntries = await readDir(dirPath);
      hasDirectory = true;

      /**
       * 递归遍历文件夹
       * @param {string} current - 当前路径
       */
      async function walk(current: string): Promise<void> {
        const entries = await readDir(current);
        for (const entry of entries) {
          if (entry.isDirectory) {
            const next = await join(current, entry.name);
            await walk(next);
          } else if (entry.isFile && allowDirectoryFile(entry.name)) {
            const filePath = await join(current, entry.name);
            const text = await readTextFile(filePath);
            outFiles.push(new File([text], entry.name, { type: "text/plain" }));
          }
        }
      }

      await walk(dirPath);
      return rootEntries.length >= 0;
    } catch (error) {
      if (error) errors.push(String(error));
      return false;
    }
  }

  /**
   * 处理单个文件路径
   * @param {string} filePath - 文件路径
   */
  async function collectFile(filePath: string): Promise<void> {
    const name = getFileNameFromPath(filePath);

    // 处理 ZIP 文件
    if (name.toLowerCase().endsWith(".zip")) {
      try {
        const buf = await readFile(filePath);
        const zip = unzipSync(buf);
        for (const [entryName, data] of Object.entries(zip)) {
          const entryBaseName = getFileNameFromPath(entryName);
          if (!allowDirectoryFile(entryBaseName)) continue;

          const text = decoder.decode(data as Uint8Array);
          outFiles.push(new File([text], entryBaseName, { type: "text/plain" }));
        }
        return;
      } catch (error) {
        if (error) errors.push(String(error));
      }
    }

    // 处理普通文件
    if (allowFile(name)) {
      try {
        const text = await readTextFile(filePath);
        outFiles.push(new File([text], name, { type: "text/plain" }));
        return;
      } catch (error) {
        if (error) errors.push(String(error));
        // 尝试使用 convertFileSrc 作为后备方案
        try {
          const url = convertFileSrc(filePath);
          const response = await fetch(url);
          const blob = await response.blob();
          outFiles.push(new File([blob], name, { type: "text/plain" }));
          return;
        } catch (fallbackError) {
          if (fallbackError) errors.push(String(fallbackError));
        }
      }
    }
  }

  for (const p of paths) {
    const isDir = await collectDir(p);
    if (!isDir) {
      await collectFile(p);
    }
  }

  return { files: outFiles, errors, hasDirectory };
}

/**
 * 判断是否为文件拖拽事件
 *
 * 检查拖拽事件的数据类型中是否包含文件。
 * 用于区分文件拖拽和其他类型的拖拽（如文本）。
 *
 * @param {DragEvent} event - 拖拽事件对象
 * @returns {boolean} 如果是文件拖拽返回 true
 *
 * @example
 * element.addEventListener('dragover', (e) => {
 *   if (isFileDrag(e)) {
 *     e.preventDefault();
 *     // 显示拖拽提示
 *   }
 * });
 */
export function isFileDrag(event: DragEvent): boolean {
  const types = Array.from(event.dataTransfer?.types || []);
  return types.includes("Files");
}

/**
 * 处理文件选择输入框变更
 *
 * 当用户通过文件选择器选择文件后，此函数：
 * 1. 获取选中的文件列表
 * 2. 展开可能存在的 ZIP 文件
 * 3. 重置输入框以允许重复选择相同文件
 *
 * @param {Event} event - 文件输入框的 change 事件
 * @returns {Promise<File[]>} 处理后的文件列表
 *
 * @example
 * <input type="file" @change="handleFileInputChange" />
 */
export async function handleFileInputChange(event: Event): Promise<File[]> {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return [];

  const logFiles = await expandSelectedFiles(Array.from(input.files));
  input.value = ""; // 重置以允许重复选择

  return logFiles;
}

/**
 * 应用用户选择的文件并重置解析状态
 *
 * 将新选择的文件添加到现有文件列表中，自动去重。
 * 同时计算文件总大小并生成状态消息。
 *
 * @param {File[]} fileList - 新选择的文件列表
 * @param {SelectedFile[]} existingFiles - 已存在的文件列表
 * @returns {{files: SelectedFile[], totalSize: number, statusMessage: string}} 新的文件列表和状态信息
 *   - files: 合并后的文件列表
 *   - totalSize: 文件总大小（字节）
 *   - statusMessage: 状态消息
 *
 * @example
 * const result = applySelectedFiles(newFiles, existingFiles);
 * console.log(result.statusMessage); // "已选择 3 个文件"
 */
export function applySelectedFiles(
  fileList: File[],
  existingFiles: SelectedFile[]
): {
  files: SelectedFile[];
  totalSize: number;
  statusMessage: string;
} {
  // 转换为 SelectedFile 格式
  const newFiles = fileList.map(file => ({
    name: file.name,
    size: file.size,
    type: getFileType(file),
    file
  }));

  // 去重：排除已存在的文件
  const existingNames = new Set(existingFiles.map(f => f.name));
  const uniqueNewFiles = newFiles.filter(f => !existingNames.has(f.name));

  // 如果没有新文件
  if (uniqueNewFiles.length === 0) {
    return {
      files: existingFiles,
      totalSize: existingFiles.reduce((sum, file) => sum + file.size, 0),
      statusMessage: "所选文件已存在"
    };
  }

  // 合并文件列表
  const updatedFiles = [...existingFiles, ...uniqueNewFiles];
  const totalSize = updatedFiles.reduce((sum, file) => sum + file.size, 0);

  return {
    files: updatedFiles,
    totalSize,
    statusMessage: `已选择 ${updatedFiles.length} 个文件`
  };
}

/**
 * 解析 JSON 配置文件并提取 Pipeline Custom Actions
 *
 * 读取 Pipeline JSON 配置文件内容，提取其中定义的 Custom Action。
 * 这些信息用于在日志分析时关联节点与对应的自定义动作实现。
 *
 * @param {string} content - 文件内容
 * @param {string} fileName - 文件名（用于记录来源）
 * @returns {{actions: Record<string, PipelineCustomActionInfo[]>, keywords: Record<string, string[]>}} Custom Actions 映射
 *   - actions: 节点名到 Custom Action 的映射
 *   - keywords: 节点名到关键词的映射
 *
 * @example
 * const result = parsePipelineFile(jsonContent, 'pipeline.json');
 * console.log(result.actions['MyNode']); // [{ name: 'MyCustomAction', fileName: 'pipeline.json' }]
 */
export function parsePipelineFile(
  content: string,
  fileName: string
): {
  actions: Record<string, PipelineCustomActionInfo[]>;
  keywords: Record<string, string[]>;
} {
  return parsePipelineCustomActions(content, fileName);
}

/**
 * 判断文件是否为 go-service 日志
 *
 * go-service 日志具有特定的文件名模式。
 * 此函数用于决定是否使用 MaaEnd 解析器处理该文件。
 *
 * 排除规则：
 * - maa.log - 主日志文件，不是 go-service 日志
 * - .json/.jsonc - 配置文件，不是日志
 *
 * @param {string} fileName - 文件名
 * @returns {boolean} 是否为 go-service 日志
 *
 * @example
 * isGoServiceLog('go-service.log'); // true
 * isGoServiceLog('maa.log'); // false
 * isGoServiceLog('config.json'); // false
 */
export function isGoServiceLog(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  if (lowerName.includes("maa.log") || lowerName === "maa.log") return false;
  if (lowerName.endsWith(".json") || lowerName.endsWith(".jsonc")) return false;
  return true;
}

/**
 * 从时间戳中提取日期部分
 *
 * 支持多种时间戳格式，提取日期部分用于日志关联。
 * 将斜杠格式统一转换为横杠格式。
 *
 * @param {string} ts - 时间戳字符串
 * @returns {string | null} 日期字符串（YYYY-MM-DD）或 null
 *
 * @example
 * extractDateFromTimestamp('2024-01-15 10:30:45'); // '2024-01-15'
 * extractDateFromTimestamp('2024/01/15 10:30:45'); // '2024-01-15'
 * extractDateFromTimestamp('10:30:45'); // null（无日期部分）
 */
export function extractDateFromTimestamp(ts: string): string | null {
  const dateMatch = ts.match(/^(\d{4}[-/]\d{2}[-/]\d{2})/);
  return dateMatch ? dateMatch[1].replace(/\//g, "-") : null;
}
