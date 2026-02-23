import * as vscode from 'vscode';
import { SidebarWebViewProvider } from '../views/sidebarWebView';
import { Logger } from '../utils/logger';

const logger = new Logger('OpenLog');

export async function openLogFile(provider: SidebarWebViewProvider): Promise<void> {
    const options: vscode.OpenDialogOptions = {
        canSelectMany: true,
        openLabel: '选择日志文件',
        filters: {
            'Log Files': ['log'],
            'JSON Files': ['json', 'jsonc'],
            'All Files': ['*']
        }
    };

    const uris = await vscode.window.showOpenDialog(options);
    if (!uris || uris.length === 0) {
        return;
    }

    logger.info('选择文件', { count: uris.length, files: uris.map(u => u.fsPath) });

    // 切换到 MaaLogs 侧边栏
    vscode.commands.executeCommand('workbench.view.extension.maa-logs');
    
    // 触发文件选择
    await provider['selectFiles'](uris);
}
