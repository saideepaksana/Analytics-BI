import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import federation from "@originjs/vite-plugin-federation";

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: "host",
      remotes: {
        auth: "http://localhost:5001/assets/remoteEntry.js",
        analytics: "http://localhost:5002/assets/remoteEntry.js",
        dataMgmt: "http://localhost:5003/assets/remoteEntry.js",
        tools: "http://localhost:5004/assets/remoteEntry.js"
      },
      shared: {
        react: { singleton: true, requiredVersion: "^19.2.0" },
        "react-dom": { singleton: true, requiredVersion: "^19.2.0" },
        "react-router-dom": { singleton: true, requiredVersion: "^7.9.4" }
      }
    })
  ],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    target: "esnext",
    minify: "esbuild"
  }
});
