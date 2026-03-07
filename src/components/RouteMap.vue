<template>
  <div class="route-map">
    <div class="route-header">
      <div class="route-summary">
        <div class="summary-item baseline">
          <span class="summary-label">基准任务节点</span>
          <span class="summary-value">{{ summary.totalA }}</span>
        </div>
        <div class="summary-item candidate">
          <span class="summary-label">本次任务节点</span>
          <span class="summary-value">{{ summary.totalB }}</span>
        </div>
        <div class="summary-item equal">
          <span class="summary-label">相同</span>
          <span class="summary-value">{{ summary.equalCount }}</span>
        </div>
        <div class="summary-item baseline">
          <span class="summary-label">基准独有</span>
          <span class="summary-value">{{ summary.aOnlyCount }}</span>
        </div>
        <div class="summary-item candidate">
          <span class="summary-label">本次独有</span>
          <span class="summary-value">{{ summary.bOnlyCount }}</span>
        </div>
        <div class="summary-item diff">
          <span class="summary-label">分歧</span>
          <span class="summary-value">{{ summary.divergedCount }}</span>
        </div>
        <div class="summary-item warning">
          <span class="summary-label">状态变化</span>
          <span class="summary-value">{{ summary.statusChangedCount }}</span>
        </div>
        <div class="summary-item warning">
          <span class="summary-label">耗时变化</span>
          <span class="summary-value">{{ summary.durationChangedCount }}</span>
        </div>
        <div class="summary-item diff">
          <span class="summary-label">循环</span>
          <span class="summary-value">{{ summary.loopCount }}</span>
        </div>
      </div>

      <div class="route-controls">
        <n-space>
          <n-button
            :type="viewMode === 'diff' ? 'primary' : 'default'"
            size="small"
            @click="viewMode = 'diff'"
          >
            只看差异
          </n-button>
          <n-button
            :type="viewMode === 'full' ? 'primary' : 'default'"
            size="small"
            @click="viewMode = 'full'"
          >
            显示全部
          </n-button>
        </n-space>
      </div>
    </div>

    <div class="route-legend">
      <div class="legend-item">
        <span class="legend-color legend-success"></span>
        <span class="legend-text">成功</span>
      </div>
      <div class="legend-item">
        <span class="legend-color legend-failed"></span>
        <span class="legend-text">失败</span>
      </div>
      <div class="legend-item">
        <span class="legend-color legend-skipped"></span>
        <span class="legend-text">跳过</span>
      </div>
      <div class="legend-item">
        <span class="legend-color legend-diverged"></span>
        <span class="legend-text">分歧</span>
      </div>
      <div class="legend-item">
        <span class="legend-color legend-only"></span>
        <span class="legend-text">独有</span>
      </div>
    </div>

    <div v-if="viewMode === 'diff'" class="route-quick-nav">
      <span
        v-for="group in diffGroups"
        :key="group.type"
        class="nav-tag"
        :class="{ 'nav-tag-active': activeGroup === group.type, [`nav-tag-${group.type}`]: true }"
        @click="scrollToGroup(group.type)"
      >
        {{ group.icon }} {{ group.label }} ({{ group.items.length }})
      </span>
    </div>

    <div v-if="viewMode === 'diff'" class="route-diff-view">
      <template v-for="group in diffGroups" :key="group.type">
        <div
          :id="`diff-group-${group.type}`"
          class="diff-group"
          :class="`diff-group-${group.type}`"
        >
          <div class="diff-group-header" @click="['a_only', 'b_only', 'diverged'].includes(group.type) ? toggleGroup(group.type) : void 0">
            <span class="diff-group-icon">{{ group.icon }}</span>
            <span class="diff-group-label">{{ group.label }}</span>
            <span class="diff-group-count">({{ group.items.length }})</span>
            <span v-if="['a_only', 'b_only', 'diverged'].includes(group.type)" class="collapse-icon">
              {{ isCollapsed(group.type) ? '▶' : '▼' }}
            </span>
          </div>

          <div v-if="!isCollapsed(group.type)" class="diff-items">
            <div
              v-for="item in group.items"
              :key="item.index"
              class="diff-item"
              @click="showDiffDetail(item)"
            >
              <div class="diff-path-preview">
                <template v-if="item.context.before.length > 0">
                  <template v-for="(node, idx) in item.context.before" :key="'before-' + idx">
                    <span class="path-node path-node-context path-node-clickable" @click.stop="showContextNodeDetail(node)">
                      {{ node }}
                    </span>
                    <span v-if="idx < item.context.before.length - 1" class="path-arrow">→</span>
                  </template>
                  <span class="path-arrow">→</span>
                </template>
                <span class="path-node path-node-main" :class="getDiffItemClass(item)">
                  {{ item.name }}
                </span>
                <template v-if="item.context.after.length > 0">
                  <span class="path-arrow">→</span>
                  <template v-for="(node, idx) in item.context.after" :key="'after-' + idx">
                    <span class="path-node path-node-context path-node-clickable" @click.stop="showContextNodeDetail(node)">
                      {{ node }}
                    </span>
                    <span v-if="idx < item.context.after.length - 1" class="path-arrow">→</span>
                  </template>
                </template>
              </div>

              <div class="diff-description">
                {{ item.description }}
              </div>

              <div v-if="item.type === 'status_changed'" class="diff-status">
                <div class="diff-status-a">
                  <span class="status-label">基准:</span>
                  <span class="status-value" :class="getStatusClass(item.nodeA?.status)">
                    {{ getStatusText(item.nodeA?.status) }}
                  </span>
                </div>
                <span class="status-arrow">→</span>
                <div class="diff-status-b">
                  <span class="status-label">本次:</span>
                  <span class="status-value" :class="getStatusClass(item.nodeB?.status)">
                    {{ getStatusText(item.nodeB?.status) }}
                  </span>
                </div>
              </div>

              <div v-else-if="item.type === 'a_only' || item.type === 'b_only'" class="diff-only-badge">
                {{ item.type === 'a_only' ? '基准独有' : '本次独有' }}
              </div>
            </div>
          </div>
        </div>
      </template>

      <div v-if="diffGroups.length === 0" class="empty-hint">
        两个任务的路线完全相同 ✓
      </div>
    </div>

    <div v-else class="route-nodes">
      <div class="route-columns">
        <div class="route-column column-a">
          <div class="column-header">
            <span class="column-title">基准任务</span>
            <span class="column-count">({{ summary.totalA }} 个)</span>
          </div>
        </div>

        <div class="route-column column-b">
          <div class="column-header">
            <span class="column-title">本次任务</span>
            <span class="column-count">({{ summary.totalB }} 个)</span>
          </div>
        </div>
      </div>

      <div class="route-rows">
        <div v-for="(row, rowIndex) in alignedRows" :key="rowIndex" class="route-row">
          <div class="row-cell cell-a">
            <div
              v-if="row.a"
              class="node-item"
              :class="getItemClass(row.a, 'a')"
              @click="showDetailFor('a', row.a)"
            >
              <span class="node-status-icon">
                {{ getStatusIcon(row.a) }}
              </span>
              <span class="node-name">{{ row.a.name }}</span>
              <span v-if="row.a.duration" class="node-duration">
                {{ formatDuration(row.a.duration) }}
              </span>
            </div>
            <div v-else class="node-placeholder"></div>
          </div>

          <div class="row-cell cell-b">
            <div
              v-if="row.b"
              class="node-item"
              :class="getItemClass(row.b, 'b')"
              @click="showDetailFor('b', row.b)"
            >
              <span class="node-status-icon">
                {{ getStatusIcon(row.b) }}
              </span>
              <span class="node-name">{{ row.b.name }}</span>
              <span v-if="row.b.duration" class="node-duration">
                {{ formatDuration(row.b.duration) }}
              </span>
            </div>
            <div v-else class="node-placeholder"></div>
          </div>
        </div>

        <div v-if="alignedRows.length === 0" class="empty-hint">
          两个任务的路线完全相同 ✓
        </div>
      </div>
    </div>

    <PathDetail
      v-model:show="detailVisible"
      :node="selectedNode"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { NButton } from "naive-ui";
