// Runs before `npm run dev`: makes sure there's a .env and a seeded SQLite
// database, so a fresh clone works with nothing but `npm install && npm run dev`.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });

if (!existsSync(join(root, ".env"))) {
  copyFileSync(join(root, ".env.example"), join(root, ".env"));
  console.log("Sonar: created .env from .env.example (demo mode, no API keys needed).");
}

const dbFile = join(root, "prisma", "dev.db");
if (!existsSync(dbFile)) {
  console.log("Sonar: creating the local database…");
  run("npx prisma db push --skip-generate");
  run("npx tsx prisma/seed.ts");
} else {
  // Keep the schema in sync after pulling changes; never drops data.
  run("npx prisma db push --skip-generate");
}
