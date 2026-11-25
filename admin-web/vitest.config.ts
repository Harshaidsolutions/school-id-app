import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Component tests only. Unit tests (pure logic) run on Node's built-in runner via `npm test`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/component/**/*.test.tsx"],
    setupFiles: ["tests/component/setup.ts"],
    globals: true,
  },
});
