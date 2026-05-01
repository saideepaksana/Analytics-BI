import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import federation from "@originjs/vite-plugin-federation";

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: "mfeAuth",
      filename: "remoteEntry.js",
      exposes: {
        "./LoginPage": "./src/modules/auth/LoginPage.jsx",
        "./SignUpPage": "./src/modules/auth/SignUpPage.jsx"
      },
      shared: {
        react: { singleton: true, requiredVersion: "^19.2.0" },
        "react-dom": { singleton: true, requiredVersion: "^19.2.0" },
        "react-router-dom": { singleton: true, requiredVersion: "^7.9.4" }
      }
    })
  ],
  server: {
    port: 5001,
    strictPort: true
  },
  build: {
    target: "esnext"
  }
});
