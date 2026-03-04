/**
 * @fileoverview RAG 系统类型定义
 *
 * 定义 RAG（检索增强生成）系统所需的所有类型接口
 *
 * @module rag/types
 */

export interface ChunkMetadata {
  source: string;
  sourceType: string;
  title?: string;
  category?: string;
}

export interface TextChunk {
  id: string;
  text: string;
  embedding: number[];
  metadata: ChunkMetadata;
  createdAt: number;
}

export interface PrebuiltKnowledge {
  version: string;
  createdAt: string;
  chunks: TextChunk[];
  metadata: {
    totalChunks: number;
    sources: string[];
  };
}

export interface RetrievalResult {
  chunk: TextChunk;
  score: number;
}

export interface RAGConfig {
  topK: number;
  minScore: number;
}

export interface RAGStatus {
  initialized: boolean;
  chunkCount: number;
  lastUpdated?: string;
}

export interface IndexProgress {
  current: number;
  total: number;
  status: string;
}

export type IndexProgressCallback = (progress: IndexProgress) => void;

export interface RetrieveOptions {
  topK?: number;
  minScore?: number;
}

export const PREBUILT_KNOWLEDGE_VERSION = '1.0.0';
