/**
 * @fileoverview RAG 系统配置
 *
 * 定义 RAG 系统的各项配置参数
 *
 * @module config/rag
 */

import type { RAGConfig } from '@/rag/types';

export const RAG_CONFIG: RAGConfig = {
  topK: 5,
  minScore: 0.15,
};

export const VECTOR_STORE_CONFIG = {
  storeFile: 'rag-knowledge.json',
};
