<script setup lang="ts">
import { NModal, NCard, NSpace, NText, NDivider, NButton, NTag, NDescriptions, NDescriptionsItem } from "naive-ui";
import { getVersion } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ref, onMounted } from "vue";
import { createDiscreteApi } from "naive-ui";

const { message: $message, dialog: $dialog } = createDiscreteApi(["message", "dialog"]);

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
}>();

const appVersion = ref("0.1.0");
const checking = ref(false);

onMounted(async () => {
  try {
    appVersion.value = await getVersion();
  } catch {
    console.warn("Failed to get app version");
  }
});

async function checkUpdate() {
  checking.value = true;
  try {
    const update = await check();
    if (update) {
      $dialog.info({
        title: "发现新版本",
        content: `当前版本：v${appVersion.value}\n最新版本：v${update.version}\n\n是否立即更新？`,
        positiveText: "立即更新",
        negativeText: "稍后提醒",
        onPositiveClick: async () => {
          $message.info("正在下载更新...");
          try {
            let downloaded = 0;
            let contentLength = 0;
            await update.downloadAndInstall((event) => {
              switch (event.event) {
                case "Started":
                  contentLength = event.data.contentLength;
                  break;
                case "Progress":
                  downloaded += event.data.chunkLength;
                  if (contentLength > 0) {
                    const percent = Math.round((downloaded / contentLength) * 100);
                    $message.info(`下载进度：${percent}%`);
                  }
                  break;
                case "Finished":
                  $message.success("下载完成，正在安装...");
                  break;
              }
            });
            $message.success("更新完成，正在重启...");
            await relaunch();
          } catch (err) {
            console.error("更新失败:", err);
            $message.error("更新失败，请稍后重试");
          }
        }
      });
    } else {
      $message.success("当前已是最新版本");
    }
  } catch (error) {
    console.error("检查更新失败:", error);
    $message.error("检查更新失败");
  } finally {
    checking.value = false;
  }
}

function openGitHub() {
  window.open("https://github.com/amiliyaai/MaaLogs", "_blank");
}

function openIssues() {
  window.open("https://github.com/amiliyaai/MaaLogs/issues", "_blank");
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
                @click="checkUpdate"
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