import type { PathNode as PathNodeType, TaskInfo, CompareStatus, PathNodeStatus, DiffItem as DiffItemType } from "@/types/logTypes";
import { buildPathComparison, buildDiffGroups } from "@/utils/pathBuilder";
import PathDetail from "./PathDetail.vue";

const props = defineProps<{
  taskA: TaskInfo;
  taskB: TaskInfo;
}>();

const viewMode = ref<"diff" | "full">("diff");
const activeGroup = ref<string | null>(null);
const detailVisible = ref(false);
const selectedNode = ref<PathNodeType | null>(null);
const collapsedGroups = ref<Set<string>>(new Set());

const comparison = computed(() => buildPathComparison(props.taskA, props.taskB));
const summary = computed(() => comparison.value.summary);
const diffGroups = computed(() => buildDiffGroups(comparison.value.nodes));

interface ColumnNode {
  name: string;
  status: PathNodeStatus;
  compareStatus: CompareStatus;
  duration?: number;
  originalNode?: PathNodeType;
}

interface AlignedRow {
  a?: ColumnNode;
  b?: ColumnNode;
}

const alignedRows = computed<AlignedRow[]>(() => {
  const result: AlignedRow[] = [];

  for (const node of comparison.value.nodes) {
    const row: AlignedRow = {};

    if (node.taskA) {
      row.a = {
        name: node.name,
        status: node.status,
        compareStatus: node.compareStatus,
        duration: node.taskA.duration,
        originalNode: node,
      };
    }

    if (node.taskB) {
      row.b = {
        name: node.name,
        status: node.status,
        compareStatus: node.compareStatus,
        duration: node.taskB.duration,
        originalNode: node,
      };
    }

    result.push(row);
  }

  return result;
});

