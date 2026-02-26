import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [vue()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("naive-ui")) return "naive-ui";
            if (id.includes("@vicons")) return "vicons";
            if (id.includes("vue-virtual-scroller")) return "virtual-scroller";
            if (id.includes("fflate")) return "fflate";
            if (id.includes("vue-flow")) return "vue-flow";
            if (id.includes("elkjs")) return "elkjs";
            if (id.includes("vue")) return "vue";
            return "vendor";
          }
        },
      },
    },
  },
}));
