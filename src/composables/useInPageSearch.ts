/**
 * @fileoverview 页面内搜索 Composable
 *
 * 本文件实现了分析页面内的结构化搜索功能，支持：
 * - 搜索任务、节点、识别、动作、日志
 * - 模糊匹配和精确匹配
 * - 搜索结果分类展示
 * - 跳转到对应位置
 *
 * @module composables/useInPageSearch
 * @author MaaLogs Team
 * @license MIT
 */

import { ref, type Ref } from "vue";
import type {
  TaskInfo,
  NodeInfo,
  RecognitionAttempt,
  ActionAttempt,
  AuxLogEntry,
} from "@/types/logTypes";

/**
 * 搜索结果类型
 */
export type SearchResultType = "task" | "node" | "recognition" | "action" | "auxlog";

/**
 * 搜索范围筛选
 */
export type SearchScope = "all" | "task" | "node" | "recognition" | "action" | "auxlog";

/**
 * 搜索结果项
 */
export interface InPageSearchResult {
  /** 结果类型 */
  type: SearchResultType;
  /** 匹配字段 */
  field: string;
  /** 匹配值 */
  value: string;
  /** 任务 ID */
  taskId: number;
  /** 任务名称 */
  taskName: string;
  /** 节点 ID（可选） */
  nodeId?: number;
  /** 节点名称（可选） */
  nodeName?: string;
  /** 识别 ID（可选） */
  recoId?: number;
  /** 动作 ID（可选） */
  actionId?: number;
  /** 日志行号（可选） */
  logLineNumber?: number;
  /** 额外信息 */
  extra?: Record<string, unknown>;
}

/**
 * 搜索器返回值
 */
export interface InPageSearcherResult {
  /** 搜索文本 */
  searchText: Ref<string>;
  /** 搜索范围 */
  searchScope: Ref<SearchScope>;
  /** 搜索结果 */
  searchResults: Ref<InPageSearchResult[]>;
  /** 是否显示搜索结果 */
  showResults: Ref<boolean>;
  /** 执行搜索 */
  performSearch: (tasks: TaskInfo[], auxLogs?: Map<string, AuxLogEntry[]>) => void;
  /** 重置搜索 */
  resetSearch: () => void;
  /** 关闭结果面板 */
  closeResults: () => void;
}

/**
 * 页面内搜索 Composable
 *
 * @returns {InPageSearcherResult} 搜索器的状态和方法
 */
