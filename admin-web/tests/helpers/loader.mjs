// Zero-install TS test loader for Node's built-in test runner.
// Transpiles .ts/.tsx on the fly with sucrase (pure JS, arch-independent) and
// resolves TypeScript-style extensionless relative imports. No tsx/esbuild/tsc
// needed, so `npm test` runs anywhere Node 20+ is installed.
import { existsSync, statSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { transform } from "sucrase";

export async function resolve(specifier, context, next) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[mc]?[jt]sx?$/.test(specifier)) {
    try {
      const basePath = fileURLToPath(new URL(specifier, context.parentURL));
      for (const ext of [".ts", ".tsx"]) {
        if (existsSync(basePath + ext)) return next(specifier + ext, context);
      }
      if (existsSync(basePath) && statSync(basePath).isDirectory()) {
        for (const idx of ["/index.ts", "/index.tsx"]) {
          if (existsSync(basePath + idx)) return next(specifier + idx, context);
        }
      }
    } catch { /* fall through to default resolver */ }
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.endsWith(".ts") || url.endsWith(".tsx")) {
    const path = fileURLToPath(url);
    const raw = readFileSync(path, "utf8");
    const { code, sourceMap } = transform(raw, {
      transforms: ["typescript"],
      disableESTransforms: true,
      filePath: path,
      sourceMapOptions: { compiledFilename: path },
    });
    const map = { ...sourceMap, sources: [path], sourcesContent: [raw] };
    const inline = Buffer.from(JSON.stringify(map)).toString("base64");
    const withMap = code + `\n//# sourceMappingURL=data:application/json;base64,${inline}\n`;
    return { format: "module", source: withMap, shortCircuit: true };
  }
  return next(url, context);
}
