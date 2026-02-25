import * as vscode from "vscode";
import type { TaskInfo, NodeInfo, AuxLogEntry, ControllerInfo, RawLine } from "../types/logTypes";
import { parseLogFile } from "../utils/parse";
import { Logger } from "../utils/logger";

const logger = new Logger("Sidebar");

export interface WebViewMessage {
  type: string;
  payload?: unknown;
}

export interface AppState {
  tasks: TaskInfo[];
  filteredTasks: TaskInfo[];
  rawLines: RawLine[];
  selectedTaskKey: string | null;
  selectedNodeId: number | null;
  selectedProcessId: string;
  selectedThreadId: string;
  hiddenCallers: string[];
  selectedAuxLevels: string[];
  searchQuery: string;
  searchResults: RawLine[];
  parseProgress: number;
  parseState: "ready" | "parsing" | "done" | "error";
  statusMessage: string;
  files: { name: string; size: number }[];
}

export class SidebarWebViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "maaLogs.main";

  private _view?: vscode.WebviewView;
  private context: vscode.ExtensionContext;
  private state: AppState;
  private _onDidChangeTasks = new vscode.EventEmitter<TaskInfo[]>();

  readonly onDidChangeTasks = this._onDidChangeTasks.event;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.state = {
      tasks: [],
      filteredTasks: [],
      rawLines: [],
      selectedTaskKey: null,
      selectedNodeId: null,
      selectedProcessId: "all",
      selectedThreadId: "all",
      hiddenCallers: [],
      selectedAuxLevels: ["error", "warn", "info", "debug"],
      searchQuery: "",
      searchResults: [],
      parseProgress: 0,
      parseState: "ready",
      statusMessage: "请选择日志文件",
      files: [],
    };
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage((message: WebViewMessage) => {
      this.handleMessage(message);
    });

    webviewView.onDidDispose(() => {
      this._view = undefined;
    });
  }

  private handleMessage(message: WebViewMessage): void {
    switch (message.type) {
      case "ready":
        this.updateState();
        break;
      case "selectFiles":
        this.selectFiles();
        break;
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
      case "search":
        this.state.searchQuery = message.payload as string;
        this.search();
        break;
      case "openFile":
        this.openFile(message.payload as { fileName: string; lineNumber: number });
        break;
      case "clearFiles":
        this.clearFiles();
        break;
    }
  }

  public async selectFiles(uris?: vscode.Uri[]): Promise<void> {
    if (!uris) {
      uris = await vscode.window.showOpenDialog({
        canSelectMany: true,
        openLabel: "选择日志文件",
        filters: {
          "Log Files": ["log", "maalog"],
          "JSON Files": ["json", "jsonc"],
          "All Files": ["*"],
        },
      });
    }

    if (!uris || uris.length === 0) {
      return;
    }

    this.state.files = uris.map((uri) => ({
      name: uri.fsPath.split(/[/\\]/).pop() || uri.fsPath,
      size: 0,
    }));
    this.state.parseState = "parsing";
    this.state.statusMessage = "解析中...";
    this.updateState();

    await this.parseFiles(uris);
  }

  private async parseFiles(uris: vscode.Uri[]): Promise<void> {
    const allTasks: TaskInfo[] = [];
    const allRawLines: RawLine[] = [];
    const allControllers: ControllerInfo[] = [];

    for (let i = 0; i < uris.length; i++) {
      const uri = uris[i];
      this.state.parseProgress = Math.round((i / uris.length) * 100);
      this.state.statusMessage = `解析 ${this.state.files[i]?.name || uri.fsPath}...`;
      this.updateState();

      try {
        const content = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(content).toString("utf-8");
        const fileName = uri.fsPath.split(/[/\\]/).pop() || uri.fsPath;

        const result = await parseLogFile(text, fileName);
        allTasks.push(...result.tasks);
        allRawLines.push(...result.rawLines);
        allControllers.push(...result.controllerInfos);
      } catch (error) {
        logger.error("解析文件失败", { file: uri.fsPath, error: String(error) });
      }
    }

    this.state.tasks = allTasks;
    this.state.rawLines = allRawLines;
    this.state.filteredTasks = allTasks;
    this.state.parseProgress = 100;
    this.state.parseState = "done";
    this.state.statusMessage =
      allTasks.length > 0 ? `解析完成，共 ${allTasks.length} 个任务` : "解析完成，未识别到任务";

    this._onDidChangeTasks.fire(allTasks);
    this.updateState();
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

  private search(): void {
    if (!this.state.searchQuery) {
      this.state.searchResults = [];
      this.updateState();
      return;
    }

    const query = this.state.searchQuery.toLowerCase();
    this.state.searchResults = this.state.rawLines
      .filter((line) => line.line.toLowerCase().includes(query))
      .slice(0, 100);

    this.updateState();
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

  private clearFiles(): void {
    this.state = {
      tasks: [],
      filteredTasks: [],
      rawLines: [],
      selectedTaskKey: null,
      selectedNodeId: null,
      selectedProcessId: "all",
      selectedThreadId: "all",
      hiddenCallers: [],
      selectedAuxLevels: ["error", "warn", "info", "debug"],
      searchQuery: "",
      searchResults: [],
      parseProgress: 0,
      parseState: "ready",
      statusMessage: "请选择日志文件",
      files: [],
    };
    this.updateState();
  }

  private updateState(): void {
    if (this._view) {
      this._view.webview.postMessage({
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
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._view?.webview.cspSource || ""} 'unsafe-inline'; script-src ${this._view?.webview.cspSource || ""} 'unsafe-inline';">
    <title>MaaLogs</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        
        .header {
            padding: 12px;
            background: var(--vscode-sideBarSectionHeader-background);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .header-title {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        
        .header-actions {
            display: flex;
            gap: 8px;
        }
        
        .btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .btn-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        
        .status-bar {
            padding: 6px 12px;
            background: var(--vscode-statusBar-background);
            color: var(--vscode-statusBar-foreground);
            font-size: 11px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .progress-bar {
            height: 2px;
            background: var(--vscode-progressBar-background);
            width: 100%;
        }
        
        .progress-fill {
            height: 100%;
            background: var(--vscode-progressBar-foreground);
            transition: width 0.3s;
        }
        
        .toolbar {
            padding: 8px 12px;
            background: var(--vscode-editorGroupHeader-tabsBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        
        .toolbar-item {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .toolbar-label {
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
        }
        
        select, input[type="text"] {
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 3px 6px;
            border-radius: 2px;
            font-size: 11px;
            min-width: 80px;
            max-width: 120px;
        }
        
        select:focus, input:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        
        .main-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        
        .tabs {
            display: flex;
            background: var(--vscode-editorGroupHeader-tabsBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .tab {
            padding: 8px 16px;
            font-size: 12px;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            color: var(--vscode-descriptionForeground);
        }
        
        .tab:hover {
            color: var(--vscode-foreground);
        }
        
        .tab.active {
            color: var(--vscode-foreground);
            border-bottom-color: var(--vscode-panel-activeTitleForeground);
        }
        
        .tab-content {
            flex: 1;
            display: flex;
            overflow: hidden;
        }
        
        .tab-content.hidden {
            display: none;
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
            padding: 6px 10px;
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
        
        .task-panel { width: 180px; min-width: 140px; }
        .node-panel { width: 160px; min-width: 120px; }
        .detail-panel { flex: 1; min-width: 200px; }
        
        .task-item, .node-item {
            padding: 8px 10px;
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
            font-size: 12px;
            margin-bottom: 2px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .task-meta {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            gap: 8px;
        }
        
        .status-badge {
            display: inline-block;
            padding: 1px 4px;
            border-radius: 2px;
            font-size: 9px;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .status-succeeded { background: #2ea043; color: white; }
        .status-failed { background: #f85149; color: white; }
        .status-running { background: #f0883e; color: white; }
        
        .node-name {
            font-weight: 500;
            font-size: 11px;
            margin-bottom: 2px;
        }
        
        .node-time {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
        }
        
        .detail-section {
            padding: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .detail-section h3 {
            font-size: 11px;
            font-weight: 600;
            margin-bottom: 6px;
            color: var(--vscode-foreground);
        }
        
        .detail-grid {
            display: grid;
            grid-template-columns: 70px 1fr;
            gap: 2px 8px;
            font-size: 11px;
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
            padding: 6px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            font-size: 10px;
            overflow-x: auto;
            white-space: pre-wrap;
            word-break: break-all;
            max-height: 150px;
            overflow-y: auto;
        }
        
        .controller-info {
            background: var(--vscode-textBlockQuote-background);
            padding: 8px 10px;
            margin: 8px 10px;
            border-radius: 3px;
            font-size: 10px;
        }
        
        .controller-info h4 {
            font-size: 10px;
            margin-bottom: 4px;
        }
        
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            padding: 20px;
            text-align: center;
        }
        
        .empty-state-icon {
            font-size: 32px;
            margin-bottom: 12px;
            opacity: 0.5;
        }
        
        .search-result-item {
            padding: 6px 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 11px;
            cursor: pointer;
        }
        
        .search-result-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        
        .search-result-line {
            font-family: var(--vscode-editor-font-family);
            font-size: 10px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .search-result-meta {
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
        }
        
        .file-list {
            padding: 8px 10px;
        }
        
        .file-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 0;
            font-size: 11px;
        }
        
        .file-name {
            color: var(--vscode-foreground);
        }
        
        .file-size {
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
        }
        
        .stat-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            padding: 10px;
        }
        
        .stat-card {
            background: var(--vscode-editorGroupHeader-tabsBackground);
            padding: 10px;
            border-radius: 4px;
            text-align: center;
        }
        
        .stat-value {
            font-size: 20px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }
        
        .stat-label {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-title">📋 MaaLogs 日志分析</div>
        <div class="header-actions">
            <button class="btn" onclick="selectFiles()">📁 选择文件</button>
            <button class="btn btn-secondary" onclick="clearFiles()">🗑️ 清空</button>
        </div>
    </div>
    
    <div class="progress-bar">
        <div class="progress-fill" id="progressFill" style="width: 0%"></div>
    </div>
    
    <div class="status-bar">
        <span id="statusMessage">请选择日志文件</span>
        <span id="taskCount">0 任务</span>
    </div>
    
    <div class="toolbar" id="toolbar">
        <div class="toolbar-item">
            <span class="toolbar-label">进程:</span>
            <select id="processSelect" onchange="setProcessId(this.value)">
                <option value="all">全部</option>
            </select>
        </div>
        <div class="toolbar-item">
            <span class="toolbar-label">线程:</span>
            <select id="threadSelect" onchange="setThreadId(this.value)">
                <option value="all">全部</option>
            </select>
        </div>
    </div>
    
    <div class="main-content">
        <div class="tabs">
            <div class="tab active" onclick="switchTab('tasks')">任务</div>
            <div class="tab" onclick="switchTab('search')">搜索</div>
            <div class="tab" onclick="switchTab('stats')">统计</div>
        </div>
        
        <div class="tab-content" id="tasksTab">
            <div class="panel task-panel">
                <div class="panel-header">任务列表</div>
                <div class="panel-content" id="taskList">
                    <div class="empty-state">
                        <div class="empty-state-icon">📭</div>
                        <div>选择日志文件开始分析</div>
                    </div>
                </div>
            </div>
            
            <div class="panel node-panel">
                <div class="panel-header">节点列表</div>
                <div class="panel-content" id="nodeList">
                    <div class="empty-state">
                        <div>选择任务查看节点</div>
                    </div>
                </div>
            </div>
            
            <div class="panel detail-panel">
                <div class="panel-header">详情</div>
                <div class="panel-content" id="detailContent">
                    <div class="empty-state">
                        <div>选择节点查看详情</div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="tab-content hidden" id="searchTab">
            <div style="padding: 8px;">
                <input type="text" id="searchInput" placeholder="搜索日志内容..." style="width: 100%;" onkeyup="if(event.key==='Enter')search()">
            </div>
            <div class="panel-content" id="searchResults" style="flex:1;">
                <div class="empty-state">
                    <div>输入关键词搜索</div>
                </div>
            </div>
        </div>
        
        <div class="tab-content hidden" id="statsTab">
            <div class="stat-grid" id="statsContent">
                <div class="stat-card">
                    <div class="stat-value" id="statTasks">0</div>
                    <div class="stat-label">任务数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="statNodes">0</div>
                    <div class="stat-label">节点数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="statSuccess">0</div>
                    <div class="stat-label">成功</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="statFailed">0</div>
                    <div class="stat-label">失败</div>
                </div>
            </div>
            <div class="file-list" id="fileList"></div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        let state = {
            tasks: [],
            filteredTasks: [],
            rawLines: [],
            selectedTaskKey: null,
            selectedNodeId: null,
            selectedProcessId: 'all',
            selectedThreadId: 'all',
            hiddenCallers: [],
            selectedAuxLevels: ['error', 'warn', 'info', 'debug'],
            searchQuery: '',
            searchResults: [],
            parseProgress: 0,
            parseState: 'ready',
            statusMessage: '请选择日志文件',
            files: []
        };
        
        window.addEventListener('message', (event) => {
            const message = event.data;
            if (message.type === 'updateState') {
                state = message.payload;
                render();
            }
        });
        
        function render() {
            document.getElementById('progressFill').style.width = state.parseProgress + '%';
            document.getElementById('statusMessage').textContent = state.statusMessage;
            document.getElementById('taskCount').textContent = state.filteredTasks.length + ' 任务';
            
            renderProcessOptions();
            renderThreadOptions();
            renderTasks();
            renderNodes();
            renderDetail();
            renderSearch();
            renderStats();
            renderFiles();
        }
        
        function renderProcessOptions() {
            const processes = new Map();
            state.tasks.forEach(t => {
                if (!processes.has(t.processId)) processes.set(t.processId, 0);
                processes.set(t.processId, processes.get(t.processId) + 1);
            });
            
            const select = document.getElementById('processSelect');
            select.innerHTML = '<option value="all">全部</option>';
            processes.forEach((count, id) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = id + ' (' + count + ')';
                if (id === state.selectedProcessId) option.selected = true;
                select.appendChild(option);
            });
        }
        
        function renderThreadOptions() {
            const threads = new Map();
            state.filteredTasks.forEach(t => {
                if (!threads.has(t.threadId)) threads.set(t.threadId, 0);
                threads.set(t.threadId, threads.get(t.threadId) + 1);
            });
            
            const select = document.getElementById('threadSelect');
            select.innerHTML = '<option value="all">全部</option>';
            threads.forEach((count, id) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = id + ' (' + count + ')';
                if (id === state.selectedThreadId) option.selected = true;
                select.appendChild(option);
            });
        }
        
        function renderTasks() {
            const container = document.getElementById('taskList');
            
            if (state.filteredTasks.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><div>' + (state.parseState === 'ready' ? '选择日志文件开始分析' : '无任务') + '</div></div>';
                return;
            }
            
            container.innerHTML = state.filteredTasks.map(task => {
                const statusClass = 'status-' + task.status;
                const selectedClass = task.key === state.selectedTaskKey ? ' selected' : '';
                const duration = task.duration ? formatDuration(task.duration) : '-';
                
                return '<div class="task-item' + selectedClass + '" onclick="selectTask(\\'' + task.key + '\\')">' +
                    '<div class="task-entry">' + escapeHtml(task.entry) + ' <span class="status-badge ' + statusClass + '">' + task.status + '</span></div>' +
                    '<div class="task-meta">' +
                        '<span>' + (task.start_time.split(' ')[1] || task.start_time.split('T')[1] || task.start_time) + '</span>' +
                        '<span>' + duration + '</span>' +
                    '</div>' +
                '</div>';
            }).join('');
        }
        
        function renderNodes() {
            const container = document.getElementById('nodeList');
            
            if (!state.selectedTaskKey) {
                container.innerHTML = '<div class="empty-state"><div>选择任务查看节点</div></div>';
                return;
            }
            
            const task = state.tasks.find(t => t.key === state.selectedTaskKey);
            if (!task || task.nodes.length === 0) {
                container.innerHTML = '<div class="empty-state"><div>无节点</div></div>';
                return;
            }
            
            container.innerHTML = task.nodes.map(node => {
                const selectedClass = node.node_id === state.selectedNodeId ? ' selected' : '';
                const statusIcon = node.status === 'success' ? '✓' : '✗';
                
                return '<div class="node-item' + selectedClass + '" onclick="selectNode(' + node.node_id + ')">' +
                    '<div class="node-name">' + statusIcon + ' ' + escapeHtml(node.name) + '</div>' +
                    '<div class="node-time">' + node.timestamp + '</div>' +
                '</div>';
            }).join('');
        }
        
        function renderDetail() {
            const container = document.getElementById('detailContent');
            
            if (!state.selectedTaskKey) {
                container.innerHTML = '<div class="empty-state"><div>选择节点查看详情</div></div>';
                return;
            }
            
            const task = state.tasks.find(t => t.key === state.selectedTaskKey);
            if (!task) {
                container.innerHTML = '<div class="empty-state"><div>任务未找到</div></div>';
                return;
            }
            
            let html = '';
            
            if (task.controllerInfo) {
                const c = task.controllerInfo;
                html += '<div class="controller-info"><h4>控制器</h4><div class="detail-grid">';
                html += '<span class="detail-label">类型:</span><span>' + c.type + '</span>';
                if (c.type === 'adb') {
                    if (c.address) html += '<span class="detail-label">地址:</span><span>' + c.address + '</span>';
                    if (c.screencapMethods) html += '<span class="detail-label">截图:</span><span>' + c.screencapMethods.join(', ') + '</span>';
                } else {
                    if (c.screencapMethod) html += '<span class="detail-label">截图:</span><span>' + c.screencapMethod + '</span>';
                }
                html += '</div></div>';
            }
            
            if (!state.selectedNodeId) {
                html += '<div class="detail-section"><h3>任务概览</h3><div class="detail-grid">';
                html += '<span class="detail-label">入口:</span><span>' + escapeHtml(task.entry) + '</span>';
                html += '<span class="detail-label">状态:</span><span>' + task.status + '</span>';
                html += '<span class="detail-label">耗时:</span><span>' + (task.duration ? formatDuration(task.duration) : '-') + '</span>';
                html += '<span class="detail-label">节点:</span><span>' + task.nodes.length + '</span>';
                html += '</div></div>';
            } else {
                const node = task.nodes.find(n => n.node_id === state.selectedNodeId);
                if (node) {
                    html += '<div class="detail-section"><h3>节点信息</h3><div class="detail-grid">';
                    html += '<span class="detail-label">名称:</span><span>' + escapeHtml(node.name) + '</span>';
                    html += '<span class="detail-label">状态:</span><span>' + node.status + '</span>';
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
                }
            }
            
            container.innerHTML = html;
        }
        
        function renderSearch() {
            const container = document.getElementById('searchResults');
            
            if (state.searchResults.length === 0) {
                container.innerHTML = '<div class="empty-state"><div>' + (state.searchQuery ? '无匹配结果' : '输入关键词搜索') + '</div></div>';
                return;
            }
            
            container.innerHTML = state.searchResults.map(r => 
                '<div class="search-result-item" onclick="openFile(\\'' + r.fileName + '\\', ' + r.lineNumber + ')">' +
                    '<div class="search-result-line">' + escapeHtml(r.line.substring(0, 100)) + '</div>' +
                    '<div class="search-result-meta">' + r.fileName + ':' + r.lineNumber + '</div>' +
                '</div>'
            ).join('');
        }
        
        function renderStats() {
            const totalNodes = state.tasks.reduce((sum, t) => sum + t.nodes.length, 0);
            const successTasks = state.tasks.filter(t => t.status === 'succeeded').length;
            const failedTasks = state.tasks.filter(t => t.status === 'failed').length;
            
            document.getElementById('statTasks').textContent = state.tasks.length;
            document.getElementById('statNodes').textContent = totalNodes;
            document.getElementById('statSuccess').textContent = successTasks;
            document.getElementById('statFailed').textContent = failedTasks;
        }
        
        function renderFiles() {
            const container = document.getElementById('fileList');
            if (state.files.length === 0) {
                container.innerHTML = '';
                return;
            }
            
            container.innerHTML = '<div class="detail-section"><h3>已加载文件</h3>' +
                state.files.map(f => '<div class="file-item"><span class="file-name">' + escapeHtml(f.name) + '</span></div>').join('') +
            '</div>';
        }
        
        function switchTab(tabName) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
            
            event.target.classList.add('active');
            document.getElementById(tabName + 'Tab').classList.remove('hidden');
        }
        
        function selectFiles() { vscode.postMessage({ type: 'selectFiles' }); }
        function clearFiles() { vscode.postMessage({ type: 'clearFiles' }); }
        function selectTask(key) { vscode.postMessage({ type: 'selectTask', payload: key }); }
        function selectNode(id) { vscode.postMessage({ type: 'selectNode', payload: id }); }
        function setProcessId(id) { vscode.postMessage({ type: 'setProcessId', payload: id }); }
        function setThreadId(id) { vscode.postMessage({ type: 'setThreadId', payload: id }); }
        function search() { vscode.postMessage({ type: 'search', payload: document.getElementById('searchInput').value }); }
        function openFile(fileName, lineNumber) { vscode.postMessage({ type: 'openFile', payload: { fileName, lineNumber } }); }
        
        function formatDuration(ms) {
            if (!ms) return '-';
            if (ms < 1000) return ms + 'ms';
            if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
            return (ms / 60000).toFixed(1) + 'm';
        }
        
        function escapeHtml(text) {
            if (!text) return '';
            return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
        
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
  }
}
