# Coleção Pokémon

Sistema pessoal de catalogação da coleção física de cartas Pokémon. Uso local,
um único usuário. Convenções de execução, contrato do sync e regras de
negócio: [`AGENTS.md`](./AGENTS.md).

```bash
corepack enable pnpm     # uma vez só, se pnpm não estiver disponível
pnpm install
docker compose up -d --build   # app em http://localhost:3010, banco interno
```
