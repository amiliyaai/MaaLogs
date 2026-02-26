<!--
@component AnalysisPanel
@description 日志分析主面板组件，提供任务列表、节点列表和详情展示功能
@author MaaLogs Team
@license MIT

@summary
该组件是日志分析视图的核心组件，采用三栏布局
- 左栏：任务列表，使用虚拟滚动优化性能
- 中栏：节点列表，显示选中任务的所有节点
- 右栏：节点详情，显示识别详情、动作详情、Custom日志

@features
- 进程/线程过滤
- 虚拟滚动（vue-virtual-scroller
- JSON 数据复制
- Custom日志级别过滤
- Custom日志来源过滤

@emits select-task - 选择任务事件
@emits select-node - 选择节点事件
@emits update:processId - 进程 ID 更新事件
@emits update:threadId - 线程 ID 更新事件
@emits update:selectedAuxLevels - Custom日志级别过滤更新事件
@emits update:hiddenCallers - 隐藏的日志来源更新事件

@example
<AnalysisPanel
  :tasks="taskList"
  :filtered-tasks="filteredTasks"
  :selected-task-key="selectedKey"
  :selected-node-id="selectedNodeId"
  :selected-task="currentTask"
  :selected-task-nodes="nodes"
  :selected-node="node"
  :process-options="processOptions"
  :thread-options="threadOptions"
  :selected-process-id="processId"
  :selected-thread-id="threadId"
  :task-item-height="taskItemHeight"
  :node-item-height="nodeItemHeight"
  :format-task-status="formatStatus"
  :format-task-time-parts="formatTime"
  :format-duration="formatDuration"
  :format-result-status="formatResult"
  :format-next-name="formatNext"
  :format-box="formatBox"
  :summarize-base="summarizeBase"
  :summarize-recognition="summarizeReco"
  :summarize-nested-actions="summarizeNested"
  :summarize-next-list="summarizeNext"
  :summarize-node-detail="summarizeDetail"
  :summarize-focus="summarizeFocus"
  :copy-json="copyJson"
  :selected-node-custom-actions="customActions"
  :selected-task-aux-logs="auxLogs"
  :format-aux-level="formatLevel"
  :selected-aux-levels="['error', 'warn']"
  :hidden-callers="[]"
  :caller-options="callerOptions"
  @select-task="handleTaskSelect"
  @select-node="handleNodeSelect"
/>
-->

<script setup lang="ts">
/**
 * 导入依赖
 * - Naive UI 组件：按钮、卡片、折叠面板、代码显示、选择器、标签、复选框
 * - vue-virtual-scroller：虚拟滚动组件，用于优化大列表性能
 */
import { NButton, NCard, NCheckbox, NCollapse, NCollapseItem, NCode, NModal, NSelect, NTag, NSpin } from "naive-ui";
import { DynamicScroller, DynamicScrollerItem } from "vue-virtual-scroller";
import { ref, watch, onMounted } from "vue";
import { useStorage } from "../composables";
import type {
  NodeInfo,
  NextListItem,
  TaskInfo,
  PipelineCustomActionInfo,
  AuxLogEntry,
} from "../types/logTypes";
import {
  analyzeWithAI,
  getAIConfig,
  saveAIConfig,
  type AIConfig,
  type FailureAnalysis,
} from "../utils/aiAnalyzer";
import AISettingsModal from "./AISettingsModal.vue";
import AIResultCard from "./AIResultCard.vue";
import ControllerInfoCard from "./ControllerInfoCard.vue";
import CustomLogPanel from "./CustomLogPanel.vue";
import NodeFlowChart from "./NodeFlowChart.vue";

/**
 * AI 分析状态
 */
const aiConfig = ref<AIConfig | null>(null);

onMounted(async () => {
  aiConfig.value = await getAIConfig();
});
const aiAnalyzing = ref(false);
const aiResults = ref<FailureAnalysis[]>([]);
const showAISettings = ref(false);
const showFlowChart = ref(false);
const showAIConfirm = ref(false);
const skipAIConfirm = useStorage("skipAIConfirm", false);
const aiError = ref("");

/**
 * 保存 AI 设置
 */
async function handleSaveAIConfig(config: AIConfig) {
  aiConfig.value = config;
  await saveAIConfig(config);
}

/**
 * 执行 AI 分析
 */
async function handleAIAnalyze() {
  if (!props.selectedTask) return;
  
  if (!skipAIConfirm.value) {
    showAIConfirm.value = true;
    return;
  }
  
  doAIAnalyze();
}