function scrollToGroup(type: string) {
  activeGroup.value = type;
  const el = document.getElementById(`diff-group-${type}`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function toggleGroup(type: string) {
  if (collapsedGroups.value.has(type)) {
    collapsedGroups.value.delete(type);
  } else {
    collapsedGroups.value.add(type);
  }
}

function isCollapsed(type: string): boolean {
  return collapsedGroups.value.has(type);
}

function getDiffItemClass(item: DiffItemType): string {
  switch (item.type) {
    case "status_changed":
      return "diff-item-status-changed";
    case "a_only":
      return "diff-item-a-only";
    case "b_only":
      return "diff-item-b-only";
    case "diverged":
      return "diff-item-diverged";
    case "duration_changed":
      return "diff-item-duration";
    default:
      return "";
  }
}

function getStatusClass(status?: string): string {
  switch (status) {
    case "success":
      return "status-success";
    case "failed":
      return "status-failed";
    case "skipped":
      return "status-skipped";
    default:
      return "";
  }
}

function getStatusText(status?: string): string {
  switch (status) {
    case "success":
      return "成功";
    case "failed":
      return "失败";
    case "skipped":
      return "跳过";
    default:
      return "未知";
  }
}

function showDiffDetail(item: DiffItemType) {
  const node = item.nodeA || item.nodeB;
  if (node) {
    selectedNode.value = node;
    detailVisible.value = true;
  }
}

function showContextNodeDetail(nodeName: string) {
  const node = comparison.value.nodes.find((n) => n.name === nodeName);
  if (node) {
    selectedNode.value = node;
    detailVisible.value = true;
  }
}

function getItemClass(node: ColumnNode, side: "a" | "b"): string {
  const classes: string[] = [];

  switch (node.status) {
    case "success":
      classes.push("status-success");
      break;
    case "failed":
      classes.push("status-failed");
      break;
    case "skipped":
      classes.push("status-skipped");
      break;
  }

  switch (node.compareStatus) {
    case "equal":
      classes.push("compare-equal");
      break;
    case "diverged":
      classes.push("compare-diverged");
      break;
    case "a_only":
      classes.push(side === "a" ? "compare-only" : "compare-missing");
      break;
    case "b_only":
      classes.push(side === "b" ? "compare-only" : "compare-missing");
      break;
  }

  return classes.join(" ");
}

function getStatusIcon(node: ColumnNode): string {
  switch (node.status) {
    case "success":
      return "✓";
    case "failed":
      return "✗";
    case "skipped":
      return "○";
    default:
      return "-";
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return `${minutes}m${remainSeconds}s`;
}

function showDetailFor(_side: "a" | "b", node: ColumnNode) {
  if (node.originalNode) {
    selectedNode.value = node.originalNode;
    detailVisible.value = true;
  }
}
</script>

<style scoped>
.route-map {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  height: 100%;
}

.route-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.route-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px;
  background: linear-gradient(135deg, #f0f9ff 0%, #fef3c7 100%);
  border-radius: 12px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  min-width: 80px;
  transition: transform 0.2s, box-shadow 0.2s;
}

.summary-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.summary-item.baseline {
  border-left: 3px solid #3b82f6;
}

.summary-item.candidate {
  border-left: 3px solid #8b5cf6;
}

.summary-item.equal {
  border-left: 3px solid #22c55e;
}

.summary-item.diff {
  border-left: 3px solid #f59e0b;
}

.summary-item.warning {
  border-left: 3px solid #ef4444;
}

.summary-label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}

.summary-value {
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
}

.summary-item.baseline .summary-value {
  color: #3b82f6;
}

.summary-item.candidate .summary-value {
  color: #8b5cf6;
}

.summary-item.equal .summary-value {
  color: #22c55e;
}

.summary-item.diff .summary-value {
  color: #f59e0b;
}

.summary-item.warning .summary-value {
  color: #ef4444;
}

.route-controls {
  display: flex;
  gap: 12px;
}

.route-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 12px 16px;
  background: white;
  border-radius: 8px;
  font-size: 13px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend-color {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.legend-success {
  background: linear-gradient(135deg, #10b981, #059669);
}

.legend-failed {
  background: linear-gradient(135deg, #ef4444, #dc2626);
}

.legend-skipped {
  background: linear-gradient(135deg, #9ca3af, #6b7280);
}

.legend-diverged {
  background: linear-gradient(135deg, #f59e0b, #d97706);
}

.legend-only {
  background: linear-gradient(135deg, #8b5cf6, #7c3aed);
}

.legend-text {
  color: #374151;
  font-weight: 500;
}

.route-quick-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px 16px;
  background: white;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.nav-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  background: white;
  border: 2px solid #e5e7eb;
}

.nav-tag:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.nav-tag-active {
  border-color: #3b82f6;
  background: #eff6ff;
  color: #1d4ed8;
}

.nav-tag-status_changed,
.nav-tag-a_only {
  border-color: #ef4444;
  background: #fef2f2;
  color: #b91c1c;
}

.nav-tag-b_only {
  border-color: #f59e0b;
  background: #fffbeb;
  color: #b45309;
}

.nav-tag-diverged {
  border-color: #8b5cf6;
  background: #f5f3ff;
  color: #6d28d9;
}

.nav-tag-duration_changed {
  border-color: #06b6d4;
  background: #ecfeff;
  color: #0891b2;
}

.route-diff-view {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px;
}

.diff-group {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  transition: box-shadow 0.2s;
}

.diff-group:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.diff-group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  font-weight: 600;
  font-size: 14px;
  border-bottom: 1px solid #e5e7eb;
  cursor: pointer;
  transition: background 0.2s;
}

.diff-group-header:hover {
  background: #f9fafb;
}

.collapse-icon {
  margin-left: auto;
  font-size: 12px;
  color: #6b7280;
  user-select: none;
}

.diff-group-icon {
  font-size: 18px;
}

.diff-group-label {
  color: #374151;
}

.diff-group-count {
  color: #6b7280;
  font-weight: 400;
  font-size: 13px;
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 10px;
}

.diff-group-status_changed .diff-group-header {
  background: linear-gradient(90deg, #fef2f2, transparent);
}

.diff-group-a_only .diff-group-header {
  background: linear-gradient(90deg, #fef2f2, transparent);
}

.diff-group-b_only .diff-group-header {
  background: linear-gradient(90deg, #fffbeb, transparent);
}

.diff-group-diverged .diff-group-header {
  background: linear-gradient(90deg, #f5f3ff, transparent);
}

.diff-group-duration_changed .diff-group-header {
  background: #ecfeff;
}

.diff-items {
  padding: 8px;
}

.diff-item {
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: #fafafa;
  border: 1px solid #e5e7eb;
}

.diff-item:last-child {
  margin-bottom: 0;
}

.diff-item:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.diff-path-preview {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.path-node {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.path-node-context {
  background: #f3f4f6;
  color: #6b7280;
}

.path-node-clickable {
  cursor: pointer;
  transition: all 0.2s;
}

.path-node-clickable:hover {
  background: #e0e7ff;
  color: #3730a3;
  border-color: #c7d2fe;
}

.path-node-main {
  background: #e0e7ff;
  color: #3730a3;
  border: 1px solid #c7d2fe;
}

.path-arrow {
  color: #9ca3af;
  font-size: 12px;
}

.diff-item-status-changed .path-node-main {
  background: #fee2e2;
  color: #991b1b;
  border-color: #fca5a5;
}

.diff-item-a-only .path-node-main {
  background: #fee2e2;
  color: #991b1b;
  border-color: #fca5a5;
}

.diff-item-b-only .path-node-main {
  background: #fef3c7;
  color: #92400e;
  border-color: #fcd34d;
}

.diff-description {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 8px;
}

.diff-status {
  display: flex;
  align-items: center;
  gap: 12px;
}

.diff-status-a,
.diff-status-b {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-label {
  font-size: 12px;
  color: #6b7280;
}

.status-value {
  font-weight: 600;
  font-size: 13px;
}

.status-value.status-success {
  color: #10b981;
}

.status-value.status-failed {
  color: #ef4444;
}

.status-value.status-skipped {
  color: #9ca3af;
}

.status-arrow {
  color: #9ca3af;
}

.diff-only-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  background: #fef2f2;
  color: #991b1b;
}

.diff-item-b-only .diff-only-badge {
  background: #fef3c7;
  color: #92400e;
}

.route-nodes {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.route-columns {
  display: flex;
  gap: 8px;
  background: linear-gradient(180deg, #f9fafb, white);
  border-bottom: 2px solid #e5e7eb;
  border-radius: 12px 12px 0 0;
}

.route-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.column-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  font-weight: 600;
  font-size: 14px;
  border-bottom: 2px solid;
  background: white;
}

.column-a .column-header {
  border-color: #3b82f6;
  color: #3b82f6;
}

.column-b .column-header {
  border-color: #8b5cf6;
  color: #8b5cf6;
}

.column-count {
  font-size: 12px;
  font-weight: 500;
  opacity: 0.8;
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 10px;
}

.route-rows {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  background: #fafafa;
}

.route-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.route-row:last-child {
  margin-bottom: 0;
}

.row-cell {
  flex: 1;
  min-width: 0;
}

.node-placeholder {
  min-height: 44px;
  border-radius: 6px;
  background: #f3f4f6;
  border: 2px dashed #d1d5db;
}

.node-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 8px;
  background: white;
  border: 2px solid #e5e7eb;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 44px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.node-item:hover {
  transform: translateX(4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: #9ca3af;
}

.node-item.status-success {
  border-color: #10b981;
  background: linear-gradient(135deg, #ecfdf5, #d1fae5);
}

.node-item.status-failed {
  border-color: #ef4444;
  background: linear-gradient(135deg, #fef2f2, #fee2e2);
}

.node-item.status-skipped {
  border-color: #9ca3af;
  background: linear-gradient(135deg, #f3f4f6, #e5e7eb);
}

.node-item.compare-equal {
  background: linear-gradient(135deg, #ecfdf5, #d1fae5);
}

.node-item.compare-diverged {
  background: linear-gradient(135deg, #fffbeb, #fef3c7);
  border-color: #f59e0b;
}

.node-item.compare-only {
  background: linear-gradient(135deg, #f3f4f6, #e5e7eb);
}

.node-item.compare-missing {
  opacity: 0.4;
  background: linear-gradient(135deg, #fef2f2, #fee2e2);
}

.node-status-icon {
  font-weight: 700;
  width: 20px;
  text-align: center;
}

.status-success .node-status-icon {
  color: #10b981;
}

.status-failed .node-status-icon {
  color: #ef4444;
}

.status-skipped .node-status-icon {
  color: #9ca3af;
}

.compare-diverged .node-status-icon {
  color: #f59e0b;
}

.node-name {
  flex: 1;
  font-weight: 500;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-duration {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
}

.empty-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #10b981;
  font-size: 16px;
}
</style>
