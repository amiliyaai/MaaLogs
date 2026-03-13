<script setup lang="ts">
import { ref, computed } from 'vue';
import { NCard, NIcon, NEmpty, NButton, NButtonGroup } from 'naive-ui';
import { WarningFilled, CloseCircleFilled } from '@vicons/antd';
import { diagnoseFailures, type DiagnosisResult, type FailureSeverity, type FailureCategory } from '@/utils/failureDetector';
import type { TaskInfo } from '@/types/logTypes';
import { defaultDurationConfig, type DurationDisplayConfig } from '@/config/display';

const props = defineProps<{
  tasks: TaskInfo[];
  durationDisplay?: DurationDisplayConfig;
}>();

const emit = defineEmits<{
  (e: 'select-node', nodeId: number): void;
}>();

const activeFilter = ref<'all' | 'critical' | 'warning'>('all');

interface DiagnosisGroup {
  nodeId: number;
  nodeName: string;
  items: DiagnosisResult[];
  severity: FailureSeverity;
  recognitionCount: number;
  actionCount: number;
  totalAttempts?: number;
  primaryCategory: FailureCategory;
}

function collectNodeStats(tasks: TaskInfo[], thresholds: { warning: number; danger: number }) {
  const failedNodes = new Set<number>();
  const warningNodes = new Map<string, { nodeIds: Set<number>; timestamps: Set<string> }>();
  const durationWarnings = new Map<string, { nodeId: number; timestamp: string; duration: number; severity: 'warning' | 'critical' }>();

  for (const task of tasks) {
    for (const node of task.nodes) {
      if (node.status === 'failed') {
        failedNodes.add(node.node_id);
      } else if (node.status === 'success') {
        const hasRecognitionRetry = node.recognition_attempts && node.recognition_attempts.length > 1;
        if (hasRecognitionRetry) {
          if (!warningNodes.has(node.name)) {
            warningNodes.set(node.name, { nodeIds: new Set(), timestamps: new Set() });
          }
          warningNodes.get(node.name)!.nodeIds.add(node.node_id);
          warningNodes.get(node.name)!.timestamps.add(node.timestamp);
        }

        if (node.start_time && node.end_time) {
          const duration = new Date(node.end_time).getTime() - new Date(node.start_time).getTime();
          const nodeKey = `${node.name}_${node.timestamp}`;
          if (duration > thresholds.danger) {
            durationWarnings.set(nodeKey, { nodeId: node.node_id, timestamp: node.timestamp, duration, severity: 'critical' });
          } else if (duration > thresholds.warning) {
            durationWarnings.set(nodeKey, { nodeId: node.node_id, timestamp: node.timestamp, duration, severity: 'warning' });
          }
        }
      }
    }
  }

  return { failedNodes, warningNodes, durationWarnings };
}

function buildWarningDiagnoses(
  tasks: TaskInfo[],
  failedNodes: Set<number>,
  warningNodes: Map<string, { nodeIds: Set<number>; timestamps: Set<string> }>,
  durationWarnings: Map<string, { nodeId: number; timestamp: string; duration: number; severity: 'warning' | 'critical' }>,
  thresholds: { warning: number; danger: number }
): DiagnosisResult[] {
  const warnings: DiagnosisResult[] = [];

  for (const task of tasks) {
    for (const node of task.nodes) {
      const info = warningNodes.get(node.name);
      if (!info || !info.nodeIds.has(node.node_id) || failedNodes.has(node.node_id)) continue;

      const retryCount = node.recognition_attempts?.length ?? 1;
      warnings.push({
        nodeId: node.node_id,
        nodeName: node.name,
        taskName: task.entry || 'Unknown',
        patternName: 'retry_warning',
        category: 'recognition',
        severity: 'warning',
        cause: retryCount > 1 ? `识别重试 ${retryCount - 1} 次后成功` : '识别有重试记录',
        suggestions: ['检查识别配置是否稳定', '考虑优化识别参数'],
      });
    }
  }

  for (const [key, info] of durationWarnings) {
    const task = tasks.find(t => t.nodes.some(n => n.node_id === info.nodeId));
    warnings.push({
      nodeId: info.nodeId,
      nodeName: key.split('_')[0],
      taskName: task?.entry || 'Unknown',
      patternName: 'duration_warning',
      category: 'recognition',
      severity: info.severity,
      cause: info.severity === 'critical'
        ? `节点耗时过长 (${info.duration}ms)，超过危险阈值 ${thresholds.danger}ms`
        : `节点耗时较长 (${info.duration}ms)，超过警告阈值 ${thresholds.warning}ms`,
      suggestions: ['检查节点执行是否有阻塞', '优化识别/动作参数', '考虑增加超时时间'],
    });
  }

  return warnings;
}

