import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [preact()],
  server: { fs: { allow: [".."] }, proxy: { "/api": "http://localhost:8787" } },
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
  worker: { format: "es" },
});
