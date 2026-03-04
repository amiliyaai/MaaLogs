/**
 * @fileoverview GitHub 文档加载器
 *
 * 从 GitHub 仓库获取文档内容
 *
 * @module scripts/github-loader
 */

import type { DocsSource } from '../src/config/prebuild';

const GITHUB_API = 'https://api.github.com';
const GITHUB_RAW = 'https://raw.githubusercontent.com';

export interface GitHubFile {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url: string | null;
}

export class GitHubLoader {
  private token?: string;

  constructor(token?: string) {
    this.token = token || process.env.GITHUB_TOKEN;
  }

  private async fetch<T>(url: string): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async fetchFileContent(repo: string, branch: string, path: string): Promise<string> {
    const [owner, repoName] = repo.split('/');
    const url = `${GITHUB_RAW}/${owner}/${repoName}/${branch}/${path}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${url}`);
    }

    return response.text();
  }

  async listFiles(repo: string, branch: string, path: string): Promise<GitHubFile[]> {
    const [owner, repoName] = repo.split('/');
    const url = `${GITHUB_API}/repos/${owner}/${repoName}/contents/${path}?ref=${branch}`;

    const files = await this.fetch<GitHubFile[]>(url);
    return files;
  }

  async scanDirectory(
    source: DocsSource,
    onProgress?: (status: string) => void
  ): Promise<Map<string, string>> {
    if (source.type !== 'github' || !source.repo || !source.docsPath) {
      throw new Error('Invalid GitHub source');
    }

    const files = new Map<string, string>();
    const branch = source.branch || 'main';

    await this.scanRecursive(source.repo, branch, source.docsPath, files, onProgress);

    return files;
  }

  private async scanRecursive(
    repo: string,
    branch: string,
    path: string,
    files: Map<string, string>,
    onProgress?: (status: string) => void
  ): Promise<void> {
    onProgress?.(`Scanning ${repo}/${path}...`);

    const items = await this.listFiles(repo, branch, path);

    for (const item of items) {
      if (item.type === 'dir') {
        await this.scanRecursive(repo, branch, item.path, files, onProgress);
      } else if (item.type === 'file' && this.isMarkdown(item.name)) {
        onProgress?.(`Fetching ${item.path}...`);

        const content = await this.fetchFileContent(repo, branch, item.path);
        files.set(`${repo}/${item.path}`, content);
      }
    }
  }

  private isMarkdown(filename: string): boolean {
    const ext = filename.toLowerCase().split('.').pop();
    return ['md', 'markdown', 'mdown', 'mkd', 'json', 'go', 'py'].includes(ext || '');
  }
}
