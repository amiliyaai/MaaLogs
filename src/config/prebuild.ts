/**
 * @fileoverview 预构建知识库配置
 *
 * @module config/prebuild
 */

export interface DocsSource {
  type: 'local' | 'github';
  path?: string;
  paths?: string[];
  repo?: string;
  branch?: string;
  docsPath?: string;
  docsPaths?: string[];
}

export interface PrebuildConfig {
  sources: DocsSource[];
  outputFile: string;
  cacheFile: string;
  embeddingModel: string;
  embeddingDimension: number;
  chunkSize: number;
  chunkOverlap: number;
  minChunkSize: number;
}

export const prebuildConfig: PrebuildConfig = {
  sources: [
    { 
        type: 'local', 
        paths: ['src/rag/prebuilt/knowledge-base']  
    },
    { 
        type: 'github', 
        repo: 'MaaXYZ/MaaFramework', 
        branch: 'main', 
        docsPaths: ['docs/zh_cn']  
    },
    { 
        type: 'github', 
        repo: 'MaaEnd/MaaEnd', 
        branch: 'main', 
        docsPaths: ['docs', 'assets/resource/pipeline', 'agent/go-service']  
    },
    { 
        type: 'github', 
        repo: 'MAA1999/M9A', 
        branch: 'main', 
        docsPaths: ['docs/zh_cn', 'assets/resource/base/pipeline']  
    },
  ],
  outputFile: 'src/rag/prebuilt/knowledge.ts',
  cacheFile: 'src/rag/prebuilt/.cache.json',
  embeddingModel: 'Xenova/all-MiniLM-L6-v2',
  embeddingDimension: 384,
  chunkSize: 600,
  chunkOverlap: 80,
  minChunkSize: 50,
};
