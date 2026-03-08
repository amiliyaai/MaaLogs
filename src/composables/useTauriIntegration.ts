/**
 * @fileoverview Tauri 环境集成
 *
 * 负责初始化日志系统、拖拽监听、主题同步、更新检查等。
 */
import { onBeforeUnmount, onMounted, type Ref } from "vue";
import { getPlatform } from "@/platform";
import { appConfig } from "@/config";
import { clearZipExtractCache } from "@/utils/file";
import { isTauriEnv } from "@/utils/env";
import { createLogger, flushLogs, init, setLoggerContext } from "@/utils/logger";

/**
 * Tauri 集成选项
 */
interface UseTauriIntegrationOptions {
  isDragging: Ref<boolean>;
  viewMode: Ref<"analysis" | "search" | "statistics" | "compare">;
  themeMode: Ref<"light" | "dark" | "auto">;
  handleTauriDrop: (paths: string[]) => Promise<void>;
  onLoadAIConfig: () => Promise<void>;
}

const logger = createLogger("TauriIntegration");

/**
 * 初始化并管理 Tauri 集成逻辑
 */
export function useTauriIntegration(options: UseTauriIntegrationOptions): void {
  let unlistenDragDrop: (() => void) | null = null;
  let removeMediaListener: (() => void) | null = null;

  function handleDropError(error: unknown): void {
    logger.error("处理拖拽路径失败", { error: String(error) });
  }

  function handleSetupError(error: unknown): void {
    logger.error("Tauri 集成初始化失败", { error: String(error) });
  }

  async function resolveLogPath(): Promise<string> {
    const platform = await getPlatform();
    try {
      return await platform.vfs.appLogDir();
    } catch {
      return await platform.vfs.appDataDir();
    }
  }

  function createTraceId(): string {
    const cryptoObj = globalThis.crypto;
    if (cryptoObj?.randomUUID) {
      return cryptoObj.randomUUID();
    }
    if (cryptoObj?.getRandomValues) {
      const bytes = new Uint8Array(8);
      cryptoObj.getRandomValues(bytes);
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      return `trace-${Date.now()}-${hex}`;
    }
    return `trace-${Date.now()}-0000000000000000`;
  }

  onMounted(() => {
    if (!isTauriEnv()) return;
    const setup = async () => {
      setLoggerContext({ traceId: createTraceId() });

      await clearZipExtractCache();

      try {
        const logPath = await resolveLogPath();
        await init({
          logLevel: appConfig.log.level,
          logPath,
          rotationSize: appConfig.log.rotationSize,
          rotationCount: appConfig.log.rotationCount,
        });
        logger.info("日志系统已初始化", { logPath });
      } catch (error) {
        logger.error("日志系统初始化失败", { error: String(error) });
      }

      const platform = await getPlatform();
      unlistenDragDrop = await platform.dragDrop.onDrop(
        (paths) => {
          options.isDragging.value = false;
          if (paths.length === 0 || options.viewMode.value === "compare") {
            return;
          }
          options.handleTauriDrop(paths).catch(handleDropError);
        },
        () => {
          options.isDragging.value = true;
        },
        () => {
          options.isDragging.value = false;
        }
      );

      await options.onLoadAIConfig();

      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleSystemThemeChange = () => {
        if (options.themeMode.value === "auto") {
          options.themeMode.value = "auto";
        }
      };
      mediaQuery.addEventListener("change", handleSystemThemeChange);
      removeMediaListener = () => mediaQuery.removeEventListener("change", handleSystemThemeChange);

      await platform.updater.checkForUpdate();
    };
    setup().catch(handleSetupError);
  });

  onBeforeUnmount(() => {
    removeMediaListener?.();
    unlistenDragDrop?.();
    flushLogs();
  });
}