async function doAIAnalyze() {
  if (!props.selectedTask) return;
  if (!aiConfig.value) return;

  if (!aiConfig.value.apiKeys[aiConfig.value.provider]) {
    showAISettings.value = true;
    return;
  }

  aiAnalyzing.value = true;
  aiError.value = "";
  aiResults.value = [];

  try {
    const rawResults = await analyzeWithAI(
      aiConfig.value,
      [props.selectedTask],
      props.selectedTaskAuxLogs
    );

    const dedupedMap = new Map<string, FailureAnalysis>();
    for (const result of rawResults) {
      const existing = dedupedMap.get(result.nodeName);
      if (!existing || result.confidence > existing.confidence) {
        dedupedMap.set(result.nodeName, result);
      }
    }
    const dedupedResults = Array.from(dedupedMap.values());
    aiResults.value = dedupedResults;
    if (props.selectedTask) {
      aiResultsCache.set(props.selectedTask.key, dedupedResults);
    }
  } catch (e) {
    aiError.value = e instanceof Error ? e.message : "未知错误";
  } finally {
    aiAnalyzing.value = false;
  }
}

/**
 * 组件属性定个
 * @property {TaskInfo[]} tasks - 所有任务列个
 * @property {TaskInfo[]} filteredTasks - 过滤后的任务列表
 * @property {string | null} selectedTaskKey - 当前选中的任个key
 * @property {number | null} selectedNodeId - 当前选中的节个ID
 * @property {TaskInfo | null} selectedTask - 当前选中的任务对个
 * @property {NodeInfo[]} selectedTaskNodes - 选中任务的所有节个
 * @property {NodeInfo | null} selectedNode - 当前选中的节点对个
 * @property {Object[]} processOptions - 进程选择器选项
 * @property {Object[]} threadOptions - 线程选择器选项
 * @property {string} selectedProcessId - 当前选中的进个ID
 * @property {string} selectedThreadId - 当前选中的线个ID
 * @property {number} taskItemHeight - 任务列表项高度（用于虚拟滚动个
 * @property {number} nodeItemHeight - 节点列表项高度（用于虚拟滚动个
 * @property {Function} formatTaskStatus - 任务状态格式化函数
 * @property {Function} formatTaskTimeParts - 任务时间格式化函个
 * @property {Function} formatDuration - 耗时格式化函个
 * @property {Function} formatResultStatus - 结果状态格式化函数
 * @property {Function} formatNextName - Next 名称格式化函个
 * @property {Function} formatBox - 识别框格式化函数
 * @property {Function} summarizeBase - 基础信息摘要函数
 * @property {Function} summarizeRecognition - 识别尝试摘要函数
 * @property {Function} summarizeNestedActions - 嵌套动作摘要函数
 * @property {Function} summarizeNextList - Next 列表摘要函数
 * @property {Function} summarizeNodeDetail - 节点配置摘要函数
 * @property {Function} summarizeFocus - Focus 信息摘要函数
 * @property {Function} copyJson - JSON 复制函数
 * @property {PipelineCustomActionInfo[]} selectedNodeCustomActions - 选中节点的自定义动作
 * @property {AuxLogEntry[]} selectedTaskAuxLogs - 选中任务的Custom日志
 * @property {Function} formatAuxLevel - Custom日志级别格式化函个
 * @property {string[]} selectedAuxLevels - 选中的Custom日志级别
 * @property {string[]} hiddenCallers - 隐藏的日志来个
 * @property {Object[]} callerOptions - 日志来源选择器选项
 */
