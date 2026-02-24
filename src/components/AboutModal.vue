<script setup lang="ts">
import { NModal, NCard, NSpace, NText, NDivider } from "naive-ui";
import { invoke } from "@tauri-apps/api/core";
import { ref, onMounted } from "vue";

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
}>();

const appVersion = ref("0.1.0");

onMounted(async () => {
  try {
    const version = await invoke<string>("get_app_version");
    appVersion.value = version;
  } catch {
    console.warn("Failed to get app version");
  }
});
</script>

<template>
  <n-modal :show="props.show" @update:show="emit('update:show', $event)" preset="card" title="关于 MaaLogs" style="width: 400px">
    <n-card :bordered="false">
      <n-space vertical :size="12">
        <n-text>版本：{{ appVersion }}</n-text>
        <n-text>日志解析 · 任务与节点可视化工具</n-text>
        <n-divider />
        <n-text depth="3">基于 Tauri + Vue 3 构建</n-text>
      </n-space>
    </n-card>
  </n-modal>
</template>
