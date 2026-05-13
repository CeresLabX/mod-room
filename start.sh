#!/bin/sh
# Wait for database and other services to be ready
echo "Waiting for database..."
sleep 3
echo "Starting MOD Room server..."
exec node index.js
