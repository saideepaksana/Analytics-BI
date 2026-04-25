import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import federation from "@originjs/vite-plugin-federation";

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: "mfeAnalytics",
      filename: "remoteEntry.js",
      exposes: {
        "./ChartsPage": "./src/modules/charts/ChartsPage.jsx",
        "./DashboardPage": "./src/modules/dashboard/DashboardPage.jsx"
      },
      shared: {
        react: { singleton: true, requiredVersion: "^19.2.0" },
        "react-dom": { singleton: true, requiredVersion: "^19.2.0" },
        "react-router-dom": { singleton: true, requiredVersion: "^7.9.4" }
      }
    })
  ],
  server: {
    port: 5002,
    strictPort: true
  },
  build: {
    target: "esnext"
  }
});
