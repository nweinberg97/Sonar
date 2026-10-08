// Runs before `npm run dev`, `npm start` and `npm run serve`:
// - makes sure there's a .env (copied from .env.example)
// - makes sure the creator side has a password (generates one if missing)
// - makes sure the SQLite database exists and is seeded
// so a fresh clone or Codespace works with nothing but `npm install && npm run dev`.
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });
const envPath = join(root, ".env");

if (!existsSync(envPath)) {
  copyFileSync(join(root, ".env.example"), envPath);
  console.log("Sonar: created .env from .env.example.");
}

let envText = readFileSync(envPath, "utf8");

// Load .env into this process so every command below (Prisma, the seed script)
// sees the same settings. Values already set in the environment win.
function loadEnv(text) {
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
const match = envText.match(/^SONAR_PASSWORD=(.*)$/m);
let password = match ? match[1].trim().replace(/^["']|["']$/g, "") : "";
if (!password) {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  password = Array.from(randomBytes(16), (b) => alphabet[b % alphabet.length]).join("");
  envText = match
    ? envText.replace(/^SONAR_PASSWORD=.*$/m, `SONAR_PASSWORD=${password}`)
    : `${envText.trimEnd()}\n\n# Password for the creator side (generated). Respondent links stay open.\nSONAR_PASSWORD=${password}\n`;
  writeFileSync(envPath, envText);
}
loadEnv(envText);
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "file:./dev.db";

const dbFile = join(root, "prisma", "dev.db");
const seededMarker = join(root, "prisma", ".seeded");
if (!existsSync(dbFile)) console.log("Sonar: creating the local database…");
// Creates the database on first run, keeps the schema in sync after updates; never drops data.
run("npx prisma db push --skip-generate");
// Load the demo workspace once. (Deleting everything later won't bring it back on restart.)
if (!existsSync(seededMarker)) {
  run("npx tsx prisma/seed.ts");
  writeFileSync(seededMarker, new Date().toISOString() + "\n");
}

console.log(`
  ┌────────────────────────────────────────────────────────┐
    Sonar creator sign-in
    username: anything      password: ${password}
    (change it any time: SONAR_PASSWORD in .env)
  └────────────────────────────────────────────────────────┘
`);
