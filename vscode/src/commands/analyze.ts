/**
 * @fileoverview 分析当前文件命令模块
 *
 * 本模块实现分析当前活动编辑器的日志文件命令：
 * - 获取当前打开的文件
 * - 检查文件是否为日志文件
 * - 将文件传递给侧边栏 WebView 进行分析
 *
 * @module commands/analyze
 * @author MaaLogs Team
 * @license MIT
 */

import * as vscode from "vscode";
import { SidebarWebViewProvider } from "../views/sidebarWebView";
import { Logger } from "../utils/logger";

/** 本模块日志记录器 */
const logger = new Logger("Analyze");

/**
 * 分析当前文件命令处理函数
 *
 * 获取当前 VSCode 活动编辑器的文件，如果是日志文件则进行分析
 * 会先弹出警告确认对话框（如果不是 .log 或 .maalog 结尾）
 *
 * @param provider - 侧边栏 WebView 提供者实例
 * @returns Promise<void> - 异步操作完成
 */
export async function analyzeCurrentFile(provider: SidebarWebViewProvider): Promise<void> {
  // 获取当前活动文本编辑器
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("没有打开的文件");
    return;
  }

  const document = editor.document;
  const fileName = document.fileName.toLowerCase();

  // 检查文件是否为日志文件
  if (!fileName.endsWith(".log") && !fileName.endsWith(".maalog")) {
    // 弹出警告确认对话框
    const result = await vscode.window.showWarningMessage(
      "当前文件不是日志文件，是否继续分析？",
      "继续",
      "取消"
    );
    if (result !== "继续") {
      return;
    }
  }

  logger.info("分析当前文件", { fileName: document.fileName });

  // 切换到 MaaLogs 侧边栏
  vscode.commands.executeCommand("workbench.view.extension.maa-logs");

  // 解析文件
  await provider.selectFiles([document.uri]);
}
