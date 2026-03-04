/**
 * @fileoverview RAG 管理器
 *
 * 整合存储、检索功能
 * 使用预构建知识库，内置最小集作为兜底
 *
 * @module rag/manager
 */

import { getVectorStore, VectorStore } from '@/rag/vectorStore';
import { getRetriever, Retriever } from '@/rag/retriever';
import { loadPrebuiltKnowledge, getPrebuiltKnowledgeInfo } from '@/rag/prebuilt';
import { createLogger } from '@/utils/logger';
import type { RetrievalResult, RAGStatus, IndexProgress, IndexProgressCallback, RetrieveOptions } from '@/rag/types';

const logger = createLogger('RAG-Manager');

let managerInstance: RAGManager | null = null;

export class RAGManager {
  private vectorStore: VectorStore;
  private retriever: Retriever;
  private initialized = false;
  private isMinimal = false;

  constructor(vectorStore: VectorStore = getVectorStore(), retriever: Retriever = getRetriever()) {
    this.vectorStore = vectorStore;
    this.retriever = retriever;
  }

  static getInstance(): RAGManager {
    if (!managerInstance) {
      managerInstance = new RAGManager();
    }
    return managerInstance;
  }

  async initialize(onProgress?: IndexProgressCallback): Promise<void> {
    if (this.initialized) {
      return;
    }

    const progress: IndexProgress = { current: 0, total: 100, status: '初始化中...' };
    onProgress?.(progress);

    progress.status = '初始化向量存储...';
    progress.current = 10;
    onProgress?.(progress);
    await this.vectorStore.initialize();

    progress.status = '加载知识库...';
    progress.current = 20;
    onProgress?.(progress);

    const info = getPrebuiltKnowledgeInfo();
    logger.info('Loading knowledge', info);

    const result = await loadPrebuiltKnowledge((current, total) => {
      progress.current = 20 + Math.round((current / total) * 70);
      progress.status = `加载知识库 (${current}/${total})...`;
      onProgress?.(progress);
    });

    this.isMinimal = result.isMinimal;

    progress.status = '初始化完成';
    progress.current = 100;
    onProgress?.(progress);

    this.initialized = true;
    logger.info('RAG Manager initialized', { isMinimal: this.isMinimal });
  }

  async retrieve(query: string, options?: RetrieveOptions): Promise<RetrievalResult[]> {
    if (!this.initialized) {
      throw new Error('RAG 系统未初始化，请先调用 initialize()');
    }

    return this.retriever.retrieve(query, options);
  }

  async clearIndex(): Promise<void> {
    await this.vectorStore.clear();
    logger.info('RAG index cleared');
  }

  getStatus(): RAGStatus {
    const stats = this.vectorStore.getStats();
    return {
      initialized: this.initialized,
      chunkCount: stats.totalChunks,
      lastUpdated: new Date().toISOString(),
    };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  isUsingMinimal(): boolean {
    return this.isMinimal;
  }
}

export function getRAGManager(): RAGManager {
  return RAGManager.getInstance();
}

export async function initializeRAG(onProgress?: IndexProgressCallback): Promise<RAGManager> {
  const manager = getRAGManager();
  await manager.initialize(onProgress);
  return manager;
}

export async function retrieve(query: string, options?: RetrieveOptions): Promise<RetrievalResult[]> {
  return getRAGManager().retrieve(query, options);
}
