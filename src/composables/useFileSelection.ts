/**
 * @fileoverview 文件选择 Composable
 *
 * 本文件实现了文件选择功能的 Vue Composable，封装了：
 * - 文件选择器输入处理
 * - 拖拽文件处理
 * - Tauri 桌面环境的文件拖拽
 * - 文件列表管理
 *
 * 支持的文件来源：
 * - 浏览器文件选择器
 * - 浏览器拖拽
 * - Tauri 桌面拖拽（支持文件夹和 ZIP）
 *
 * @module composables/useFileSelection
 * @author MaaLogs Team
 * @license MIT
 */

import { ref, type Ref } from "vue";
import type { SelectedFile } from "@/types/logTypes";
import { getPlatform } from "@/platform";
import {
  applySelectedFiles as applyFiles,
  expandSelectedFiles,
  applySelectedPaths,
  isFileDrag,
  getFilesFromDragEvent,
} from "@/utils/file";
import { createLogger } from "@/utils/logger";

/**
 * 应用日志记录器
 */
const logger = createLogger("FileSelection");

/**
 * 浏览器环境目录选择对话框（回退方案）
 *
 * 通过创建 <input type="file" webkitdirectory> 元素来选择目录。
 * 注意：该能力依赖 Chromium，Firefox/Safari 支持有限。
 */
