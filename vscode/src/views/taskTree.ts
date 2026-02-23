import * as vscode from 'vscode';
import type { TaskInfo, NodeInfo } from '../types/logTypes';
import { MaaLogsProvider } from '../providers/extensionProvider';

export class TaskTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private provider: MaaLogsProvider) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeItem): Thenable<TreeItem[]> {
        if (!element) {
            return Promise.resolve(this.getTaskItems());
        }

        if (element.contextValue === 'task') {
            return Promise.resolve(this.getNodeItems(element.taskKey!));
        }

        return Promise.resolve([]);
    }

    private getTaskItems(): TreeItem[] {
        const tasks = this.provider.tasks;
        return tasks.map(task => {
            const statusIcon = task.status === 'succeeded' ? '✓' : 
                              task.status === 'failed' ? '✗' : '○';
            
            const item = new TreeItem(
                `${statusIcon} ${task.entry}`,
                task.nodes.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
            );
            
            item.taskKey = task.key;
            item.contextValue = 'task';
            item.description = task.duration ? `${task.duration}ms` : '';
            item.tooltip = `任务: ${task.entry}\n状态: ${task.status}\n节点数: ${task.nodes.length}`;
            item.iconPath = new vscode.ThemeIcon(
                task.status === 'succeeded' ? 'check' : 
                task.status === 'failed' ? 'error' : 'loading~spin'
            );
            item.command = {
                command: 'maaLogs.openTask',
                title: '打开任务详情',
                arguments: [task.key]
            };

            return item;
        });
    }

    private getNodeItems(taskKey: string): TreeItem[] {
        const task = this.provider.tasks.find(t => t.key === taskKey);
        if (!task) return [];

        return task.nodes.map(node => {
            const statusIcon = node.status === 'success' ? '✓' : '✗';
            
            const item = new TreeItem(
                `${statusIcon} ${node.name}`,
                vscode.TreeItemCollapsibleState.None
            );
            
            item.nodeKey = `node-${node.node_id}`;
            item.taskKey = taskKey;
            item.contextValue = 'node';
            item.description = node.timestamp;
            item.tooltip = `节点: ${node.name}\n状态: ${node.status}`;
            item.iconPath = new vscode.ThemeIcon(
                node.status === 'success' ? 'check' : 'error'
            );
            item.command = {
                command: 'maaLogs.openNode',
                title: '打开节点详情',
                arguments: [taskKey, `node-${node.node_id}`]
            };

            return item;
        });
    }
}

class TreeItem extends vscode.TreeItem {
    taskKey?: string;
    nodeKey?: string;
    constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState) {
        super(label, collapsibleState);
    }
}
