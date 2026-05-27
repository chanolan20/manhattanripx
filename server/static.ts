import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // In production the server runs as:
  //   <resourcesPath>/server/index.cjs
  // and static files are at:
  //   <resourcesPath>/public/
  //
  // In development the server runs from the repo root and static files are at:
  //   dist/public/   (relative to the repo root, i.e. __dirname/../public)
  //
  // We try several candidate paths and use the first one that exists.
  const candidates = [
    // Env var set by main.js (most reliable)
    process.env.PUBLIC_PATH,
    // Packaged: server/ lives one level below resources/
    path.resolve(__dirname, "..", "public"),
    // Dev fallback: __dirname is dist/, public is dist/public/
    path.resolve(__dirname, "public"),
    // Absolute fallback via RESOURCES_PATH env
    process.env.RESOURCES_PATH ? path.join(process.env.RESOURCES_PATH, "public") : null,
  ].filter(Boolean) as string[];

  const distPath = candidates.find(p => fs.existsSync(p) && fs.existsSync(path.join(p, "index.html")));

  if (!distPath) {
    const tried = candidates.join(", ");
    throw new Error(
      `Could not find the build directory (tried: ${tried}). Make sure to build the client first.`,
    );
  }

  console.log(`[static] serving from: ${distPath}`);

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
