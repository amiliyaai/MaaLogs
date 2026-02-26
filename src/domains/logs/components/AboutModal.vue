<script setup lang="ts">
import { NModal, NCard, NSpace, NText, NDivider, NButton, NTag, NDescriptions, NDescriptionsItem } from "naive-ui";
import { ref, onMounted } from "vue";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { checkForUpdate, getCurrentVersion } from "../utils/updater";
import { getLogPath } from "../utils/logger";

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
}>();

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
  <n-modal
    :show="props.show"
    preset="card"
    title="关于 MaaLogs"
    style="width: 480px"
    @update:show="emit('update:show', $event)"
  >
    <n-card :bordered="false">
      <n-space
        vertical
        :size="16"
      >
        <n-descriptions
          label-placement="left"
          :column="1"
          bordered
        >
          <n-descriptions-item label="版本">
            <n-space align="center">
              <n-text>v{{ appVersion }}</n-text>
              <n-button
                size="small"
                :loading="checking"
                @click="handleCheckUpdate"
              >
                检查更新
              </n-button>
            </n-space>
          </n-descriptions-item>
          <n-descriptions-item label="许可证">
            <n-tag
              type="success"
              size="small"
            >
              MIT
            </n-tag>
          </n-descriptions-item>
          <n-descriptions-item label="技术栈">
            <n-space>
              <n-tag
                type="info"
                size="small"
              >
                Tauri 2.0
              </n-tag>
              <n-tag
                type="info"
                size="small"
              >
                Vue 3
              </n-tag>
              <n-tag
                type="info"
                size="small"
              >
                Naive UI
              </n-tag>
              <n-tag
                type="info"
                size="small"
              >
                TypeScript
              </n-tag>
            </n-space>
          </n-descriptions-item>
        </n-descriptions>

        <n-divider style="margin: 8px 0" />

        <n-space
          vertical
          :size="8"
        >
          <n-text depth="2">
            MaaLogs - MaaFramework 日志分析利器
          </n-text>
          <n-text depth="3">
            支持多项目日志解析、可视化任务流程、集成 AI 智能分析
          </n-text>
        </n-space>

        <n-divider style="margin: 8px 0" />

        <n-space justify="center">
          <n-button
            quaternary
            type="primary"
            @click="openGitHub"
          >
            GitHub 仓库
          </n-button>
          <n-button
            quaternary
            type="warning"
            @click="openIssues"
          >
            问题反馈
          </n-button>
          <n-button
            quaternary
            @click="openLogDir"
          >
            打开日志目录
          </n-button>
        </n-space>

        <n-text
          depth="3"
          style="text-align: center; font-size: 12px"
        >
          © 2026 MaaLogs Team. All rights reserved.
        </n-text>
      </n-space>
    </n-card>
  </n-modal>
</template>
