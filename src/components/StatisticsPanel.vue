<script setup lang="ts">
import { NCard, NDivider, NInput, NSelect } from "naive-ui";
import type { NodeStat } from "../types/logTypes";

defineProps<{
  nodeStatistics: NodeStat[];
  nodeSummary: {
    uniqueNodes: number;
    totalNodes: number;
    avgDuration: number;
    totalDuration: number;
    slowestNode: { name: string };
  } | null;
  statKeyword: string;
  statSort: "avgDuration" | "count" | "failRate";
  formatDuration: (value: number) => string;
}>();

const emit = defineEmits<{
  (e: "update:statKeyword", value: string): void;
  (e: "update:statSort", value: "avgDuration" | "count" | "failRate"): void;
}>();

const statSortOptions = [
  { label: "按平均耗时", value: "avgDuration" },
  { label: "按执行次数", value: "count" },
  { label: "按失败率", value: "failRate" }
];
</script>

<template>
  <n-card class="panel" size="small">
    <template #header>节点统计</template>
    <div v-if="nodeStatistics.length === 0" class="empty">解析后将在此显示统计数据</div>
    <div v-else>
      <div class="stat-controls">
        <n-input :value="statKeyword" placeholder="按节点名过滤" @update:value="emit('update:statKeyword', $event)" />
        <n-select
          size="small"
          :options="statSortOptions"
          :value="statSort"
          @update:value="emit('update:statSort', $event)"
        />
      </div>
      <div v-if="nodeSummary" class="stat-summary">
        <div>
          <div class="stat-label">节点类型</div>
          <div class="stat-value">{{ nodeSummary.uniqueNodes }}</div>
        </div>
        <div>
          <div class="stat-label">总执行次数</div>
          <div class="stat-value">{{ nodeSummary.totalNodes }}</div>
        </div>
        <div>
          <div class="stat-label">平均耗时</div>
          <div class="stat-value">{{ formatDuration(nodeSummary.avgDuration) }}</div>
        </div>
        <div>
          <div class="stat-label">总耗时</div>
          <div class="stat-value">{{ formatDuration(nodeSummary.totalDuration) }}</div>
        </div>
        <div>
          <div class="stat-label">最慢节点</div>
          <div class="stat-value">{{ nodeSummary.slowestNode.name }}</div>
        </div>
      </div>
      <n-divider />
      <div class="stat-table">
        <div class="stat-row header">
          <div>节点名称</div>
          <div>次数</div>
          <div>成功/失败</div>
          <div>平均耗时</div>
          <div>最大耗时</div>
          <div>成功率</div>
        </div>
        <div v-for="stat in nodeStatistics" :key="stat.name" class="stat-row">
          <div class="stat-name">{{ stat.name }}</div>
          <div>{{ stat.count }}</div>
          <div>{{ stat.successCount }}/{{ stat.failCount }}</div>
          <div>{{ formatDuration(stat.avgDuration) }}</div>
          <div>{{ formatDuration(stat.maxDuration) }}</div>
          <div>{{ stat.successRate.toFixed(1) }}%</div>
        </div>
      </div>
    </div>
  </n-card>
</template>
