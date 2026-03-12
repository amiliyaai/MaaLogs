/**
 * @fileoverview 应用更新模块
 *
 * 本文件实现了应用程序的自动更新功能，使用 Tauri 的更新插件。
 * 支持：检查更新、下载更新包、显示 changelog、自动安装并重启。
 *
 * @module utils/updater
 * @author MaaLogs Team
 * @license MIT
 */

import { createDiscreteApi, NCard, NScrollbar, NText, NButton } from "naive-ui";
import { h } from "vue";
import { isTauriEnv } from "@/utils/env";
import type { Update } from "@tauri-apps/plugin-updater";

/**
 * 简单 Markdown 转 HTML
 * 支持：代码块、行内代码、标题、列表、粗体、斜体、删除线
 */
function parseMarkdown(text: string): string {
  let html = text;

  // 代码块
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, __lang, code) => {
    return `<pre style="background: var(--n-color-fill-weak); padding: 8px; border-radius: 4px; overflow-x: auto;"><code>${escapeHtml(code.trim())}</code></pre>`;
  });

  // 行内代码
  html = html.replace(
    /`([^`]+)`/g,
    '<code style="background: var(--n-color-fill-weak); padding: 2px 6px; border-radius: 3px; font-size: 12px;">$1</code>'
  );

  // 标题 ### → h4
  html = html.replace(
    /^### (.+)$/gm,
    '<h4 style="margin: 12px 0 8px 0; font-size: 14px; font-weight: 600;">$1</h4>'
  );

  // 标题 ## → h3
  html = html.replace(
    /^## (.+)$/gm,
    '<h3 style="margin: 12px 0 8px 0; font-size: 15px; font-weight: 600;">$1</h3>'
  );

  // 列表项
  html = html.replace(
    /^[-*] (.+)$/gm,
    '<li style="margin-left: 20px; margin-bottom: 4px; line-height: 1.6;">$1</li>'
  );

  // 粗体
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // 斜体
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // 删除线
  html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  // 段落和列表包裹
  html = html.replace(/\n\n/g, '</p><p style="margin: 8px 0;">');
  html = '<p style="margin: 8px 0;">' + html + "</p>";
  html = html.replace(
    /(<li[^>]*>[\s\S]*?<\/li>)+/g,
    '<ul style="margin: 4px 0; padding-left: 0;">$&</ul>'
  );

  return html;
}

/**
 * HTML 特殊字符转义
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const { message: $message, dialog: $dialog } = createDiscreteApi(["message", "dialog"], {
  configProviderProps: {
    themeOverrides: {
      Dialog: { style: "max-width: 600px" },
    },
  },
});

/**
 * 创建更新对话框内容
 */
function createUpdateDialogContent(
  currentVersion: string,
  newVersion: string,
  changelog: string,
  onUpdate: () => void,
  onCancel: () => void
) {
  return h("div", { style: "max-height: 400px; display: flex; flex-direction: column;" }, [
    h("div", { style: "margin-bottom: 12px;" }, [
      h("div", { style: "font-size: 14px;" }, [
        h(NText, null, () => `当前版本：v${currentVersion}`),
      ]),
      h("div", { style: "font-size: 14px; margin-top: 4px;" }, [
        h(NText, null, () => `最新版本：v${newVersion}`),
      ]),
    ]),
    h(
      NText,
      { depth: 2, style: "font-size: 13px; margin-bottom: 8px; display: block;" },
      () => "更新内容："
    ),
    h(
      NCard,
      { style: "flex: 1; margin-bottom: 16px;", size: "small", contentStyle: "padding: 12px;" },
      {
        default: () =>
          h(NScrollbar, { style: "max-height: 250px;" }, () =>
            h("div", {
              style: "font-size: 13px; line-height: 1.6;",
              innerHTML: parseMarkdown(changelog),
            })
          ),
      }
    ),
    h("div", { style: "text-align: right;" }, [
      h(NButton, { onClick: onCancel, style: "margin-right: 8px;" }, () => "稍后提醒"),
      h(NButton, { type: "primary", onClick: onUpdate }, () => "立即更新"),
    ]),
  ]);
}

/**
 * 检查应用更新
 *
 * 从配置的更新服务器检查是否有新版本可用。
 * 如果发现新版本，弹出对话框显示 changelog 并询问用户是否立即更新。
 *
 * @param showNoUpdate - 当没有更新时是否显示提示
 * @returns 是否发现新版本
 *
 * @example
 * const hasUpdate = await checkForUpdate();
 * await checkForUpdate(true);
 */
export async function checkForUpdate(showNoUpdate = false): Promise<boolean> {
  if (!isTauriEnv()) {
    return false;
  }
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();

    if (!update) {
      if (showNoUpdate) {
        $message.success("当前已是最新版本");
      }
      return false;
    }

    const currentVersion = await getCurrentVersion();
    const changelog = update.body || "暂无更新内容信息";

    $dialog.info({
      title: "发现新版本",
      content: () =>
        createUpdateDialogContent(
          currentVersion,
          update.version,
          changelog,
          () => {
            $dialog.destroyAll();
            downloadAndInstall(update);
          },
          () => $dialog.destroyAll()
        ),
    });

    return true;
  } catch (error) {
    console.error("检查更新失败:", error);
    $message.error("检查更新失败");
    return false;
  }
}

/**
 * 下载并安装更新
 * 显示下载进度，下载完成后自动安装并重启应用
 */
async function downloadAndInstall(update: Update | null): Promise<void> {
  if (!update) return;

  const loadingMsg = $message.loading("正在下载更新...", { duration: 0 });

  try {
    let downloaded = 0;
    let contentLength = 0;

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          contentLength = event.data?.contentLength ?? 0;
          break;
        case "Progress":
          downloaded += event.data?.chunkLength ?? 0;
          if (contentLength > 0) {
            const percent = Math.round((downloaded / contentLength) * 100);
            loadingMsg.content = `正在下载更新... ${percent}%`;
          }
          break;
        case "Finished":
          loadingMsg.content = "下载完成，正在安装...";
          break;
      }
    });

    loadingMsg.destroy();
    $message.success("更新完成，正在重启...");
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (err) {
    loadingMsg.destroy();
    console.error("更新失败:", err);
    $message.error("更新失败，请稍后重试");
  }
}

/**
 * 获取当前应用版本号
 *
 * @returns 版本号字符串，获取失败时返回 "unknown"
 *
 * @example
 * const version = await getCurrentVersion();
 */
export async function getCurrentVersion(): Promise<string> {
  if (!isTauriEnv()) {
    return  __APP_VERSION__;
  }
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return "unknown";
  }
}