async function pickDirectoryFilesInBrowser(): Promise<File[]> {
  if (typeof document === "undefined") {
    return [];
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.style.display = "none";

    const cleanUp = () => {
      input.onchange = null;
      input.oncancel = null;
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    };

    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      cleanUp();
      resolve(files);
    };
    input.oncancel = () => {
      cleanUp();
      resolve([]);
    };

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * 文件选择器返回值
 *
 * 包含文件选择的所有状态和操作方法。
 *
 * @property {Ref<SelectedFile[]>} selectedFiles - 已选择的文件列表
 * @property {Ref<number>} totalSize - 文件总大小（字节）
 * @property {Ref<boolean>} isDragging - 是否正在拖拽中
 * @property {function} applySelectedFiles - 应用选择的文件
 * @property {function} handleFileChange - 处理文件选择输入框变更
 * @property {function} handleDrop - 处理拖拽释放事件
 * @property {function} handleDragOver - 处理拖拽悬停事件
 * @property {function} handleDragLeave - 处理拖拽离开事件
 * @property {function} handleRemoveSelectedFile - 移除选中的文件
 * @property {function} handleClearSelectedFiles - 清空所有选中的文件
 * @property {function} handleTauriDrop - 处理 Tauri 拖拽路径
 */
export interface FileSelectorResult {
  /** 已选择的文件列表 */
  selectedFiles: Ref<SelectedFile[]>;
  /** 用户选择的基准目录（用于查找截图等） */
  baseDir: Ref<string>;
  /** 文件总大小（字节） */
  totalSize: Ref<number>;
  /** 是否正在拖拽中 */
  isDragging: Ref<boolean>;
  /** 应用选择的文件 */
  applySelectedFiles: (fileList: File[]) => void;
  /** 打开目录选择对话框 */
  handleSelectDirectory: () => Promise<void>;
  /** 处理拖拽释放事件 */
  handleDrop: (event: DragEvent) => Promise<void>;
  /** 处理拖拽悬停事件 */
  handleDragOver: (event: DragEvent) => void;
  /** 处理拖拽离开事件 */
  handleDragLeave: (event: DragEvent) => void;
  /** 移除选中的文件 */
  handleRemoveSelectedFile: (index: number) => void;
  /** 清空所有选中的文件 */
  handleClearSelectedFiles: () => void;
  /** 处理 Tauri 拖拽路径 */
  handleTauriDrop: (paths: string[]) => Promise<void>;
}

/**
 * 文件选择器 Composable
 *
 * 封装文件选择、拖拽等核心逻辑，提供统一的文件管理接口。
 *
 * @param {function} [onFilesChange] - 文件列表变更时的回调函数
 * @returns {FileSelectorResult} 文件选择器的状态和方法
 *
 * @example
 * const {
 *   selectedFiles,
 *   isDragging,
 *   handleDrop,
 *   handleDragOver,
 *   handleFileChange
 * } = useFileSelection((files) => {
 *   console.log('文件已更新:', files);
 * });
 */
export function useFileSelection(
  onFilesChange?: (files: SelectedFile[]) => void
): FileSelectorResult {
  // ============================================
  // 响应式状态
  // ============================================

  /** 已选择的文件列表 */
  const selectedFiles = ref<SelectedFile[]>([]);
  const baseDir = ref<string>("");
  /** 文件总大小（字节） */
  const totalSize = ref(0);
  /** 是否正在拖拽中 */
  const isDragging = ref(false);

  // ============================================
  // 文件操作方法
  // ============================================

  /**
   * 应用选择的文件
   *
   * 将新选择的文件添加到文件列表中，自动去重并更新总大小。
   *
   * @param {File[]} fileList - 新选择的文件列表
   */
  function applySelectedFiles(fileList: File[]): void {
    const result = applyFiles(fileList, selectedFiles.value);
    selectedFiles.value = result.files;
    totalSize.value = result.totalSize;

    if (result.files.length > 0) {
      logger.info("已选择日志文件", {
        count: result.files.length,
        names: result.files.map((file) => file.name),
      });
    }

    onFilesChange?.(result.files);
  }

  /**
   * 处理文件选择输入框变更
   *
   * 当用户通过文件选择器选择文件时触发。
   * 支持选择文件夹和 ZIP 压缩包。
   *
   * @param {Event} event - 文件输入框的 change 事件
   */
  /**
   * 打开目录选择
   *
   * - 桌面环境：调用平台目录选择器，解析路径
   * - 浏览器环境：使用 webkitdirectory 选择目录，过滤与展开日志/ZIP
   */
  async function handleSelectDirectory(): Promise<void> {
    const platform = await getPlatform();
    const selected = await platform.picker.selectDirectory();
    if (selected) {
      await handleTauriDrop([selected]);
      return;
    }

    const browserFiles = await pickDirectoryFilesInBrowser();
    if (browserFiles.length === 0) {
      return;
    }
    const logFiles = await expandSelectedFiles(browserFiles);
    const hasVision =
      browserFiles.some((f) => {
        const rel = (f as any).webkitRelativePath || (f as any).__fullPath || "";
        return String(rel).replace(/\\/g, "/").toLowerCase().includes("/vision/");
      }) || false;
    if (logFiles.length === 0) {
      return;
    }
    if (hasVision) {
      baseDir.value = "/selected";
    }
    applySelectedFiles(logFiles);
  }

  /**
   * 处理拖拽释放事件
   *
   * 当用户拖拽文件并释放到目标区域时触发。
   * 支持拖拽 ZIP 文件，会自动解压并提取日志。
   *
   * @param {DragEvent} event - 拖拽释放事件
   */
  /**
   * 处理拖拽释放
   *
   * - 支持从文件或目录拖拽
   * - 目录通过 webkitGetAsEntry 递归展开
   * - ZIP 文件在后续 expandSelectedFiles 中解包筛选
   */
  async function handleDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    isDragging.value = false;

    const files = await getFilesFromDragEvent(event);
    const hasVision = files.some((f) => {
      const rel = (f as any).webkitRelativePath || (f as any).__fullPath || "";
      return String(rel).replace(/\\/g, "/").toLowerCase().includes("/vision/");
    });
    const logFiles = await expandSelectedFiles(files);
    if (logFiles.length === 0) return;

    if (hasVision) {
      baseDir.value = "/selected";
    }
    applySelectedFiles(logFiles);
  }

  /**
   * 处理拖拽悬停事件
   *
   * 当拖拽的文件悬停在目标区域上方时触发。
   * 设置拖拽效果并更新拖拽状态。
   *
   * @param {DragEvent} event - 拖拽悬停事件
   */
  function handleDragOver(event: DragEvent): void {
    // 检查是否为文件拖拽
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();

    // 设置拖拽效果为复制
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.dropEffect = "copy";
    }
    isDragging.value = true;
  }

  /**
   * 处理拖拽离开事件
   *
   * 当拖拽的文件离开目标区域时触发。
   * 重置拖拽状态。
   *
   * @param {DragEvent} event - 拖拽离开事件
   */
  /**
   * 处理拖拽离开
   *
   * 任何离开当前可投放区域的行为都应关闭遮罩，避免状态残留。
   */
  function handleDragLeave(event: DragEvent): void {
    event.stopPropagation();
    isDragging.value = false;
  }

  /**
   * 移除选中的文件
   *
   * 从文件列表中移除指定索引的文件。
   *
   * @param {number} index - 要移除的文件索引
   */
  function handleRemoveSelectedFile(index: number): void {
    selectedFiles.value = selectedFiles.value.filter((_, i) => i !== index);
    totalSize.value = selectedFiles.value.reduce((sum, file) => sum + file.size, 0);
    onFilesChange?.(selectedFiles.value);
  }

  /**
   * 清空所有选中的文件
   *
   * 重置文件列表和总大小。
   */
  function handleClearSelectedFiles(): void {
    selectedFiles.value = [];
    totalSize.value = 0;
    onFilesChange?.([]);
  }

  /**
   * 处理 Tauri 拖拽路径
   *
   * 在 Tauri 桌面环境中，处理从系统文件管理器拖入的路径。
   * 支持单个文件、文件夹和 ZIP 文件。
   *
   * @param {string[]} paths - 拖入的路径列表
   */
  async function handleTauriDrop(paths: string[]): Promise<void> {
    const result = await applySelectedPaths(paths);

    if (result.files.length === 0) {
      if (result.errors.length > 0) {
        logger.error("拖拽路径未解析到文件", {
          errors: result.errors,
          hasDirectory: result.hasDirectory,
          pathCount: paths.length,
        });
      }
      return;
    }

    logger.info("拖拽路径解析成功", { fileCount: result.files.length });
    baseDir.value = result.baseDir;
    applySelectedFiles(result.files);
  }

  // ============================================
  // 返回公共接口
  // ============================================

  return {
    selectedFiles,
    baseDir,
    totalSize,
    isDragging,
    applySelectedFiles,
    handleSelectDirectory,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleRemoveSelectedFile,
    handleClearSelectedFiles,
    handleTauriDrop,
  };
}
