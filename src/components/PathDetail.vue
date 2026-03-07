<template>
  <n-modal
    :show="show"
    preset="card"
    title="节点详情"
    style="width: 550px; max-width: 90vw"
    :bordered="false"
    body-style="max-height: 80vh; overflow-y: auto;"
    @update:show="emit('update:show', $event)"
  >
    <div v-if="node" class="detail-content">
      <div class="detail-header" :class="compareClass">
        <span class="detail-icon">{{ icon }}</span>
        <span class="detail-name">{{ node.name }}</span>
        <n-tag v-if="node.loopCount && node.loopCount > 1" type="warning">
          循环 ×{{ node.loopCount }}
        </n-tag>
      </div>

      <n-divider />

      <div class="detail-section">
        <div class="section-title">运行逻辑</div>
        <div class="detail-row">
          <span class="label">执行状态:</span>
          <n-tag :type="statusType">{{ statusText }}</n-tag>
        </div>
        <div v-if="node.compareStatus === 'diverged'" class="detail-row">
          <span class="label">对比状态:</span>
          <span class="value compare-hint">{{ compareHint }}</span>
        </div>
      </div>

      <div v-if="nextListInfo && nextListInfo.length > 0" class="detail-section">
        <div class="section-title">后续节点 (Next List)</div>
        <div class="next-list">
          <div v-for="(item, idx) in nextListInfo" :key="idx" class="next-item">
            <span class="next-arrow">→</span>
            <span class="next-name">{{ item.name }}</span>
            <n-tag v-if="item.anchor" size="small" type="info">锚点</n-tag>
            <n-tag v-if="item.jumpBack" size="small" type="warning">跳转</n-tag>
            <n-tag v-if="item.status === 'success'" size="small" type="success">成功</n-tag>
            <n-tag v-if="item.status === 'failed'" size="small" type="error">失败</n-tag>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <div class="section-title">识别详情</div>
        <div class="side-comparison">
          <div class="side-col">
            <div class="side-title">基准</div>
            <div v-if="node.taskA?.recognition" class="side-content">
              <div class="detail-row">
                <span class="label">算法:</span>
                <span class="value">{{ node.taskA.recognition.algorithm }}</span>
              </div>
              <div v-if="node.taskA.recognition.box" class="detail-row">
                <span class="label">区域:</span>
                <span class="value">[{{ node.taskA.recognition.box.join(', ') }}]</span>
              </div>
              <div v-if="node.taskA.recognition.expected" class="detail-row">
                <span class="label">期望:</span>
                <span class="value">{{ node.taskA.recognition.expected }}</span>
              </div>
            </div>
            <div v-else class="empty">无</div>
          </div>
          <div class="side-col">
            <div class="side-title">本次</div>
            <div v-if="node.taskB?.recognition" class="side-content">
              <div class="detail-row">
                <span class="label">算法:</span>
                <span class="value">{{ node.taskB.recognition.algorithm }}</span>
              </div>
              <div v-if="node.taskB.recognition.box" class="detail-row">
                <span class="label">区域:</span>
                <span class="value">[{{ node.taskB.recognition.box.join(', ') }}]</span>
              </div>
              <div v-if="node.taskB.recognition.expected" class="detail-row">
                <span class="label">期望:</span>
                <span class="value">{{ node.taskB.recognition.expected }}</span>
              </div>
            </div>
            <div v-else class="empty">无</div>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <div class="section-title">动作详情</div>
        <div class="side-comparison">
          <div class="side-col">
            <div class="side-title">基准</div>
            <div v-if="node.taskA?.action" class="side-content">
              <div class="detail-row">
                <span class="label">类型:</span>
                <span class="value">{{ node.taskA.action.type }}</span>
              </div>
              <div v-if="actionParams(node.taskA.action.params)" class="detail-row">
                <span class="label">参数:</span>
                <span class="value params">{{ actionParams(node.taskA.action.params) }}</span>
              </div>
            </div>
            <div v-else class="empty">无</div>
          </div>
          <div class="side-col">
            <div class="side-title">本次</div>
            <div v-if="node.taskB?.action" class="side-content">
              <div class="detail-row">
                <span class="label">类型:</span>
                <span class="value">{{ node.taskB.action.type }}</span>
              </div>
              <div v-if="actionParams(node.taskB.action.params)" class="detail-row">
                <span class="label">参数:</span>
                <span class="value params">{{ actionParams(node.taskB.action.params) }}</span>
              </div>
            </div>
            <div v-else class="empty">无</div>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <div class="section-title">耗时对比</div>
        <div class="duration-compare">
          <div class="duration-item">
            <span class="duration-label">基准</span>
            <span class="duration-value">{{ formatDuration(node.taskA?.duration ?? 0) }}</span>
          </div>
          <div class="duration-item">
            <span class="duration-label">本次</span>
            <span class="duration-value">{{ formatDuration(node.taskB?.duration ?? 0) }}</span>
          </div>
          <div v-if="durationDiff !== null" class="duration-item diff">
            <span class="duration-label">差异</span>
            <span class="duration-value">{{ durationDiff }}</span>
          </div>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NModal, NTag, NDivider } from "naive-ui";