const diagnoses = computed<DiagnosisResult[]>(() => {
  if (!props.tasks?.length) return [];

  const config = props.durationDisplay ?? defaultDurationConfig;
  const thresholds = { warning: config.warningThreshold, danger: config.dangerThreshold };

  const results = diagnoseFailures(props.tasks);
  const { failedNodes, warningNodes, durationWarnings } = collectNodeStats(props.tasks, thresholds);

  const failedDiagnoses = results.filter(d => failedNodes.has(d.nodeId));
  const warningDiagnoses = buildWarningDiagnoses(props.tasks, failedNodes, warningNodes, durationWarnings, thresholds);

  return [...failedDiagnoses, ...warningDiagnoses];
});

const executionSummary = computed(() => {
  if (!props.tasks?.length) return { total: 0, success: 0, failed: 0, recognition: 0, action: 0 };

  let total = 0, success = 0, failed = 0, recognition = 0, action = 0;
  for (const task of props.tasks) {
    for (const node of task.nodes) {
      total++;
      if (node.status === 'success') success++;
      else if (node.status === 'failed') {
        failed++;
        if (node.recognition_attempts?.some(a => a.status === 'failed')) recognition++;
        if (node.action_details?.success === false) action++;
      }
    }
  }
  return { total, success, failed, recognition, action };
});

const groupedDiagnoses = computed(() => {
  const groups: Record<string, DiagnosisGroup> = {};

  for (const d of diagnoses.value) {
    if (!groups[d.nodeName]) {
      groups[d.nodeName] = {
        nodeId: d.nodeId,
        nodeName: d.nodeName,
        items: [],
        severity: d.severity,
        recognitionCount: 0,
        actionCount: 0,
        primaryCategory: d.category
      };
    }
    const group = groups[d.nodeName];
    group.items.push(d);
    if (d.severity === 'critical') group.severity = 'critical';
    if (d.category === 'recognition') group.recognitionCount++;
    if (d.category === 'action') group.actionCount++;
    if (d.recognitionHistory?.totalAttempts) {
      group.totalAttempts = (group.totalAttempts || 0) + d.recognitionHistory.totalAttempts;
    }
  }

  for (const task of props.tasks) {
    for (const node of task.nodes) {
      const group = groups[node.name];
      if (group) {
        if (node.recognition_attempts?.some(a => a.status === 'failed')) group.recognitionCount++;
        if (node.action_details?.success === false) group.actionCount++;
      }
    }
  }

  const severityOrder: Record<FailureSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return Object.values(groups).sort((a, b) => {
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return (b.recognitionCount + b.actionCount) - (a.recognitionCount + a.actionCount);
  });
});

const filteredGroups = computed(() => {
  if (activeFilter.value === 'all') return groupedDiagnoses.value;
  return groupedDiagnoses.value.filter(g => g.severity === activeFilter.value);
});

const severityCounts = computed(() => ({
  critical: groupedDiagnoses.value.filter(g => g.severity === 'critical').length,
  warning: groupedDiagnoses.value.filter(g => g.severity === 'warning').length,
}));

function getPercent(value: number, total: number): number {
  return total > 0 ? Math.round(value / total * 100) : 0;
}
</script>

