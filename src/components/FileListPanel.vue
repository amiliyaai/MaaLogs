<script setup lang="ts">
import { NButton, NCard } from "naive-ui";
import type { SelectedFile } from "../types/logTypes";

defineProps<{
  selectedFiles: SelectedFile[];
  formatSize: (value: number) => string;
}>();

const emit = defineEmits<{
  (e: "remove", index: number): void;
}>();
</script>

<template>
  <n-card class="panel" size="small">
    <template #header>文件列表</template>
    <div v-if="selectedFiles.length === 0" class="empty">请先选择日志/配置文件</div>
    <div v-else class="file-list-wrapper">
      <ul class="file-list">
        <li v-for="(file, index) in selectedFiles" :key="file.name" class="file-row">
          <div class="file-name">{{ file.name }}</div>
          <div class="file-meta">{{ formatSize(file.size) }}</div>
          <div class="file-meta">{{ file.type }}</div>
          <div class="file-action">
            <n-button size="tiny" secondary type="error" @click="emit('remove', index)">删除</n-button>
          </div>
        </li>
      </ul>
    </div>
  </n-card>
</template>
