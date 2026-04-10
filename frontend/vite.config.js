import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 9091,
    strictPort: true,
    host: true,
    proxy: {
      "/api/promptfoo": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/promptfoo/, "/api"),
      },
      "/api": {
        target: "http://127.0.0.1:9090",
        changeOrigin: true,
      },
      "/v1": {
        target: "http://127.0.0.1:9090",
        changeOrigin: true,
      },
      "/mcp": {
        target: "http://127.0.0.1:9090",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://127.0.0.1:9090",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