const props = withDefaults(
  defineProps<{
    tasks: TaskInfo[];
    filteredTasks: TaskInfo[];
    selectedTaskKey: string | null;
    selectedNodeId: number | null;
    selectedTask: TaskInfo | null;
    selectedTaskNodes: NodeInfo[];
    selectedNode: NodeInfo | null;
    processOptions: { label: string; value: string }[];
    threadOptions: { label: string; value: string }[];
    selectedProcessId: string;
    selectedThreadId: string;
    taskItemHeight: number;
    nodeItemHeight: number;
    formatTaskStatus: (status: TaskInfo["status"]) => string;
    formatTaskTimeParts: (value: string) => { date: string; time?: string };
    formatDuration: (value: number) => string;
    formatResultStatus: (value: NodeInfo["status"]) => string;
    formatCount: (count: number) => string;
    formatNextName: (value: NextListItem) => string;
    formatBox: (value: [number, number, number, number] | null | undefined) => string;
    summarizeBase: (node: NodeInfo) => string;
    summarizeRecognition: (node: NodeInfo) => string;
    summarizeNestedActions: (node: NodeInfo) => string;
    summarizeNextList: (node: NodeInfo) => string;
    summarizeNodeDetail: (node: NodeInfo) => string;
    summarizeFocus: (node: NodeInfo) => string;
    copyJson: (data: unknown) => void;
    selectedNodeCustomActions: PipelineCustomActionInfo[];
    selectedTaskAuxLogs: AuxLogEntry[];
    formatAuxLevel: (
      value: string
    ) => "default" | "primary" | "info" | "success" | "warning" | "error";
    selectedAuxLevels?: string[];
    hiddenCallers?: string[];
    callerOptions: { label: string; value: string }[];
  }>(),
  {
    selectedAuxLevels: () => ["error", "warn", "info", "debug", "other"],
    hiddenCallers: () => [],
  }
);

/**
 * AI 分析结果缓存（按任务 key 存储个
 */
const aiResultsCache = new Map<string, FailureAnalysis[]>();

/**
 * 监听任务切换，恢复已分析任务的结个
 */
watch(
  () => props.selectedTaskKey,
  (newKey) => {
    if (newKey && aiResultsCache.has(newKey)) {
      aiResults.value = aiResultsCache.get(newKey)!;
    } else {
      aiResults.value = [];
    }
    aiError.value = "";
  }
);

/**
 * 组件事件定义
 * @event select-task - 选择任务，参数包个taskKey 和可选的 nodeId
 * @event select-node - 选择节点，参数为节点 ID
 * @event update:processId - 更新进程 ID 过滤
 * @event update:threadId - 更新线程 ID 过滤
 * @event update:selectedAuxLevels - 更新Custom日志级别过滤
 * @event update:hiddenCallers - 更新隐藏的日志来个
 */
const emit = defineEmits<{
  (e: "select-task", value: { taskKey: string; nodeId: number | null }): void;
  (e: "select-node", value: number): void;
  (e: "update:processId", value: string): void;
  (e: "update:threadId", value: string): void;
  (e: "update:selectedAuxLevels", value: string[]): void;
  (e: "update:hiddenCallers", value: string[]): void;
}>();

/**
 * 处理任务选择
 * 点击任务时，选中该任务并默认选中第一个节点?
 * @param payload - 任务选择信息
 */
const handleTaskSelect = (payload: { taskKey: string; nodeId: number | null }) => {
  if (payload.nodeId === null) {
    const task = props.filteredTasks.find(t => t.key === payload.taskKey);
    if (task && task.nodes && task.nodes.length > 0) {
      payload.nodeId = task.nodes[0].node_id;
    }
  }
  emit("select-task", payload);
};

/**
 * 处理节点选择
 * 点击节点时，选中该节点以显示详情
 * @param {number} nodeId - 被选中的节点ID
 */
const handleNodeSelect = (nodeId: number) => {
  emit("select-node", nodeId);
};
</script>

<!--
  模板部分
  三栏布局个
  - 左栏：任务列表（虚拟滚动）
  - 中栏：节点列表（虚拟滚动）
  - 右栏：节点详情（识别详情、动作详情、Custom日志等）
