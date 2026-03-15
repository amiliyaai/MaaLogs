<script setup lang="ts">
import { ref, computed } from 'vue';
import { NIcon, NEmpty, NButton, NButtonGroup, NProgress } from 'naive-ui';
import { WarningFilled, CloseCircleFilled, InfoCircleFilled, AimOutlined, ThunderboltOutlined } from '@vicons/antd';
import { diagnoseFailures, type DiagnosisResult, type FailureSeverity, type FailureCategory } from '@/utils/failureDetector';
import type { TaskInfo, NodeInfo, RecognitionAttempt } from '@/types/logTypes';
import { defaultDurationConfig, defaultSummaryConfig, type DurationDisplayConfig } from '@/config/display';

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
  taskName: string;
  items: DiagnosisResult[];
  severity: FailureSeverity;
  recognitionCount: number;
  actionCount: number;
  totalAttempts: number;
  primaryCategory: FailureCategory;
  failedTaskNames: string[];
  lastTimestamp: string;
  scoreRange?: { min: number; max: number };
  cachedCauses?: { cause: string; suggestions: string[] }[];
}

function findNodeById(tasks: TaskInfo[], nodeId: number): NodeInfo | undefined {
  return tasks.flatMap(t => t.nodes).find(n => n.node_id === nodeId);
}

function buildDiagnosisGroup(d: DiagnosisResult, tasks: TaskInfo[]): DiagnosisGroup {
  const nodeInfo = findNodeById(tasks, d.nodeId);
  return {
    nodeId: d.nodeId,
    nodeName: d.nodeName,
    taskName: d.taskName,
    items: [d],
    severity: d.severity,
    recognitionCount: 0,
    actionCount: 0,
    totalAttempts: 0,
    primaryCategory: d.category,
    failedTaskNames: [d.taskName],
    lastTimestamp: nodeInfo?.timestamp || '',
  };
}

function findMatchingNodes(tasks: TaskInfo[], group: DiagnosisGroup) {
  return tasks
    .flatMap(t => t.nodes.map(n => ({ task: t, node: n })))
    .filter(({ node, task }) => 
      node.name === group.nodeName && 
      task.entry === group.taskName && 
      node.timestamp === group.lastTimestamp
    );
}

function processFailedNode(result: ReturnType<typeof createEmptyStats>, node: NodeInfo, task: TaskInfo) {
  result.failedNodes.set(node.node_id, { node, task });
}

function processSuccessNode(result: ReturnType<typeof createEmptyStats>, node: NodeInfo, thresholds: { warning: number; danger: number }) {
  const hasRetry = node.recognition_attempts && node.recognition_attempts.length > 1;
  if (hasRetry) {
    if (!result.warningNodes.has(node.name)) {
      result.warningNodes.set(node.name, { nodeIds: new Set(), timestamps: new Set() });
    }
    result.warningNodes.get(node.name)!.nodeIds.add(node.node_id);
  }

  if (node.start_time && node.end_time) {
    const duration = new Date(node.end_time).getTime() - new Date(node.start_time).getTime();
    const nodeKey = `${node.name}_${node.timestamp}`;
    if (duration > thresholds.danger) {
      result.durationWarnings.set(nodeKey, { nodeId: node.node_id, timestamp: node.timestamp, duration, severity: 'critical' });
    } else if (duration > thresholds.warning) {
      result.durationWarnings.set(nodeKey, { nodeId: node.node_id, timestamp: node.timestamp, duration, severity: 'warning' });
    }
  }
}

function createEmptyStats() {
  return {
    failedNodes: new Map<number, { node: NodeInfo; task: TaskInfo }>(),
    warningNodes: new Map<string, { nodeIds: Set<number>; timestamps: Set<string> }>(),
    durationWarnings: new Map<string, { nodeId: number; timestamp: string; duration: number; severity: 'warning' | 'critical' }>(),
  };
}

