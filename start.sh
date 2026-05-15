#!/bin/sh
echo "[start] PORT=$PORT NODE_ENV=$NODE_ENV"
echo "[start] Checking server/public/..."
ls /app/server/public/ 2>&1 | head -5 || echo "[start] server/public/ MISSING!"
echo "[start] Starting node /app/server/index.js..."
node /app/server/index.js 2>&1
echo "[start] node exited: $?"
