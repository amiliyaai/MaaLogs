/**
 * @fileoverview 向量化服务
 *
 * 使用 transformers.js 生成语义向量
 *
 * @module scripts/embedding-service
 */

import { pipeline, env } from '@huggingface/transformers';
import type { PrebuildConfig } from '../src/config/prebuild';

export class EmbeddingService {
  private extractor: Awaited<ReturnType<typeof pipeline>> | null = null;
  private config: PrebuildConfig;
  private initialized = false;

  constructor(config: PrebuildConfig) {
    this.config = config;
  }

  async initialize(onProgress?: (progress: number, status: string) => void): Promise<void> {
    if (this.initialized) {
      return;
    }

    const hfMirror = process.env.HF_MIRROR || 'https://huggingface.co';
    
    env.allowLocalModels = false;
    env.remoteHost = hfMirror;
    env.remotePathTemplate = '{model}/resolve/{revision}/';

    console.log(`Loading model from: ${env.remoteHost}`);
    onProgress?.(0, '加载向量化模型...');

    try {
      this.extractor = await pipeline('feature-extraction', this.config.embeddingModel, {
        progress_callback: (progress: { status: string; progress?: number }) => {
          if (progress.progress !== undefined) {
            const percent = Math.round(progress.progress);
            onProgress?.(percent, progress.status);
          }
        },
      });

      this.initialized = true;
      onProgress?.(100, '模型加载完成');
    } catch (error) {
      console.error('Failed to load embedding model:', error);
      throw error;
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.extractor) {
      throw new Error('Embedding service not initialized');
    }

    const result = await this.extractor(text, {
      pooling: 'mean',
      normalize: true,
    });

    return Array.from(result.data as Float32Array);
  }

  async embedBatch(texts: string[], onProgress?: (current: number, total: number) => void): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i++) {
      const embedding = await this.embed(texts[i]);
      embeddings.push(embedding);
      onProgress?.(i + 1, texts.length);
    }

    return embeddings;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
