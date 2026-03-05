<script setup lang="ts">
import { NRadioGroup, NRadioButton } from "naive-ui";

type ThemeMode = "light" | "dark" | "auto";

const props = defineProps<{
  themeMode: ThemeMode;
}>();

const emit = defineEmits<{
  (e: "update:themeMode", value: ThemeMode): void;
}>();

const themeOptions = [
  { label: "☀️ 浅色", value: "light" },
  { label: "🌙 深色", value: "dark" },
  { label: "💻 跟随系统", value: "auto" },
];
</script>

<template>
  <div class="general-settings">
    <div class="setting-item">
      <div class="setting-label">
        <span class="label-text">主题模式</span>
        <span class="label-desc">选择应用的显示主题</span>
      </div>
      <div class="setting-control">
        <n-radio-group
          :value="props.themeMode"
          @update:value="emit('update:themeMode', $event as ThemeMode)"
        >
          <n-radio-button
            v-for="option in themeOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </n-radio-button>
        </n-radio-group>
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

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--n-text-color-1);
}

.label-desc {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.setting-control {
  flex-shrink: 0;
}
</style>
