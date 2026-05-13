#!/bin/sh
echo "[start] PORT=$PORT NODE_ENV=$NODE_ENV"
echo "[start] Checking public/..."
ls /app/public/ 2>&1 | head -5 || echo "[start] public/ MISSING!"
echo "[start] Starting node /app/index.js..."
node /app/index.js 2>&1
echo "[start] node exited: $?"