function collectNodeStats(tasks: TaskInfo[], thresholds: { warning: number; danger: number }) {
  const result = createEmptyStats();

  for (const task of tasks) {
    for (const node of task.nodes) {
      if (node.status === 'failed') {
        processFailedNode(result, node, task);
      } else if (node.status === 'success') {
        processSuccessNode(result, node, thresholds);
      }
    }
  }

  return result;
}

function extractScoresFromAttempt(attempt: RecognitionAttempt, targetScores: number[]) {
  const detail = attempt.reco_details?.detail;
  if (Array.isArray(detail)) {
    for (const child of detail) {
      if (child && typeof child === 'object' && 'detail' in child) {
        const childDetail = (child as { detail?: unknown }).detail as Record<string, unknown> | null;
        if (childDetail && typeof childDetail === 'object') {
          if (Array.isArray(childDetail.all)) {
            for (const r of childDetail.all as { score?: number }[]) {
              if (r.score !== undefined) targetScores.push(r.score);
            }
          } else if (typeof childDetail.score === 'number') {
            targetScores.push(childDetail.score);
          }
        }
      }
    }
  } else if (detail && typeof detail === 'object') {
    const detailObj = detail as Record<string, unknown>;
    if (Array.isArray(detailObj.all)) {
      for (const r of detailObj.all as { score?: number }[]) {
        if (r.score !== undefined) targetScores.push(r.score);
      }
    } else if (typeof detailObj.score === 'number') {
      targetScores.push(detailObj.score);
    }
  }
  if (attempt.nested_nodes) {
    for (const nested of attempt.nested_nodes) {
      if (nested.status === 'failed') {
        extractScoresFromAttempt(nested, targetScores);
      }
    }
  }
}

function buildRetryWarning(node: NodeInfo, task: TaskInfo): DiagnosisResult {
  const allScores: number[] = [];
  for (const attempt of node.recognition_attempts || []) {
    if (attempt.status === 'failed') {
      extractScoresFromAttempt(attempt, allScores);
    }
  }

  const cfg = defaultSummaryConfig.diagnosisSuggestions.retryWarning;
  return {
    nodeId: node.node_id,
    nodeName: node.name,
    taskName: task.entry || 'Unknown',
    patternId: 'retry_warning',
    category: 'recognition',
    severity: 'warning',
    cause: cfg.cause,
    suggestions: cfg.suggestions.map(s => s.replace('节点', `"${node.name}"`)),
    recognitionHistory: allScores.length > 0 ? {
      totalAttempts: node.recognition_attempts?.length ?? 1,
      failedAttempts: allScores.length,
      scores: allScores,
      algorithms: [],
    } : undefined,
  };
}

function buildDurationWarning(key: string, info: { nodeId: number; duration: number; severity: 'warning' | 'critical' }, thresholds: { warning: number; danger: number }, tasks: TaskInfo[]): DiagnosisResult {
  const task = tasks.find(t => t.nodes.some(n => n.node_id === info.nodeId));
  const cfg = defaultSummaryConfig.diagnosisSuggestions.durationWarning;
  const threshold = info.severity === 'critical' ? thresholds.danger : thresholds.warning;
  return {
    nodeId: info.nodeId,
    nodeName: key.split('_')[0],
    taskName: task?.entry || 'Unknown',
    patternId: 'duration_warning',
    category: 'recognition',
    severity: info.severity,
    cause: cfg.cause(info.duration, threshold, info.severity),
    suggestions: cfg.suggestions,
  };
}

