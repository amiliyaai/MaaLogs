import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { createDiscreteApi } from "naive-ui";

const { message: $message, dialog: $dialog } = createDiscreteApi(["message", "dialog"]);

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
      onPositiveClick: () => downloadAndInstall(update)
    });
    
    return true;
  } catch (error) {
    console.error("检查更新失败:", error);
    $message.error("检查更新失败");
    return false;
  }
}

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

export async function getCurrentVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return "unknown";
  }
}
