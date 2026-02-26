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
import type { SelectedFile } from "../types/logTypes";
import {
  applySelectedFiles as applyFiles,
  expandSelectedFiles,
  handleFileInputChange,
  applySelectedPaths,
  isFileDrag,
} from "../utils/file";
import { createLogger } from "../utils/logger";

/**
 * 应用日志记录器
 */
const logger = createLogger("FileSelection");

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
  /** 文件总大小（字节） */
  totalSize: Ref<number>;
  /** 是否正在拖拽中 */
  isDragging: Ref<boolean>;
  /** 应用选择的文件 */
  applySelectedFiles: (fileList: File[]) => void;
  /** 处理文件选择输入框变更 */
  handleFileChange: (event: Event) => Promise<void>;
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
   *
   * @param {Event} event - 文件输入框的 change 事件
   */
  async function handleFileChange(event: Event): Promise<void> {
    const logFiles = await handleFileInputChange(event);
    if (logFiles.length === 0) return;
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
  async function handleDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    isDragging.value = false;

    const files = Array.from(event.dataTransfer?.files || []);
    const logFiles = await expandSelectedFiles(files);
    if (logFiles.length === 0) return;

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
  function handleDragLeave(event: DragEvent): void {
    event.stopPropagation();
    // 确保是离开目标元素本身，而不是子元素
    if (event.currentTarget !== event.target) return;
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
    applySelectedFiles(result.files);
  }

  // ============================================
  // 返回公共接口
  // ============================================

  return {
    selectedFiles,
    totalSize,
    isDragging,
    applySelectedFiles,
    handleFileChange,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleRemoveSelectedFile,
    handleClearSelectedFiles,
    handleTauriDrop,
  };
}
