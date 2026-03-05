<script setup lang="ts">
import { NSpace, NText, NButton, NTag } from "naive-ui";
import { ref, onMounted } from "vue";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { checkForUpdate, getCurrentVersion } from "@/utils/updater";
import { getLogPath } from "@/utils/logger";

const appVersion = ref("0.1.0");
const checking = ref(false);

onMounted(async () => {
  appVersion.value = await getCurrentVersion();
});

async function handleCheckUpdate() {
  checking.value = true;
  await checkForUpdate(true);
  checking.value = false;
}

async function openGitHub() {
  await openUrl("https://github.com/amiliyaai/MaaLogs");
}

async function openIssues() {
  await openUrl("https://github.com/amiliyaai/MaaLogs/issues");
}

async function openLogDir() {
  const logPath = getLogPath();
  if (logPath) {
    await revealItemInDir(logPath);
  }
}
</script>

<template>
  <div class="about-settings">
    <div class="setting-card">
      <div class="about-content">
        <div class="about-section">
          <div class="about-item">
            <span class="about-label">版本</span>
            <n-space align="center">
              <n-text>v{{ appVersion }}</n-text>
              <n-button size="small" :loading="checking" @click="handleCheckUpdate">
                检查更新
              </n-button>
            </n-space>
          </div>
          <div class="about-item">
            <span class="about-label">许可证</span>
            <n-tag type="success" size="small"> MIT </n-tag>
          </div>
          <div class="about-item">
            <span class="about-label">技术栈</span>
            <n-space>
              <n-tag type="info" size="small"> Tauri 2.0 </n-tag>
              <n-tag type="info" size="small"> Vue 3 </n-tag>
              <n-tag type="info" size="small"> Naive UI </n-tag>
              <n-tag type="info" size="small"> TypeScript </n-tag>
            </n-space>
          </div>
        </div>
        <div class="about-divider"></div>
        <div class="about-section">
          <n-text depth="2" style="font-weight: 600"> MaaLogs - MaaFramework 日志分析利器 </n-text>
          <n-text depth="3" style="margin-top: 4px; display: block">
            支持多项目日志解析、可视化任务流程、集成 AI 智能分析
          </n-text>
        </div>
        <div class="about-divider"></div>
        <div class="about-links">
          <n-button quaternary type="primary" @click="openGitHub"> GitHub 仓库 </n-button>
          <n-button quaternary type="warning" @click="openIssues"> 问题反馈 </n-button>
          <n-button quaternary @click="openLogDir"> 打开日志目录 </n-button>
        </div>
        <n-text depth="3" style="text-align: center; font-size: 12px; margin-top: 16px">
          © 2026 MaaLogs Team. All rights reserved.
        </n-text>
      </div>
    </div>
  </div>
</template>

<style scoped>
.about-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-card {
  background: var(--n-color-fill-weak);
  border-radius: 16px;
  padding: 20px;
}

.about-content {
  margin-top: 0;
}

.about-section {
  padding: 12px 0;
}

.about-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--n-border-color);
}

.about-item:last-child {
  border-bottom: none;
}

.about-label {
  font-weight: 500;
  color: var(--n-text-color-2);
}

.about-divider {
  height: 1px;
  background: var(--n-border-color);
  margin: 8px 0;
}

.about-links {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}
</style>
