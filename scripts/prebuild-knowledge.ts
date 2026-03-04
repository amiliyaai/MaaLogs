/**
 * @fileoverview 预构建知识库脚本
 *
 * 在构建时收集文档并生成向量数据，保存为静态 TypeScript 文件
 *
 * 功能：
 * - 真实向量化：使用 transformers.js 生成语义向量
 * - 配置化目录：支持本地目录和 GitHub 仓库
 * - 增量更新：只处理变更的文件
 *
 * @module scripts/prebuild-knowledge
 */

import { config } from 'dotenv';
config();

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, extname, basename, dirname } from 'path';
import { existsSync } from 'fs';
import { createHash } from 'crypto';
import { prebuildConfig, type PrebuildConfig, type DocsSource } from '../src/config/prebuild';
import { EmbeddingService } from './embedding-service';
import { CacheManager } from './cache-manager';
import { GitHubLoader } from './github-loader';
import type { TextChunk, PrebuiltKnowledge } from '../src/rag/types';

const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd'];
const JSON_EXTENSIONS = ['.json'];
const GO_EXTENSIONS = ['.go'];
const PYTHON_EXTENSIONS = ['.py'];

interface KnowledgeItem {
  id: string;
  category: string;
  title: string;
  content: string;
  sourcePath: string;
  sourceType: string;
  keywords?: string[];
}

class ContentCacheManager extends CacheManager {
  contentCache: Record<string, { hash: string; chunks: TextChunk[] }> = {};

  constructor(cacheFile: string) {
    super(cacheFile);
  }

  async load(): Promise<void> {
    await super.load();
    for (const file of this.getAllCachedFiles()) {
      this.contentCache[file] = {
        hash: this['cache'].files[file].hash,
        chunks: this.getCachedChunks(file),
      };
    }
  }

  getContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  hasContentChanged(sourcePath: string, content: string): boolean {
    const cached = this.contentCache[sourcePath];
    if (!cached) return true;
    const currentHash = this.getContentHash(content);
    return currentHash !== cached.hash;
  }

  getCachedContentChunks(sourcePath: string): TextChunk[] | null {
    return this.contentCache[sourcePath]?.chunks || null;
  }

  updateContentCache(sourcePath: string, content: string, chunks: TextChunk[]): void {
    const hash = this.getContentHash(content);
    this.contentCache[sourcePath] = { hash, chunks };
    this['cache'].files[sourcePath] = {
      path: sourcePath,
      hash,
      mtime: Date.now(),
      chunks,
    };
  }

  getStats(): { totalFiles: number; totalChunks: number; lastUpdated: string; cachedHits: number } {
    const baseStats = super.getStats();
    return {
      ...baseStats,
      cachedHits: Object.keys(this.contentCache).length,
    };
  }
}

async function scanLocalDirectory(dirPath: string, recursive = true): Promise<string[]> {
  const files: string[] = [];

  if (!existsSync(dirPath)) {
    console.log(`Directory not found: ${dirPath}`);
    return files;
  }

  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory() && recursive) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }
      const subFiles = await scanLocalDirectory(fullPath, recursive);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (MARKDOWN_EXTENSIONS.includes(ext) || JSON_EXTENSIONS.includes(ext) || GO_EXTENSIONS.includes(ext) || PYTHON_EXTENSIONS.includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function jsonToReadableText(filePath: string, content: string): string {
  try {
    const json = JSON.parse(content);
    const fileName = basename(filePath, '.json');
    const lines: string[] = [`# ${fileName}`, ''];

    function processObject(obj: Record<string, unknown>, indent = 0): void {
      for (const [key, value] of Object.entries(obj)) {
        const prefix = '  '.repeat(indent);
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          lines.push(`${prefix}## ${key}`);
          processObject(value as Record<string, unknown>, indent + 1);
        } else if (Array.isArray(value)) {
          lines.push(`${prefix}- ${key}: [${value.map((v) => JSON.stringify(v)).join(', ')}]`);
        } else {
          lines.push(`${prefix}- ${key}: ${JSON.stringify(value)}`);
        }
      }
    }

    processObject(json);
    return lines.join('\n');
  } catch {
    return content;
  }
}

function goToReadableText(filePath: string, content: string): string {
  const fileName = basename(filePath, '.go');
  const lines: string[] = [`# ${fileName}`, '', '```go', content, '```'];
  return lines.join('\n');
}

function pythonToReadableText(filePath: string, content: string): string {
  const fileName = basename(filePath, '.py');
  const lines: string[] = [`# ${fileName}`, '', '```python', content, '```'];
  return lines.join('\n');
}

function processFileContent(filePath: string, content: string): string {
  const ext = extname(filePath).toLowerCase();
  if (JSON_EXTENSIONS.includes(ext)) {
    return jsonToReadableText(filePath, content);
  }
  if (GO_EXTENSIONS.includes(ext)) {
    return goToReadableText(filePath, content);
  }
  if (PYTHON_EXTENSIONS.includes(ext)) {
    return pythonToReadableText(filePath, content);
  }
  return content;
}

