// Runs before Sonar starts. If insights use Ollama (the default), make sure the
// Ollama server is running and the model is downloaded. Never blocks for long:
// if anything is missing, Sonar still starts and uses its built-in extractor
// until the model is ready.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
if (existsSync(join(root, ".env"))) {
  for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#\n]*)"?/);
    if (m) env[m[1]] = m[2].trim();
  }
}
const provider = (process.env.AI_PROVIDER || env.AI_PROVIDER || "ollama").toLowerCase();
const model = process.env.AI_MODEL || env.AI_MODEL || "llama3.2:3b";
if (provider !== "ollama") process.exit(0);

const base = "http://127.0.0.1:11434";
const ping = async () => {
  try {
    const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(1000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
};

const hasOllama = spawnSync("ollama", ["--version"], { stdio: "ignore" }).status === 0;
let tags = await ping();

if (!tags && !hasOllama) {
  console.log(
    "Sonar: Ollama isn't installed, so insights will use the built-in extractor.\n" +
      `       For the open-source model: install from https://ollama.com, then run \`ollama pull ${model}\`.`,
  );
  process.exit(0);
}

if (!tags) {
  const log = openSync(join(root, ".ollama.log"), "a");
  spawn("ollama", ["serve"], { detached: true, stdio: ["ignore", log, log] }).unref();
  for (let i = 0; i < 20 && !tags; i++) {
    await new Promise((r) => setTimeout(r, 500));
    tags = await ping();
  }
  console.log(tags ? "Sonar: started Ollama." : "Sonar: Ollama is starting slowly; Sonar will keep checking.");
}

const want = model.includes(":") ? model : `${model}:latest`;
const present = (tags?.models ?? []).some((m) => m.name === want || m.model === want);
if (tags && !present) {
  console.log(`Sonar: downloading ${model} in the background (about 2 GB). Insights use the built-in extractor until it's ready.`);
  const log = openSync(join(root, ".ollama.log"), "a");
  spawn("ollama", ["pull", model], { detached: true, stdio: ["ignore", log, log] }).unref();
} else if (present) {
  console.log(`Sonar: insights model ready (${model}).`);
}