function buildWarningDiagnoses(tasks: TaskInfo[], failedNodes: Map<number, unknown>, warningNodes: Map<string, { nodeIds: Set<number> }>, durationWarnings: Map<string, { nodeId: number; duration: number; severity: 'warning' | 'critical' }>, thresholds: { warning: number; danger: number }): DiagnosisResult[] {
  const warnings: DiagnosisResult[] = [];

  for (const task of tasks) {
    for (const node of task.nodes) {
      const info = warningNodes.get(node.name);
      if (info?.nodeIds.has(node.node_id) && !failedNodes.has(node.node_id)) {
        warnings.push(buildRetryWarning(node, task));
      }
    }
  }

  for (const [key, info] of durationWarnings) {
    warnings.push(buildDurationWarning(key, info, thresholds, tasks));
  }

  return warnings;
}

const diagnoses = computed<DiagnosisResult[]>(() => {
  if (!props.tasks?.length) return [];

  const config = props.durationDisplay ?? defaultDurationConfig;
  const thresholds = { warning: config.warningThreshold, danger: config.dangerThreshold };

  const results = diagnoseFailures(props.tasks);
  const { failedNodes, warningNodes, durationWarnings } = collectNodeStats(props.tasks, thresholds);
  const failedNodeIds = new Set(failedNodes.keys());
  const filteredFailedDiagnoses = results.filter(d => failedNodeIds.has(d.nodeId));
  const warningDiagnoses = buildWarningDiagnoses(props.tasks, failedNodes, warningNodes, durationWarnings, thresholds);

  return [...filteredFailedDiagnoses, ...warningDiagnoses];
});

const executionSummary = computed(() => {
  if (!props.tasks?.length) return { total: 0, success: 0, failed: 0, recognition: 0, action: 0, successRate: 0 };

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
  const successRate = total > 0 ? Math.round(success / total * 100) : 0;
  return { total, success, failed, recognition, action, successRate };
});

const successRateLevel = computed(() => {
  const { high, medium } = defaultSummaryConfig.successRateThresholds;
  const rate = executionSummary.value.successRate;
  if (rate >= high) return 'high';
  if (rate >= medium) return 'medium';
  return 'low';
});

const successRateColor = computed(() => {
  const colors = defaultSummaryConfig.successRateColors;
  return colors[successRateLevel.value];
});

function calcGroupStats(group: DiagnosisGroup) {
  let totalAttempts = 0;
  let totalFailedRecos = 0;
  let totalFailedActions = 0;
  let allScores: number[] = [];

  const matchingNodes = findMatchingNodes(props.tasks, group);
  for (const { node } of matchingNodes) {
    if (node.recognition_attempts) {
      totalAttempts += node.recognition_attempts.length;
      for (const attempt of node.recognition_attempts) {
        if (attempt.status === 'failed') {
          extractScoresFromAttempt(attempt, allScores);
        }
      }
      totalFailedRecos += node.recognition_attempts.filter(a => a.status === 'failed').length;
    }
  }

  for (const d of group.items) {
    if (d.actionDetail?.success === false) {
      totalFailedActions++;
    }
  }

  return {
    totalAttempts,
    totalFailedRecos,
    totalFailedActions,
    scoreRange: allScores.length > 0 ? { min: Math.min(...allScores), max: Math.max(...allScores) } : undefined,
  };
}

