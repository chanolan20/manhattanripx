import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, copyFile } from "fs/promises";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { createRequire } from "module";
const _require = createRequire(import.meta.url);

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  // ── originally bundled ───────────────────────────────────
  "@google/generative-ai",
  "axios",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
  // ── CRITICAL: must be inlined — not available in packaged app node_modules ──
  // jimp and all its sub-packages (pure JS, safe to bundle)
  "jimp",
  "@jimp/core",
  "@jimp/types",
  "@jimp/plugins",
  "@jimp/utils",
  "@jimp/js-jpeg",
  "@jimp/js-png",
  "@jimp/js-bmp",
  "@jimp/js-tiff",
  "@jimp/js-gif",
  "@jimp/plugin-resize",
  "@jimp/plugin-crop",
  "@jimp/plugin-rotate",
  "@jimp/plugin-flip",
  "@jimp/plugin-blit",
  "@jimp/plugin-blur",
  "@jimp/plugin-color",
  "@jimp/plugin-contain",
  "@jimp/plugin-cover",
  "@jimp/plugin-displace",
  "@jimp/plugin-dither",
  "@jimp/plugin-fisheye",
  "@jimp/plugin-mask",
  "@jimp/plugin-print",
  "@jimp/plugin-quantize",
  "@jimp/plugin-scale",
  "@jimp/plugin-shadow",
  "@jimp/plugin-threshold",
  // ── sql.js: pure JS/WASM SQLite — zero native deps, must be bundled ──
  "sql.js",
  // other pure-JS server deps that may not be in Electron node_modules
  "ipp",
  "form-data",
  "i18next",
  "i18next-http-middleware",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  // After build, copy sql-wasm.wasm into dist/ so the server can find it at runtime
  // This runs after esbuild below

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  // Copy sql-wasm.wasm into dist/ so the bundled sql.js can load it
  try {
    const sqlJsMain = _require.resolve("sql.js");
    const wasmSrc = resolve(dirname(sqlJsMain), "sql-wasm.wasm");
    if (existsSync(wasmSrc)) {
      await copyFile(wasmSrc, "dist/sql-wasm.wasm");
      console.log("copied sql-wasm.wasm to dist/");
    }
  } catch (e) {
    console.warn("Warning: could not copy sql-wasm.wasm:", e);
  }
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