export function useInPageSearch(): InPageSearcherResult {
  const searchText = ref("");
  const searchScope = ref<SearchScope>("all");
  const searchResults = ref<InPageSearchResult[]>([]);
  const showResults = ref(false);

  /**
   * 检查文本是否匹配
   */
  function matches(text: string | undefined | null, keyword: string): boolean {
    if (!text) return false;
    return text.toLowerCase().includes(keyword.toLowerCase());
  }

  /**
   * 检查数字是否匹配（精确匹配）
   */
  function matchesNumber(num: number | undefined | null, keyword: string): boolean {
    if (num === undefined || num === null) return false;
    return String(num) === keyword;
  }

  /**
   * 搜索任务
   */
  function searchTasks(tasks: TaskInfo[], keyword: string): InPageSearchResult[] {
    const results: InPageSearchResult[] = [];

    for (const task of tasks) {
      if (matches(task.entry, keyword)) {
        results.push({
          type: "task",
          field: "entry",
          value: task.entry,
          taskId: task.task_id,
          taskName: task.entry,
        });
      }

      if (matchesNumber(task.task_id, keyword)) {
        results.push({
          type: "task",
          field: "task_id",
          value: String(task.task_id),
          taskId: task.task_id,
          taskName: task.entry,
        });
      }
    }

    return results;
  }

  /**
   * 搜索节点
   */
  function searchNodes(tasks: TaskInfo[], keyword: string): InPageSearchResult[] {
    const results: InPageSearchResult[] = [];

    for (const task of tasks) {
      for (const node of task.nodes || []) {
        if (matches(node.name, keyword)) {
          results.push({
            type: "node",
            field: "name",
            value: node.name,
            taskId: task.task_id,
            taskName: task.entry,
            nodeId: node.node_id,
            nodeName: node.name,
            extra: { status: node.status },
          });
        }

        if (matchesNumber(node.node_id, keyword)) {
          results.push({
            type: "node",
            field: "node_id",
            value: String(node.node_id),
            taskId: task.task_id,
            taskName: task.entry,
            nodeId: node.node_id,
            nodeName: node.name,
            extra: { status: node.status },
          });
        }
      }
    }

    return results;
  }

  /**
   * 搜索识别
   */
  function searchRecognition(tasks: TaskInfo[], keyword: string): InPageSearchResult[] {
    const results: InPageSearchResult[] = [];

    function addRecognitionResult(
      attempt: RecognitionAttempt,
      task: TaskInfo,
      node: NodeInfo,
      field: string,
      value: string,
      extra?: Record<string, unknown>
    ) {
      results.push({
        type: "recognition",
        field,
        value,
        taskId: task.task_id,
        taskName: task.entry,
        nodeId: node.node_id,
        nodeName: node.name,
        recoId: attempt.reco_id,
        extra,
      });
    }

    function checkRecognitionDetails(attempt: RecognitionAttempt, task: TaskInfo, node: NodeInfo) {
      const details = attempt.reco_details;
      if (!details) return;

      if (matches(details.algorithm, keyword)) {
        addRecognitionResult(attempt, task, node, "algorithm", details.algorithm, {
          algorithm: details.algorithm,
        });
      }

      if (matchesNumber(details.reco_id, keyword)) {
        addRecognitionResult(attempt, task, node, "reco_id", String(details.reco_id), {
          algorithm: details.algorithm,
        });
      }
    }

    function searchSingleAttempt(attempt: RecognitionAttempt, task: TaskInfo, node: NodeInfo) {
      if (matches(attempt.name, keyword)) {
        addRecognitionResult(attempt, task, node, "name", attempt.name, {
          status: attempt.status,
        });
      }

      if (matchesNumber(attempt.reco_id, keyword)) {
        addRecognitionResult(attempt, task, node, "reco_id", String(attempt.reco_id), {
          status: attempt.status,
        });
      }

      checkRecognitionDetails(attempt, task, node);

      if (attempt.nested_nodes) {
        for (const nested of attempt.nested_nodes) {
          searchSingleAttempt(nested, task, node);
        }
      }
    }

    for (const task of tasks) {
      for (const node of task.nodes || []) {
        for (const attempt of node.recognition_attempts || []) {
          searchSingleAttempt(attempt, task, node);
        }

        for (const attempt of node.nested_recognition_in_action || []) {
          searchSingleAttempt(attempt, task, node);
        }
      }
    }

    return results;
  }

  /**
   * 搜索动作
   */
  function searchActions(tasks: TaskInfo[], keyword: string): InPageSearchResult[] {
    const results: InPageSearchResult[] = [];

    function addActionResult(
      attempt: ActionAttempt,
      task: TaskInfo,
      node: NodeInfo,
      field: string,
      value: string,
      extra?: Record<string, unknown>
    ) {
      results.push({
        type: "action",
        field,
        value,
        taskId: task.task_id,
        taskName: task.entry,
        nodeId: node.node_id,
        nodeName: node.name,
        actionId: attempt.action_id,
        extra,
      });
    }

    function searchSingleActionAttempt(attempt: ActionAttempt, task: TaskInfo, node: NodeInfo) {
      if (matches(attempt.name, keyword)) {
        addActionResult(attempt, task, node, "name", attempt.name, {
          status: attempt.status,
        });
      }

      if (matchesNumber(attempt.action_id, keyword)) {
        addActionResult(attempt, task, node, "action_id", String(attempt.action_id), {
          status: attempt.status,
        });
      }

      if (attempt.action_details && matches(attempt.action_details.action, keyword)) {
        addActionResult(attempt, task, node, "action", attempt.action_details.action);
      }

      if (attempt.nested_actions) {
        for (const nested of attempt.nested_actions) {
          searchSingleActionAttempt(nested, task, node);
        }
      }
    }

    function searchNodeActions(task: TaskInfo, node: NodeInfo) {
      if (node.action_details && matches(node.action_details.action, keyword)) {
        results.push({
          type: "action",
          field: "action",
          value: node.action_details.action,
          taskId: task.task_id,
          taskName: task.entry,
          nodeId: node.node_id,
          nodeName: node.name,
        });
      }

      if (node.nested_action_nodes) {
        for (const nestedNode of node.nested_action_nodes) {
          for (const attempt of nestedNode.actions || []) {
            searchSingleActionAttempt(attempt, task, node);
          }
        }
      }
    }

    for (const task of tasks) {
      for (const node of task.nodes || []) {
        searchNodeActions(task, node);
      }
    }

    return results;
  }

  /**
   * 搜索辅助日志
   */
  function searchAuxLogs(
    auxLogs: Map<string, AuxLogEntry[]>,
    keyword: string
  ): InPageSearchResult[] {
    const results: InPageSearchResult[] = [];

    for (const [, entries] of auxLogs) {
      for (const entry of entries) {
        if (matches(entry.message, keyword)) {
          results.push({
            type: "auxlog",
            field: "message",
            value: entry.message.substring(0, 100),
            taskId: entry.task_id || 0,
            taskName: entry.entry || "",
            logLineNumber: entry.lineNumber,
            extra: { level: entry.level, source: entry.source },
          });
        }

        if (matches(entry.level, keyword)) {
          results.push({
            type: "auxlog",
            field: "level",
            value: entry.level,
            taskId: entry.task_id || 0,
            taskName: entry.entry || "",
            logLineNumber: entry.lineNumber,
            extra: { source: entry.source },
          });
        }
      }
    }

    return results;
  }

  /**
   * 执行搜索
   */
  function performSearch(tasks: TaskInfo[], auxLogs?: Map<string, AuxLogEntry[]>): void {
    const keyword = searchText.value.trim();

    if (!keyword) {
      searchResults.value = [];
      showResults.value = false;
      return;
    }

    const allResults: InPageSearchResult[] = [];
    const scope = searchScope.value;

    if (scope === "all" || scope === "task") {
      allResults.push(...searchTasks(tasks, keyword));
    }

    if (scope === "all" || scope === "node") {
      allResults.push(...searchNodes(tasks, keyword));
    }

    if (scope === "all" || scope === "recognition") {
      allResults.push(...searchRecognition(tasks, keyword));
    }

    if (scope === "all" || scope === "action") {
      allResults.push(...searchActions(tasks, keyword));
    }

    if ((scope === "all" || scope === "auxlog") && auxLogs) {
      allResults.push(...searchAuxLogs(auxLogs, keyword));
    }

    searchResults.value = allResults.slice(0, 100);
    showResults.value = allResults.length > 0;
  }

  /**
   * 重置搜索
   */
  function resetSearch(): void {
    searchText.value = "";
    searchResults.value = [];
    showResults.value = false;
  }

  /**
   * 关闭结果面板
   */
  function closeResults(): void {
    showResults.value = false;
  }

  return {
    searchText,
    searchScope,
    searchResults,
    showResults,
    performSearch,
    resetSearch,
    closeResults,
  };
}
