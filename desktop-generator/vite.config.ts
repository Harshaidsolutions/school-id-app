import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const admin = fileURLToPath(new URL("../admin-web/src", import.meta.url));
const nm = fileURLToPath(new URL("./node_modules", import.meta.url));

export default defineConfig({
  root: "renderer",
  base: "./",
  publicDir: "public",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@admin", replacement: admin },
      { find: "@gen", replacement: `${admin}/generator` },
      // The generator code lives in admin-web (no node_modules there in CI): always use THIS project's React.
      { find: /^react-dom(\/.*)?$/, replacement: path.join(nm, "react-dom") + "$1" },
      { find: /^react(\/.*)?$/, replacement: path.join(nm, "react") + "$1" },
    ],
    dedupe: ["react", "react-dom"],
  },
  server: { port: 5174, strictPort: true, fs: { allow: [".."] } },
  build: { outDir: "../dist-renderer", emptyOutDir: true, sourcemap: false, target: "chrome130", chunkSizeWarningLimit: 4000 },
});
