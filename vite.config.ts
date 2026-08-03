import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Vite proxy → backend: Origin başlığını iletme (CORS false-positive önleme). */
function apiProxy(target: string) {
  return {
    target,
    changeOrigin: true,
    configure(proxy) {
      proxy.on("proxyReq", (proxyReq) => {
        proxyReq.removeHeader("origin");
        proxyReq.removeHeader("referer");
      });
    },
  };
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": apiProxy("http://localhost:4000"),
    },
  },
  preview: {
    port: 4173,
    strictPort: false,
    proxy: {
      "/api": apiProxy("http://localhost:4000"),
    },
  },
});
