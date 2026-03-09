/**
 * @fileoverview 文件监控 Composable
 *
 * 本文件实现了文件监控功能的 Vue Composable，负责：
 * - 扫描目录并识别需要监控的日志文件
 * - 检测文件变更（通过 mtime 和 position）
 * - 增量读取新增内容
 *
 * 性能优化：
 * - 大文件只读取最后 10MB（通过 LOG_WATCHER_CONFIG.MAX_INITIAL_READ_SIZE 配置）
 * - 使用 position 跟踪已读取位置，支持增量读取
 * - 批量处理变更减少 DOM 更新
 *
 * @module composables/useFileWatcher
 */

import { ref } from "vue";
import { getPlatform } from "@/platform";
import { shouldWatchFile, isMainLogFile, LOG_WATCHER_CONFIG } from "@/config/logFiles";
import { createLogger } from "@/utils/logger";

const logger = createLogger("FileWatcher");

/** 从配置中读取最大初始读取大小 */
const MAX_INITIAL_READ_SIZE = LOG_WATCHER_CONFIG.MAX_INITIAL_READ_SIZE;

/**
 * 监控文件的信息
 *
 * @property path - 文件完整路径
 * @property filename - 文件名
 * @property mtime - 文件修改时间戳
 * @property position - 已读取位置（用于增量读取）
 * @property size - 文件当前大小
 * @property lastReadTime - 最后读取时间
 */
export interface WatchedFile {
  path: string;
  filename: string;
  mtime: number;
  position: number;
  size: number;
  lastReadTime: number;
}

/**
 * 文件变更信息
 *
 * @property file - 变更的文件信息
 * @property newContent - 新增的内容
 * @property isMainLog - 是否为主日志文件
 */
export interface FileChange {
  file: WatchedFile;
  newContent: string;
  isMainLog: boolean;
}

/**
 * FileWatcher 返回的接口定义
 */
export interface FileWatcherResult {
  /** 当前监控的文件列表 */
  watchedFiles: ReturnType<typeof ref<WatchedFile[]>>;
  /** 是否正在监控 */
  isWatching: ReturnType<typeof ref<boolean>>;
  /** 初始化监控 */
  init: (dirPath: string, projectType: string) => Promise<void>;
  /** 开始监控 */
  startWatching: () => void;
  /** 停止监控 */
  stopWatching: () => void;
  /** 更新文件位置 */
  updateFilePositions: () => void;
  /** 获取变更并清除缓存 */
  getChanges: () => FileChange[];
  /** 重置监控状态 */
  reset: () => void;
}

/**
 * 创建文件监控器
 *
 * @returns 文件监控器接口
 *
 * @example
 * const watcher = useFileWatcher();
 * await watcher.init("/path/to/logs", "m9a");
 * watcher.startWatching();
 *
 * const changes = watcher.getChanges();
 * // 处理变更...
 */
