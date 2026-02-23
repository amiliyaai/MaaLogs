import * as vscode from 'vscode';

export class Logger {
  private outputChannel: vscode.OutputChannel;
  private module: string;

  constructor(module: string) {
    this.module = module;
    this.outputChannel = vscode.window.createOutputChannel(`MaaLogs: ${module}`);
  }

  private formatMessage(level: string, message: string, data?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    let formatted = `[${timestamp}][${level}][${this.module}] ${message}`;
    if (data && Object.keys(data).length > 0) {
      formatted += ` ${JSON.stringify(data)}`;
    }
    return formatted;
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.outputChannel.appendLine(this.formatMessage('DEBUG', message, data));
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.outputChannel.appendLine(this.formatMessage('INFO', message, data));
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.outputChannel.appendLine(this.formatMessage('WARN', message, data));
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.outputChannel.appendLine(this.formatMessage('ERROR', message, data));
  }

  show(): void {
    this.outputChannel.show();
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}

export function createLogger(module: string): Logger {
  return new Logger(module);
}
