/**
 * 对比面板组件
 *
 * 用于在主界面中显示运行对比功能，包括：
 * - 基准/候选运行快照选择
 * - 任务选择
 * - 差异摘要显示
 * - 节点对比列表
 *
 * @module components/ComparePanel
 */
<script setup lang="ts">
import { computed, ref } from "vue";
import { NButton, NCard, NSelect, NTag, NTabs, NTabPane, NEmpty } from "naive-ui";
import type { CompareResult, ParsedRunSnapshot, TaskInfo } from "@/types/logTypes";
import { useComparePanel } from "@/composables/useComparePanel";
import RouteMap from "./RouteMap.vue";

// ============================================
// Props & Emits
// ============================================

const props = defineProps<{
  baselineSnapshot: ParsedRunSnapshot | null;
  candidateSnapshot: ParsedRunSnapshot | null;
  selectedTaskA: TaskInfo | null;
  selectedTaskB: TaskInfo | null;
  compareResult: CompareResult | null;
  baselineTasks: TaskInfo[];
  candidateTasks: TaskInfo[];
  formatDuration: (ms: number) => string;
}>();

const emit = defineEmits<{
  (e: "select-task-a", task: TaskInfo | null): void;
  (e: "select-task-b", task: TaskInfo | null): void;
  (e: "clear-baseline"): void;
  (e: "clear-candidate"): void;
  (e: "select-baseline-dir"): void;
  (e: "select-baseline-zip"): void;
  (e: "select-candidate-dir"): void;
  (e: "select-candidate-zip"): void;
  (e: "use-baseline-as-candidate"): void;
}>();

// ============================================
// Composable
// ============================================

const baselineTasksRef = computed(() => props.baselineTasks);
const candidateTasksRef = computed(() => props.candidateTasks);
const compareResultRef = computed(() => props.compareResult);

const {
  baselineOptions,
  candidateOptions,
  getDiffTypeText,
  getNodeStatusType,
} = useComparePanel({
  baselineTasks: baselineTasksRef,
  candidateTasks: candidateTasksRef,
  compareResult: compareResultRef,
});

// ============================================
// 事件处理
// ============================================

function handleSelectTaskA(taskKey: string | null): void {
  const task = taskKey ? props.baselineTasks.find((item) => item.key === taskKey) ?? null : null;
  emit("select-task-a", task);
}

function handleSelectTaskB(taskKey: string | null): void {
  const task = taskKey ? props.candidateTasks.find((item) => item.key === taskKey) ?? null : null;
  emit("select-task-b", task);
}

const activeTab = ref<"overview" | "route">("overview");

const canCompare = computed(() => props.selectedTaskA && props.selectedTaskB);
</script>