async function loadLocalDocument(filePath: string, projectRoot: string): Promise<KnowledgeItem | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const processedContent = processFileContent(filePath, content);
    const title = extractTitle(basename(filePath), processedContent);
    const category = extractCategory(filePath, projectRoot);

    return {
      id: `local-${filePath.replace(/[/\\]/g, '-')}`,
      category,
      title,
      content: processedContent,
      sourcePath: filePath,
      sourceType: 'local',
      keywords: extractKeywords(processedContent),
    };
  } catch (error) {
    console.error(`Failed to load document: ${filePath}`, error);
    return null;
  }
}

async function loadGitHubDocuments(
  source: DocsSource,
  githubLoader: GitHubLoader
): Promise<KnowledgeItem[]> {
  if (source.type !== 'github' || !source.repo) {
    return [];
  }

  const items: KnowledgeItem[] = [];
  const docsPaths = source.docsPaths || (source.docsPath ? [source.docsPath] : ['docs']);

  for (const docsPath of docsPaths) {
    const files = await githubLoader.scanDirectory(
      { ...source, docsPath },
      (status) => {
        console.log(`    ${status}`);
      }
    );

    for (const [path, content] of files) {
      const processedContent = processFileContent(path, content);
      const title = extractTitle(basename(path), processedContent);
      const repoName = source.repo.split('/')[1];

      items.push({
        id: `github-${path.replace(/[/\\]/g, '-')}`,
        category: repoName,
        title,
        content: processedContent,
        sourcePath: `${source.repo}:${path}`,
        sourceType: source.repo,
        keywords: extractKeywords(processedContent),
      });
    }
  }

  return items;
}

