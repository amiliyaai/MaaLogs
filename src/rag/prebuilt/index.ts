/**
 * @fileoverview 预构建知识库加载器
 *
 * 加载预构建的向量数据到向量存储
 * 如果预构建数据不存在，使用内置最小知识集作为兜底
 *
 * @module rag/prebuilt/loader
 */

import prebuiltKnowledge from './knowledge';
import minimalKnowledge from './minimal';
import { getVectorStore } from '@/rag/vectorStore';
import type { PrebuiltKnowledge, TextChunk } from '@/rag/types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('RAG-Prebuilt');

export function getPrebuiltKnowledge(): PrebuiltKnowledge {
  return prebuiltKnowledge as PrebuiltKnowledge;
}

export function getMinimalKnowledge(): PrebuiltKnowledge {
  return minimalKnowledge;
}

export function hasPrebuiltKnowledge(): boolean {
  const knowledge = getPrebuiltKnowledge();
  return knowledge.chunks.length > 0;
}

export function getPrebuiltKnowledgeInfo(): {
  version: string;
  createdAt: string;
  totalChunks: number;
  sources: string[];
  isMinimal: boolean;
} {
  const knowledge = hasPrebuiltKnowledge() ? getPrebuiltKnowledge() : getMinimalKnowledge();
  return {
    version: knowledge.version,
    createdAt: knowledge.createdAt,
    totalChunks: knowledge.metadata.totalChunks,
    sources: knowledge.metadata.sources,
    isMinimal: !hasPrebuiltKnowledge(),
  };
}

export async function loadPrebuiltKnowledge(
  onProgress?: (current: number, total: number) => void
): Promise<{ count: number; isMinimal: boolean }> {
  const useMinimal = !hasPrebuiltKnowledge();
  const knowledge = useMinimal ? getMinimalKnowledge() : getPrebuiltKnowledge();

  if (knowledge.chunks.length === 0) {
    logger.warn('No knowledge available');
    return { count: 0, isMinimal: true };
  }

  const vectorStore = getVectorStore();
  await vectorStore.initialize();

  const total = knowledge.chunks.length;
  onProgress?.(0, total);

  let loaded = 0;
  for (const chunk of knowledge.chunks) {
    const textChunk: TextChunk = {
      id: chunk.id,
      text: chunk.text,
      embedding: chunk.embedding,
      metadata: {
        source: chunk.metadata.source,
        sourceType: chunk.metadata.sourceType,
        title: chunk.metadata.title,
        category: chunk.metadata.category,
      },
      createdAt: chunk.createdAt,
    };

    await vectorStore.addChunk(textChunk);
    loaded++;
    onProgress?.(loaded, total);
  }

  logger.info('Knowledge loaded', { count: loaded, isMinimal: useMinimal });
  return { count: loaded, isMinimal: useMinimal };
}
