<!--
@component StatisticsPanel
@description 节点统计面板组件，提供节点执行统计和排序功能
@author MaaLogs Team
@license MIT

@summary
该组件显示所有节点的执行统计信息，包含：
- 统计摘要（节点类型数、总执行次数、平均耗时、总耗时、最慢节点）
- 节点名称过滤
- 排序选项（按平均耗时、执行次数、失败率）
- 统计表格（虚拟滚动）

@features
- 节点名称关键字过滤
- 多种排序方式
- 虚拟滚动优化大列表性能
- 统计摘要展示

@emits update:statKeyword - 统计关键字更新事件
@emits update:statSort - 排序方式更新事件

@example
<StatisticsPanel
  :node-statistics="stats"
  :node-summary="summary"
  :stat-keyword="keyword"
  :stat-sort="'avgDuration'"
  :format-duration="formatDuration"
  @update:stat-keyword="handleKeywordChange"
  @update:stat-sort="handleSortChange"
/>
-->

<script setup lang="ts">
/**
 * 导入依赖
 * - Naive UI 组件：卡片、分隔线、输入框、选择器
 * - vue-virtual-scroller：虚拟滚动组件
 */
import { NCard, NDivider, NInput, NSelect } from "naive-ui";
import { DynamicScroller, DynamicScrollerItem } from "vue-virtual-scroller";
import type { NodeStat } from "../types/logTypes";

/**
 * 组件属性定义
 * @property {NodeStat[]} nodeStatistics - 节点统计数据列表
 * @property {Object | null} nodeSummary - 统计摘要对象
 *   - uniqueNodes: 唯一节点类型数
 *   - totalNodes: 总执行次数
 *   - avgDuration: 平均耗时（毫秒）
 *   - totalDuration: 总耗时（毫秒）
 *   - slowestNode: 最慢节点信息
 * @property {string} statKeyword - 过滤关键字
 * @property {'avgDuration' | 'count' | 'failRate'} statSort - 排序方式
 * @property {Function} formatDuration - 耗时格式化函数
 */
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

/**
 * 组件事件定义
 * @event update:statKeyword - 更新过滤关键字
 * @event update:statSort - 更新排序方式
 */
const emit = defineEmits<{
  (e: "update:statKeyword", value: string): void;
  (e: "update:statSort", value: "avgDuration" | "count" | "failRate"): void;
}>();

/**
 * 排序选项
 * - avgDuration: 按平均耗时排序
 * - count: 按执行次数排序
 * - failRate: 按失败率排序
 */
const statSortOptions = [
  { label: "按平均耗时", value: "avgDuration" },
  { label: "按执行次数", value: "count" },
  { label: "按失败率", value: "failRate" },
];
</script>

<!--
  模板部分
  - 控制区域：关键字过滤、排序选择
  - 统计摘要卡片
  - 统计表格（虚拟滚动）
-->
<template>
  <n-card class="panel" size="small">
    <!-- 标题 -->
    <template #header> 节点统计 </template>
    <!-- 空状态：无统计数据 -->
    <div v-if="nodeStatistics.length === 0" class="empty">解析后将在此显示统计数据</div>
    <div v-else>
      <!-- 控制区域 -->
      <div class="stat-controls">
        <!-- 关键字过滤输入框 -->
        <n-input
          :value="statKeyword"
          placeholder="按节点名过滤"
          @update:value="emit('update:statKeyword', $event)"
        />
        <!-- 排序选择器 -->
        <n-select
          size="small"
          :options="statSortOptions"
          :value="statSort"
          @update:value="emit('update:statSort', $event)"
        />
      </div>
      <!-- 统计摘要 -->
      <div v-if="nodeSummary" class="stat-summary">
        <!-- 节点类型数 -->
        <div>
          <div class="stat-label">节点类型</div>
          <div class="stat-value">
            {{ nodeSummary.uniqueNodes }}
          </div>
        </div>
        <!-- 总执行次数 -->
        <div>
          <div class="stat-label">总执行次数</div>
          <div class="stat-value">
            {{ nodeSummary.totalNodes }}
          </div>
        </div>
        <!-- 平均耗时 -->
        <div>
          <div class="stat-label">平均耗时</div>
          <div class="stat-value">
            {{ formatDuration(nodeSummary.avgDuration) }}
          </div>
        </div>
        <!-- 总耗时 -->
        <div>
          <div class="stat-label">总耗时</div>
          <div class="stat-value">
            {{ formatDuration(nodeSummary.totalDuration) }}
          </div>
        </div>
        <!-- 最慢节点 -->
        <div>
          <div class="stat-label">最慢节点</div>
          <div class="stat-value">
            {{ nodeSummary.slowestNode.name }}
          </div>
        </div>
      </div>
      <!-- 分隔线 -->
      <n-divider />
      <!-- 统计表格 -->
      <div class="stat-table">
        <!-- 表头 -->
        <div class="stat-row header">
          <div>节点名称</div>
          <div>次数</div>
          <div>成功/失败</div>
          <div>平均耗时</div>
          <div>最大耗时</div>
          <div>成功率</div>
        </div>
        <!-- 表格内容（虚拟滚动） -->
        <DynamicScroller
          class="virtual-scroller stat-scroller"
          :items="nodeStatistics"
          key-field="name"
          :min-item-size="36"
        >
          <template #default="{ item, active }">
            <DynamicScrollerItem :item="item" :active="active">
              <!-- 数据行 -->
              <div class="stat-row">
                <div class="stat-name">
                  {{ item.name }}
                </div>
                <div>{{ item.count }}</div>
                <div>{{ item.successCount }}/{{ item.failCount }}</div>
                <div>{{ formatDuration(item.avgDuration) }}</div>
                <div>{{ formatDuration(item.maxDuration) }}</div>
                <div>{{ item.successRate.toFixed(1) }}%</div>
              </div>
            </DynamicScrollerItem>
          </template>
        </DynamicScroller>
      </div>
    </div>
  </n-card>
</template>

<!--
  样式部分
  - 统计滚动区域高度限制
-->
<style scoped>
.stat-scroller {
  max-height: 400px;
}
</style>
