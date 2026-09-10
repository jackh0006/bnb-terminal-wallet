#!/usr/bin/env bash
set -euo pipefail

node_version="$(node --version 2>/dev/null || true)"
if [[ ! "$node_version" =~ ^v([2-9][0-9]|[1-9][0-9]{2,})\. ]]; then
  echo "Node.js 20 or newer is required (found: ${node_version:-not installed})." >&2
  exit 1
fi
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example. Add optional service credentials there."
fi
