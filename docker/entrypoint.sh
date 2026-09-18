#!/bin/sh
# Migrations aplicadas na subida, antes de servir tráfego (AGENTS.md).
set -e

echo "[entrypoint] aplicando migrations..."
node scripts/migrate.mjs

echo "[entrypoint] iniciando servidor..."
exec node node_modules/next/dist/bin/next start
