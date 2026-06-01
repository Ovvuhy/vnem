import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

const hermesApiTarget = process.env.VITE_HERMES_DASHBOARD_API_TARGET ?? "http://127.0.0.1:8788";

export default defineConfig({
  base: "/dashboard/",
  plugins: [react()],
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: {
      buffer: "buffer/"
    }
  },
  optimizeDeps: {
    include: ["buffer"]
  },
  define: {
    global: "globalThis"
  },
  build: {
    outDir: "../landing/dashboard",
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    host: "127.0.0.1",
    port: 4174,
    proxy: {
      "/api": {
        target: hermesApiTarget,
        changeOrigin: true,
        secure: false
      }
    }
  }
});
