import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Fully static build: no API proxy, all data ships in /public/data and live data is fetched from public APIs.
export default defineConfig({
  plugins: [react()],
  // changes on every build, so a new deployment never pairs new code with a browser-cached old data file
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  server: { port: 5173 },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          leaflet: ["leaflet"],
        },
      },
    },
  },
});
