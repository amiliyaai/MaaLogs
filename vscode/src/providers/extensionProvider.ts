import * as vscode from 'vscode';
import type { TaskInfo, ParseResult, ControllerInfo } from '../types/logTypes';
import { parseLogFile } from '../utils/parse';
import { Logger } from '../utils/logger';
import { TaskTreeDataProvider } from '../views/taskTree';

const logger = new Logger('Provider');

export class MaaLogsProvider {
    private context: vscode.ExtensionContext;
    private _tasks: TaskInfo[] = [];
    private _rawLines: { fileName: string; lineNumber: number; line: string }[] = [];
    private _controllerInfos: ControllerInfo[] = [];
    private _treeDataProvider?: TaskTreeDataProvider;
    private _onDidChangeTasks = new vscode.EventEmitter<TaskInfo[]>();
    
    readonly onDidChangeTasks = this._onDidChangeTasks.event;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    get tasks(): TaskInfo[] {
        return this._tasks;
    }

    get rawLines(): { fileName: string; lineNumber: number; line: string }[] {
        return this._rawLines;
    }

    get controllerInfos(): ControllerInfo[] {
        return this._controllerInfos;
    }

    setTreeDataProvider(provider: TaskTreeDataProvider): void {
        this._treeDataProvider = provider;
    }