const groupedDiagnoses = computed(() => {
  const groups: Record<string, DiagnosisGroup> = {};

  for (const d of diagnoses.value) {
    const key = `${d.nodeName}_${d.taskName}`;
    if (!groups[key]) {
      groups[key] = buildDiagnosisGroup(d, props.tasks);
    } else {
      groups[key].items.push(d);
      if (d.severity === 'critical') groups[key].severity = 'critical';
      if (!groups[key].failedTaskNames.includes(d.taskName)) {
        groups[key].failedTaskNames.push(d.taskName);
      }
    }
  }

  for (const group of Object.values(groups)) {
    const stats = calcGroupStats(group);
    group.totalAttempts = stats.totalAttempts;
    group.recognitionCount = stats.totalFailedRecos;
    group.actionCount = stats.totalFailedActions;
    group.scoreRange = stats.scoreRange;
    group.cachedCauses = computeCauses(group.items);
  }

  const severityOrder = defaultSummaryConfig.severityOrder as Record<FailureSeverity, number>;

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

function handleCardClick(nodeId: number) {
  emit('select-node', nodeId);
}

function getSeverityLabel(severity: FailureSeverity): string {
  return defaultSummaryConfig.severityLabels[severity] || severity;
}

function computeCauses(items: DiagnosisResult[]): { cause: string; suggestions: string[] }[] {
  const patternMap = new Map<string, DiagnosisResult>();
  for (const item of items) {
    if (!item.patternId || !item.cause) continue;
    if (!patternMap.has(item.patternId)) {
      patternMap.set(item.patternId, item);
    }
  }
  
  if (patternMap.has('and_or')) {
    const andOrItem = patternMap.get('and_or')!;
    return [{ cause: andOrItem.cause, suggestions: andOrItem.suggestions || [] }];
  }
  
  return Array.from(patternMap.values()).map(item => ({
    cause: item.cause,
    suggestions: item.suggestions || [],
  }));
}
</script>

<template>
  <div class="preset-analysis">
    <n-empty v-if="!diagnoses.length" description="未发现失败节点" />

    <template v-else>
      <div class="summary-section">
        <div class="summary-card">
          <div class="summary-header">
            <span class="summary-title">执行概览</span>
            <span class="success-rate" :class="successRateLevel">
              {{ executionSummary.successRate }}% 成功率
            </span>
          </div>
          
          <div class="progress-bar-container">
            <n-progress
              type="line"
              :percentage="executionSummary.successRate"
              :indicator-placement="'inside'"
              :color="successRateColor"
              :rail-color="'rgba(0,0,0,0.06)'"
              :height="24"
              :border-radius="12"
            />
          </div>

          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-value">{{ executionSummary.total }}</div>
              <div class="stat-label">总节点</div>
            </div>
            <div class="stat-item success">
              <div class="stat-value">{{ executionSummary.success }}</div>
              <div class="stat-label">成功</div>
            </div>
            <div class="stat-item failed">
              <div class="stat-value">{{ executionSummary.failed }}</div>
              <div class="stat-label">失败</div>
            </div>
            <div class="stat-item recognition">
              <div class="stat-value">{{ executionSummary.recognition }}</div>
              <div class="stat-label">识别失败</div>
            </div>
            <div class="stat-item action">
              <div class="stat-value">{{ executionSummary.action }}</div>
              <div class="stat-label">动作失败</div>
            </div>
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
              <template #icon>
                <n-icon :component="CloseCircleFilled" />
              </template>
              严重 ({{ severityCounts.critical }})
            </n-button>
            <n-button
              :type="activeFilter === 'warning' ? 'warning' : 'default'"
              :disabled="severityCounts.warning === 0"
              @click="activeFilter = 'warning'"
            >
              <template #icon>
                <n-icon :component="WarningFilled" />
              </template>
              警告 ({{ severityCounts.warning }})
            </n-button>
          </n-button-group>
        </div>
      </div>

      <div class="diagnosis-list">
        <div
          v-for="group in filteredGroups"
          :key="`${group.nodeName}_${group.taskName}`"
          class="diagnosis-card"
          :class="{ critical: group.severity === 'critical', warning: group.severity === 'warning' }"
          @click="handleCardClick(group.nodeId)"
        >
          <div class="card-header">
            <span class="node-name">{{ group.nodeName }}</span>
            <span class="task-name-right">{{ group.taskName }}</span>
          </div>

          <div v-if="group.lastTimestamp" class="timestamp">{{ group.lastTimestamp }}</div>

          <div class="severity-badge" :class="group.severity">
            <n-icon v-if="group.severity === 'critical'" :component="CloseCircleFilled" />
            <n-icon v-else-if="group.severity === 'warning'" :component="WarningFilled" />
            <n-icon v-else :component="InfoCircleFilled" />
            {{ getSeverityLabel(group.severity) }}
          </div>

          <div class="stats-badges">
            <div v-if="group.recognitionCount > 0" class="stat-badge recognition">
              <n-icon :component="AimOutlined" />
              {{ group.recognitionCount }} 次识别失败
            </div>
            <div v-if="group.actionCount > 0" class="stat-badge action">
              <n-icon :component="ThunderboltOutlined" />
              {{ group.actionCount }} 次动作失败
            </div>
          </div>

          <div v-if="group.cachedCauses && group.cachedCauses.length > 0" class="causes-section">
            <div v-for="(item, idx) in group.cachedCauses" :key="idx" class="cause-suggestion-group">
              <div class="cause-title">问题原因 {{ idx + 1 }}</div>
              <div class="cause-text">{{ item.cause }}</div>
              <div v-if="item.suggestions.length > 0" class="suggestions">
                <div class="suggestion-title">解决建议</div>
                <ul class="suggestion-list">
                  <li v-for="(s, sidx) in item.suggestions" :key="sidx">{{ s }}</li>
                </ul>
              </div>
            </div>
          </div>

          <div v-if="group.scoreRange" class="score-range">
            <span class="score-label">失败识别分数区间</span>
            <span class="score-value">{{ group.scoreRange.min.toFixed(3) }} ~ {{ group.scoreRange.max.toFixed(3) }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.preset-analysis {
  padding: 16px;
}

.summary-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 16px;
}

.summary-card {
  background: var(--card-bg, #fff);
  border: 1px solid var(--card-border, #e8e8e8);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.summary-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, #1a1a1a);
}

.success-rate {
  font-size: 14px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 20px;
  letter-spacing: 0.5px;
}
.success-rate.high { background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%); color: #fff; }
.success-rate.medium { background: linear-gradient(135deg, #faad14 0%, #ffc53d 100%); color: #fff; }
.success-rate.low { background: linear-gradient(135deg, #ff4d4f 0%, #ff7875 100%); color: #fff; }

.progress-bar-container {
  margin-bottom: 20px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

.stat-item {
  text-align: center;
  padding: 16px 12px;
  background: var(--stat-bg, #f5f5f5);
  border-radius: 10px;
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.stat-item.success { background: linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%); }
.stat-item.failed { background: linear-gradient(135deg, #fff2f0 0%, #ffccc7 100%); }
.stat-item.recognition { background: linear-gradient(135deg, #fff7e6 0%, #ffe7ba 100%); }
.stat-item.action { background: linear-gradient(135deg, #fff0f6 0%, #ffadd2 100%); }

.stat-value {
  font-size: 24px;
  font-weight: 700;
  background: linear-gradient(135deg, #333 0%, #666 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary, #666);
  margin-top: 6px;
  font-weight: 500;
}

.filter-bar {
  display: flex;
  justify-content: center;
}

.diagnosis-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.diagnosis-card {
  background: var(--card-bg, #fff);
  border: 1px solid var(--card-border, #e8e8e8);
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.diagnosis-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--card-accent, transparent);
  transition: width 0.3s;
}

.diagnosis-card:hover {
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  transform: translateX(4px);
}

.diagnosis-card:hover::before {
  width: 6px;
}

.diagnosis-card.critical {
  border-color: #ff4d4f;
}

.diagnosis-card.critical::before {
  background: linear-gradient(180deg, #ff4d4f 0%, #ff7875 100%);
}

.diagnosis-card.warning {
  border-color: #faad14;
}

.diagnosis-card.warning::before {
  background: linear-gradient(180deg, #faad14 0%, #ffc53d 100%);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.node-name {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary, #1a1a1a);
}

.task-name-right {
  font-size: 14px;
  color: var(--text-secondary, #8c8c8c);
}

.timestamp {
  font-size: 12px;
  color: var(--text-secondary, #8c8c8c);
  margin-bottom: 12px;
}

.severity-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 16px;
  margin-bottom: 14px;
  letter-spacing: 0.3px;
}

.severity-badge.critical {
  background: linear-gradient(135deg, #fff2f0 0%, #ffccc7 100%);
  color: #ff4d4f;
}

.severity-badge.warning {
  background: linear-gradient(135deg, #fffbe6 0%, #ffe7ba 100%);
  color: #d48806;
}

.severity-badge.info {
  background: linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%);
  color: #1890ff;
}

.stats-badges {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.stat-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  padding: 5px 12px;
  border-radius: 8px;
  font-weight: 500;
}

.stat-badge.recognition {
  background: linear-gradient(135deg, #fff7e6 0%, #ffe7ba 100%);
  color: #d48806;
}

.stat-badge.action {
  background: linear-gradient(135deg, #fff0f6 0%, #ffadd2 100%);
  color: #c41d7f;
}

.causes-section {
  border-top: 1px solid var(--border-color, #f0f0f0);
  padding-top: 14px;
  margin-top: 10px;
}

.cause-suggestion-group {
  margin-bottom: 14px;
}

.cause-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, #8c8c8c);
  margin-bottom: 6px;
}

.cause-text {
  font-size: 14px;
  color: var(--text-primary, #1a1a1a);
  line-height: 1.6;
  margin-bottom: 10px;
}

.suggestions {
  background: var(--suggestion-bg, #f9f9f9);
  padding: 12px 16px;
  border-radius: 10px;
  border-left: 3px solid #1890ff;
}

.suggestion-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #8c8c8c);
  margin-bottom: 6px;
}

.suggestion-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--text-primary, #333);
}

.suggestion-list li {
  margin-bottom: 4px;
  line-height: 1.5;
}

.score-range {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #fff7e6 0%, #ffe7ba 100%);
  padding: 10px 16px;
  border-radius: 10px;
  margin-top: 12px;
}

.score-label {
  font-size: 13px;
  font-weight: 500;
  color: #d48806;
}

.score-value {
  font-size: 15px;
  font-weight: 700;
  color: #d48806;
}

.dark .stat-value {
  background: linear-gradient(135deg, #e8e8e8 0%, #a0a0a0 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.dark .diagnosis-card {
  border-color: #3a3a3a;
}

.dark .diagnosis-card.critical {
  border-color: #ff4d4f;
}

.dark .diagnosis-card.warning {
  border-color: #faad14;
}

.dark .severity-badge.critical {
  background: linear-gradient(135deg, #3d1a1a 0%, #522020 100%);
}

.dark .severity-badge.warning {
  background: linear-gradient(135deg, #3d2a15 0%, #523520 100%);
}

.dark .severity-badge.info {
  background: linear-gradient(135deg, #1a2a30 0%, #203040 100%);
}

.dark .score-range {
  background: linear-gradient(135deg, #3d2a15 0%, #523520 100%);
}

.dark .causes-section {
  border-top-color: #4a4a4a;
}

.dark .suggestions {
  background: linear-gradient(135deg, #252525 0%, #2a2a2a 100%);
  border-left-color: #4096ff;
  box-shadow: 0 2px 8px rgba(64, 150, 255, 0.1);
}
</style>

<style>
:root {
  --card-bg: #ffffff;
  --card-border: #e8e8e8;
  --card-accent: transparent;
  --stat-bg: #f5f5f5;
  --text-primary: #1a1a1a;
  --text-secondary: #666666;
  --border-color: #f0f0f0;
  --suggestion-bg: #fafafa;
}

.dark {
  --card-bg: #1f1f1f;
  --card-border: #303030;
  --card-accent: transparent;
  --stat-bg: #2a2a2a;
  --text-primary: #e8e8e8;
  --text-secondary: #8c8c8c;
  --border-color: #3a3a3a;
  --suggestion-bg: #252525;
}
</style>