export function useFileWatcher(): FileWatcherResult {
  const watchedFiles = ref<WatchedFile[]>([]);
  const isWatching = ref(false);
  const fileChanges = ref<FileChange[]>([]);

  let watchInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * 初始化文件监控
   *
   * 扫描目录，识别需要监控的日志文件
   * 对于大文件（> MAX_INITIAL_READ_SIZE），只读取最后一部分
   * 初始化时会读取从 initialPosition 到文件末尾的内容
   *
   * @param dirPath - 日志目录路径
   * @param projectType - 项目类型（m9a / maaend）
   */
  async function init(dirPath: string, projectType: string): Promise<void> {
    logger.info(`Initializing file watcher for directory: ${dirPath}, project type: ${projectType}`);

    const platform = await getPlatform();
    const entries = await platform.vfs.list(dirPath);

    const files: WatchedFile[] = [];
    const changes: FileChange[] = [];

    for (const entry of entries) {
      if (entry.type !== "file") continue;

      const filename = entry.name;
      if (!shouldWatchFile(filename, projectType)) continue;

      try {
        const filePath = await platform.vfs.join(dirPath, filename);
        const stat = await platform.vfs.stat(filePath);

        const fileSize = stat.size ?? 0;
        let initialPosition = 0;

        /** 大文件处理：只读取最后 MAX_INITIAL_READ_SIZE 字节 */
        if (fileSize > MAX_INITIAL_READ_SIZE) {
          initialPosition = fileSize - MAX_INITIAL_READ_SIZE;
          logger.debug(`Large file detected ${filename}: ${fileSize} bytes, starting from position ${initialPosition}`);
        }

        /** 读取从 initialPosition 到文件末尾的内容 */
        let initialContent = "";
        if (fileSize > 0 && initialPosition < fileSize) {
          initialContent = await readFileContent(filePath, initialPosition, fileSize);
        }

        const watchedFile: WatchedFile = {
          path: filePath,
          filename,
          mtime: stat.mtime ?? 0,
          position: fileSize,
          size: fileSize,
          lastReadTime: Date.now(),
        };
        files.push(watchedFile);

        /** 如果有初始内容，添加到变更列表 */
        if (initialContent.trim()) {
          const isMain = isMainLogFile(filename);
          const lines = initialContent.split(/\r?\n/).length;
          changes.push({
            file: watchedFile,
            newContent: initialContent,
            isMainLog: isMain,
          });
          logger.debug(`Initial content for ${filename}: ${lines} lines, isMainLog: ${isMain}`);
        }

        logger.debug(`Found file to watch: ${filename}, size: ${fileSize}, start position: ${initialPosition}`);
      } catch (err) {
        logger.warn(`Failed to stat file ${filename}: ${err}`);
      }
    }

    watchedFiles.value = files;
    fileChanges.value = changes;
    logger.info(`File watcher initialized with ${files.length} files, ${changes.length} initial changes`);
  }

  /**
   * 读取文件内容（支持增量读取）
   *
   * 使用二进制读取来正确处理字节位置，避免 UTF-8 编码问题
   *
   * @param filePath - 文件路径
   * @param startPosition - 起始位置（字节）
   * @param _expectedSize - 预期文件大小（字节），保留参数
   * @returns 文件新增内容
   */
  async function readFileContent(filePath: string, startPosition: number, _expectedSize: number): Promise<string> {
    const platform = await getPlatform();
    
    if (startPosition === 0) {
      return platform.vfs.readText(filePath);
    }

    /** 使用二进制读取，从指定字节位置开始 */
    const binaryData = await platform.vfs.readBinary(filePath);
    const totalBytes = binaryData.length;
    
    if (startPosition >= totalBytes) {
      return "";
    }
    
    /** 找到第一个完整行，避免读取不完整的行 */
    let newlineOffset = startPosition;
    while (newlineOffset < totalBytes && binaryData[newlineOffset] !== 10) {
      newlineOffset++;
    }
    
    /** 如果找到换行符，从换行符后开始读取 */
    const startOffset = newlineOffset < totalBytes ? newlineOffset + 1 : startPosition;
    
    /** 提取新增内容的字节数组 */
    const newContentBytes = binaryData.slice(startOffset);
    
    /** 将字节数组转换为字符串 */
    const decoder = new TextDecoder("utf-8", { fatal: false });
    return decoder.decode(newContentBytes);
  }

  /**
   * 检查文件变更
   *
   * 通过比较 mtime 和 size 判断文件是否有变化
   * 如有变化，读取新增内容
   */
  async function checkForChanges(): Promise<void> {
    const platform = await getPlatform();
    const changes: FileChange[] = [];
    const now = Date.now();

    for (const watched of watchedFiles.value) {
      try {
        const stat = await platform.vfs.stat(watched.path);
        const newMtime = stat.mtime ?? 0;
        const newSize = stat.size ?? 0;

        /** 检测到文件变化 */
        if (newMtime > watched.mtime || newSize > watched.size) {
          const isMain = isMainLogFile(watched.filename);

          let newContent = "";
          if (newSize > watched.position) {
            newContent = await readFileContent(watched.path, watched.position, newSize);
          }

          watched.mtime = newMtime;
          watched.size = newSize;
          watched.position = newSize;
          watched.lastReadTime = now;

          if (newContent.trim()) {
            const lines = newContent.split(/\r?\n/).length;
            changes.push({
              file: { ...watched },
              newContent: newContent,
              isMainLog: isMain,
            });
            logger.debug(`File changed: ${watched.filename}, ${lines} new lines, isMainLog: ${isMain}`);
          }
        }
      } catch (err) {
        logger.warn(`Error checking file ${watched.filename}: ${err}`);
      }
    }

    if (changes.length > 0) {
      fileChanges.value = changes;
    }
  }

  /**
   * 开始文件监控
   *
   * 设置定时器，定期检查文件变更
   */
  function startWatching(): void {
    if (isWatching.value) return;

    isWatching.value = true;
    watchInterval = setInterval(checkForChanges, LOG_WATCHER_CONFIG.POLL_INTERVAL_MS);
    logger.info("File watcher started");
  }

  /**
   * 停止文件监控
   *
   * 清除定时器，停止检查
   */
  function stopWatching(): void {
    if (!isWatching.value) return;

    isWatching.value = false;
    if (watchInterval) {
      clearInterval(watchInterval);
      watchInterval = null;
    }
    logger.info("File watcher stopped");
  }

  /**
   * 更新所有监控文件的当前位置
   *
   * 在初始加载完成后调用，避免重复读取已处理的内容
   */
  function updateFilePositions(): void {
    for (const watched of watchedFiles.value) {
      watched.position = watched.size;
    }
    logger.debug("Updated file positions after initial load");
  }

  /**
   * 获取文件变更
   *
   * @returns 自上次获取后的所有文件变更
   */
  function getChanges(): FileChange[] {
    const changes = [...fileChanges.value];
    fileChanges.value = [];
    return changes;
  }

  /**
   * 重置监控状态
   *
   * 停止监控，清空文件列表和变更缓存
   */
  function reset(): void {
    stopWatching();
    watchedFiles.value = [];
    fileChanges.value = [];
    logger.info("File watcher reset");
  }

  return {
    watchedFiles,
    isWatching,
    init,
    startWatching,
    stopWatching,
    updateFilePositions,
    getChanges,
    reset,
  };
}
