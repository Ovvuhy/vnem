import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/dashboard/",
  plugins: [react()],
  root: new URL(".", import.meta.url).pathname,
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