<template>
  <section class="compare-panel panel">
    <!-- 快照选择区域 -->
    <div class="compare-slots">
      <!-- 基准任务 -->
      <n-card class="snapshot-slot" size="small">
        <template #header>
          <div class="slot-header">
            <span>基准任务</span>
            <div class="slot-actions">
              <n-button size="small" tertiary type="primary" @click="emit('select-baseline-dir')">
                📁 导入目录
              </n-button>
              <n-button size="small" tertiary type="primary" @click="emit('select-baseline-zip')">
                📦 导入压缩包
              </n-button>
              <n-button
                size="small"
                tertiary
                :disabled="!baselineSnapshot"
                @click="emit('clear-baseline')"
              >
                清空
              </n-button>
            </div>
          </div>
        </template>
        <div class="slot-body">
          <div v-if="baselineSnapshot" class="slot-meta">
            <span>&nbsp;{{ baselineSnapshot.totalTaskCount }} 任务</span>
          </div>
          <div v-else class="slot-placeholder">点击上方按钮加载日志</div>
          <n-select
            :options="baselineOptions"
            :value="selectedTaskA?.key ?? null"
            clearable
            placeholder="选择任务"
            @update:value="handleSelectTaskA"
          />
        </div>
      </n-card>

      <div class="slot-gap" />

      <!-- 本次任务 -->
      <n-card class="snapshot-slot" size="small">
        <template #header>
          <div class="slot-header">
            <span>本次任务</span>
            <div class="slot-actions">
              <n-button size="small" tertiary type="primary" @click="emit('select-candidate-dir')">
                📁 导入目录
              </n-button>
              <n-button size="small" tertiary type="primary" @click="emit('select-candidate-zip')">
                📦 导入压缩包
              </n-button>
              <n-button
                size="small"
                tertiary
                :disabled="!baselineSnapshot"
                @click="emit('use-baseline-as-candidate')"
              >
                选用基准日志
              </n-button>
              <n-button
                size="small"
                tertiary
                :disabled="!candidateSnapshot"
                @click="emit('clear-candidate')"
              >
                清空
              </n-button>
            </div>
          </div>
        </template>
        <div class="slot-body">
          <div v-if="candidateSnapshot" class="slot-meta">
            <span>&nbsp;{{ candidateSnapshot.totalTaskCount }} 个任务</span>
          </div>
          <div v-else class="slot-placeholder">点击上方按钮加载日志</div>
          <n-select
            :options="candidateOptions"
            :value="selectedTaskB?.key ?? null"
            clearable
            placeholder="选择任务"
            @update:value="handleSelectTaskB"
          />
        </div>
      </n-card>
    </div>

    <!-- 差异摘要 -->
    <n-card v-if="compareResult" class="summary-card">
      <template #header>差异摘要</template>

      <n-tabs v-model:active-key="activeTab" type="segment" size="small">
        <n-tab-pane name="overview" tab="概览">
          <!-- 概览 -->
          <div class="overview">
            <div class="overview-item">
              <span>基准任务 状态</span>
              <n-tag :type="getNodeStatusType(compareResult.overview.baselineStatus)">
                {{ compareResult.overview.baselineStatus === "failed" ? "失败" : "成功" }}
              </n-tag>
            </div>
            <div class="overview-item">
              <span>本次任务 状态</span>
              <n-tag :type="getNodeStatusType(compareResult.overview.candidateStatus)">
                {{ compareResult.overview.candidateStatus === "failed" ? "失败" : "成功" }}
              </n-tag>
            </div>
            <div class="overview-item">
              <span>基准任务 耗时</span>
              <strong>{{ formatDuration(compareResult.overview.baselineDuration) }}</strong>
            </div>
            <div class="overview-item">
              <span>本次任务 耗时</span>
              <strong>{{ formatDuration(compareResult.overview.candidateDuration) }}</strong>
            </div>
          </div>

          <!-- 差异列表 -->
          <div v-if="compareResult.keyDiffs.length > 0" class="diff-list">
            <div
              v-for="diff in compareResult.keyDiffs"
              :key="diff.id"
              class="diff-item"
              :class="diff.severity"
            >
              <span class="diff-type">{{ getDiffTypeText(diff.type) }}</span>
              <span class="diff-node">{{ diff.nodeName }}</span>
              <span class="diff-desc">{{ diff.description }}</span>
            </div>
          </div>
          <div v-else class="no-diff">两次运行无显著差异</div>
        </n-tab-pane>

        <n-tab-pane name="route" tab="路线图">
          <RouteMap
            v-if="canCompare && selectedTaskA && selectedTaskB"
            :task-a="selectedTaskA"
            :task-b="selectedTaskB"
          />
          <n-empty v-else description="请先选择两个任务进行对比" />
        </n-tab-pane>
      </n-tabs>
    </n-card>
  </section>
</template>

<style scoped>
.compare-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.compare-slots {
  display: grid;
  grid-template-columns: 1fr 12px 1fr;
  align-items: stretch;
  flex-shrink: 0;
}

.slot-gap {
  width: 100%;
}

.snapshot-slot {
  position: relative;
  height: 120px;
  border: 1px dashed var(--n-border-color);
}

.snapshot-slot :deep(.n-card__content) {
  padding: 8px !important;
}

.slot-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.slot-actions {
  display: flex;
  gap: 4px;
}

.slot-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
}

.slot-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--n-text-color-2);
}

.slot-placeholder {
  color: var(--n-text-color-3);
  font-size: 13px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.overview-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--n-color-modal);
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
  padding: 8px;
  font-size: 12px;
}

.diff-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.diff-item {
  display: grid;
  grid-template-columns: 68px 1fr 2fr;
  gap: 8px;
  align-items: center;
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
  padding: 8px;
  font-size: 12px;
}

.diff-item.critical {
  border-color: var(--n-error-color);
}

.diff-item.warning {
  border-color: var(--n-warning-color);
}

.diff-type {
  font-weight: 600;
}

.no-diff {
  color: var(--n-success-color);
  font-size: 13px;
}
</style>
