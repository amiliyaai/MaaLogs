<script setup lang="ts">
import { NTag } from "naive-ui";
import type { TaskInfo } from "../types/logTypes";

defineProps<{
  controllerInfo: NonNullable<TaskInfo["controllerInfo"]>;
}>();
</script>

<template>
  <div class="detail-section-card">
    <div class="detail-section-header">
      <div class="detail-section-title">控制器信息</div>
    </div>
    <div class="controller-info-list">
      <div class="controller-info-item">
        <n-tag size="small" :type="controllerInfo.type === 'adb' ? 'info' : 'success'">
          {{ controllerInfo.type === 'adb' ? 'ADB' : 'Win32' }}
        </n-tag>
        <div class="controller-info-details">
          <template v-if="controllerInfo.type === 'adb'">
            <span v-if="controllerInfo.address" class="controller-info-detail">
              <span class="controller-info-label">地址:</span> {{ controllerInfo.address }}
            </span>
            <span
              v-if="controllerInfo.screencapMethods && controllerInfo.screencapMethods.length > 0"
              class="controller-info-detail"
            >
              <span class="controller-info-label">截图:</span> {{ controllerInfo.screencapMethods.join(', ') }}
            </span>
            <span
              v-if="controllerInfo.inputMethods && controllerInfo.inputMethods.length > 0"
              class="controller-info-detail"
            >
              <span class="controller-info-label">输入:</span> {{ controllerInfo.inputMethods.join(', ') }}
            </span>
          </template>
          <template v-else-if="controllerInfo.type === 'win32'">
            <span v-if="controllerInfo.screencapMethod" class="controller-info-detail">
              <span class="controller-info-label">截图:</span> {{ controllerInfo.screencapMethod }}
            </span>
            <span v-if="controllerInfo.mouseMethod" class="controller-info-detail">
              <span class="controller-info-label">鼠标:</span> {{ controllerInfo.mouseMethod }}
            </span>
            <span v-if="controllerInfo.keyboardMethod" class="controller-info-detail">
              <span class="controller-info-label">键盘:</span> {{ controllerInfo.keyboardMethod }}
            </span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.controller-info-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.controller-info-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  background: #f9fafb;
  border-radius: 6px;
}

.controller-info-details {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  flex: 1;
}

.controller-info-detail {
  color: #374151;
}

.controller-info-label {
  color: #6b7280;
  margin-right: 2px;
}
</style>
