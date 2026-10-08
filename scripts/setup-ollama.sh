#!/usr/bin/env bash
# One-time setup for Codespaces (runs automatically when the Codespace is created):
# installs Ollama, the open-source model runner, and downloads Sonar's insight model.
set -euo pipefail
MODEL="${AI_MODEL:-llama3.2:3b}"

if ! command -v ollama >/dev/null 2>&1; then
  echo "Sonar: installing Ollama (official installer from ollama.com)…"
  curl -fsSL https://ollama.com/install.sh | sh
fi

# Start a temporary Ollama server just for the download, then stop it.
started_here=0
if ! curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  (ollama serve >/tmp/ollama-setup.log 2>&1 &)
  started_here=1
  for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break; sleep 1; done
fi

echo "Sonar: downloading the insight model ($MODEL, about 2 GB)…"
ollama pull "$MODEL"

if [ "$started_here" = 1 ]; then pkill -f "ollama serve" || true; fi
echo "Sonar: Ollama is ready."