import type { PathNode } from "@/types/logTypes";

interface Props {
  show: boolean;
  node: PathNode | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  "update:show": [value: boolean];
}>();

interface NextInfo {
  name: string;
  anchor: boolean;
  jumpBack: boolean;
  status?: "success" | "failed";
}

const nextListInfo = computed<NextInfo[] | null>(() => {
  const attempts = props.node?.nextListAttempts;
  if (attempts && attempts.length > 0) {
    const latestAttempt = attempts[attempts.length - 1];
    return latestAttempt.list.map((item) => ({
      name: item.name,
      anchor: item.anchor,
      jumpBack: item.jump_back,
      status: latestAttempt.status,
    }));
  }
  if (!props.node?.nextList) return null;
  return props.node.nextList.map((item) => ({
    name: item.name,
    anchor: item.anchor,
    jumpBack: item.jump_back,
  }));
});

const icon = computed(() => {
  if (!props.node) return "⚪";
  switch (props.node.compareStatus) {
    case "equal":
      return "⭕";
    case "diverged":
      return "⚡";
    case "a_only":
      return "🔵";
    case "b_only":
      return "🟣";
    default:
      return "⚪";
  }
});

const compareClass = computed(() => {
  if (!props.node) return "";
  return props.node.compareStatus;
});

const statusType = computed(() => {
  if (!props.node) return "default";
  switch (props.node.status) {
    case "success":
      return "success";
    case "failed":
      return "error";
    case "skipped":
      return "warning";
    default:
      return "default";
  }
});

const statusText = computed(() => {
  if (!props.node) return "未知";
  switch (props.node.status) {
    case "success":
      return "成功";
    case "failed":
      return "失败";
    case "skipped":
      return "跳过";
    default:
      return "未知";
  }
});

const compareHint = computed(() => {
  if (!props.node) return "";
  const { taskA, taskB } = props.node;
  if (taskA && !taskB) return "基准独有";
  if (!taskA && taskB) return "本次独有";
  if (taskA && taskB) return "内容不同";
  return "";
});

const durationDiff = computed(() => {
  if (!props.node) return null;
  const a = props.node.taskA?.duration ?? 0;
  const b = props.node.taskB?.duration ?? 0;
  if (a === 0 && b === 0) return null;
  const diff = b - a;
  const percent = a > 0 ? ((diff / a) * 100).toFixed(1) : "∞";
  const sign = diff > 0 ? "+" : "";
  return `${sign}${formatDuration(Math.abs(diff))} (${sign}${percent}%)`;
});

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function actionParams(params: Record<string, unknown> | undefined): string {
  if (!params || Object.keys(params).length === 0) return "";
  const entries = Object.entries(params).slice(0, 3);
  return entries.map(([k, v]) => `${k}=${v}`).join(", ");
}
</script>

<style scoped>
.detail-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  background: #f5f7fa;
}

.detail-header.equal {
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
}

.detail-header.diverged {
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
}

.detail-header.a-only {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
}

.detail-header.b-only {
  background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%);
}

.detail-icon {
  font-size: 20px;
}

.detail-name {
  font-weight: 600;
  font-size: 16px;
  color: #374151;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  font-weight: 600;
  color: #374151;
  font-size: 14px;
  padding-bottom: 4px;
  border-bottom: 1px solid #e5e7eb;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.label {
  color: #6b7280;
  font-size: 13px;
}

.value {
  color: #374151;
  font-size: 13px;
}

.value.empty {
  color: #9ca3af;
  font-style: italic;
}

.value.params {
  font-size: 12px;
  max-width: 300px;
  word-break: break-all;
  overflow-wrap: break-word;
}

.compare-hint {
  font-weight: 500;
  color: #f59e0b;
}

.next-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.next-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #f9fafb;
  border-radius: 6px;
}

.next-arrow {
  color: #9ca3af;
  font-weight: bold;
}

.next-name {
  flex: 1;
  font-weight: 500;
}

.side-comparison {
  display: flex;
  gap: 16px;
}

.side-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.side-title {
  font-weight: 600;
  color: #374151;
  font-size: 13px;
  padding-bottom: 4px;
  border-bottom: 2px solid;
}

.side-col:first-child .side-title {
  border-color: #3b82f6;
  color: #3b82f6;
}

.side-col:last-child .side-title {
  border-color: #8b5cf6;
  color: #8b5cf6;
}

.side-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: #f9fafb;
  border-radius: 6px;
}

.empty {
  color: #9ca3af;
  font-style: italic;
  font-size: 13px;
  padding: 8px;
}

.duration-compare {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.duration-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 20px;
  background: #f9fafb;
  border-radius: 8px;
  min-width: 80px;
}

.duration-item.diff {
  background: #fffbeb;
}

.duration-label {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}

.duration-value {
  font-size: 16px;
  font-weight: 600;
  color: #374151;
  word-break: break-word;
  text-align: center;
}

.duration-item.diff .duration-value {
  color: #f59e0b;
}
</style>
