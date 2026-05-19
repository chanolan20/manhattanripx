/**
 * Vitest global setup — runs before any test file is imported.
 * Sets DB_PATH to an isolated temp file so tests never share a SQLite DB.
 */
import path from "path";
import os from "os";

// Each vitest worker gets a unique DB file
const workerDbPath = path.join(
  os.tmpdir(),
  `mrx_test_${process.pid}_${Date.now()}.db`
);
process.env.DB_PATH = workerDbPath;
process.env.UPLOADS_DIR = path.join(os.tmpdir(), `mrx_uploads_${process.pid}`);
process.env.NODE_ENV = "test";
