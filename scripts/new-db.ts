/**
 * Create (or recreate) an empty database with the current schema.
 *   npm run db:reset           — apply DDL/migrations to the existing file
 *   npm run db:reset -- --empty — delete it first and start from nothing
 *
 * There is no seed data: accounts come from /signup, meetings from /ingest.
 */
import fs from "node:fs";
import path from "node:path";

async function main() {
  const empty = process.argv.includes("--empty");

  // resolve the path first so --empty can remove the file before the DDL runs
  const { DATABASE_PATH } = await import("../src/lib/db-path");
  if (empty) {
    for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${DATABASE_PATH}${suffix}`, { force: true });
  }

  const { db } = await import("../src/db");
  const users = db.all<{ n: number }>(`select count(*) as n from "User"`)[0]?.n ?? 0;
  const meetings = db.all<{ n: number }>(`select count(*) as n from "Meeting"`)[0]?.n ?? 0;
  const sessions = db.all<{ n: number }>(`select count(*) as n from "Session"`)[0]?.n ?? 0;

  console.log(
    `database ready: ${path.resolve(DATABASE_PATH)} (users=${users}, meetings=${meetings}, sessions=${sessions})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
