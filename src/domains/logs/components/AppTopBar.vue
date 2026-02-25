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
import { NButton } from "naive-ui";
import AboutModal from "./AboutModal.vue";
import { ref } from "vue";

type ViewMode = "analysis" | "search" | "statistics";

defineProps<{
  viewMode: ViewMode;
  isTauri: boolean;
}>();

const emit = defineEmits<{
  (e: "change-view", value: ViewMode): void;
  (e: "open-devtools"): void;
}>();

const emitView = (value: ViewMode) => {
  emit("change-view", value);
};

const showAbout = ref(false);
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
    <div class="brand" />
    <!-- 操作区域 -->
    <div class="top-actions">
      <!-- 关于按钮 -->
      <n-button
        size="small"
        quaternary
        @click="showAbout = true"
      >
        关于
      </n-button>
      <!-- 开发者工具按钮（仅 Tauri 环境） -->
      <n-button
        v-if="isTauri"
        size="small"
        quaternary
        @click="emit('open-devtools')"
      >
        开发者工具
      </n-button>
      <!-- 分隔线 -->
      <div class="divider" />
      <!-- 视图切换按钮组 -->
      <div class="view-tabs">
        <n-button
          size="small"
          :type="viewMode === 'analysis' ? 'primary' : 'default'"
          @click="emitView('analysis')"
        >
          📊 日志分析
        </n-button>
        <n-button
          size="small"
          :type="viewMode === 'search' ? 'primary' : 'default'"
          @click="emitView('search')"
        >
          🔍 文本搜索
        </n-button>
        <n-button
          size="small"
          :type="viewMode === 'statistics' ? 'primary' : 'default'"
          @click="emitView('statistics')"
        >
          📈 节点统计
        </n-button>
      </div>
    </div>
  </header>

  <!-- 关于弹窗 -->
  <AboutModal v-model:show="showAbout" />
</template>

<style scoped>
.top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.divider {
  width: 1px;
  height: 16px;
  background: var(--n-border-color);
  margin: 0 4px;
}

.view-tabs {
  display: flex;
  gap: 4px;
}
</style>
