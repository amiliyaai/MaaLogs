<script setup lang="ts">
import { NButton, NCard, NCollapse, NCollapseItem, NCode, NSelect, NTag } from "naive-ui";
import { DynamicScroller, DynamicScrollerItem } from "vue-virtual-scroller";
import type { AuxLogEntry, NodeInfo, NextListItem, PipelineCustomActionInfo, TaskInfo } from "../types/logTypes";

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
  formatNextName: (value: NextListItem) => string;
  formatBox: (value: [number, number, number, number] | null | undefined) => string;
  summarizeBase: (node: NodeInfo) => string;
  summarizeRecognition: (node: NodeInfo) => string;
  summarizeNestedActions: (node: NodeInfo) => string;
  summarizeNextList: (node: NodeInfo) => string;
  summarizeNodeDetail: (node: NodeInfo) => string;
  summarizeFocus: (node: NodeInfo) => string;
  copyJson: (data: unknown) => void;
  selectedNodeAuxWindowLabel: string;
  selectedNodeCustomActions: PipelineCustomActionInfo[];
  selectedNodeAuxLogs: AuxLogEntry[];
  selectedNodeAuxGroups: {
    matched: AuxLogEntry[];
    unmatched: AuxLogEntry[];
    failed: AuxLogEntry[];
  };
  formatAuxLevel: (value: string) => "default" | "primary" | "info" | "success" | "warning" | "error";
}>();

const emit = defineEmits<{
  (e: "select-task", value: { taskKey: string; nodeId: number | null }): void;
  (e: "select-node", value: number): void;
  (e: "update:processId", value: string): void;
  (e: "update:threadId", value: string): void;
}>();

const handleTaskSelect = (task: TaskInfo) => {
  emit("select-task", { taskKey: task.key, nodeId: task.nodes[0]?.node_id ?? null });
};

const handleNodeSelect = (nodeId: number) => {
  emit("select-node", nodeId);
};
</script>

