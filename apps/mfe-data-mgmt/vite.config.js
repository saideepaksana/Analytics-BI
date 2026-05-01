import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import federation from "@originjs/vite-plugin-federation";

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: "mfeDataMgmt",
      filename: "remoteEntry.js",
      exposes: {
        "./IngestionPage": "./src/modules/ingestion/IngestionPage.jsx",
        "./DatasetsPage": "./src/modules/datasets/DatasetsPage.jsx",
        "./DataReviewPage": "./src/modules/data-review/DataReviewPage.jsx"
      },
      shared: {
        react: { singleton: true, requiredVersion: "^19.2.0" },
        "react-dom": { singleton: true, requiredVersion: "^19.2.0" },
        "react-router-dom": { singleton: true, requiredVersion: "^7.9.4" }
      }
    })
  ],
  server: {
    port: 5003,
    strictPort: true
  },
  build: {
    target: "esnext"
  }
});
