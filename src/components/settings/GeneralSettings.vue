<script setup lang="ts">
import { NButton, NSwitch } from "naive-ui";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

type ThemeMode = "light" | "dark" | "auto";

const props = defineProps<{
  themeMode: ThemeMode;
  importMaaBakLog: boolean;
}>();

const emit = defineEmits<{
  (e: "update:themeMode", value: ThemeMode): void;
  (e: "update:importMaaBakLog", value: boolean): void;
}>();

const themeOptions: { label: string; icon: string; value: ThemeMode }[] = [
  { label: "浅色", icon: "☀️", value: "light" },
  { label: "深色", icon: "🌙", value: "dark" },
  { label: "跟随系统", icon: "💻", value: "auto" },
];

async function resetWindowLayout() {
  const window = getCurrentWindow();
  await window.setSize(new LogicalSize(1280, 720));
  await window.center();
}

function selectTheme(value: ThemeMode) {
  emit("update:themeMode", value);
}

function handleImportMaaBakLogChange(value: boolean) {
  emit("update:importMaaBakLog", value);
}
</script>

<template>
  <div class="general-settings">
    <div class="setting-card">
      <div class="setting-row">
        <div class="setting-icon">🎨</div>
        <div class="setting-info">
          <div class="setting-title">主题模式</div>
          <div class="setting-desc">选择应用的显示主题</div>
        </div>
      </div>
      <div class="theme-options">
        <button
          v-for="option in themeOptions"
          :key="option.value"
          class="theme-option"
          :class="{ active: props.themeMode === option.value }"
          @click="selectTheme(option.value)"
        >
          <span class="theme-icon">{{ option.icon }}</span>
          <span class="theme-label">{{ option.label }}</span>
        </button>
      </div>
    </div>

    <div class="setting-card">
      <div class="setting-row">
        <div class="setting-icon">↕️</div>
        <div class="setting-info">
          <div class="setting-title">重置窗口布局</div>
          <div class="setting-desc">将窗口大小恢复为默认值，并居中显示</div>
        </div>
        <n-button class="reset-btn" @click="resetWindowLayout">重置</n-button>
      </div>
    </div>

    <div class="setting-card">
      <div class="setting-row">
        <div class="setting-icon">📄</div>
        <div class="setting-info">
          <div class="setting-title">导入 maa.bak.log</div>
          <div class="setting-desc">导入目录时同时导入 maa.bak.log，与 maa.log 拼接后解析</div>
        </div>
        <n-switch :value="props.importMaaBakLog" @update:value="handleImportMaaBakLogChange" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.general-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-card {
  background: var(--n-color-fill-weak);
  border-radius: 16px;
  padding: 20px;
  border: 1px solid var(--n-border-color);
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.setting-icon {
  font-size: 28px;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--n-color-fill);
  border-radius: 10px;
}

.setting-info {
  flex: 1;
  min-width: 0;
}

.setting-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--n-text-color-1);
  margin-bottom: 2px;
}

.setting-desc {
  font-size: 13px;
  color: var(--n-text-color-3);
}

.theme-options {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.theme-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 12px;
  background: var(--n-color-fill);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid var(--n-border-color);
}

.theme-option:hover {
  background: var(--n-color-hover);
}

.theme-option.active {
  background: var(--n-color-hover);
  border-color: var(--n-primary-color);
  border-width: 2px;
}

.theme-icon {
  font-size: 24px;
}

.theme-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--n-text-color-2);
}

.theme-option.active .theme-label {
  color: var(--n-primary-color);
  font-weight: 600;
}

.reset-btn {
  flex-shrink: 0;
}
</style>