<template>
  <n-card class="panel" size="small">
    <template #header>
      <div class="panel-header">
        <div>任务与节点</div>
        <div class="panel-tools panel-filters">
          <n-select
            size="small"
            :options="processOptions"
            :value="selectedProcessId"
            @update:value="emit('update:processId', $event)"
            placeholder="进程"
            class="filter-select"
          />
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
    <div v-if="tasks.length === 0" class="empty">解析后将在此显示任务与节点</div>
    <div v-else class="task-layout">
      <div class="task-list">
        <div class="panel-top">
          <div class="node-header">任务列表</div>
        </div>
        <div class="task-list-content">
          <div class="task-list-scroll">
            <div
              v-for="item in filteredTasks"
              :key="item.key"
              class="task-row"
              :class="{ active: item.key === selectedTaskKey }"
              @click="handleTaskSelect(item)"
            >
              <div class="task-main">
                <div class="task-title">{{ item.entry || "未命名任务" }}</div>
                <div class="task-tags">
                  <n-tag size="small" type="info">进程ID：{{ item.processId || "P?" }}</n-tag>
                  <n-tag size="small">线程ID：{{ item.threadId || "T?" }}</n-tag>
                </div>
              </div>
              <div class="task-sub">
                <div>文件： {{ item.fileName }}</div>
                <div>节点： {{ item.nodes.length }}个</div>
              </div>
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
          </div>
        </div>
      </div>
      <div class="node-list">
        <div class="panel-top">
          <div class="node-header">节点列表</div>
        </div>
        <div v-if="!selectedTaskKey" class="empty">请选择左侧任务</div>
        <div v-else class="node-list-content">
          <DynamicScroller
            class="virtual-scroller"
            :items="selectedTaskNodes"
            key-field="node_id"
            :min-item-size="nodeItemHeight"
          >
            <template #default="{ item, active }">
              <DynamicScrollerItem :item="item" :active="active" :size-dependencies="[item.name, item.status, item.recognition_attempts?.length]">
                <div class="node-row" :class="{ active: item.node_id === selectedNodeId }" @click="handleNodeSelect(item.node_id)">
                  <div class="node-main">
                    <div class="node-name">{{ item.name || item.node_id }}</div>
                    <div class="node-sub">
                      <div>时间： {{ item.timestamp }}</div>
                      <div>状态： {{ formatResultStatus(item.status) }}</div>
                    </div>
                  </div>
                  <div class="node-badges">
                    <div class="node-badge">进行识别： {{ item.recognition_attempts?.length || 0 }}次</div>
                    <div class="node-badge">Next列表： {{ item.next_list?.length || 0 }}个</div>
                  </div>
                </div>
              </DynamicScrollerItem>
            </template>
          </DynamicScroller>
          <div v-if="(selectedTask?.nodes || []).length === 0" class="empty">未发现节点事件</div>
        </div>
      </div>
      <div class="detail-panel">
        <div class="panel-top">
          <div class="node-header">节点详情</div>
        </div>
        <div v-if="!selectedTask" class="empty">请选择左侧任务</div>
        <div v-else class="detail-content">
          <div v-if="!selectedNode" class="empty">请选择节点</div>
          <template v-else>
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
            <div v-else class="detail-section-card">
              <div class="detail-section-header">
                <div class="detail-section-title">识别详情</div>
              </div>
              <div class="empty">无 Recognition 详情</div>
            </div>
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
            <div v-else class="detail-section-card">
              <div class="detail-section-header">
                <div class="detail-section-title">动作详情</div>
              </div>
              <div class="empty">无 Action 详情</div>
            </div>
            <n-collapse :default-expanded-names="[]">
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
          <div class="detail-section-card">
            <div class="detail-section-header">
              <div class="detail-section-title">辅助日志</div>
              <div class="detail-section-sub" v-if="selectedNodeAuxWindowLabel">
                {{ selectedNodeAuxWindowLabel }}
              </div>
            </div>
            <div v-if="selectedNodeCustomActions.length > 0" class="detail-tag-list">
              <n-tag v-for="item in selectedNodeCustomActions" :key="`${item.name}-${item.fileName}`" size="small" type="info">
                {{ item.name }} · {{ item.fileName }}
              </n-tag>
            </div>
            <div v-if="!selectedNode" class="empty">请选择节点查看辅助日志</div>
            <div v-else class="aux-log-section">
              <div class="aux-log-summary">
                <n-tag size="small" type="success">已关联 {{ selectedNodeAuxGroups.matched.length }}</n-tag>
                <n-tag size="small">未关联 {{ selectedNodeAuxGroups.unmatched.length }}</n-tag>
                <n-tag size="small" type="error">关联失败 {{ selectedNodeAuxGroups.failed.length }}</n-tag>
              </div>
              <div class="aux-log-section-title">当前节点 · 关联日志</div>
              <div v-if="selectedNodeAuxLogs.length === 0" class="empty">无关联日志</div>
              <div v-else class="aux-log-list">
                <div v-for="log in selectedNodeAuxLogs" :key="log.key" class="aux-log-item">
                  <div class="aux-log-main">
                    <div class="aux-log-header">
                      <n-tag size="small" :type="formatAuxLevel(log.level)">{{ log.level }}</n-tag>
                      <n-tag size="small" type="success">匹配</n-tag>
                      <span class="aux-log-time">{{ log.timestamp }}</span>
                    </div>
                    <div class="aux-log-message">{{ log.message }}</div>
                  </div>
                  <div class="aux-log-meta">
                    <div v-if="log.entry">入口：{{ log.entry }}</div>
                    <div v-if="log.caller">来源：{{ log.caller }}</div>
                    <div v-if="log.correlation?.keys?.length">
                      关联线索：{{ log.correlation.keys.join(" / ") }}
                    </div>
                    <n-code
                      v-if="log.details"
                      :code="JSON.stringify(log.details, null, 2)"
                      language="json"
                      word-wrap
                      class="detail-code"
                    />
                  </div>
                </div>
              </div>
              <div class="aux-log-section-title">未关联日志</div>
              <div v-if="selectedNodeAuxGroups.unmatched.length === 0" class="empty">无未关联日志</div>
              <div v-else class="aux-log-list">
                <div v-for="log in selectedNodeAuxGroups.unmatched" :key="log.key" class="aux-log-item">
                  <div class="aux-log-main">
                    <div class="aux-log-header">
                      <n-tag size="small" :type="formatAuxLevel(log.level)">{{ log.level }}</n-tag>
                      <n-tag size="small">未关联</n-tag>
                      <span class="aux-log-time">{{ log.timestamp }}</span>
                    </div>
                    <div class="aux-log-message">{{ log.message }}</div>
                  </div>
                  <div class="aux-log-meta">
                    <div v-if="log.correlation?.reason">原因：{{ log.correlation.reason }}</div>
                    <div v-if="log.correlation?.keys?.length">
                      关联线索：{{ log.correlation.keys.join(" / ") }}
                    </div>
                  </div>
                </div>
              </div>
              <div class="aux-log-section-title">关联失败日志</div>
              <div v-if="selectedNodeAuxGroups.failed.length === 0" class="empty">无关联失败日志</div>
              <div v-else class="aux-log-list">
                <div v-for="log in selectedNodeAuxGroups.failed" :key="log.key" class="aux-log-item">
                  <div class="aux-log-main">
                    <div class="aux-log-header">
                      <n-tag size="small" :type="formatAuxLevel(log.level)">{{ log.level }}</n-tag>
                      <n-tag size="small" type="error">失败</n-tag>
                      <span class="aux-log-time">{{ log.timestamp }}</span>
                    </div>
                    <div class="aux-log-message">{{ log.message }}</div>
                  </div>
                  <div class="aux-log-meta">
                    <div v-if="log.correlation?.reason">原因：{{ log.correlation.reason }}</div>
                    <div v-if="log.correlation?.driftMs !== undefined">
                      漂移：{{ formatDuration(log.correlation.driftMs) }}
                    </div>
                    <div v-if="log.correlation?.keys?.length">
                      关联线索：{{ log.correlation.keys.join(" / ") }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </n-card>
</template>
