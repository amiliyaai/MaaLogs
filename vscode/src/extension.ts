import * as vscode from 'vscode';
import { SidebarWebViewProvider } from './views/sidebarWebView';
import { openLogFile } from './commands/openLog';
import { analyzeCurrentFile } from './commands/analyze';
import { Logger } from './utils/logger';

let logger: Logger;

export function activate(context: vscode.ExtensionContext) {
    logger = new Logger('MaaLogs');
    logger.info('插件激活');

    const sidebarProvider = new SidebarWebViewProvider(context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            SidebarWebViewProvider.viewType,
            sidebarProvider
        ),
        
        vscode.commands.registerCommand('maaLogs.openAnalysis', () => {
            vscode.commands.executeCommand('workbench.view.extension.maa-logs');
        }),
        
        vscode.commands.registerCommand('maaLogs.openLog', () => openLogFile(sidebarProvider)),
        vscode.commands.registerCommand('maaLogs.analyzeCurrent', () => analyzeCurrentFile(sidebarProvider)),
        vscode.commands.registerCommand('maaLogs.refreshTasks', () => {
            vscode.window.showInformationMessage('任务已刷新');
        }),
        
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('maaLogs')) {
                logger.info('配置已更新');
            }
        })
    );

    logger.info('插件激活完成');
}

export function deactivate() {
    logger?.info('插件停用');
}
