<!--
@component AnalysisPanel
@description 日志分析主面板组件，提供任务列表、节点列表和详情展示功能
@author MaaLogs Team
@license MIT

@summary
该组件是日志分析视图的核心组件，采用三栏布局：
- 左栏：任务列表，使用虚拟滚动优化性能
- 中栏：节点列表，显示选中任务的所有节点
- 右栏：节点详情，显示识别详情、动作详情、Custom日志等

@features
- 进程/线程过滤
- 虚拟滚动（vue-virtual-scroller）
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
  :task-item-height="80"
  :node-item-height="60"
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
import { NButton, NCard, NCollapse, NCollapseItem, NCode, NSelect, NTag, NCheckboxGroup, NCheckbox, NSpace } from "naive-ui";
import { DynamicScroller, DynamicScrollerItem } from "vue-virtual-scroller";
import type { AuxLogEntry, NodeInfo, NextListItem, PipelineCustomActionInfo, TaskInfo } from "../types/logTypes";

/**
 * 组件属性定义
 * @property {TaskInfo[]} tasks - 所有任务列表
 * @property {TaskInfo[]} filteredTasks - 过滤后的任务列表
 * @property {string | null} selectedTaskKey - 当前选中的任务 key
 * @property {number | null} selectedNodeId - 当前选中的节点 ID
 * @property {TaskInfo | null} selectedTask - 当前选中的任务对象
 * @property {NodeInfo[]} selectedTaskNodes - 选中任务的所有节点
 * @property {NodeInfo | null} selectedNode - 当前选中的节点对象
 * @property {Object[]} processOptions - 进程选择器选项
 * @property {Object[]} threadOptions - 线程选择器选项
 * @property {string} selectedProcessId - 当前选中的进程 ID
 * @property {string} selectedThreadId - 当前选中的线程 ID
 * @property {number} taskItemHeight - 任务列表项高度（用于虚拟滚动）
 * @property {number} nodeItemHeight - 节点列表项高度（用于虚拟滚动）
 * @property {Function} formatTaskStatus - 任务状态格式化函数
 * @property {Function} formatTaskTimeParts - 任务时间格式化函数
 * @property {Function} formatDuration - 耗时格式化函数
 * @property {Function} formatResultStatus - 结果状态格式化函数
 * @property {Function} formatNextName - Next 名称格式化函数
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
 * @property {Function} formatAuxLevel - Custom日志级别格式化函数
 * @property {string[]} selectedAuxLevels - 选中的Custom日志级别
 * @property {string[]} hiddenCallers - 隐藏的日志来源
 * @property {Object[]} callerOptions - 日志来源选择器选项
 */
const props = withDefaults(defineProps<{
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
  formatAuxLevel: (value: string) => "default" | "primary" | "info" | "success" | "warning" | "error";
  selectedAuxLevels?: string[];
  hiddenCallers?: string[];
  callerOptions: { label: string; value: string }[];
}>(), {
  selectedAuxLevels: () => ["error", "warn", "info", "debug", "other"],
  hiddenCallers: () => []
});

/**
 * 组件事件定义
 * @event select-task - 选择任务，参数包含 taskKey 和可选的 nodeId
 * @event select-node - 选择节点，参数为节点 ID
 * @event update:processId - 更新进程 ID 过滤
 * @event update:threadId - 更新线程 ID 过滤
 * @event update:selectedAuxLevels - 更新Custom日志级别过滤
 * @event update:hiddenCallers - 更新隐藏的日志来源
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
 * Custom日志级别选项
 * 用于级别过滤复选框组
 */
const auxLevelOptions = [
  { label: "Error", value: "error" },
  { label: "Warn", value: "warn" },
  { label: "Info", value: "info" },
  { label: "Debug", value: "debug" },
  { label: "Other", value: "other" }
];

/**
 * 处理任务选择
 * 点击任务时，选中该任务并默认选中第一个节点
 * @param {TaskInfo} task - 被选中的任务
 */
const handleTaskSelect = (task: TaskInfo) => {
  emit("select-task", { taskKey: task.key, nodeId: task.nodes[0]?.node_id ?? null });
};

/**
 * 处理节点选择
 * 点击节点时，选中该节点以显示详情
 * @param {number} nodeId - 被选中的节点 ID
 */
