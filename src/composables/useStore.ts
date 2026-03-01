/**
 * @fileoverview Store 持久化 Composable
 *
 * 本文件使用 @tauri-apps/plugin-store 提供统一的设置持久化功能。
 * 封装了 Tauri Store API，提供响应式的持久化存储接口。
 *
 * 主要功能：
 * - 响应式数据绑定：数据变更自动持久化
 * - 异步加载：首次访问时从存储加载
 * - 类型安全：支持泛型类型推断
 * - 自动保存：500ms 防抖自动保存
 *
 * @module composables/useStore
 * @author MaaLogs Team
 * @license MIT
 */

import { ref, watch, Ref } from "vue";
import { Store } from "@tauri-apps/plugin-store";

/** Store 实例缓存 */
let store: Store | null = null;

/**
 * 获取或创建 Store 实例
 *
 * 使用单例模式管理 Tauri Store 实例。
 * Store 配置：
 * - 文件名：app-settings.json
 * - 自动保存：500ms 防抖
 *
 * @returns {Promise<Store>} Store 实例
 */
async function getStore(): Promise<Store> {
  if (!store) {
    store = await Store.load("app-settings.json", {
      autoSave: 500,
      defaults: {},
    });
  }
  return store;
}

/**
 * 响应式持久化存储 Hook
 *
 * 创建一个响应式引用，其值会自动持久化到 Tauri Store。
 * 首次使用时从存储加载已有值，后续变更自动保存。
 *
 * @template T - 存储值的类型
 * @param {string} key - 存储键名
 * @param {T} defaultValue - 默认值（当存储中没有对应键时使用）
 * @returns {Ref<T>} 响应式引用，可直接读写
 *
 * @example
 * // 存储字符串
 * const theme = useStorage('app-theme', 'light');
 * theme.value = 'dark'; // 自动保存
 *
 * @example
 * // 存储对象
 * interface Settings {
 *   language: string;
 *   fontSize: number;
 * }
 * const settings = useStorage<Settings>('app-settings', {
 *   language: 'zh-CN',
 *   fontSize: 14
 * });
 *
 * settings.value.fontSize = 16; // 自动保存
 */
export function useStorage<T>(key: string, defaultValue: T): Ref<T> {
  const isLoaded = ref(false);
  const innerValue = ref<T>(defaultValue) as Ref<T>;

  /**
   * 从 Store 加载已保存的值
   */
  async function load() {
    try {
      const s = await getStore();
      const value = await s.get<T>(key);
      if (value !== null && value !== undefined) {
        innerValue.value = value;
      }
      isLoaded.value = true;
    } catch (e) {
      console.error(`Failed to load ${key} from store:`, e);
      isLoaded.value = true;
    }
  }

  load();

  watch(
    () => innerValue.value,
    async (newValue) => {
      if (!isLoaded.value) return;
      try {
        const s = await getStore();
        await s.set(key, newValue);
      } catch (e) {
        console.error(`Failed to save ${key} to store:`, e);
      }
    },
    { deep: true }
  );

  return innerValue;
}
