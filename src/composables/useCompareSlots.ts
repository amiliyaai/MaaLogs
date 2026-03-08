/**
 * @fileoverview 对比视图的解析槽位管理
 *
 * 提供基准与对比分别加载日志并生成快照的组合式逻辑。
 */
import type { ComputedRef, Ref } from "vue";
import type {
  AuxLogEntry,
  ParsedRunSnapshot,
  RawLine,
  SelectedFile,
  TaskInfo,
} from "@/types/logTypes";
import type { ParseState } from "@/composables/useLogParser";
import { setSelectedFiles } from "@/composables/useLogParser";
import { applySelectedPaths, getFileType } from "@/utils/file";
import { buildParsedRunSnapshot } from "@/utils/diffDetection";
import { createLogger } from "@/utils/logger";

type CompareSlot = "baseline" | "candidate";

interface UseCompareSlotsOptions {
  selectedFiles: Ref<SelectedFile[]>;
  parseState: Ref<ParseState>;
  parseProgress: Ref<number>;
  statusMessage: Ref<string>;
  tasks: Ref<TaskInfo[]>;
  rawLines: Ref<RawLine[]>;
  auxLogs: Ref<AuxLogEntry[]>;
  detectedProject: Ref<string>;
  selectedProcessId: Ref<string>;
  selectedThreadId: Ref<string>;
  nodeStatistics: ComputedRef<ParsedRunSnapshot["nodeStatistics"]>;
  nodeSummary: ComputedRef<ParsedRunSnapshot["nodeSummary"]>;
  handleParse: () => Promise<void>;
  resetParseState: () => void;
  setBaselineSnapshot: (snapshot: ParsedRunSnapshot) => void;
  setCandidateSnapshot: (snapshot: ParsedRunSnapshot) => void;
}

type ParserStateBackup = {
  parseState: ParseState;
  parseProgress: number;
  statusMessage: string;
  tasks: TaskInfo[];
  rawLines: RawLine[];
  auxLogs: AuxLogEntry[];
  detectedProject: string;
  selectedProcessId: string;
  selectedThreadId: string;
};

const logger = createLogger("CompareSlots");

function cloneNodeSummary(
  summary: ParsedRunSnapshot["nodeSummary"]
): ParsedRunSnapshot["nodeSummary"] {
  if (!summary) return null;
  return {
    ...summary,
    slowestNode: summary.slowestNode ? { ...summary.slowestNode } : null,
  };
}

/**
 * 对比槽位管理 Composable
 *
 * 在不影响当前解析状态的前提下，解析基准/对比日志并生成快照。
 */
export function useCompareSlots(options: UseCompareSlotsOptions) {
  async function handleSelectBaselineDir(): Promise<void> {
    const paths = await selectDirectory();
    if (paths.length > 0) {
      await processSlotPaths("baseline", paths);
    }
  }

  async function handleSelectBaselineZip(): Promise<void> {
    const paths = await selectZipFile();
    if (paths.length > 0) {
      await processSlotPaths("baseline", paths);
    }
  }

  async function handleSelectCandidateDir(): Promise<void> {
    const paths = await selectDirectory();
    if (paths.length > 0) {
      await processSlotPaths("candidate", paths);
    }
  }

  async function handleSelectCandidateZip(): Promise<void> {
    const paths = await selectZipFile();
    if (paths.length > 0) {
      await processSlotPaths("candidate", paths);
    }
  }

  async function selectDirectory(): Promise<string[]> {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: false,
      directory: true,
    });
    if (!selected) return [];
    return Array.isArray(selected) ? selected : [selected];
  }

  async function selectZipFile(): Promise<string[]> {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: false,
      filters: [{ name: "压缩包", extensions: ["zip"] }],
    });
    if (!selected) return [];
    return Array.isArray(selected) ? selected : [selected];
  }

  async function processSlotFiles(slot: CompareSlot, parserFiles: SelectedFile[]): Promise<void> {
    const previousParserFiles = options.selectedFiles.value;
    const parserStateBackup: ParserStateBackup = {
      parseState: options.parseState.value,
      parseProgress: options.parseProgress.value,
      statusMessage: options.statusMessage.value,
      tasks: options.tasks.value,
      rawLines: options.rawLines.value,
      auxLogs: options.auxLogs.value,
      detectedProject: options.detectedProject.value,
      selectedProcessId: options.selectedProcessId.value,
      selectedThreadId: options.selectedThreadId.value,
    };
    try {
      setSelectedFiles(parserFiles);
      options.resetParseState();
      await options.handleParse();
      if (options.tasks.value.length === 0) {
        logger.warn("对比槽位解析完成但任务为空", { slot, fileCount: parserFiles.length });
        return;
      }
      const snapshot = buildParsedRunSnapshot({
        tasks: [...options.tasks.value],
        sourceName: parserFiles[0].name,
        detectedProject: options.detectedProject.value,
        label: slot === "baseline" ? "基准运行" : "当前运行",
        nodeStatistics: [...options.nodeStatistics.value],
        nodeSummary: cloneNodeSummary(options.nodeSummary.value),
      });
      if (slot === "baseline") {
        options.setBaselineSnapshot(snapshot);
      } else {
        options.setCandidateSnapshot(snapshot);
      }
      logger.info("对比槽位加载完成", {
        slot,
        sourceName: snapshot.sourceName,
        taskCount: snapshot.totalTaskCount,
        failedTaskCount: snapshot.failedTaskCount,
      });
    } catch (error) {
      logger.error("对比槽位加载失败", { slot, error: String(error) });
    } finally {
      setSelectedFiles(previousParserFiles);
      options.parseState.value = parserStateBackup.parseState;
      options.parseProgress.value = parserStateBackup.parseProgress;
      options.statusMessage.value = parserStateBackup.statusMessage;
      options.tasks.value = parserStateBackup.tasks;
      options.rawLines.value = parserStateBackup.rawLines;
      options.auxLogs.value = parserStateBackup.auxLogs;
      options.detectedProject.value = parserStateBackup.detectedProject;
      options.selectedProcessId.value = parserStateBackup.selectedProcessId;
      options.selectedThreadId.value = parserStateBackup.selectedThreadId;
    }
  }

  async function processSlotPaths(slot: CompareSlot, paths: string[]): Promise<void> {
    const result = await applySelectedPaths(paths);
    if (result.files.length === 0) {
      logger.warn("对比槽位路径未解析到文件", { slot, pathCount: paths.length });
      return;
    }
    const parserFiles = result.files.map((file) => ({
      name: file.name,
      size: file.size,
      type: getFileType(file),
      file,
    }));
    await processSlotFiles(slot, parserFiles);
  }

  return {
    handleSelectBaselineDir,
    handleSelectBaselineZip,
    handleSelectCandidateDir,
    handleSelectCandidateZip,
  };
}
