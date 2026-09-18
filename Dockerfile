# Imagem única, pragmática para um app pessoal de baixo tráfego (spec §7).
# Sem standalone tracing do Next.js: mantém node_modules completo porque o
# entrypoint também roda scripts (migrate, sync) fora do bundle do servidor.
FROM node:22-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Build não depende de banco: nenhuma página estática lê DATABASE_URL.
RUN pnpm build

EXPOSE 3000

RUN chmod +x docker/entrypoint.sh
CMD ["./docker/entrypoint.sh"]
