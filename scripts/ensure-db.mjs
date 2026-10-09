// Runs before `npm run dev`, `npm start` and `npm run serve`:
// - makes sure there's a .env (copied from .env.example)
// - makes sure the creator side has a password (generates one if missing)
// - makes sure the database exists and its tables are up to date (SQLite, or Postgres if DATABASE_URL says so)
// - loads the demo data once on a fresh local SQLite database
// so a fresh clone or Codespace works with nothing but `npm install && npm run dev`.
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const reset = process.argv.includes("--reset");
const seedOnly = process.argv.includes("--seed");
const isPostgres = /^postgres(ql)?:/i.test(process.env.DATABASE_URL);
const dbFile = join(root, "prisma", "dev.db");
const seededMarker = join(root, "prisma", ".seeded");

// Moving to Postgres (e.g. Supabase) is just DATABASE_URL: Prisma can't read
// the provider from the environment, so we write a Postgres copy of the schema
// (prisma/.postgres/schema.prisma, not committed) and use that instead.
let schemaArg = "";
let wantProvider = "sqlite";
if (isPostgres) {
  wantProvider = "postgresql";
  const src = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");
  const pg = src.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
  mkdirSync(join(root, "prisma", ".postgres"), { recursive: true });
  writeFileSync(join(root, "prisma", ".postgres", "schema.prisma"), pg);
  schemaArg = " --schema prisma/.postgres/schema.prisma";
}
// The generated Prisma client is tied to one database type. Regenerate it if it doesn't match.
const generated = join(root, "node_modules", ".prisma", "client", "schema.prisma");
const haveProvider = existsSync(generated) ? (readFileSync(generated, "utf8").match(/provider\s*=\s*"(sqlite|postgresql)"/)?.[1] ?? "") : "";
if (haveProvider !== wantProvider || isPostgres) {
  console.log(`Sonar: preparing the database client for ${isPostgres ? "Postgres" : "SQLite"}…`);
  run(`npx prisma generate${schemaArg}`);
}

if (!isPostgres && !existsSync(dbFile)) console.log("Sonar: creating the local database…");
if (seedOnly) {
  // npm run db:seed: load the demo into an empty database (refuses if there's data).
  run(`npx prisma db push --skip-generate${schemaArg}`);
  run("npx tsx prisma/seed.ts");
} else if (reset) {
  // npm run db:reset: wipe everything and load the demo.
  run(`npx prisma db push --force-reset --skip-generate${schemaArg}`);
  run("npx tsx prisma/seed.ts --force");
} else {
  // Creates the tables on first run, keeps them in sync after updates; never drops data.
  run(`npx prisma db push --skip-generate${schemaArg}`);
  // Load the demo workspace once, on the local database only. (Deleting everything later
  // won't bring it back on restart.) A real Postgres database is never filled with demo data.
  if (!isPostgres && !existsSync(seededMarker)) {
    run("npx tsx prisma/seed.ts");
    writeFileSync(seededMarker, new Date().toISOString() + "\n");
  }
  if (isPostgres) console.log("Sonar: using Postgres. (Want the demo data there? Run: npm run db:seed)");
}

console.log(`
  ┌────────────────────────────────────────────────────────┐
    Sonar creator sign-in
    username: anything      password: ${password}
    (change it any time: SONAR_PASSWORD in .env)
  └────────────────────────────────────────────────────────┘
`);