function extractTitle(fileName: string, content: string): string {
  const firstLine = content.split('\n')[0] || '';
  const headerMatch = firstLine.match(/^#+\s+(.+)/);
  if (headerMatch) {
    return headerMatch[1].trim();
  }

  const ext = extname(fileName);
  return basename(fileName, ext);
}

function extractCategory(filePath: string, projectRoot: string): string {
  const relativePath = filePath.replace(projectRoot, '').replace(/^[/\\]/, '');
  const parts = relativePath.split(/[/\\]/);

  if (parts.length > 1) {
    if (parts[0] === 'docs') {
      return parts[1] || '文档';
    }
    if (parts[0] === '..') {
      return parts[1] || '文档';
    }
  }
  return '文档';
}

function extractKeywords(content: string): string[] {
  const keywords: string[] = [];
  const lines = content.split('\n');

  for (const line of lines.slice(0, 20)) {
    if (line.startsWith('#')) {
      const title = line.replace(/^#+\s*/, '').trim();
      if (title.length > 0 && title.length < 50) {
        keywords.push(title);
      }
    }
    if (keywords.length >= 5) break;
  }

  return keywords;
}

function processSection(section: string, chunkSize: number, overlap: number, minSize: number): string[] {
  const chunks: string[] = [];
  const paragraphs = section.split(/\n\n+/);
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
      if (currentChunk.trim().length >= minSize) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = currentChunk.slice(-overlap) + '\n\n' + paragraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  if (currentChunk.trim().length >= minSize) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

function chunkText(text: string, chunkSize: number, overlap: number, minSize: number): string[] {
  const sections = text.split(/^#+\s+/m).filter(Boolean);
  const allChunks: string[] = [];

  for (const section of sections) {
    const sectionChunks = processSection(section, chunkSize, overlap, minSize);
    allChunks.push(...sectionChunks);
  }

  return allChunks;
}

async function processLocalSource(
  source: DocsSource,
  projectRoot: string,
  allItems: KnowledgeItem[],
  sources: string[]
): Promise<void> {
  const paths = source.paths || (source.path ? [source.path] : []);

  for (const path of paths) {
    const localPath = join(projectRoot, path);

    if (!existsSync(localPath)) {
      console.log(`  Skipping: ${path} (not found)`);
      continue;
    }

    console.log(`  Scanning local: ${path}`);
    sources.push(basename(path));

    const files = await scanLocalDirectory(localPath);
    console.log(`    Found ${files.length} markdown files`);

    for (const file of files) {
      const item = await loadLocalDocument(file, projectRoot);
      if (item) {
        allItems.push(item);
      }
    }
  }
}

async function processGitHubSource(
  source: DocsSource,
  githubLoader: GitHubLoader,
  allItems: KnowledgeItem[],
  sources: string[]
): Promise<void> {
  if (!source.repo) return;

  console.log(`  Scanning GitHub: ${source.repo}`);
  sources.push(source.repo);

  try {
    const items = await loadGitHubDocuments(source, githubLoader);
    console.log(`    Found ${items.length} markdown files`);
    allItems.push(...items);
  } catch (error) {
    console.error(`    Failed to fetch from GitHub: ${error}`);
  }
}

async function processDocuments(
  items: KnowledgeItem[],
  config: PrebuildConfig,
  embeddingService: EmbeddingService,
  cacheManager: ContentCacheManager
): Promise<TextChunk[]> {
  const allChunks: TextChunk[] = [];
  let chunkIndex = 0;
  let cachedCount = 0;
  let processedCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`  [${i + 1}/${items.length}] ${item.title}`);

    if (!cacheManager.hasContentChanged(item.sourcePath, item.content)) {
      const cachedChunks = cacheManager.getCachedContentChunks(item.sourcePath);
      if (cachedChunks) {
        console.log(`    Using cached (${cachedChunks.length} chunks)`);
        for (const cachedChunk of cachedChunks) {
          allChunks.push({
            ...cachedChunk,
            id: `chunk-${chunkIndex++}`,
          });
        }
        cachedCount++;
        continue;
      }
    }

    processedCount++;
    const textChunks = chunkText(item.content, config.chunkSize, config.chunkOverlap, config.minChunkSize);
    console.log(`    Chunking into ${textChunks.length} pieces...`);

    const itemChunks: TextChunk[] = [];

    for (let j = 0; j < textChunks.length; j++) {
      const textChunk = textChunks[j];
      console.log(`    Embedding chunk ${j + 1}/${textChunks.length}...`);
      const embedding = await embeddingService.embed(textChunk);

      const chunk: TextChunk = {
        id: `chunk-${chunkIndex++}`,
        text: textChunk,
        embedding,
        metadata: {
          source: item.category,
          sourceType: item.sourceType,
          title: item.title,
          category: item.category,
        },
        createdAt: Date.now(),
      };

      allChunks.push(chunk);
      itemChunks.push(chunk);
    }

    cacheManager.updateContentCache(item.sourcePath, item.content, itemChunks);
  }

  console.log(`\n  Cached: ${cachedCount}, Processed: ${processedCount}`);
  return allChunks;
}

async function saveKnowledge(
  chunks: TextChunk[],
  sources: string[],
  config: PrebuildConfig
): Promise<void> {
  await mkdir(dirname(config.outputFile), { recursive: true });

  const prebuiltKnowledge: PrebuiltKnowledge = {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    chunks,
    metadata: {
      totalChunks: chunks.length,
      sources,
    },
  };

  const tsContent = `/**
 * @fileoverview 预构建知识库数据
 *
 * 此文件由 scripts/prebuild-knowledge.ts 自动生成
 * 运行 npm run prebuild:knowledge 生成实际数据
 *
 * @module rag/prebuilt/knowledge
 */

import type { PrebuiltKnowledge } from '@/rag/types';

export const prebuiltKnowledge: PrebuiltKnowledge = ${JSON.stringify(prebuiltKnowledge, null, 2)};

export default prebuiltKnowledge;
`;

  await writeFile(config.outputFile, tsContent, 'utf-8');
}

async function main() {
  console.log('Starting prebuild knowledge...\n');
  console.log(`HF_MIRROR: ${process.env.HF_MIRROR || 'not set'}`);

  const projectRoot = join(import.meta.dirname, '..');
  const config: PrebuildConfig = {
    ...prebuildConfig,
    outputFile: join(projectRoot, prebuildConfig.outputFile),
    cacheFile: join(projectRoot, prebuildConfig.cacheFile),
  };

  const embeddingService = new EmbeddingService(config);
  const cacheManager = new ContentCacheManager(config.cacheFile);
  const githubLoader = new GitHubLoader();

  await cacheManager.load();
  console.log('Cache loaded:', cacheManager.getStats());

  console.log('\n[1/4] Loading embedding model...');
  await embeddingService.initialize((progress, status) => {
    if (progress % 20 === 0 || progress === 100) {
      console.log(`  ${progress}% - ${status}`);
    }
  });

  console.log('\n[2/4] Scanning documents...');
  const allItems: KnowledgeItem[] = [];
  const sources: string[] = [];

  for (const source of config.sources) {
    if (source.type === 'local') {
      await processLocalSource(source, projectRoot, allItems, sources);
    } else if (source.type === 'github') {
      await processGitHubSource(source, githubLoader, allItems, sources);
    }
  }

  console.log(`\n  Total documents: ${allItems.length}`);

  console.log('\n[3/4] Processing documents...');
  const allChunks = await processDocuments(allItems, config, embeddingService, cacheManager);
  console.log(`\n  Total chunks: ${allChunks.length}`);

  console.log('\n[4/4] Saving knowledge base...');
  await saveKnowledge(allChunks, sources, config);
  console.log(`  Saved to: ${config.outputFile}`);

  await cacheManager.save();
  console.log(`  Cache saved: ${config.cacheFile}`);

  console.log('\n✅ Prebuild complete!');
  console.log(`   Total chunks: ${allChunks.length}`);
  console.log(`   Sources: ${sources.join(', ')}`);
}

main().catch((error) => {
  console.error('Prebuild failed:', error);
  process.exit(1);
});
