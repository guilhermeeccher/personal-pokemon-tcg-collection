#!/bin/sh
# Migrations aplicadas na subida, antes de servir tráfego (AGENTS.md).
set -e

echo "[entrypoint] applying migrations..."
node scripts/migrate.mjs

# Primeiro boot: se `carta_catalogo` está vazia, carrega o catálogo
# versionado em `seed/` — sem nenhuma requisição de rede. A checagem de
# "vazia" acontece dentro do script (`--se-vazio`), não aqui: a imagem não
# tem psql, e quem sabe consultar o banco é o mesmo código que vai gravar.
#
# Instalação que já tem catálogo não é tocada — o script sai na hora, sem
# escrever nada. E o seed nunca derruba a app: se falhar, o servidor sobe do
# mesmo jeito e o catálogo pode ser carregado depois com `pnpm seed:catalogo`.
# Daí o `if !`, em vez de deixar o `set -e` matar o container.
echo "[entrypoint] checking catalog..."
if ! ./node_modules/.bin/tsx scripts/seed-catalogo.ts --se-vazio; then
  echo "[entrypoint] WARNING: the catalog seed failed. The app starts anyway;" >&2
  echo "[entrypoint] run 'pnpm seed:catalogo' later to load the catalog." >&2
fi

echo "[entrypoint] starting server..."
exec node node_modules/next/dist/bin/next start
