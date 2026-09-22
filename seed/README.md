# seed/ — versioned card catalog

These files are what make a fresh install useful from birth. Without them, whoever clones the project
comes up with an empty database and would have to run hours of syncing against `api.tcgdex.net` —
which has already blocked this project's IP once (see `AGENTS.md`) — or download the ~220 MB clone of
their data repository.

| File | Table | Contents |
|---|---|---|
| `carta-catalogo.csv.gz` | `carta_catalogo` | The entire catalog, in the three languages (`pt`, `en`, `jp`) |
| `set-mypcards.csv` | `set_mypcards` | Mapping of set → mypcards internal set id |

**The `.gz` is versioned on purpose.** It is ~1 MB compressed against ~12 MB of text; it is static
data that changes a few times a year, not code. Git LFS would solve a problem this size does not
create, and would cost whoever clones one more configuration step — exactly what this directory
exists to avoid.

## How to load it

```bash
pnpm seed:catalogo              # always loads
pnpm seed:catalogo --se-vazio   # loads only if carta_catalogo is empty
```

`--se-vazio` is what `docker/entrypoint.sh` runs at boot, after the migrations: an install that
already has a catalog is left alone. The load is idempotent (upsert by `id` + `idioma`), never
deletes and never marks a card inactive — the contract is in the header of
`scripts/seed-catalogo.ts`.

## What does NOT go in here

- **No collection data.** `copia`, `colecao`, `vaga` and the purchase tables belong to whoever
  installed the system, and they do not go into the repository in any form — not aggregated, not as
  an example.
- **No card image bytes**, and **no per-card image reference**. The image URL on mypcards is
  assembled from the set mapping plus the set code and the card number (`lib/dominio/mypcards.ts`),
  so `set-mypcards.csv` on its own is already enough for any installation to download the images of
  its own cards with `pnpm baixar:imagens-mypcards`. Shipping the list of already downloaded images
  would add nothing and would say which cards whoever generated the seed has at home.

## How to regenerate it

It is worth doing when upstream releases new sets and the community deserves a more recent catalog.
The starting point is a database with the catalog synced (`pnpm sync:catalogo`).

From the project root, with Compose running:

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

Check before committing: `zcat seed/carta-catalogo.csv.gz | wc -l` (header plus one line per card)
and a `git diff --stat` that shows only these files.

Every detail of the command above exists for a reason, and changing it breaks the read:

- **A fixed `ORDER BY`.** With no deterministic order, every regeneration would produce a completely
  different file and the diff would say nothing.
- **`gzip -9 -n`.** The `-n` drops the name and the timestamp from the gzip header — without it,
  regenerating the same content would produce different bytes.
- **`to_json` on the arrays.** `dex_ids` and `tipos` come out as JSON, not as Postgres's `{a,b}`
  literal: JSON has one escaping rule, and the array literal has three.
- **`to_char(... AT TIME ZONE 'UTC', ...)`.** It returns the date and time in ISO 8601 with `Z`,
  which JavaScript reads without ambiguity — `COPY`'s default format
  (`2026-08-29 12:34:56.789+00`) is not ISO.
- **`criado_em` and `atualizado_em` stay out.** They are the clock of whoever generated the file;
  whoever loads it writes their own.

The column order in the file is free — the reader matches by name — but the set has to be exactly
that one: a column too many, too few or renamed aborts the load instead of quietly writing crooked
data. The full format, and the reason for every rule, is in `lib/dominio/seed-catalogo.ts`.
