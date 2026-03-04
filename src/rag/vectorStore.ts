/**
 * @fileoverview 向量存储
 *
 * 使用 Tauri Store 存储文本块和向量数据
 *
 * @module rag/vectorStore
 */

import { Store } from '@tauri-apps/plugin-store';
import { VECTOR_STORE_CONFIG } from '@/config/rag';
import type { TextChunk } from '@/rag/types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('RAG-VectorStore');

let storeInstance: VectorStore | null = null;

export class VectorStore {
  private store: Store | null = null;
  private chunks: Record<string, TextChunk> = {};
  private initialized = false;

  static getInstance(): VectorStore {
    if (!storeInstance) {
      storeInstance = new VectorStore();
    }
    return storeInstance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.store = await Store.load(VECTOR_STORE_CONFIG.storeFile, {
        autoSave: 1000,
        defaults: {
          metadata: {
            version: '1.0.0',
            lastUpdated: new Date().toISOString(),
            totalChunks: 0,
          },
          chunks: {},
        },
      });

      await this.loadFromStore();
      this.initialized = true;
      logger.info('VectorStore initialized', { chunkCount: Object.keys(this.chunks).length });
    } catch (error) {
      logger.error('Failed to initialize VectorStore', { error });
      throw new Error(`向量存储初始化失败: ${error}`);
    }
  }

  private async loadFromStore(): Promise<void> {
    if (!this.store) return;

    const data = await this.store.get<Record<string, TextChunk>>('chunks');
    if (data) {
      this.chunks = data;
    }
  }

  async addChunk(chunk: TextChunk): Promise<void> {
    this.chunks[chunk.id] = chunk;
    await this.saveToStore();
  }

  async addChunks(chunks: TextChunk[]): Promise<void> {
    for (const chunk of chunks) {
      this.chunks[chunk.id] = chunk;
    }
    await this.saveToStore();
  }

  async getChunk(id: string): Promise<TextChunk | null> {
    return this.chunks[id] || null;
  }

  getAllChunks(): TextChunk[] {
    return Object.values(this.chunks);
  }

  async clear(): Promise<void> {
    this.chunks = {};
    await this.saveToStore();
    logger.info('VectorStore cleared');
  }

  private async saveToStore(): Promise<void> {
    if (!this.store) return;

    await this.store.set('chunks', this.chunks);
    await this.store.set('metadata', {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      totalChunks: Object.keys(this.chunks).length,
    });
  }

  getStats(): { totalChunks: number; bySource: Record<string, number> } {
    const bySource: Record<string, number> = {};

    for (const chunk of Object.values(this.chunks)) {
      const source = chunk.metadata.sourceType;
      bySource[source] = (bySource[source] || 0) + 1;
    }

    return {
      totalChunks: Object.keys(this.chunks).length,
      bySource,
    };
  }

  hasChunks(): boolean {
    return Object.keys(this.chunks).length > 0;
  }
}

export function getVectorStore(): VectorStore {
  return VectorStore.getInstance();
}
