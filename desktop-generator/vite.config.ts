import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const admin = fileURLToPath(new URL("../admin-web/src", import.meta.url));

export default defineConfig({
  root: "renderer",
  base: "./",
  publicDir: "public",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@admin": admin, "@gen": `${admin}/generator` },
    // The generator code lives in admin-web; make it use THIS project's React.
    dedupe: ["react", "react-dom"],
  },
  server: { port: 5174, strictPort: true, fs: { allow: [".."] } },
  build: { outDir: "../dist-renderer", emptyOutDir: true, sourcemap: false, target: "chrome130", chunkSizeWarningLimit: 4000 },
});
