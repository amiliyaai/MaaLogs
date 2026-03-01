/**
 * @fileoverview Store 持久化 Composable
 *
 * 使用 @tauri-apps/plugin-store 提供统一的设置持久化功能
 */

import { ref, watch, Ref } from "vue";
import { Store } from "@tauri-apps/plugin-store";

let store: Store | null = null;

async function getStore(): Promise<Store> {
  if (!store) {
    store = await Store.load("app-settings.json", {
      autoSave: 500,
      defaults: {},
    });
  }
  return store;
}

export function useStorage<T>(key: string, defaultValue: T): Ref<T> {
  const isLoaded = ref(false);
  const innerValue = ref<T>(defaultValue) as Ref<T>;

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
