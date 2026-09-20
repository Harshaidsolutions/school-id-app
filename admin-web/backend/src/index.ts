import "dotenv/config";
import path from "path";
import fs from "fs";
import express from "express";
import cors from "cors";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { pool } from "./config/database";
import { schedulePhotoCleanup } from "./jobs/photoCleanup";

const app = express();
const PORT = Number(process.env.PORT) || 5000;

/**
 * Admin panel is same-origin (static files from this process).
 * Teacher mobile app is a separate origin — CORS stays enabled for it.
 * Tighten origin allowlist to your production domains later via CORS_ORIGIN.
 */
const corsOrigin = process.env.CORS_ORIGIN?.trim();
app.use(
  cors(
    corsOrigin
      ? { origin: corsOrigin.split(",").map((o) => o.trim()) }
      : process.env.NODE_ENV === "production"
        ? { origin: true } // reflect request origin (teacher app + same-origin admin)
        : undefined // allow all in development
  )
);
app.use(express.json());

// ---------------------------------------------------------------------------
// Middleware / route order (critical):
//   (a) /api/* API routes
//   (b) express.static for backend/public  (JS/CSS/images)
//   (c) SPA catch-all → index.html only for extension-less paths
// ---------------------------------------------------------------------------

/** (a) All API routes live under /api */
app.use("/api", routes);

/**
 * (b) Admin-web build output.
 * Resolves to backend/public whether running from src/ (tsx) or dist/ (node).
 */
const publicDir = path.resolve(__dirname, "..", "public");

app.use(
  express.static(publicDir, {
    index: false, // never auto-serve index.html here; SPA handler owns that
    fallthrough: true,
  })
);

/**
 * (c) SPA fallback for React Router.
 * - Never for /api/*
 * - Never for paths that look like static assets (have a file extension)
 * - Missing .js/.css/etc → real 404, not index.html (avoids MIME module errors)
 */
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    next();
    return;
  }

  if (req.path.startsWith("/api")) {
    next();
    return;
  }

  // Asset-like request: do not fall back to HTML
  if (path.extname(req.path)) {
    res.status(404).type("text").send("Not found");
    return;
  }

  const indexHtml = path.join(publicDir, "index.html");
  if (!fs.existsSync(indexHtml)) {
    res
      .status(503)
      .type("text")
      .send(
        "Admin panel is not built yet. From the repo root run: npm run build:admin"
      );
    return;
  }

  res.sendFile(indexHtml, (err) => {
    if (err) next(err);
  });
});

app.use(errorHandler);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${PORT} (NODE_ENV=${process.env.NODE_ENV ?? "undefined"})`);
  console.log(`  Static dir:  ${publicDir}`);
  schedulePhotoCleanup();
});

process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await pool.end();
  process.exit(0);
});

export default app;
