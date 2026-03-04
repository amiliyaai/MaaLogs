/**
 * @fileoverview 缓存管理
 *
 * 管理文件哈希缓存和已生成的 chunks，实现增量更新
 *
 * @module scripts/cache-manager
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { createHash } from 'crypto';
import { stat } from 'fs/promises';
import type { TextChunk } from '../src/rag/types';

export interface FileCache {
  path: string;
  hash: string;
  mtime: number;
  chunks: TextChunk[];
}

export interface CacheData {
  version: string;
  lastUpdated: string;
  files: Record<string, FileCache>;
}

export class CacheManager {
  private cacheFile: string;
  private cache: CacheData;

  constructor(cacheFile: string) {
    this.cacheFile = cacheFile;
    this.cache = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      files: {},
    };
  }

  async load(): Promise<void> {
    if (existsSync(this.cacheFile)) {
      try {
        const data = await readFile(this.cacheFile, 'utf-8');
        this.cache = JSON.parse(data);
      } catch {
        console.warn('Failed to load cache, starting fresh');
      }
    }
  }

  async save(): Promise<void> {
    this.cache.lastUpdated = new Date().toISOString();
    await writeFile(this.cacheFile, JSON.stringify(this.cache, null, 2), 'utf-8');
  }

  async getFileHash(filePath: string): Promise<string> {
    const content = await readFile(filePath, 'utf-8');
    return createHash('sha256').update(content).digest('hex');
  }

  async getMtime(filePath: string): Promise<number> {
    const stats = await stat(filePath);
    return stats.mtimeMs;
  }

  async needsUpdate(filePath: string): Promise<boolean> {
    const cached = this.cache.files[filePath];
    if (!cached) {
      return true;
    }

    const currentMtime = await this.getMtime(filePath);
    if (currentMtime !== cached.mtime) {
      const currentHash = await this.getFileHash(filePath);
      return currentHash !== cached.hash;
    }

    return false;
  }

  async updateFile(filePath: string, chunks: TextChunk[]): Promise<void> {
    const hash = await this.getFileHash(filePath);
    const mtime = await this.getMtime(filePath);

    this.cache.files[filePath] = {
      path: filePath,
      hash,
      mtime,
      chunks,
    };
  }

  removeFile(filePath: string): void {
    delete this.cache.files[filePath];
  }

  getCachedChunks(filePath: string): TextChunk[] {
    return this.cache.files[filePath]?.chunks || [];
  }

  getAllCachedFiles(): string[] {
    return Object.keys(this.cache.files);
  }

  getAllChunks(): TextChunk[] {
    const allChunks: TextChunk[] = [];
    for (const fileCache of Object.values(this.cache.files)) {
      allChunks.push(...fileCache.chunks);
    }
    return allChunks;
  }

  getStats(): { totalFiles: number; totalChunks: number; lastUpdated: string } {
    let totalChunks = 0;
    for (const fileCache of Object.values(this.cache.files)) {
      totalChunks += fileCache.chunks.length;
    }

    return {
      totalFiles: Object.keys(this.cache.files).length,
      totalChunks,
      lastUpdated: this.cache.lastUpdated,
    };
  }
}
