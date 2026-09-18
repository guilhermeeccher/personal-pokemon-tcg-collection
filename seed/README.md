# seed/ — catálogo de cartas versionado

Estes arquivos são o que faz uma instalação nova nascer útil. Sem eles, quem clona o projeto sobe com
banco vazio e precisaria rodar horas de sync contra a `api.tcgdex.net` — que já bloqueou o IP deste
projeto uma vez (ver `AGENTS.md`) — ou baixar o clone de ~220 MB do repositório de dados deles.

| Arquivo | Tabela | Conteúdo |
|---|---|---|
| `carta-catalogo.csv.gz` | `carta_catalogo` | O catálogo inteiro, nos três idiomas (`pt`, `en`, `jp`) |
| `set-mypcards.csv` | `set_mypcards` | Mapeamento set → id interno do set no mypcards |

**O `.gz` é versionado de propósito.** São ~1 MB comprimido contra ~12 MB de texto; é dado estático que
muda algumas vezes por ano, não código. Git LFS resolveria um problema que este tamanho não cria, e
custaria a quem clona um passo a mais de configuração — exatamente o que este diretório existe para
evitar.

## Como carregar

```bash
pnpm seed:catalogo              # carrega sempre
pnpm seed:catalogo --se-vazio   # carrega só se carta_catalogo estiver vazia
```

O `--se-vazio` é o que o `docker/entrypoint.sh` roda no boot, depois das migrations: instalação que já
tem catálogo não é tocada. O carregamento é idempotente (upsert por `id` + `idioma`), nunca apaga e
nunca marca carta como inativa — o contrato está no cabeçalho de `scripts/seed-catalogo.ts`.

## O que NÃO entra aqui

- **Nenhum dado de coleção.** `copia`, `colecao`, `vaga` e as tabelas de compra são de quem instalou o
  sistema, e não vão para o repositório em forma nenhuma — nem agregada, nem como exemplo.
- **Nenhum byte de imagem de carta**, e **nenhuma referência de imagem por carta**. A URL da imagem no
  mypcards é montada a partir do mapeamento de set mais o código do set e o número da carta
  (`lib/dominio/mypcards.ts`), então `set-mypcards.csv` sozinho já basta para qualquer instalação baixar
  as imagens das cartas dela com `pnpm baixar:imagens-mypcards`. Mandar a lista de imagens já baixadas
  não acrescentaria nada e diria quais cartas quem gerou o seed tem em casa.

## Como regerar

Vale a pena quando o upstream lança sets novos e a comunidade merece um catálogo mais recente. O ponto
de partida é um banco com o catálogo sincronizado (`pnpm sync:catalogo`).

Da raiz do projeto, com o Compose no ar:

```bash
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL' | gzip -9 -n > seed/carta-catalogo.csv.gz
COPY (
  SELECT
    id, idioma, set_id, set_nome, set_serie, set_serie_id, set_sigla, set_lancamento,
    local_id, nome, categoria, raridade,
    to_json(dex_ids)::text AS dex_ids,
    forma, origem,
    variante_normal_disponivel, variante_reverse_disponivel, variante_holo_disponivel,
    variante_primeira_edicao_disponivel, variante_promo_disponivel,
    to_json(tipos)::text AS tipos,
    dex_ids_derivado, imagem_url, imagem_cdn_existe,
    to_char(imagem_cdn_verificado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      AS imagem_cdn_verificado_em,
    ilustrador, set_qtd_oficial, set_qtd_total, ativa
  FROM carta_catalogo
  ORDER BY idioma, set_id, id
) TO STDOUT WITH (FORMAT csv, HEADER);
SQL

docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL' > seed/set-mypcards.csv
COPY (
  SELECT set_id, numero, origem_url FROM set_mypcards ORDER BY set_id
) TO STDOUT WITH (FORMAT csv, HEADER);
SQL
```

Confira antes de commitar: `zcat seed/carta-catalogo.csv.gz | wc -l` (cabeçalho + uma linha por carta) e
um `git diff --stat` que mostre só estes arquivos.

Cada detalhe do comando acima existe por um motivo, e mudá-los quebra a leitura:

- **`ORDER BY` fixo.** Sem ordem determinística, cada regeração produziria um arquivo completamente
  diferente e o diff não diria nada.
- **`gzip -9 -n`.** O `-n` descarta nome e timestamp do cabeçalho do gzip — sem ele, regerar o mesmo
  conteúdo geraria bytes diferentes.
- **`to_json` nos arrays.** `dex_ids` e `tipos` saem em JSON, não no literal `{a,b}` do Postgres: JSON tem
  uma regra de escape só, e o literal de array tem três.
- **`to_char(... AT TIME ZONE 'UTC', ...)`.** Devolve a data/hora em ISO 8601 com `Z`, que o JavaScript
  lê sem ambiguidade — o formato padrão do `COPY` (`2026-08-29 12:34:56.789+00`) não é ISO.
- **`criado_em` e `atualizado_em` ficam de fora.** São o relógio de quem gerou o arquivo; quem carrega
  grava o próprio.

A ordem das colunas no arquivo é livre — o leitor casa por nome —, mas o conjunto tem que ser exatamente
esse: coluna a mais, a menos ou renomeada aborta o carregamento em vez de gravar dado torto em silêncio.
O formato completo, e o porquê de cada regra, estão em `lib/dominio/seed-catalogo.ts`.
