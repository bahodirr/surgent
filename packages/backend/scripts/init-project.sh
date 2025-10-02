#!/bin/sh
set -e

# Ensure working directory exists
mkdir -p /tmp/project

# Seed project and initialize git repo on first boot
if [ ! -d "/tmp/project/.git" ]; then
  # If a template exists and /tmp/project is empty, copy it
  if [ -d "/workspace/template" ] && [ -z "$(ls -A /tmp/project)" ]; then
    cp -a /workspace/template/. /tmp/project/
    # If template was a git repo, drop its history/remotes
    rm -rf /tmp/project/.git 2>/dev/null || true
  fi
  cd /tmp/project
  git init -b main
  git config user.name "Surgent Dev"
  git config user.email "bot@surgent.dev"
  git config --global --add safe.directory /tmp/project
  git add -A
  git commit --allow-empty -m "Initial commit"
fi

# Start dev server via PM2 if not running
if ! pm2 describe vite-dev-server >/dev/null 2>&1; then
  cd /tmp/project
  pm2 start /workspace/ecosystem.config.cjs || true
  pm2 save || true
fi

# If no command was provided (common during snapshot validation), keep the container alive
if [ "$#" -eq 0 ]; then
  exec sleep infinity
else
  exec "$@"
fi