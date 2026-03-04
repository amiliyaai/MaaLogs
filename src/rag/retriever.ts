/**
 * @fileoverview 知识检索器
 *
 * 基于向量相似度检索相关知识
 *
 * @module rag/retriever
 */

import { RAG_CONFIG } from '@/config/rag';
import { getVectorStore, VectorStore } from '@/rag/vectorStore';
import type { RetrievalResult, RetrieveOptions } from '@/rag/types';

let retrieverInstance: Retriever | null = null;

export class Retriever {
  private vectorStore: VectorStore;
  private topK: number;
  private minScore: number;

  constructor(vectorStore: VectorStore = getVectorStore(), topK = RAG_CONFIG.topK, minScore = RAG_CONFIG.minScore) {
    this.vectorStore = vectorStore;
    this.topK = topK;
    this.minScore = minScore;
  }

  static getInstance(): Retriever {
    if (!retrieverInstance) {
      retrieverInstance = new Retriever();
    }
    return retrieverInstance;
  }

  async retrieve(query: string, options?: RetrieveOptions): Promise<RetrievalResult[]> {
    const topK = options?.topK ?? this.topK;
    const minScore = options?.minScore ?? this.minScore;

    const chunks = this.vectorStore.getAllChunks();
    const results: RetrievalResult[] = [];

    for (const chunk of chunks) {
      if (!chunk.embedding || chunk.embedding.length === 0) {
        continue;
      }

      const score = this.keywordMatchScore(chunk.text, query);

      if (score >= minScore) {
        results.push({ chunk, score });
      }
    }

    results.sort((a, b) => b.score - a.score);

    return results.slice(0, topK);
  }

  private keywordMatchScore(text: string, query: string): number {
    const textLower = text.toLowerCase();
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 1);

    let score = 0;

    if (textLower.includes(queryLower)) {
      score += 0.8;
    }

    for (const term of queryTerms) {
      if (textLower.includes(term)) {
        score += 0.1;
      }
    }

    const words = textLower.split(/\s+/);
    for (const term of queryTerms) {
      for (const word of words) {
        if (word.includes(term) || term.includes(word)) {
          score += 0.02;
        }
      }
    }

    return Math.min(score, 1);
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export function getRetriever(): Retriever {
  return Retriever.getInstance();
}

export async function retrieve(query: string, options?: RetrieveOptions): Promise<RetrievalResult[]> {
  return getRetriever().retrieve(query, options);
}
