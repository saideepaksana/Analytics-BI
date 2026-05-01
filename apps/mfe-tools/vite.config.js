import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import federation from "@originjs/vite-plugin-federation";

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: "mfeTools",
      filename: "remoteEntry.js",
      exposes: {
        "./SettingsPage": "./src/modules/settings/SettingsPage.jsx",
        "./SqlEditorPage": "./src/modules/sql-editor/SqlEditorPage.jsx",
        "./BuilderPage": "./src/modules/builder/BuilderPage.jsx"
      },
      shared: {
        react: { singleton: true, requiredVersion: "^19.2.0" },
        "react-dom": { singleton: true, requiredVersion: "^19.2.0" },
        "react-router-dom": { singleton: true, requiredVersion: "^7.9.4" }
      }
    })
  ],
  server: {
    port: 5004,
    strictPort: true
  },
  build: {
    target: "esnext"
  }
});
