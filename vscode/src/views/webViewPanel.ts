import * as vscode from "vscode";
import type { TaskInfo, NodeInfo, AuxLogEntry, ControllerInfo } from "../types/logTypes";
import { Logger } from "../utils/logger";

const logger = new Logger("WebView");

export interface WebViewMessage {
  type: string;
  payload?: unknown;
}

export interface WebViewState {
  tasks: TaskInfo[];
  filteredTasks: TaskInfo[];
  selectedTaskKey: string | null;
  selectedNodeId: number | null;
  selectedProcessId: string;
  selectedThreadId: string;
  hiddenCallers: string[];
  selectedAuxLevels: string[];
  searchResults: { fileName: string; lineNumber: number; line: string }[];
}

export class WebViewPanel {
  private panel: vscode.WebviewPanel | null = null;
  private context: vscode.ExtensionContext;
  private state: WebViewState;
  private _onDidDispose = new vscode.EventEmitter<void>();
  private _onDidMessage = new vscode.EventEmitter<WebViewMessage>();

  readonly onDidDispose = this._onDidDispose.event;
  readonly onDidMessage = this._onDidMessage.event;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.state = {
      tasks: [],
      filteredTasks: [],
      selectedTaskKey: null,
      selectedNodeId: null,
      selectedProcessId: "all",
      selectedThreadId: "all",
      hiddenCallers: [],
      selectedAuxLevels: ["error", "warn", "info", "debug"],
      searchResults: [],
    };
  }

  show(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "maaLogsAnalysis",
      "MaaLogs 分析",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        enableFindWidget: true,
      }
    );

    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage((message: WebViewMessage) => {
      logger.debug("收到消息", { type: message.type, payload: message.payload });
      this._onDidMessage.fire(message);
      this.handleMessage(message);
    });

    this.panel.onDidDispose(() => {
      this.panel = null;
      this._onDidDispose.fire();
    });
  }

  private handleMessage(message: WebViewMessage): void {
    switch (message.type) {
      case "selectTask":
        this.state.selectedTaskKey = message.payload as string;
        this.state.selectedNodeId = null;
        this.updateState();
        break;
      case "selectNode":
        this.state.selectedNodeId = message.payload as number;
        this.updateState();
        break;
      case "setProcessId":
        this.state.selectedProcessId = message.payload as string;
        this.filterTasks();
        break;
      case "setThreadId":
        this.state.selectedThreadId = message.payload as string;
        this.filterTasks();
        break;
      case "setHiddenCallers":
        this.state.hiddenCallers = message.payload as string[];
        this.updateState();
        break;
      case "setAuxLevels":
        this.state.selectedAuxLevels = message.payload as string[];
        this.updateState();
        break;
      case "openFile":
        this.openFile(message.payload as { fileName: string; lineNumber: number });
        break;
    }
  }

  private async openFile(payload: { fileName: string; lineNumber: number }): Promise<void> {
    const files = await vscode.workspace.findFiles(payload.fileName);
    if (files.length > 0) {
      const document = await vscode.workspace.openTextDocument(files[0]);
      const editor = await vscode.window.showTextDocument(document);
      const position = new vscode.Position(payload.lineNumber - 1, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position));
    }
  }

  setTasks(tasks: TaskInfo[]): void {
    this.state.tasks = tasks;
    this.filterTasks();
  }

  private filterTasks(): void {
    let filtered = [...this.state.tasks];

    if (this.state.selectedProcessId !== "all") {
      filtered = filtered.filter((t) => t.processId === this.state.selectedProcessId);
    }

    if (this.state.selectedThreadId !== "all") {
      filtered = filtered.filter((t) => t.threadId === this.state.selectedThreadId);
    }

    this.state.filteredTasks = filtered;
    this.updateState();
  }

  private updateState(): void {
    if (this.panel) {
      this.panel.webview.postMessage({
        type: "updateState",
        payload: this.state,
      });
    }
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel?.webview.cspSource} 'unsafe-inline'; script-src ${this.panel?.webview.cspSource} 'unsafe-inline';">
    <title>MaaLogs 分析</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .toolbar {
            display: flex;
            gap: 12px;
            padding: 12px;
            background: var(--vscode-editorGroupHeader-tabsBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-wrap: wrap;
        }
        
        .toolbar-item {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .toolbar-label {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }
        
        select, input {
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 4px 8px;
            border-radius: 2px;
            font-size: 12px;
            min-width: 120px;
        }
        
        select:focus, input:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        
        .main-container {
            display: flex;
            flex: 1;
            overflow: hidden;
        }
        
        .panel {
            display: flex;
            flex-direction: column;
            border-right: 1px solid var(--vscode-panel-border);
            overflow: hidden;
        }
        
        .panel:last-child {
            border-right: none;
        }
        
        .panel-header {
            padding: 8px 12px;
            background: var(--vscode-sideBarSectionHeader-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            font-weight: 600;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .panel-content {
            flex: 1;
            overflow-y: auto;
        }
        
        .task-panel { width: 280px; min-width: 200px; }
        .node-panel { width: 260px; min-width: 180px; }
        .detail-panel { flex: 1; min-width: 300px; }
        
        .task-item, .node-item {
            padding: 10px 12px;
            border-bottom: 1px solid var(--vscode-list-inactiveSelectionBackground);
            cursor: pointer;
            transition: background 0.1s;
        }
        
        .task-item:hover, .node-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        
        .task-item.selected, .node-item.selected {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        
        .task-entry {
            font-weight: 600;
            margin-bottom: 4px;
        }
        
        .task-meta {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            gap: 12px;
        }
        
        .status-badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .status-succeeded { background: #2ea043; color: white; }
        .status-failed { background: #f85149; color: white; }
        .status-running { background: #f0883e; color: white; }
        
        .node-name {
            font-weight: 500;
            margin-bottom: 2px;
        }
        
        .node-time {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        
        .detail-section {
            padding: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .detail-section h3 {
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-foreground);
        }
        
        .detail-grid {
            display: grid;
            grid-template-columns: 100px 1fr;
            gap: 4px 12px;
            font-size: 12px;
        }
        
        .detail-label {
            color: var(--vscode-descriptionForeground);
        }
        
        .detail-value {
            color: var(--vscode-foreground);
            word-break: break-all;
        }
        
        .json-block {
            background: var(--vscode-textCodeBlock-background);
            padding: 8px;
            border-radius: 4px;
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
            overflow-x: auto;
            white-space: pre-wrap;
            word-break: break-all;
        }
        
        .aux-log-item {
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 12px;
        }
        
        .aux-log-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
        }
        
        .aux-log-level {
            font-weight: 600;
            font-size: 10px;
            text-transform: uppercase;
        }
        
        .level-error { color: #f85149; }
        .level-warn { color: #f0883e; }
        .level-info { color: #58a6ff; }
        .level-debug { color: var(--vscode-descriptionForeground); }
        
        .aux-log-message {
            color: var(--vscode-foreground);
            word-break: break-all;
        }
        
        .aux-log-meta {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
        
        .empty-state {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
        }
        
        .controller-info {
            background: var(--vscode-textBlockQuote-background);
            padding: 8px 12px;
            margin: 8px 12px;
            border-radius: 4px;
            font-size: 11px;
        }
        
        .controller-info h4 {
            font-size: 11px;
            margin-bottom: 6px;
            color: var(--vscode-foreground);
        }
        
        .controller-grid {
            display: grid;
            grid-template-columns: 80px 1fr;
            gap: 2px 8px;
        }
        
        .clickable {
            cursor: pointer;
            color: var(--vscode-textLink-foreground);
        }
        
        .clickable:hover {
            text-decoration: underline;
        }
        
        .hidden { display: none; }
    </style>
</head>
<body>
    <div class="toolbar">
        <div class="toolbar-item">
            <span class="toolbar-label">进程:</span>
            <select id="processSelect">
                <option value="all">全部</option>
            </select>
        </div>
        <div class="toolbar-item">
            <span class="toolbar-label">线程:</span>
            <select id="threadSelect">
                <option value="all">全部</option>
            </select>
        </div>
    </div>
    
    <div class="main-container">
        <div class="panel task-panel">
            <div class="panel-header">任务列表 (<span id="taskCount">0</span>)</div>
            <div class="panel-content" id="taskList"></div>
        </div>
        
        <div class="panel node-panel">
            <div class="panel-header">节点列表</div>
            <div class="panel-content" id="nodeList">
                <div class="empty-state">选择任务查看节点</div>
            </div>
        </div>
        
        <div class="panel detail-panel">
            <div class="panel-header">详情</div>
            <div class="panel-content" id="detailContent">
                <div class="empty-state">选择节点查看详情</div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        let state = {
            tasks: [],
            filteredTasks: [],
            selectedTaskKey: null,
            selectedNodeId: null,
            selectedProcessId: 'all',
            selectedThreadId: 'all',
            hiddenCallers: [],
            selectedAuxLevels: ['error', 'warn', 'info', 'debug'],
            searchResults: []
        };
        
        const processSelect = document.getElementById('processSelect');
        const threadSelect = document.getElementById('threadSelect');
        const taskList = document.getElementById('taskList');
        const nodeList = document.getElementById('nodeList');
        const detailContent = document.getElementById('detailContent');
        const taskCount = document.getElementById('taskCount');
        
        processSelect.addEventListener('change', (e) => {
            vscode.postMessage({ type: 'setProcessId', payload: e.target.value });
        });
        
        threadSelect.addEventListener('change', (e) => {
            vscode.postMessage({ type: 'setThreadId', payload: e.target.value });
        });
        
        window.addEventListener('message', (event) => {
            const message = event.data;
            if (message.type === 'updateState') {
                state = message.payload;
                render();
            }
        });
        
        function render() {
            renderProcessOptions();
            renderThreadOptions();
            renderTasks();
            renderNodes();
            renderDetail();
        }
        
        function renderProcessOptions() {
            const processes = new Map();
            state.tasks.forEach(t => {
                if (!processes.has(t.processId)) {
                    processes.set(t.processId, 0);
                }
                processes.set(t.processId, processes.get(t.processId) + 1);
            });
            
            processSelect.innerHTML = '<option value="all">全部</option>';
            processes.forEach((count, id) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = id + ' (' + count + ')';
                if (id === state.selectedProcessId) option.selected = true;
                processSelect.appendChild(option);
            });
        }
        
        function renderThreadOptions() {
            const threads = new Map();
            state.filteredTasks.forEach(t => {
                if (!threads.has(t.threadId)) {
                    threads.set(t.threadId, 0);
                }
                threads.set(t.threadId, threads.get(t.threadId) + 1);
            });
            
            threadSelect.innerHTML = '<option value="all">全部</option>';
            threads.forEach((count, id) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = id + ' (' + count + ')';
                if (id === state.selectedThreadId) option.selected = true;
                threadSelect.appendChild(option);
            });
        }
        
        function renderTasks() {
            taskCount.textContent = state.filteredTasks.length;
            
            if (state.filteredTasks.length === 0) {
                taskList.innerHTML = '<div class="empty-state">无任务</div>';
                return;
            }
            
            taskList.innerHTML = state.filteredTasks.map(task => {
                const statusClass = 'status-' + task.status;
                const selectedClass = task.key === state.selectedTaskKey ? ' selected' : '';
                const duration = task.duration ? formatDuration(task.duration) : '-';
                
                return '<div class="task-item' + selectedClass + '" onclick="selectTask(\\'' + task.key + '\\')">' +
                    '<div class="task-entry">' + escapeHtml(task.entry) + ' <span class="status-badge ' + statusClass + '">' + task.status + '</span></div>' +
                    '<div class="task-meta">' +
                        '<span>' + task.start_time.split(' ')[1] || task.start_time + '</span>' +
                        '<span>' + duration + '</span>' +
                        '<span>' + task.nodes.length + ' 节点</span>' +
                    '</div>' +
                '</div>';
            }).join('');
        }
        
        function renderNodes() {
            if (!state.selectedTaskKey) {
                nodeList.innerHTML = '<div class="empty-state">选择任务查看节点</div>';
                return;
            }
            
            const task = state.tasks.find(t => t.key === state.selectedTaskKey);
            if (!task || task.nodes.length === 0) {
                nodeList.innerHTML = '<div class="empty-state">无节点</div>';
                return;
            }
            
            nodeList.innerHTML = task.nodes.map(node => {
                const selectedClass = node.node_id === state.selectedNodeId ? ' selected' : '';
                const statusIcon = node.status === 'success' ? '✓' : '✗';
                
                return '<div class="node-item' + selectedClass + '" onclick="selectNode(' + node.node_id + ')">' +
                    '<div class="node-name">' + statusIcon + ' ' + escapeHtml(node.name) + '</div>' +
                    '<div class="node-time">' + node.timestamp + '</div>' +
                '</div>';
            }).join('');
        }
        
        function renderDetail() {
            if (!state.selectedTaskKey) {
                detailContent.innerHTML = '<div class="empty-state">选择节点查看详情</div>';
                return;
            }
            
            const task = state.tasks.find(t => t.key === state.selectedTaskKey);
            if (!task) {
                detailContent.innerHTML = '<div class="empty-state">任务未找到</div>';
                return;
            }
            
            let html = '';
            
            // 控制器信息
            if (task.controllerInfo) {
                const c = task.controllerInfo;
                html += '<div class="controller-info"><h4>控制器信息</h4><div class="controller-grid">';
                html += '<span class="detail-label">类型:</span><span>' + c.type + '</span>';
                if (c.type === 'adb') {
                    if (c.address) html += '<span class="detail-label">地址:</span><span>' + c.address + '</span>';
                    if (c.screencapMethods) html += '<span class="detail-label">截图:</span><span>' + c.screencapMethods.join(', ') + '</span>';
                    if (c.inputMethods) html += '<span class="detail-label">输入:</span><span>' + c.inputMethods.join(', ') + '</span>';
                } else {
                    if (c.screencapMethod) html += '<span class="detail-label">截图:</span><span>' + c.screencapMethod + '</span>';
                    if (c.mouseMethod) html += '<span class="detail-label">鼠标:</span><span>' + c.mouseMethod + '</span>';
                    if (c.keyboardMethod) html += '<span class="detail-label">键盘:</span><span>' + c.keyboardMethod + '</span>';
                }
                html += '</div></div>';
            }
            
            if (!state.selectedNodeId) {
                // 任务概览
                html += '<div class="detail-section"><h3>任务概览</h3><div class="detail-grid">';
                html += '<span class="detail-label">入口:</span><span>' + escapeHtml(task.entry) + '</span>';
                html += '<span class="detail-label">状态:</span><span>' + task.status + '</span>';
                html += '<span class="detail-label">开始:</span><span>' + task.start_time + '</span>';
                html += '<span class="detail-label">结束:</span><span>' + (task.end_time || '-') + '</span>';
                html += '<span class="detail-label">耗时:</span><span>' + (task.duration ? formatDuration(task.duration) : '-') + '</span>';
                html += '<span class="detail-label">节点数:</span><span>' + task.nodes.length + '</span>';
                html += '</div></div>';
                
                // 节点统计
                const successCount = task.nodes.filter(n => n.status === 'success').length;
                html += '<div class="detail-section"><h3>节点统计</h3><div class="detail-grid">';
                html += '<span class="detail-label">成功:</span><span style="color:#2ea043">' + successCount + '</span>';
                html += '<span class="detail-label">失败:</span><span style="color:#f85149">' + (task.nodes.length - successCount) + '</span>';
                html += '</div></div>';
            } else {
                const node = task.nodes.find(n => n.node_id === state.selectedNodeId);
                if (node) {
                    html += '<div class="detail-section"><h3>节点信息</h3><div class="detail-grid">';
                    html += '<span class="detail-label">名称:</span><span>' + escapeHtml(node.name) + '</span>';
                    html += '<span class="detail-label">状态:</span><span>' + node.status + '</span>';
                    html += '<span class="detail-label">时间:</span><span>' + node.timestamp + '</span>';
                    html += '</div></div>';
                    
                    if (node.reco_details) {
                        html += '<div class="detail-section"><h3>识别详情</h3>';
                        html += '<div class="json-block">' + escapeHtml(JSON.stringify(node.reco_details, null, 2)) + '</div>';
                        html += '</div>';
                    }
                    
                    if (node.action_details) {
                        html += '<div class="detail-section"><h3>动作详情</h3>';
                        html += '<div class="json-block">' + escapeHtml(JSON.stringify(node.action_details, null, 2)) + '</div>';
                        html += '</div>';
                    }
                    
                    if (node.recognition_attempts && node.recognition_attempts.length > 0) {
                        html += '<div class="detail-section"><h3>识别尝试 (' + node.recognition_attempts.length + ')</h3>';
                        html += '<div class="json-block">' + escapeHtml(JSON.stringify(node.recognition_attempts, null, 2)) + '</div>';
                        html += '</div>';
                    }
                }
            }
            
            detailContent.innerHTML = html;
        }
        
        function selectTask(key) {
            vscode.postMessage({ type: 'selectTask', payload: key });
        }
        
        function selectNode(nodeId) {
            vscode.postMessage({ type: 'selectNode', payload: nodeId });
        }
        
        function formatDuration(ms) {
            if (ms < 1000) return ms + 'ms';
            if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
            return (ms / 60000).toFixed(1) + 'm';
        }
        
        function escapeHtml(text) {
            if (!text) return '';
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
        
        // 初始化
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = null;
  }
}