const handleNodeSelect = (nodeId: number) => {
  emit("select-node", nodeId);
};
</script>

<!--
  模板部分
  三栏布局：
  - 左栏：任务列表（虚拟滚动）
  - 中栏：节点列表（虚拟滚动）
  - 右栏：节点详情（识别详情、动作详情、Custom日志等）
-->
<template>
  <n-card class="panel" size="small">
    <!-- 标题栏，包含进程/线程过滤器 -->
    <template #header>
      <div class="panel-header">
        <div>任务与节点</div>
        <div class="panel-tools panel-filters">
          <!-- 进程过滤器 -->
          <n-select
            size="small"
            :options="processOptions"
            :value="selectedProcessId"
            @update:value="emit('update:processId', $event)"
            placeholder="进程"
            class="filter-select"
          />
          <!-- 线程过滤器 -->
          <n-select
            size="small"
            :options="threadOptions"
            :value="selectedThreadId"
            @update:value="emit('update:threadId', $event)"
            placeholder="线程"
            class="filter-select"
          />
        </div>
      </div>
    </template>
    <!-- 空状态 -->
    <div v-if="tasks.length === 0" class="empty">解析后将在此显示任务与节点</div>
    <!-- 主内容区域：三栏布局 -->
    <div v-else class="task-layout">
      <!-- 左栏：任务列表 -->
      <div class="task-list">
        <div class="panel-top">
          <div class="node-header">任务列表</div>
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
              <DynamicScrollerItem :item="item" :active="active">
                <!-- 任务行 -->
                <div
                  class="task-row"
                  :class="{ active: item.key === selectedTaskKey }"
                  @click="handleTaskSelect(item)"
                >
                  <!-- 任务主要信息 -->
                  <div class="task-main">
                    <div class="task-title">{{ item.entry || "未命名任务" }}</div>
                    <div class="task-tags">
                      <n-tag size="small" type="info">进程ID：{{ item.processId || "P?" }}</n-tag>
                      <n-tag size="small">线程ID：{{ item.threadId || "T?" }}</n-tag>
                    </div>
                  </div>
                  <!-- 任务次要信息 -->
                  <div class="task-sub">
                    <div>文件： {{ item.fileName }}</div>
                    <div>节点： {{ item.nodes.length }}个</div>
                  </div>
                  <!-- 任务侧边信息 -->
                  <div class="task-side">
                    <div>状态： {{ formatTaskStatus(item.status) }}</div>
                    <div class="task-side-row">
                      <div class="task-side-label">开始时间：</div>
                      <div class="task-side-value">
                        <span>{{ formatTaskTimeParts(item.start_time).date }}</span>
                        <span v-if="formatTaskTimeParts(item.start_time).time">
                          {{ formatTaskTimeParts(item.start_time).time }}
                        </span>
                      </div>
                    </div>
                    <div class="task-side-row task-side-row-inline">
                      <div class="task-side-label">耗时：</div>
                      <div class="task-side-value">
                        {{ item.duration ? formatDuration(item.duration) : "-" }}
                      </div>
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
          <div class="node-header">节点列表</div>
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
              <DynamicScrollerItem :item="item" :active="active" :size-dependencies="[item.name, item.status, item.recognition_attempts?.length]">
                <!-- 节点行 -->
                <div class="node-row" :class="{ active: item.node_id === selectedNodeId }" @click="handleNodeSelect(item.node_id)">
                  <!-- 节点主要信息 -->
                  <div class="node-main">
                    <div class="node-name">{{ item.name || item.node_id }}</div>
                    <div class="node-sub">
                      <div>时间： {{ item.timestamp }}</div>
                      <div>状态： {{ formatResultStatus(item.status) }}</div>
                    </div>
                  </div>
                  <!-- 节点徽章 -->
                  <div class="node-badges">
                    <div class="node-badge">进行识别： {{ item.recognition_attempts?.length || 0 }}次</div>
                    <div class="node-badge">Next列表： {{ item.next_list?.length || 0 }}个</div>
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
          <!-- 空状态：未选择节点 -->
          <div v-if="!selectedNode" class="empty">请选择节点</div>
          <template v-else>
            <!-- 识别详情卡片 -->
            <div class="detail-section-card" v-if="selectedNode.reco_details">
              <div class="detail-section-header">
                <div class="detail-section-title">识别详情</div>
                <n-button size="tiny" @click="copyJson(selectedNode.reco_details)">复制</n-button>
              </div>
              <div class="detail-section-grid">
                <div class="detail-section-cell">
                  <div class="detail-section-label">识别 ID</div>
                  <div class="detail-section-value">{{ selectedNode.reco_details.reco_id }}</div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">识别算法</div>
                  <div class="detail-section-value">
                    <n-tag size="small" type="info">{{ selectedNode.reco_details.algorithm }}</n-tag>
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">节点名称</div>
                  <div class="detail-section-value">{{ selectedNode.reco_details.name }}</div>
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
            <!-- 无识别详情 -->
            <div v-else class="detail-section-card">
              <div class="detail-section-header">
                <div class="detail-section-title">识别详情</div>
              </div>
              <div class="empty">无 Recognition 详情</div>
            </div>
            <!-- 动作详情卡片 -->
            <div class="detail-section-card" v-if="selectedNode.action_details">
              <div class="detail-section-header">
                <div class="detail-section-title">动作详情</div>
                <n-button size="tiny" @click="copyJson(selectedNode.action_details)">复制</n-button>
              </div>
              <div class="detail-section-grid">
                <div class="detail-section-cell">
                  <div class="detail-section-label">动作 ID</div>
                  <div class="detail-section-value">{{ selectedNode.action_details.action_id }}</div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">动作类型</div>
                  <div class="detail-section-value">
                    <n-tag size="small" type="success">{{ selectedNode.action_details.action }}</n-tag>
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">节点名称</div>
                  <div class="detail-section-value">{{ selectedNode.action_details.name }}</div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">执行结果</div>
                  <div class="detail-section-value">
                    <n-tag size="small" :type="selectedNode.action_details.success ? 'success' : 'error'">
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
              <div class="empty">无 Action 详情</div>
            </div>
            <!-- 详细信息折叠面板组 -->
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
                    状态:
                    <n-tag size="small" :type="selectedNode.status === 'success' ? 'success' : 'error'">
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
                <div v-if="(selectedNode.recognition_attempts || []).length === 0" class="empty">无识别尝试记录</div>
                <div v-else class="detail-list">
                  <div
                    v-for="(attempt, index) in selectedNode.recognition_attempts"
                    :key="`${selectedNode.node_id}-${index}`"
                    class="detail-item"
                  >
                    <div class="detail-item-title">
                      {{ attempt.name || "Recognition" }} · {{ formatResultStatus(attempt.status) }} · {{ attempt.timestamp }}
                    </div>
                    <div v-if="attempt.reco_details" class="detail-actions">
                      <n-button size="tiny" @click="copyJson(attempt.reco_details)">复制</n-button>
                    </div>
                    <n-code
                      v-if="attempt.reco_details"
                      :code="JSON.stringify(attempt.reco_details, null, 2)"
                      language="json"
                      word-wrap
                      class="detail-code"
                    />
                    <!-- 嵌套节点 -->
                    <div v-if="(attempt.nested_nodes || []).length > 0" class="nested-list">
                      <div
                        v-for="(nested, nestedIndex) in attempt.nested_nodes"
                        :key="`${selectedNode.node_id}-${index}-nested-${nestedIndex}`"
                        class="detail-item nested"
                      >
                        <div class="detail-item-title">
                          {{ nested.name || "Nested" }} · {{ formatResultStatus(nested.status) }} · {{ nested.timestamp }}
                        </div>
                        <div v-if="nested.reco_details" class="detail-actions">
                          <n-button size="tiny" @click="copyJson(nested.reco_details)">复制</n-button>
                        </div>
                        <n-code
                          v-if="nested.reco_details"
                          :code="JSON.stringify(nested.reco_details, null, 2)"
                          language="json"
                          word-wrap
                          class="detail-code"
                        />
                      </div>
                    </div>
                  </div>
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
                <div v-if="(selectedNode.nested_action_nodes || []).length === 0" class="empty">无嵌套动作节点</div>
                <div v-else class="detail-list">
                  <div
                    v-for="(actionNode, actionIndex) in selectedNode.nested_action_nodes"
                    :key="`${selectedNode.node_id}-action-${actionIndex}`"
                    class="detail-item"
                  >
                    <div class="detail-item-title">
                      {{ actionNode.name || "Action" }} · {{ formatResultStatus(actionNode.status) }} · {{ actionNode.timestamp }}
                    </div>
                    <div v-if="actionNode.action_details" class="detail-actions">
                      <n-button size="tiny" @click="copyJson(actionNode.action_details)">复制</n-button>
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
                <div v-if="(selectedNode.next_list || []).length === 0" class="empty">无 Next List</div>
                <div v-else class="next-list">
                  <n-tag v-for="(item, idx) in selectedNode.next_list" :key="`${selectedNode.node_id}-next-${idx}`" size="small" type="info">
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
                  <n-button size="tiny" @click="copyJson(selectedNode.node_details)">复制</n-button>
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
                  <n-button size="tiny" @click="copyJson(selectedNode.focus)">复制</n-button>
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
          <div class="detail-section-card">
            <div class="detail-section-header">
              <div class="detail-section-title">Custom日志</div>
            </div>
            <!-- Custom日志级别过滤 -->
            <div class="aux-log-filters">
              <span class="aux-log-filter-label">级别过滤：</span>
              <n-checkbox-group :value="props.selectedAuxLevels" @update:value="emit('update:selectedAuxLevels', $event as string[])">
                <n-space>
                  <n-checkbox v-for="opt in auxLevelOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
                </n-space>
              </n-checkbox-group>
            </div>
            <!-- 日志来源过滤 -->
            <div class="aux-log-filters">
              <span class="aux-log-filter-label">隐藏来源：</span>
              <n-select
                :value="props.hiddenCallers"
                :options="props.callerOptions"
                multiple
                clearable
                placeholder="选择要隐藏的日志来源文件"
                @update:value="emit('update:hiddenCallers', $event as string[])"
                style="flex: 1; max-width: 400px;"
              />
            </div>
            <!-- 自定义动作标签 -->
            <div v-if="selectedNodeCustomActions.length > 0" class="detail-tag-list">
              <n-tag v-for="item in selectedNodeCustomActions" :key="`${item.name}-${item.fileName}`" size="small" type="info">
                {{ item.name }} · {{ item.fileName }}
              </n-tag>
            </div>
            <!-- 空状态：未选择任务 -->
            <div v-if="!selectedTask" class="empty">请选择任务查看Custom日志</div>
            <div v-else class="aux-log-section">
              <!-- 关联日志统计 -->
              <div class="aux-log-summary">
                <n-tag size="small" type="success">关联日志 {{ selectedTaskAuxLogs.length }}</n-tag>
              </div>
              <div class="aux-log-section-title">当前任务 · Custom日志</div>
              <!-- 空状态：无关联日志 -->
              <div v-if="selectedTaskAuxLogs.length === 0" class="empty">无关联日志</div>
              <!-- Custom日志列表（虚拟滚动） -->
              <div v-else class="aux-log-list">
                <DynamicScroller
                  class="virtual-scroller aux-log-scroller"
                  :items="selectedTaskAuxLogs"
                  key-field="key"
                  :min-item-size="60"
                >
                  <template #default="{ item, active }">
                    <DynamicScrollerItem :item="item" :active="active">
                      <div class="aux-log-item">
                        <div class="aux-log-main">
                          <div class="aux-log-header">
                            <n-tag size="small" :type="formatAuxLevel(item.level)">{{ item.level }}</n-tag>
                            <span class="aux-log-time">{{ item.timestamp }}</span>
                          </div>
                          <div class="aux-log-message">{{ item.message }}</div>
                        </div>
                        <div class="aux-log-meta">
                          <div v-if="item.entry">入口：{{ item.entry }}</div>
                          <div v-if="item.caller">来源：{{ item.caller }}</div>
                        </div>
                      </div>
                    </DynamicScrollerItem>
                  </template>
                </DynamicScroller>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </n-card>
</template>

<!--
  样式部分
  - Custom日志过滤器样式
  - Custom日志滚动区域高度限制
-->
<style scoped>
.aux-log-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.aux-log-filter-label {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
}

.aux-log-scroller {
  max-height: 200px;
}
</style>
