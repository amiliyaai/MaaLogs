/**
 * @fileoverview 日志解析 Worker 管理器
 *
 * 提供 Worker 的创建、消息通信、进度监听功能。
 * 封装 Worker 生命周期管理，简化主线程调用。
 *
 * @module composables/useLogParserWorker
 */

import { ref, onUnmounted } from "vue";
import type { TaskInfo, RawLine, AuxLogEntry, ControllerInfo, SelectedFile } from "@/types/logTypes";
import type { ProjectType } from "@/types/parserTypes";

interface WorkerProgress {
  percentage: number;
  message?: string;
}

interface FileContent {
  name: string;
  content: string;
}

interface ParseResult {
  tasks: TaskInfo[];
  rawLines: RawLine[];
  auxEntries: AuxLogEntry[];
  detectedProjectType: ProjectType;
  controllerInfos: ControllerInfo[];
  logDir?: string;
  duration: number;
}

interface WorkerResponse {
  type: "progress" | "result" | "error" | "ready";
  payload: unknown;
}

export function useLogParserWorker() {
  let worker: Worker | null = null;
  const isReady = ref(false);
  const isRunning = ref(false);

  function createWorker(): Worker {
    if (worker) {
      worker.terminate();
    }
    worker = new Worker(new URL("@/workers/logParser.worker.ts", import.meta.url), { type: "module" });
    return worker;
  }

  function initWorker(): Promise<void> {
    return new Promise((resolve, reject) => {
      const w = createWorker();
      
      const handleMessage = (event: MessageEvent<WorkerResponse>) => {
        const { type } = event.data;
        if (type === "ready") {
          isReady.value = true;
          resolve();
        }
      };
      
      const handleError = (error: ErrorEvent) => {
        reject(error);
      };
      
      w.addEventListener("message", handleMessage);
      w.addEventListener("error", handleError);
      
      w.postMessage({ type: "init" });
      
      setTimeout(() => {
        w.removeEventListener("message", handleMessage);
        w.removeEventListener("error", handleError);
      }, 5000);
    });
  }

  async function parse(
    files: SelectedFile[],
    baseDir: string | undefined,
    onProgress: (progress: WorkerProgress) => void
  ): Promise<ParseResult> {
    if (!worker) {
      await initWorker();
    }

    onProgress({ percentage: 0, message: "读取文件..." });
    const fileContents: FileContent[] = await Promise.all(
      files.map(async (f) => ({
        name: f.name,
        content: await f.file.text(),
      }))
    );

    isRunning.value = true;

    return new Promise((resolve, reject) => {
      if (!worker) {
        reject(new Error("Worker not initialized"));
        return;
      }

      const handleMessage = (event: MessageEvent<WorkerResponse>) => {
        const { type, payload } = event.data;

        if (type === "progress") {
          onProgress(payload as WorkerProgress);
        } else if (type === "result") {
          isRunning.value = false;
          worker?.removeEventListener("message", handleMessage);
          worker?.removeEventListener("error", handleError);
          resolve(payload as ParseResult);
        } else if (type === "error") {
          isRunning.value = false;
          worker?.removeEventListener("message", handleMessage);
          worker?.removeEventListener("error", handleError);
          const error = payload as { message: string };
          reject(new Error(error.message));
        }
      };

      const handleError = (error: ErrorEvent) => {
        isRunning.value = false;
        worker?.removeEventListener("message", handleMessage);
        worker?.removeEventListener("error", handleError);
        reject(new Error(error.message));
      };

      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", handleError);

      try {
        worker.postMessage({
          type: "parse",
          payload: { files: fileContents, baseDir },
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function cancel(): void {
    if (worker && isRunning.value) {
      worker.postMessage({ type: "cancel" });
      isRunning.value = false;
    }
  }

  function terminate(): void {
    if (worker) {
      worker.terminate();
      worker = null;
      isReady.value = false;
      isRunning.value = false;
    }
  }

  onUnmounted(() => {
    terminate();
  });

  return {
    isReady,
    isRunning,
    initWorker,
    parse,
    cancel,
    terminate,
  };
}
