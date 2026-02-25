/**
 * @fileoverview MaaLogs VSCode 插件主入口
 *
 * 本文件是 MaaLogs VSCode 插件的入口点，负责：
 * - 注册插件命令
 * - 初始化侧边栏 WebView
 * - 注册 VSCode 命令（如打开日志、分析文件等）
 * - 处理插件生命周期事件
 *
 * @module extension
 * @author MaaLogs Team
 * @license MIT
 */

import * as vscode from "vscode";
import { SidebarWebViewProvider } from "./views/sidebarWebView";
import { openLogFile } from "./commands/openLog";
import { analyzeCurrentFile } from "./commands/analyze";
import { Logger } from "./utils/logger";

/** 插件日志记录器实例 */
let logger: Logger;

/**
 * 插件激活入口
 *
 * 当 VSCode 加载插件时调用此函数，完成以下初始化：
 * - 创建日志记录器
 * - 注册侧边栏 WebView
 * - 注册插件命令
 *
 * @param context - VSCode 扩展上下文
 */
export function activate(context: vscode.ExtensionContext) {
  logger = new Logger("MaaLogs");
  logger.info("插件激活");

  // 创建侧边栏 WebView 提供者
  const sidebarProvider = new SidebarWebViewProvider(context);

  // 注册插件命令和事件监听
  context.subscriptions.push(
    // 注册侧边栏 WebView
    vscode.window.registerWebviewViewProvider(SidebarWebViewProvider.viewType, sidebarProvider),

    // 注册打开分析面板命令
    vscode.commands.registerCommand("maaLogs.openAnalysis", () => {
      vscode.commands.executeCommand("workbench.view.extension.maa-logs");
    }),

    // 注册打开日志文件命令
    vscode.commands.registerCommand("maaLogs.openLog", () => openLogFile(sidebarProvider)),
    
    // 注册分析当前文件命令
    vscode.commands.registerCommand("maaLogs.analyzeCurrent", () =>
      analyzeCurrentFile(sidebarProvider)
    ),
    
    // 注册刷新任务命令
    vscode.commands.registerCommand("maaLogs.refreshTasks", () => {
      vscode.window.showInformationMessage("任务已刷新");
    }),

    // 监听配置文件变更事件
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("maaLogs")) {
        logger.info("配置已更新");
      }
    })
  );

  logger.info("插件激活完成");
}

/**
 * 插件停用入口
 *
 * 当 VSCode 停用插件时调用，用于清理资源
 */
export function deactivate() {
  logger?.info("插件停用");
}
