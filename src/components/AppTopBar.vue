<!--
@component AppTopBar
@description 应用顶部导航栏组件，提供视图切换和开发者工具入口
@author MaaLogs Team
@license MIT

@summary
该组件是应用的主导航栏，包含：
- 品牌标识和副标题
- 视图模式切换按钮（日志分析、文本搜索、节点统计）
- 主题切换
- 开发者工具按钮（仅 Tauri 环境下显示）

@emits change-view - 视图模式切换事件，参数为新视图模式
@emits open-devtools - 打开开发者工具事件
@emits change-theme - 主题切换事件

@example
<AppTopBar
  :view-mode="currentView"
  :is-tauri="isTauri"
  :theme-mode="themeMode"
  @change-view="handleViewChange"
  @open-devtools="openDevTools"
  @change-theme="handleThemeChange"
/>
-->

<script setup lang="ts">
import { NButton, NDropdown } from "naive-ui";
import AboutModal from "./AboutModal.vue";
import { ref } from "vue";

type ViewMode = "analysis" | "search" | "statistics";
type ThemeMode = "light" | "dark" | "auto";

const props = defineProps<{
  viewMode: ViewMode;
  isTauri: boolean;
  themeMode: ThemeMode;
}>();

const emit = defineEmits<{
  (e: "change-view", value: ViewMode): void;
  (e: "open-devtools"): void;
  (e: "change-theme", value: ThemeMode): void;
}>();

const emitView = (value: ViewMode) => {
  emit("change-view", value);
};

const showAbout = ref(false);

const themeOptions = [
  { label: "☀️ 浅色", key: "light" },
  { label: "🌙 深色", key: "dark" },
  { label: "💻 跟随系统", key: "auto" },
];

const themeLabels: Record<ThemeMode, string> = {
  light: "☀️",
  dark: "🌙",
  auto: "💻",
};

const handleThemeSelect = (key: string) => {
  emit("change-theme", key as ThemeMode);
};
</script>

<template>
  <header class="topbar">
    <!-- 品牌区域 -->
    <div class="brand">
      <span class="brand-subtitle">MaaFramework 日志分析工具 - 多项目 | 流程可视 | AI 智能</span>
    </div>
    <!-- 操作区域 -->
    <div class="top-actions">
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
        <span title="功能开发中">
          <n-button size="small" disabled> 流程图 </n-button>
        </span>
      </div>
      <div class="divider" />
      <!-- 主题切换 -->
      <n-dropdown
        :options="themeOptions"
        :value="props.themeMode"
        trigger="click"
        @select="handleThemeSelect"
      >
        <n-button size="small" quaternary>
          {{ themeLabels[props.themeMode] }}
        </n-button>
      </n-dropdown>
      <!-- 关于按钮 -->
      <n-button size="small" quaternary @click="showAbout = true"> 关于 </n-button>
      <!-- 开发者工具按钮（仅 Tauri 环境） -->
      <n-button v-if="isTauri" size="small" quaternary @click="emit('open-devtools')">
        开发者工具
      </n-button>
    </div>
  </header>

  <!-- 关于弹窗 -->
  <AboutModal v-model:show="showAbout" />
</template>

<style scoped>
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.brand {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.brand-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--n-text-color);
}

.brand-subtitle {
  font-size: 14 px;
  font-weight: bold;
  color: var(--n-text-color-3);
}

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