<template>
  <div class="preset-analysis">
    <n-empty v-if="!diagnoses.length" description="未发现失败节点" />

    <template v-else>
      <div class="header-section">
        <div class="summary-bar">
          <div class="summary-item">
            <span class="label">总节点</span>
            <span class="value">{{ executionSummary.total }}</span>
          </div>
          <div class="summary-item success">
            <span class="label">成功</span>
            <div class="value-row">
              <span class="value">{{ executionSummary.success }}</span>
              <span class="percent">({{ getPercent(executionSummary.success, executionSummary.total) }}%)</span>
            </div>
          </div>
          <div class="summary-item failed">
            <span class="label">失败</span>
            <div class="value-row">
              <span class="value">{{ executionSummary.failed }}</span>
              <span class="percent">({{ getPercent(executionSummary.failed, executionSummary.total) }}%)</span>
            </div>
          </div>
          <div class="summary-item recognition">
            <span class="label">识别失败</span>
            <span class="value">{{ executionSummary.recognition }}</span>
          </div>
          <div class="summary-item action">
            <span class="label">动作失败</span>
            <span class="value">{{ executionSummary.action }}</span>
          </div>
        </div>

        <div class="filter-bar">
          <n-button-group size="small">
            <n-button
              :type="activeFilter === 'all' ? 'primary' : 'default'"
              @click="activeFilter = 'all'"
            >
              全部 ({{ groupedDiagnoses.length }})
            </n-button>
            <n-button
              :type="activeFilter === 'critical' ? 'error' : 'default'"
              :disabled="severityCounts.critical === 0"
              @click="activeFilter = 'critical'"
            >
              严重 ({{ severityCounts.critical }})
            </n-button>
            <n-button
              :type="activeFilter === 'warning' ? 'warning' : 'default'"
              :disabled="severityCounts.warning === 0"
              @click="activeFilter = 'warning'"
            >
              警告 ({{ severityCounts.warning }})
            </n-button>
          </n-button-group>
        </div>
      </div>

      <div class="failed-nodes-list">
        <n-card
          v-for="group in filteredGroups"
          :key="group.nodeName"
          size="small"
          class="diagnosis-card"
          :class="group.severity"
        >
          <div class="card-main" @click="emit('select-node', group.items[0]?.nodeId)">
            <div class="node-header">
              <div class="node-title">
                <span class="node-name">
                  <n-icon v-if="group.severity === 'critical'" :component="CloseCircleFilled" color="#ff4d4f" size="16" />
                  <n-icon v-else-if="group.severity === 'warning'" :component="WarningFilled" color="#faad14" size="16" />
                  {{ group.nodeName }}
                  <span v-if="group.totalAttempts" class="attempt-count">· {{ group.totalAttempts }} 次</span>
                </span>
              </div>
            </div>

            <div class="quick-fix">
              <div v-if="group.items[0]?.cause" class="cause-line">
                <span class="cause-label">原因:</span>
                <span>{{ group.items[0].cause }}</span>
              </div>
              <div v-if="group.items[0]?.suggestions?.length" class="suggestions-line">
                <span class="suggest-label">建议:</span>
                <ul>
                  <li v-for="(s, idx) in group.items[0].suggestions.slice(0, 2)" :key="idx">{{ s }}</li>
                </ul>
              </div>
            </div>
          </div>
        </n-card>
      </div>
    </template>
  </div>
</template>

<style scoped>
.preset-analysis {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.summary-bar {
  display: flex;
  gap: 24px;
  padding: 16px 20px;
  background: linear-gradient(135deg, var(--n-color-hover) 0%, var(--n-color) 100%);
  border-radius: 12px;
  border: 1px solid var(--n-border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 60px;
}

.summary-item .label {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.summary-item .value {
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
}

.summary-item .percent {
  font-size: 11px;
  color: var(--n-text-color-3);
}

.value-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.summary-item.success .value { color: #52c41a; }
.summary-item.failed .value { color: #ff4d4f; }
.summary-item.recognition .value { color: #ff7875; }
.summary-item.action .value { color: #faad14; }

.filter-bar {
  display: flex;
  justify-content: flex-end;
}

.failed-nodes-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.diagnosis-card {
  transition: all 0.2s ease;
  cursor: pointer;
}

.diagnosis-card:hover {
  background-color: var(--n-color-hover);
}

.diagnosis-card.critical {
  border-left: 3px solid #ff4d4f;
}

.diagnosis-card.warning {
  border-left: 3px solid #faad14;
}

.card-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.node-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.node-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.node-name {
  font-weight: 600;
  font-size: 14px;
}

.quick-fix {
  padding: 6px 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  border-radius: 4px;
}

.cause-line {
  margin-top: 8px;
  font-size: 13px;
  color: var(--n-text-color-2);
  flex: 1 1 100%;
}

.cause-label {
  font-weight: 500;
  color: var(--n-text-color);
  margin-right: 4px;
}

.suggestions-line {
  margin-top: 8px;
  flex: 1 1 100%;
}

.suggest-label {
  font-weight: 500;
  color: var(--n-text-color);
}

.suggestions-line ul {
  margin: 4px 0 0 0;
  padding-left: 20px;
}

.suggestions-line li {
  font-size: 13px;
  color: var(--n-text-color-2);
  margin-bottom: 2px;
}
</style>
