#!/usr/bin/env bash
# Install workspace packages for a fresh GroundTruth clone.
# Node 26 is required (.nvmrc). pnpm is not assumed to be on PATH.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if ! command -v node >/dev/null 2>&1; then
  echo "Node is not installed. Install Node 26, then run this again."
  echo "With nvm: nvm install 26 && nvm use"
  exit 1
fi

node_major="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$node_major" != "26" ]]; then
  echo "Node $(node -v) is active. This repo expects Node 26 (.nvmrc)."
  echo "With nvm, from the repo root: nvm install && nvm use"
  exit 1
fi

pnpm=(npx --yes pnpm@12.18.0)
echo "Installing packages with pnpm 12.18.0"
"${pnpm[@]}" install --frozen-lockfile
echo "Building workspace packages"
"${pnpm[@]}" -r build

cat <<'EOF'

Packages are installed and built.

Web:    npx --yes pnpm@12.18.0 --filter @groundtruth/web dev
API:    copy backend/.env.example to backend/.env, start Postgres, then
        npx --yes pnpm@12.18.0 --filter @groundtruth/backend db:migrate
        npx --yes pnpm@12.18.0 --filter @groundtruth/backend db:seed
        npx --yes pnpm@12.18.0 --filter @groundtruth/backend dev
Checks: npx --yes pnpm@12.18.0 -r typecheck
        npx --yes pnpm@12.18.0 lint
EOF
