import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/dashboard/",
  plugins: [react()],
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: {
      buffer: "buffer"
    }
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
    port: 4174
  }
});
