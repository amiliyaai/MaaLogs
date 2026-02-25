/**
 * @fileoverview 打开日志文件命令模块
 *
 * 本模块实现打开日志文件的命令功能：
 * - 弹出文件选择对话框
 * - 支持多选日志文件（.log, .json, .jsonc）
 * - 将选中的文件传递给侧边栏 WebView 进行解析
 *
 * @module commands/openLog
 * @author MaaLogs Team
 * @license MIT
 */

import * as vscode from "vscode";
import { SidebarWebViewProvider } from "../views/sidebarWebView";
import { Logger } from "../utils/logger";

/** 本模块日志记录器 */
const logger = new Logger("OpenLog");

/**
 * 打开日志文件命令处理函数
 *
 * 弹出文件选择对话框，允许用户选择一个或多个日志文件，
 * 然后切换到 MaaLogs 侧边栏并触发文件解析
 *
 * @param provider - 侧边栏 WebView 提供者实例
 * @returns Promise<void> - 异步操作完成
 */
export async function openLogFile(provider: SidebarWebViewProvider): Promise<void> {
  // 配置文件选择对话框选项
  const options: vscode.OpenDialogOptions = {
    canSelectMany: true,
    openLabel: "选择日志文件",
    filters: {
      "Log Files": ["log"],
      "JSON Files": ["json", "jsonc"],
      "All Files": ["*"],
    },
  };

  // 弹出文件选择对话框
  const uris = await vscode.window.showOpenDialog(options);
  if (!uris || uris.length === 0) {
    return;
  }

  logger.info("选择文件", { count: uris.length, files: uris.map((u) => u.fsPath) });

  // 切换到 MaaLogs 侧边栏
  vscode.commands.executeCommand("workbench.view.extension.maa-logs");

  // 触发文件选择
  await provider["selectFiles"](uris);
}
