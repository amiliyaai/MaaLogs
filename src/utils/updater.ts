/**
 * @fileoverview 应用更新模块
 *
 * 本文件实现了应用程序的自动更新功能，使用 Tauri 的更新插件。
 * 支持：
 * - 检查更新
 * - 下载更新包
 * - 显示下载进度
 * - 自动安装并重启
 *
 * @module utils/updater
 * @author MaaLogs Team
 * @license MIT
 */

import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { createDiscreteApi } from "naive-ui";

const { message: $message, dialog: $dialog } = createDiscreteApi(["message", "dialog"]);

/**
 * 检查应用更新
 *
 * 从配置的更新服务器检查是否有新版本可用。
 * 如果发现新版本，弹出对话框询问用户是否立即更新。
 *
 * @param {boolean} [showNoUpdate=false] - 当没有更新时是否显示提示
 * @returns {Promise<boolean>} 是否发现新版本
 *
 * @example
 * // 静默检查更新
 * const hasUpdate = await checkForUpdate();
 *
 * // 手动检查更新，显示"已是最新版本"提示
 * await checkForUpdate(true);
 */
export async function checkForUpdate(showNoUpdate = false): Promise<boolean> {
  try {
    const update = await check();

    if (!update) {
      if (showNoUpdate) {
        $message.success("当前已是最新版本");
      }
      return false;
    }

    const currentVersion = await getVersion();

    $dialog.info({
      title: "发现新版本",
      content: `当前版本：v${currentVersion}\n最新版本：v${update.version}\n\n是否立即更新？`,
      positiveText: "立即更新",
      negativeText: "稍后提醒",
      onPositiveClick: () => downloadAndInstall(update),
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
 *
 * 下载更新包并显示进度，下载完成后自动安装并重启应用。
 *
 * @param {Awaited<ReturnType<typeof check>>} update - 更新信息对象
 */
async function downloadAndInstall(update: Awaited<ReturnType<typeof check>>): Promise<void> {
  if (!update) return;

  const loadingMsg = $message.loading("正在下载更新...", { duration: 0 });

  try {
    let downloaded = 0;
    let contentLength = 0;

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          contentLength = event.data.contentLength ?? 0;
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
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
 * @returns {Promise<string>} 版本号字符串，获取失败时返回 "unknown"
 *
 * @example
 * const version = await getCurrentVersion();
 * console.log(`当前版本: v${version}`);
 */
export async function getCurrentVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return "unknown";
  }
}