    async parseFiles(uris: vscode.Uri[]): Promise<void> {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'MaaLogs: 解析日志文件',
                cancellable: false
            },
            async (progress) => {
                progress.report({ message: '读取文件...', increment: 0 });

                const allResults: ParseResult = {
                    tasks: [],
                    rawLines: [],
                    auxLogs: [],
                    pipelineCustomActions: {},
                    controllerInfos: []
                };

                for (let i = 0; i < uris.length; i++) {
                    const uri = uris[i];
                    progress.report({
                        message: `解析 ${uri.fsPath.split(/[/\\]/).pop()}...`,
                        increment: (100 / uris.length) * i
                    });

                    try {
                        const content = await vscode.workspace.fs.readFile(uri);
                        const text = Buffer.from(content).toString('utf-8');
                        const fileName = uri.fsPath.split(/[/\\]/).pop() || uri.fsPath;
                        
                        const result = await parseLogFile(text, fileName);
                        allResults.tasks.push(...result.tasks);
                        allResults.rawLines.push(...result.rawLines);
                        allResults.controllerInfos.push(...result.controllerInfos);
                    } catch (error) {
                        logger.error('解析文件失败', { 
                            file: uri.fsPath, 
                            error: String(error) 
                        });
                    }
                }

                this._tasks = allResults.tasks;
                this._rawLines = allResults.rawLines;
                this._controllerInfos = allResults.controllerInfos;

                progress.report({ message: '完成', increment: 100 });

                logger.info('解析完成', {
                    tasks: this._tasks.length,
                    lines: this._rawLines.length,
                    controllers: this._controllerInfos.length
                });

                this._onDidChangeTasks.fire(this._tasks);
                this._treeDataProvider?.refresh();

                if (this._tasks.length === 0) {
                    vscode.window.showInformationMessage('未识别到任务');
                } else {
                    vscode.window.showInformationMessage(`解析完成，共 ${this._tasks.length} 个任务`);
                }
            }
        );
    }

    showTaskDetail(taskKey: string): void {
        const task = this._tasks.find(t => t.key === taskKey);
        if (!task) {
            vscode.window.showWarningMessage(`未找到任务: ${taskKey}`);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'maaLogsTaskDetail',
            `任务: ${task.entry}`,
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = this.getTaskDetailHtml(task);
    }

    showNodeDetail(taskKey: string, nodeKey: string): void {
        const task = this._tasks.find(t => t.key === taskKey);
        if (!task) {
            vscode.window.showWarningMessage(`未找到任务: ${taskKey}`);
            return;
        }

        const node = task.nodes.find(n => `node-${n.node_id}` === nodeKey);
        if (!node) {
            vscode.window.showWarningMessage(`未找到节点: ${nodeKey}`);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'maaLogsNodeDetail',
            `节点: ${node.name}`,
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = this.getNodeDetailHtml(task, node);
    }

    updateConfiguration(): void {
        logger.info('配置已更新');
    }

    private getTaskDetailHtml(task: TaskInfo): string {
        const statusColor = task.status === 'succeeded' ? '#4caf50' : 
                           task.status === 'failed' ? '#f44336' : '#ff9800';
        const duration = task.duration ? `${task.duration}ms` : '未知';
        const controller = task.controllerInfo;

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>任务详情: ${task.entry}</title>
    <style>
        body { font-family: var(--vscode-font-family); padding: 20px; }
        .header { margin-bottom: 20px; }
        .header h1 { margin: 0 0 10px 0; font-size: 24px; }
        .status { display: inline-block; padding: 4px 12px; border-radius: 4px; color: white; }
        .info-grid { display: grid; grid-template-columns: 150px 1fr; gap: 8px; margin-bottom: 20px; }
        .info-label { color: var(--vscode-descriptionForeground); }
        .section { margin-top: 20px; }
        .section h2 { font-size: 16px; margin-bottom: 10px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 5px; }
        .node-list { list-style: none; padding: 0; }
        .node-item { padding: 8px; border: 1px solid var(--vscode-panel-border); margin-bottom: 4px; border-radius: 4px; }
        .node-item:hover { background: var(--vscode-list-hoverBackground); }
        .node-name { font-weight: bold; }
        .node-status { float: right; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${task.entry}</h1>
        <span class="status" style="background-color: ${statusColor}">${task.status}</span>
    </div>
    
    <div class="info-grid">
        <span class="info-label">任务 ID:</span>
        <span>${task.task_id}</span>
        <span class="info-label">开始时间:</span>
        <span>${task.start_time}</span>
        <span class="info-label">结束时间:</span>
        <span>${task.end_time || '运行中'}</span>
        <span class="info-label">耗时:</span>
        <span>${duration}</span>
        <span class="info-label">进程 ID:</span>
        <span>${task.processId}</span>
        <span class="info-label">UUID:</span>
        <span>${task.uuid}</span>
    </div>

    ${controller ? `
    <div class="section">
        <h2>控制器信息</h2>
        <div class="info-grid">
            <span class="info-label">类型:</span>
            <span>${controller.type}</span>
            ${controller.type === 'adb' ? `
                <span class="info-label">ADB 路径:</span>
                <span>${controller.adbPath || '-'}</span>
                <span class="info-label">设备地址:</span>
                <span>${controller.address || '-'}</span>
                <span class="info-label">截图方式:</span>
                <span>${controller.screencapMethods?.join(', ') || '-'}</span>
                <span class="info-label">输入方式:</span>
                <span>${controller.inputMethods?.join(', ') || '-'}</span>
            ` : `
                <span class="info-label">截图方式:</span>
                <span>${controller.screencapMethod || '-'}</span>
                <span class="info-label">鼠标方式:</span>
                <span>${controller.mouseMethod || '-'}</span>
                <span class="info-label">键盘方式:</span>
                <span>${controller.keyboardMethod || '-'}</span>
            `}
        </div>
    </div>
    ` : ''}

    <div class="section">
        <h2>节点列表 (${task.nodes.length})</h2>
        <ul class="node-list">
            ${task.nodes.map(node => `
                <li class="node-item">
                    <span class="node-name">${node.name}</span>
                    <span class="node-status" style="color: ${node.status === 'success' ? '#4caf50' : '#f44336'}">
                        ${node.status}
                    </span>
                </li>
            `).join('')}
        </ul>
    </div>
</body>
</html>`;
    }

    private getNodeDetailHtml(task: TaskInfo, node: any): string {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>节点详情: ${node.name}</title>
    <style>
        body { font-family: var(--vscode-font-family); padding: 20px; }
        .header { margin-bottom: 20px; }
        .header h1 { margin: 0 0 10px 0; font-size: 24px; }
        .info-grid { display: grid; grid-template-columns: 150px 1fr; gap: 8px; margin-bottom: 20px; }
        .info-label { color: var(--vscode-descriptionForeground); }
        .section { margin-top: 20px; }
        .section h2 { font-size: 16px; margin-bottom: 10px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 5px; }
        pre { background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${node.name}</h1>
    </div>
    
    <div class="info-grid">
        <span class="info-label">节点 ID:</span>
        <span>${node.node_id}</span>
        <span class="info-label">时间戳:</span>
        <span>${node.timestamp}</span>
        <span class="info-label">状态:</span>
        <span>${node.status}</span>
    </div>

    ${node.reco_details ? `
    <div class="section">
        <h2>识别详情</h2>
        <pre>${JSON.stringify(node.reco_details, null, 2)}</pre>
    </div>
    ` : ''}

    ${node.action_details ? `
    <div class="section">
        <h2>动作详情</h2>
        <pre>${JSON.stringify(node.action_details, null, 2)}</pre>
    </div>
    ` : ''}

    <div class="section">
        <h2>识别尝试 (${node.recognition_attempts?.length || 0})</h2>
        <pre>${JSON.stringify(node.recognition_attempts, null, 2)}</pre>
    </div>
</body>
</html>`;
    }
}