-->
<template>
  <n-card class="panel" size="small">
    <template #header>
      <div class="panel-header">
        <div class="panel-title">任务与节点</div>
        <div class="panel-filters">
          <!-- 进程过滤 -->
          <n-select
            size="small"
            :options="processOptions"
            :value="selectedProcessId"
            placeholder="进程"
            class="filter-select"
            @update:value="emit('update:processId', $event)"
          />
          <!-- 线程过滤 -->
          <n-select
            size="small"
            :options="threadOptions"
            :value="selectedThreadId"
            placeholder="线程"
            class="filter-select"
            @update:value="emit('update:threadId', $event)"
          />
        </div>
      </div>
    </template>
    <!-- 主内容区域 -->
    <div class="task-layout">
      <!-- 左栏：任务列表 -->
      <div class="task-list">
        <div class="panel-top">
          <div class="node-header">
            <span>任务列表</span>
            <div class="ai-controls">
              <n-spin :show="aiAnalyzing" size="small">
                <n-button size="small" :disabled="!selectedTask" @click="handleAIAnalyze">
                  AI 分析
                </n-button>
              </n-spin>
              <n-button size="small" @click="showAISettings = true"> 设置 </n-button>
            </div>
          </div>
        </div>
        <div class="task-list-content">
          <!-- 虚拟滚动任务列表 -->
          <DynamicScroller
            class="virtual-scroller"
            :items="filteredTasks"
            key-field="key"
            :min-item-size="taskItemHeight"
          >
            <template #default="{ item, active }">
              <DynamicScrollerItem
                :item="item"
                :active="active"
                class="scroller-item"
                :style="{ paddingBottom: '0.325px' }"
              >
                <!-- 任务行 -->
                <div
                  class="task-row"
                  :class="{
                    active: item.key === selectedTaskKey,
                    failed: item.status === 'failed',
                  }"
                  @click="handleTaskSelect({ taskKey: item.key, nodeId: null })"
                >
                  <!-- 任务行顶部：任务名 + 状态 -->
                  <div class="task-row-top">
                    <div class="task-main">
                      <div class="task-title">
                        {{ item.entry || "未命名任务" }}
                      </div>
                      <div class="task-tags">
                        <n-tag size="small" type="info">
                          进程ID：{{ item.processId || "P?" }}
                        </n-tag>
                        <n-tag size="small"> 线程ID：{{ item.threadId || "T?" }} </n-tag>
                      </div>
                    </div>
                    <div class="task-side">
                      <n-tag :type="item.status === 'failed' ? 'error' : 'success'" size="small">
                        状态：{{ formatTaskStatus(item.status) }}
                      </n-tag>
                    </div>
                  </div>
                  <!-- 任务行底部：节点 + 时间 -->
                  <div class="task-row-bottom">
                    <div class="task-sub">
                      <n-tag type="info" size="small">节点：{{ item.nodes.length }}</n-tag>
                    </div>
                    <div class="task-side">
                      <span
                        >{{ formatTaskTimeParts(item.start_time).date }}
                        {{ formatTaskTimeParts(item.start_time).time }}</span
                      >
                      <span>耗时：{{ item.duration ? formatDuration(item.duration) : "-" }}</span>
                    </div>
                  </div>
                </div>
              </DynamicScrollerItem>
            </template>
          </DynamicScroller>
        </div>
      </div>
      <!-- 中栏：节点列表 -->
      <div class="node-list">
        <div class="panel-top">
          <div class="node-header">
            <span>节点列表</span>
            <n-button
              v-if="selectedTaskNodes.length > 0"
              size="small"
              @click="showFlowChart = true"
            >
              展开流程图
            </n-button>
          </div>
        </div>
        <!-- 空状态：未选择任务 -->
        <div v-if="!selectedTaskKey" class="empty">请选择左侧任务</div>
        <div v-else class="node-list-content">
          <!-- 虚拟滚动节点列表 -->
          <DynamicScroller
            class="virtual-scroller"
            :items="selectedTaskNodes"
            key-field="node_id"
            :min-item-size="nodeItemHeight"
          >
            <template #default="{ item, active }">
              <DynamicScrollerItem
                :item="item"
                :active="active"
                :size-dependencies="[item.name, item.status, item.recognition_attempts?.length]"
                class="scroller-item"
                :style="{ paddingBottom: '0.325px' }"
              >
                <!-- 节点行 -->
                <div
                  class="node-row"
                  :class="{
                    active: item.node_id === selectedNodeId,
                    failed: item.status === 'failed',
                  }"
                  @click="handleNodeSelect(item.node_id)"
                >
                  <!-- 节点主要信息 -->
                  <div class="node-main">
                    <div class="node-name">
                      {{ item.name || item.node_id }}
                    </div>
                    <div class="node-sub">
                      <div>时间：{{ item.timestamp }}</div>
                      <span :style="{ color: item.status === 'failed' ? '#d03050' : '#18a058' }">
                        状态：{{ formatResultStatus(item.status) }}
                      </span>
                    </div>
                  </div>
                  <!-- 节点徽章 -->
                  <div class="node-badges">
                    <n-tag type="warning" size="small">进行识别：{{ item.recognition_attempts?.length || 0 }}</n-tag>
                    <n-tag type="info" size="small">Next列表：{{ item.next_list?.length || 0 }}</n-tag>
                  </div>
                </div>
              </DynamicScrollerItem>
            </template>
          </DynamicScroller>
          <!-- 空状态：无节点 -->
          <div v-if="(selectedTask?.nodes || []).length === 0" class="empty">未发现节点事件</div>
        </div>
      </div>
      <!-- 右栏：节点详情 -->
      <div class="detail-panel">
        <div class="panel-top">
          <div class="node-header">节点详情</div>
        </div>
        <!-- 空状态：未选择任务 -->
        <div v-if="!selectedTask" class="empty">请选择左侧任务</div>
        <div v-else class="detail-content">
          <!-- 控制器信息卡片 -->
          <ControllerInfoCard
            v-if="selectedTask.controllerInfo"
            :controller-info="selectedTask.controllerInfo"
          />
          <!-- AI 分析结果卡片 -->
          <AIResultCard :results="aiResults" :error="aiError" />
          <!-- 空状态：未选择节点 -->
          <div v-if="!selectedNode" class="empty">请选择节点</div>
          <template v-else>
            <!-- 识别详情卡片 -->
            <div v-if="selectedNode.reco_details" class="detail-section-card">
              <div class="detail-section-header">
                <div class="detail-section-title">识别详情</div>
                <n-button size="tiny" @click="copyJson(selectedNode.reco_details)"> 复制 </n-button>
              </div>
              <div class="detail-section-grid">
                <div class="detail-section-cell">
                  <div class="detail-section-label">识别 ID</div>
                  <div class="detail-section-value">
                    {{ selectedNode.reco_details.reco_id }}
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">识别算法</div>
                  <div class="detail-section-value">
                    <n-tag size="small" type="info">
                      {{ selectedNode.reco_details.algorithm }}
                    </n-tag>
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">节点名称</div>
                  <div class="detail-section-value">
                    {{ selectedNode.reco_details.name }}
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">识别位置</div>
                  <div class="detail-section-value detail-section-box">
                    {{ formatBox(selectedNode.reco_details.box) }}
                  </div>
                </div>
              </div>
              <!-- 原始识别数据折叠面板 -->
              <n-collapse class="detail-section-collapse" :default-expanded-names="[]">
                <n-collapse-item title="原始识别数据" name="reco-raw">
                  <n-code
                    :code="JSON.stringify(selectedNode.reco_details, null, 2)"
                    language="json"
                    word-wrap
                    class="detail-code"
                  />
                </n-collapse-item>
              </n-collapse>
            </div>
            <!-- 无识别详情，但有识别尝试 -->
            <div
              v-else-if="(selectedNode.recognition_attempts || []).length > 0"
              class="detail-section-card"
            >
              <div class="detail-section-header">
                <div class="detail-section-title">识别详情（识别失败）</div>
              </div>
              <div class="detail-section-grid">
                <div class="detail-section-cell">
                  <div class="detail-section-label">识别算法</div>
                  <div class="detail-section-value">
                    <n-tag
                      v-if="selectedNode.recognition_attempts[0]?.reco_details?.algorithm"
                      size="small"
                      type="error"
                    >
                      {{ selectedNode.recognition_attempts[0].reco_details.algorithm }}
                    </n-tag>
                    <div v-else>零个</div>
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">识别次数</div>
                  <div class="detail-section-value">
                    <n-tag type="warning" size="small">{{ selectedNode.recognition_attempts.length }}</n-tag>
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">成功次数</div>
                  <div class="detail-section-value">
                    <n-tag type="success" size="small">{{
                      formatCount(
                        selectedNode.recognition_attempts.filter((a) => a.status === "success")
                          .length
                      )
                    }}</n-tag>
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">失败次数</div>
                  <div class="detail-section-value">
                    <n-tag type="error" size="small">{{
                      formatCount(
                        selectedNode.recognition_attempts.filter((a) => a.status === "failed")
                          .length
                      )
                    }}</n-tag>
                  </div>
                </div>
              </div>
            </div>
            <!-- 无识别详情 -->
            <div v-else class="detail-section-card">
              <div class="detail-section-header">
                <div class="detail-section-title">识别详情</div>
              </div>
              <div class="empty">Recognition 详情</div>
            </div>
            <!-- 动作详情卡片 -->
            <div v-if="selectedNode.action_details" class="detail-section-card">
              <div class="detail-section-header">
                <div class="detail-section-title">动作详情</div>
                <n-button size="tiny" @click="copyJson(selectedNode.action_details)">
                  复制
                </n-button>
              </div>
              <div class="detail-section-grid">
                <div class="detail-section-cell">
                  <div class="detail-section-label">动作 ID</div>
                  <div class="detail-section-value">
                    {{ selectedNode.action_details.action_id }}
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">动作类型</div>
                  <div class="detail-section-value">
                    <n-tag size="small" type="success">
                      {{ selectedNode.action_details.action }}
                    </n-tag>
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">节点名称</div>
                  <div class="detail-section-value">
                    {{ selectedNode.action_details.name }}
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">执行结果</div>
                  <div class="detail-section-value">
                    <n-tag
                      size="small"
                      :type="selectedNode.action_details.success ? 'success' : 'error'"
                    >
                      {{ selectedNode.action_details.success ? "成功" : "失败" }}
                    </n-tag>
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">目标位置</div>
                  <div class="detail-section-value detail-section-box">
                    {{ formatBox(selectedNode.action_details.box) }}
                  </div>
                </div>
              </div>
              <!-- 原始动作数据折叠面板 -->
              <n-collapse class="detail-section-collapse" :default-expanded-names="[]">
                <n-collapse-item title="原始动作数据" name="action-raw">
                  <n-code
                    :code="JSON.stringify(selectedNode.action_details, null, 2)"
                    language="json"
                    word-wrap
                    class="detail-code"
                  />
                </n-collapse-item>
              </n-collapse>
            </div>
            <!-- 无动作详情 -->
            <div v-else class="detail-section-card">
              <div class="detail-section-header">
                <div class="detail-section-title">动作详情</div>
              </div>
              <div class="empty">Action 详情</div>
            </div>
            <!-- 详细信息折叠面板 -->
            <n-collapse :default-expanded-names="[]">
              <!-- 基础信息 -->
              <n-collapse-item name="base">
                <template #header>
                  <div class="collapse-header">
                    <span>基础信息</span>
                    <span class="collapse-summary">{{ summarizeBase(selectedNode) }}</span>
                  </div>
                </template>
                <div class="detail-grid">
                  <div>名称: {{ selectedNode.name }}</div>
                  <div>时间: {{ selectedNode.timestamp }}</div>
                  <div>
                    状态
                    <n-tag
                      size="small"
                      :type="selectedNode.status === 'success' ? 'success' : 'error'"
                    >
                      {{ formatResultStatus(selectedNode.status) }}
                    </n-tag>
                  </div>
                  <div>任务: {{ selectedNode.task_id }}</div>
                  <div>节点ID: {{ selectedNode.node_id }}</div>
                </div>
              </n-collapse-item>
              <!-- 识别尝试 -->
              <n-collapse-item name="reco">
                <template #header>
                  <div class="collapse-header">
                    <span>识别尝试</span>
                    <span class="collapse-summary">{{ summarizeRecognition(selectedNode) }}</span>
                  </div>
                </template>
                <div v-if="(selectedNode.recognition_attempts || []).length === 0" class="empty">
                  无识别尝试记录
                </div>
                <div v-else class="recognition-attempts-list">
                  <n-collapse
                    v-for="(attempt, index) in selectedNode.recognition_attempts"
                    :key="`${selectedNode.node_id}-${index}`"
                    :default-expanded-names="[]"
                  >
                    <n-collapse-item
                      :title="`${attempt.name || 'Recognition'}`"
                      :name="`attempt-${index}`"
                    >
                      <template #header-extra>
                        <n-tag
                          :type="attempt.status === 'success' ? 'success' : 'error'"
                          size="tiny"
                        >
                          {{ formatResultStatus(attempt.status) }}
                        </n-tag>
                      </template>
                      <div v-if="attempt.reco_details" class="attempt-details">
                        <div class="attempt-detail-actions">
                          <n-button size="tiny" @click="copyJson(attempt.reco_details)">
                            复制
                          </n-button>
                        </div>
                        <div v-if="attempt.reco_details.algorithm" class="attempt-detail-row">
                          <span class="attempt-label">算法:</span>
                          <n-tag size="small" type="info">
                            {{ attempt.reco_details.algorithm }}
                          </n-tag>
                        </div>
                        <div v-if="attempt.reco_details.name" class="attempt-detail-row">
                          <span class="attempt-label">名称:</span>
                          <span>{{ attempt.reco_details.name }}</span>
                        </div>
                        <div v-if="attempt.reco_details.reco_id" class="attempt-detail-row">
                          <span class="attempt-label">ID:</span>
                          <span>{{ attempt.reco_details.reco_id }}</span>
                        </div>
                        <div v-if="attempt.reco_details.box" class="attempt-detail-row">
                          <span class="attempt-label">位置:</span>
                          <span>{{ formatBox(attempt.reco_details.box) }}</span>
                        </div>
                        <div v-if="attempt.reco_details.detail" class="attempt-detail-row">
                          <span class="attempt-label">结果:</span>
                          <n-code
                            :code="JSON.stringify(attempt.reco_details.detail, null, 2)"
                            language="json"
                            word-wrap
                            class="detail-code"
                          />
                        </div>
                      </div>
                      <div v-else class="empty">无识别详情</div>
                      <!-- 嵌套节点 -->
                      <div v-if="(attempt.nested_nodes || []).length > 0" class="nested-attempts">
                        <div class="nested-title">
                          <n-tag type="info" size="small">嵌套识别 ({{ attempt.nested_nodes?.length }})</n-tag>
                        </div>
                        <n-collapse>
                          <n-collapse-item
                            v-for="(nested, nestedIndex) in attempt.nested_nodes"
                            :key="`${selectedNode.node_id}-${index}-nested-${nestedIndex}`"
                            :title="`${nested.name || 'Nested'}`"
                            :name="`nested-${nestedIndex}`"
                          >
                            <template #header-extra>
                              <n-tag
                                :type="nested.status === 'success' ? 'success' : 'error'"
                                size="tiny"
                              >
                                {{ formatResultStatus(nested.status) }}
                              </n-tag>
                            </template>
                            <div v-if="nested.reco_details" class="attempt-details">
                              <div class="attempt-detail-actions">
                                <n-button size="tiny" @click="copyJson(nested.reco_details)">
                                  复制
                                </n-button>
                              </div>
                              <div v-if="nested.reco_details.algorithm" class="attempt-detail-row">
                                <span class="attempt-label">算法:</span>
                                <n-tag size="small" type="info">
                                  {{ nested.reco_details.algorithm }}
                                </n-tag>
                              </div>
                              <div v-if="nested.reco_details.detail" class="attempt-detail-row">
                                <span class="attempt-label">结果:</span>
                                <n-code
                                  :code="JSON.stringify(nested.reco_details.detail, null, 2)"
                                  language="json"
                                  word-wrap
                                  class="detail-code"
                                />
                              </div>
                            </div>
                          </n-collapse-item>
                        </n-collapse>
                      </div>
                    </n-collapse-item>
                  </n-collapse>
                </div>
              </n-collapse-item>
              <!-- 嵌套动作节点 -->
              <n-collapse-item name="action-nested">
                <template #header>
                  <div class="collapse-header">
                    <span>嵌套动作节点</span>
                    <span class="collapse-summary">{{ summarizeNestedActions(selectedNode) }}</span>
                  </div>
                </template>
                <div v-if="(selectedNode.nested_action_nodes || []).length === 0" class="empty">
                  无嵌套动作节点
                </div>
                <div v-else class="detail-list">
                  <div
                    v-for="(actionNode, actionIndex) in selectedNode.nested_action_nodes"
                    :key="`${selectedNode.node_id}-action-${actionIndex}`"
                    class="detail-item"
                  >
                    <div class="detail-item-title">
                      {{ actionNode.name || "Action" }} · {{ actionNode.timestamp }}
                    </div>
                    <div v-if="actionNode.action_details" class="detail-actions">
                      <n-button size="tiny" @click="copyJson(actionNode.action_details)">
                        复制
                      </n-button>
                    </div>
                    <n-code
                      v-if="actionNode.action_details"
                      :code="JSON.stringify(actionNode.action_details, null, 2)"
                      language="json"
                      word-wrap
                      class="detail-code"
                    />
                  </div>
                </div>
              </n-collapse-item>
              <!-- Next List -->
              <n-collapse-item name="next">
                <template #header>
                  <div class="collapse-header">
                    <span>Next List</span>
                    <span class="collapse-summary">{{ summarizeNextList(selectedNode) }}</span>
                  </div>
                </template>
                <div v-if="(selectedNode.next_list || []).length === 0" class="empty">
                  Next List
                </div>
                <div v-else class="next-list">
                  <n-tag
                    v-for="(item, idx) in selectedNode.next_list"
                    :key="`${selectedNode.node_id}-next-${idx}`"
                    size="small"
                    type="info"
                  >
                    {{ formatNextName(item) }}
                  </n-tag>
                </div>
              </n-collapse-item>
              <!-- 节点配置 -->
              <n-collapse-item name="node-detail">
                <template #header>
                  <div class="collapse-header">
                    <span>节点配置</span>
                    <span class="collapse-summary">{{ summarizeNodeDetail(selectedNode) }}</span>
                  </div>
                </template>
                <div v-if="selectedNode.node_details" class="detail-actions">
                  <n-button size="tiny" @click="copyJson(selectedNode.node_details)">
                    复制
                  </n-button>
                </div>
                <n-code
                  v-if="selectedNode.node_details"
                  :code="JSON.stringify(selectedNode.node_details, null, 2)"
                  language="json"
                  word-wrap
                  class="detail-code"
                />
                <div v-else class="empty">无节点配置</div>
              </n-collapse-item>
              <!-- Focus 信息 -->
              <n-collapse-item name="focus">
                <template #header>
                  <div class="collapse-header">
                    <span>Focus</span>
                    <span class="collapse-summary">{{ summarizeFocus(selectedNode) }}</span>
                  </div>
                </template>
                <div v-if="selectedNode.focus" class="detail-actions">
                  <n-button size="tiny" @click="copyJson(selectedNode.focus)"> 复制 </n-button>
                </div>
                <n-code
                  v-if="selectedNode.focus"
                  :code="JSON.stringify(selectedNode.focus, null, 2)"
                  language="json"
                  word-wrap
                  class="detail-code"
                />
                <div v-else class="empty">无 Focus 信息</div>
              </n-collapse-item>
            </n-collapse>
          </template>
          <!-- Custom 日志区域 -->
          <CustomLogPanel
            :aux-logs="selectedTaskAuxLogs"
            :custom-actions="selectedNodeCustomActions"
            :selected-aux-levels="props.selectedAuxLevels"
            :hidden-callers="props.hiddenCallers"
            :caller-options="props.callerOptions"
            :format-aux-level="formatAuxLevel"
            @update:selected-aux-levels="emit('update:selectedAuxLevels', $event)"
            @update:hidden-callers="emit('update:hiddenCallers', $event)"
          />
        </div>
      </div>
    </div>
    <!-- AI 设置 Modal -->
    <AISettingsModal v-model:show="showAISettings" :config="aiConfig" @update:config="aiConfig = $event" @save="handleSaveAIConfig" />
    <!-- AI 分析确认弹窗 -->
    <n-modal
      v-model:show="showAIConfirm"
      preset="dialog"
      title="确认开始分析"
      positive-text="确认"
      negative-text="取消"
      @positive-click="doAIAnalyze"
      @update:show="(val: boolean) => { if (!val) showAIConfirm = val }"
    >
      <n-checkbox v-model:checked="skipAIConfirm">
        不再提醒
      </n-checkbox>
    </n-modal>
    <!-- 节点流程图大面板 -->
    <n-modal
      v-model:show="showFlowChart"
      preset="card"
      title="节点流程图"
      :closable="true"
      style="width: 90vw; max-width: 1200px; height: 80vh;"
    >
      <div style="height: 100%;">
        <NodeFlowChart
          v-if="selectedTaskNodes.length > 0"
          :nodes="selectedTaskNodes"
          :selected-node-id="selectedNodeId"
          style="height: calc(100% - 20px);"
          @select-node="handleNodeSelect"
        />
        <div v-else style="display: flex; align-items: center; justify-content: center; height: 100%;">
          暂无节点数据
        </div>
      </div>
    </n-modal>
  </n-card>
</template>

<!--
  样式部分
-->
<style scoped>
.panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel :deep(.n-card__content) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.node-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ai-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.node-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.node-sub {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.task-sub,
.task-side {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.collapse-header {
  display: flex;
  gap: 8px;
}

.panel-top {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: none;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
}

.panel-tools {
  display: flex;
  align-items: center;
  gap: 16px;
}

.view-mode-tabs {
  flex-shrink: 0;
}

.panel-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-select {
  width: 160px;
}

.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--n-text-color-3);
}

.task-layout {
  display: grid;
  grid-template-columns: 1fr 1.2fr 1.4fr;
  gap: 16px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.task-list,
.node-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  padding: 8px;
  background: var(--n-color);
}

.task-list-content,
.node-list-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.virtual-scroller {
  height: 100%;
  padding: 8px;
  padding-bottom: 24px;
  box-sizing: border-box;
}

.detail-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  padding: 8px;
  background: var(--n-color);
}

.detail-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
  padding-bottom: 24px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
