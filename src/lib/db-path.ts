import path from "node:path";

/**
 * Where the SQLite file lives. Imported by scripts before the DDL runs.
 *
 * A blank DATABASE_PATH in .env.local must not reach better-sqlite3: an empty
 * path silently opens a throwaway *temporary* database, which is how two module
 * instances in one dev server can end up with different (empty) databases.
 */
const raw = process.env.DATABASE_PATH?.trim();

export const DATABASE_PATH =
  raw && raw.length > 0 ? raw : path.join(process.cwd(), "data", "fathom.db");
