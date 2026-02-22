<!--
@component AppTopBar
@description 应用顶部导航栏组件，提供视图切换和开发者工具入口
@author MaaLogs Team
@license MIT

@summary
该组件是应用的主导航栏，包含：
- 品牌标识和副标题
- 视图模式切换按钮（日志分析、文本搜索、节点统计）
- 开发者工具按钮（仅 Tauri 环境下显示）

@emits change-view - 视图模式切换事件，参数为新视图模式
@emits open-devtools - 打开开发者工具事件

@example
<AppTopBar
  :view-mode="currentView"
  :is-tauri="isTauri"
  @change-view="handleViewChange"
  @open-devtools="openDevTools"
/>
-->

<script setup lang="ts">
/**
 * 导入依赖
 * - NButton: Naive UI 按钮组件
 */
import { NButton } from "naive-ui";

/**
 * 视图模式类型定义
 * @typedef {'analysis' | 'search' | 'statistics'} ViewMode
 * - analysis: 日志分析视图，显示任务与节点详情
 * - search: 文本搜索视图，支持全文检索
 * - statistics: 节点统计视图，显示节点执行统计
 */
type ViewMode = "analysis" | "search" | "statistics";

/**
 * 组件属性定义
 * @property {ViewMode} viewMode - 当前激活的视图模式
 * @property {boolean} isTauri - 是否运行在 Tauri 环境中
 */
defineProps<{
  viewMode: ViewMode;
  isTauri: boolean;
}>();

/**
 * 组件事件定义
 * @event change-view - 切换视图模式
 * @event open-devtools - 打开开发者工具（仅 Tauri）
 */
const emit = defineEmits<{
  (e: "change-view", value: ViewMode): void;
  (e: "open-devtools"): void;
}>();

/**
 * 发送视图切换事件
 * @param {ViewMode} value - 目标视图模式
 */
const emitView = (value: ViewMode) => {
  emit("change-view", value);
};
</script>

<!--
  模板部分
  - 顶部栏布局：左侧品牌，右侧操作按钮
  - 视图切换按钮组：当前激活的按钮显示为 primary 类型
  - 开发者工具按钮：仅 Tauri 环境下显示
-->
<template>
  <header class="topbar">
    <!-- 品牌区域 -->
    <div class="brand">
      <div class="subtitle">日志解析 · 任务与节点可视化</div>
    </div>
    <!-- 操作区域 -->
    <div class="top-actions">
      <div class="view-tabs">
        <!-- 开发者工具按钮（仅 Tauri 环境） -->
        <n-button v-if="isTauri" size="small" secondary @click="emit('open-devtools')">
          开发者工具
        </n-button>
        <!-- 日志分析视图切换按钮 -->
        <n-button size="small" :type="viewMode === 'analysis' ? 'primary' : 'default'" @click="emitView('analysis')">
          日志分析
        </n-button>
        <!-- 文本搜索视图切换按钮 -->
        <n-button size="small" :type="viewMode === 'search' ? 'primary' : 'default'" @click="emitView('search')">
          文本搜索
        </n-button>
        <!-- 节点统计视图切换按钮 -->
        <n-button
          size="small"
          :type="viewMode === 'statistics' ? 'primary' : 'default'"
          @click="emitView('statistics')"
        >
          节点统计
        </n-button>
      </div>
    </div>
  </header>
</template>
