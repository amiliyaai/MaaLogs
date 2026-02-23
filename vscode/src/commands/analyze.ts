import * as vscode from 'vscode';
import { SidebarWebViewProvider } from '../views/sidebarWebView';
import { Logger } from '../utils/logger';

const logger = new Logger('Analyze');

export async function analyzeCurrentFile(provider: SidebarWebViewProvider): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('没有打开的文件');
        return;
    }

    const document = editor.document;
    const fileName = document.fileName.toLowerCase();
    
    if (!fileName.endsWith('.log') && !fileName.endsWith('.maalog')) {
        const result = await vscode.window.showWarningMessage(
            '当前文件不是日志文件，是否继续分析？',
            '继续',
            '取消'
        );
        if (result !== '继续') {
            return;
        }
    }

    logger.info('分析当前文件', { fileName: document.fileName });

    // 切换到 MaaLogs 侧边栏
    vscode.commands.executeCommand('workbench.view.extension.maa-logs');
    
    // 解析文件
    await provider.selectFiles([document.uri]);
}
