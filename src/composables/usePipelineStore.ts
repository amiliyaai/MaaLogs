/**
 * @fileoverview Pipeline 数据管理 Composable
 *
 * 管理用户设置的 Pipeline 目录，
 * 自动递归查找 JSON 文件，提供节点配置查询功能用于诊断增强。
 *
 * @module composables/usePipelineStore
 */

import { ref, computed } from 'vue';
import { useStorage } from '@/composables/useStore';
import { getPlatform } from '@/platform';
import { parseJsonc } from '@/utils/parse';

export interface PipelineNodeConfig {
  name: string;
  recognition?: {
    type?: string;
    template?: string | string[];
    threshold?: number;
    roi?: [number, number, number, number];
    expected?: string | string[];
    [key: string]: unknown;
  };
  action?: {
    type?: string;
    target?: string | boolean;
    target_offset?: number[];
    begin?: [number, number];
    end?: [number, number];
    duration?: number;
    key?: string;
    input_text?: string;
    [key: string]: unknown;
  };
  next?: Array<{ name: string; anchor?: boolean; jump_back?: boolean }>;
  pre_delay?: number;
  post_delay?: number;
  timeout?: number;
  roi?: [number, number, number, number];
  [key: string]: unknown;
}

export interface PipelineFile {
  fileName: string;
  filePath: string;
  nodes: Record<string, PipelineNodeConfig>;
  loadedAt: number;
}

const pipelineDir = useStorage<string | null>('pipelineDir', null);
const pipelineFiles = ref<PipelineFile[]>([]);
const isLoading = ref(false);
const loadError = ref<string | null>(null);

export function usePipelineStore() {
  let initialized = false;

  async function ensureLoaded() {
    if (initialized || !pipelineDir.value) return;
    initialized = true;
    await refreshPipelineDir();
  }

  const isLoaded = computed(() => pipelineFiles.value.length > 0);
  const hasDir = computed(() => !!pipelineDir.value);

  const allNodes = computed(() => {
    const nodes: Record<string, PipelineNodeConfig & { sourceFile: string }> = {};
    for (const file of pipelineFiles.value) {
      for (const [name, config] of Object.entries(file.nodes)) {
        if (!nodes[name]) {
          nodes[name] = { ...config, sourceFile: file.fileName };
        }
      }
    }
    return nodes;
  });

  async function loadPipelineDir(dir: string): Promise<boolean> {
    pipelineDir.value = dir;
    return refreshPipelineDir();
  }

  async function refreshPipelineDir(): Promise<boolean> {
    if (!pipelineDir.value) {
      pipelineFiles.value = [];
      return false;
    }

    isLoading.value = true;
    loadError.value = null;

    try {
      const platform = await getPlatform();
      const files = await platform.vfs.list(pipelineDir.value, { recursive: true });

      const jsonFiles = files.filter(
        (entry) => entry.name.toLowerCase().endsWith('.json') || entry.name.toLowerCase().endsWith('.jsonc')
      );

      const loaded: PipelineFile[] = [];

      console.log('[PipelineStore] Found entries:', files.length);

      for (const entry of jsonFiles) {
        console.log('[PipelineStore] Loading file:', entry.name, entry.path);
        const filePath = entry.path;
        try {
          const content = await platform.vfs.readText(filePath);
          const parsed = parseJsonc(content);

          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            const fileName = filePath.split(/[/\\]/).pop() || filePath;
            console.log('[PipelineStore] Loaded nodes:', Object.keys(parsed).slice(0, 5));
            loaded.push({
              fileName,
              filePath,
              nodes: parsed as Record<string, PipelineNodeConfig>,
              loadedAt: Date.now(),
            });
          }
        } catch (e) {
          console.warn(`Failed to load pipeline file ${filePath}:`, e);
        }
      }

      console.log('[PipelineStore] Final loaded count:', loaded.length);
      pipelineFiles.value = loaded;
      console.log(`Loaded ${loaded.length} pipeline files`);
      return loaded.length > 0;
    } catch (e) {
      console.error('Failed to load pipeline directory:', e);
      loadError.value = e instanceof Error ? e.message : 'Failed to load pipeline directory';
      pipelineFiles.value = [];
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  function getNodeConfig(nodeName: string): PipelineNodeConfig | null {
    const nodes = allNodes.value;
    return nodes[nodeName] || null;
  }

  function clearPipeline(): void {
    pipelineDir.value = null;
    pipelineFiles.value = [];
    loadError.value = null;
  }

  return {
    pipelineDir,
    isLoaded,
    hasDir,
    isLoading,
    loadError,
    allNodes,
    loadPipelineDir,
    refreshPipelineDir,
    getNodeConfig,
    clearPipeline,
    ensureLoaded,
  };
}
