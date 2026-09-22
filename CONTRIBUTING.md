# How to contribute

Thanks for the interest. This is an open personal project: there is no SLA and no guarantee of a
reply, but a well-made PR is welcome.

## Before writing code

Read [`AGENTS.md`](./AGENTS.md). It is the repository's style and engineering contract — inviolable
business rules, conventions, the sync and price collector contracts, and the list of decisions that
are **not** reopened inside a PR. If you use a coding assistant, point it there before asking for the
change.

For a large change, a stack change or anything the "Stopping points" section of `AGENTS.md` covers:
**open an issue first**. Disagreeing in text is cheaper than disagreeing in a diff.

## The code is in Portuguese

The documentation is in English; the code is not, and translating it is not a contribution the
project accepts. Domain identifiers, database columns, enum values, route paths and the comments
stay in Portuguese, for the reasons in `AGENTS.md`. A PR whose diff is a translation of comments or
identifiers is closed.

The glossary below is the key. Read it once and the code reads fine.

### Glossary — domain vocabulary

| Portuguese | English | What it means |
|---|---|---|
| `copia` | copy | One physical card you own: language, variant, condition, quantity, location. Table `copia`. |
| `colecao` | collection | A set of slots you are filling: a Pokédex, a complete set or a custom list. Table `colecao`, kinds `pokedex`, `set`, `customizada`. |
| `vaga` | slot | One position inside a collection, filled by at most one copy. Table `vaga`; an empty slot is what the whole system exists to report. |
| `carta_catalogo` | catalog card | A row of the TCGdex catalog, keyed by (`id`, `idioma`). It answers "which card is this", never "what is mine like". |
| `escolha_compra` | buy choice | A card you decided to buy for a slot. Table `escolha_compra`; it survives price rounds and is never deleted by one. |
| `varredura` | scan | One price-collecting run against LigaPokemon, slot by slot. Table `liga_varredura`. |
| `raridade` | rarity | The card's rarity, as the catalog publishes it. Column `raridade`. |
| `idioma` | language | Enum `idioma`: `pt`, `en`, `jp`. A copy's language is the language of the physical card; the catalog row has its own. |
| `variante` | variant | Enum `variante_copia`: `normal`, `reverse`, `holo`, `primeira_edicao` (first edition), `promo`. |
| `condicao` | condition | Enum `condicao`: `NM`, `LP`, `MP`, `HP`, `DMG`. |
| `inventario` | inventory | Every copy you own, with search and filters. |
| `repetidas` | duplicates | Copies beyond the first of the same card — what is left over for trading. |
| `falta` | missing | The list of empty slots in a collection: what you still need. |
| `cadastro` | card entry | Adding copies to the inventory, either by set grid or by search. |
| `opcoes-compra` | buy options | The offers found by a scan for a slot, with price, edition and number. Table `liga_opcao`. |
| `ritmo` | pace | The interval between two requests to LigaPokemon, read live from their `Crawl-delay`. `lib/liga/ritmo.ts`. |
| `frescor` | freshness | How recently a slot was queried. A slot queried in the last 24 h is skipped by a new scan. `lib/dominio/frescor-consulta.ts`. |
| `set` | set | An expansion, in the TCGdex sense. The word is the same in both languages and is used as-is in the code. |
| `liga` | Liga | Short for LigaPokemon, the Brazilian marketplace the price collector reads. |
| `melhoria` | upgrade | A copy better than the one currently in the slot (rarity > language > variant). It is flagged, never applied on its own. |
| `forma` | form | Regional or special form derived from the card name: `alola`, `galar`, `hisui`, `paldea`, `mega`, `gigantamax`, `normal`. |
| `especie` | species | The Pokémon itself, which is what a Pokédex slot represents. |
| `edicao` | edition | LigaPokemon's name for a set. `edicao_sigla` is their set code, `edid` their internal id. |
| `identidade` | identity | Edition plus number, no leading zero: the bridge between a scan result and a buy choice. `lib/dominio/identidade-carta.ts`. |
| `chave` | key | The identifier of a slot inside its collection (a Pokédex number, a card number in a set). |
| `secretas` | secret cards | Cards numbered above the official count of a set. A collection flag decides whether they get slots. |
| `alocacao` | allocation | Attaching a copy to a slot. A copy is allocated to at most one slot, ever. |
| `dominio` | domain | `src/lib/dominio/`: the pure, tested business-rule modules. |

Route paths are in Portuguese too:

| Path | What it is |
|---|---|
| `/colecoes` | collections; `/colecoes/nova` creates one, `/colecoes/falta` is the missing list across collections |
| `/colecoes/[id]/opcoes-compra` | the buy options and the buy list for one collection |
| `/inventario` | the inventory; `/inventario/repetidas` is duplicates, `/inventario/visao-geral` is the overview |
| `/cadastro` | card entry; `/cadastro/set` is the grid for a whole set, `/cadastro/busca` is one card by search |

## Environment

Node.js 22 or newer, and Docker with the Compose v2 plugin if you are going to bring the application
up.

```bash
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm exec next typegen
```

If `corepack enable` gives you `EACCES` pointing at `/usr/bin/pnpm`, your Node is installed
system-wide: use `sudo corepack enable pnpm` or
`corepack enable --install-directory ~/.local/bin pnpm`.

`next typegen` is not optional: `LayoutProps` and the other route types are generated into
`.next/types/`, which is gitignored. Without it, `typecheck` fails on a clean checkout.

## Running the tests

```bash
pnpm test        # Vitest, once
pnpm test:watch  # in watch mode
pnpm typecheck
pnpm lint
```

**The tests need no database.** The business rules live in pure modules in `src/lib/dominio/`, and
that is where a new test belongs. If your test needs a running Postgres, the logic is probably in the
wrong place.

To exercise the whole application, bring up Compose following the
[README](./README.md#installing-from-scratch).

## What a PR has to pass

CI runs on every PR and has to be green:

- `pnpm lint`
- `pnpm exec next typegen` and then `pnpm typecheck`
- `pnpm test`
- `docker build .` — catches packaging breakage that the local build does not catch

Beyond CI, for the PR to be accepted:

- **a business rule that was touched has a test**, and the test runs without a database;
- **no collection data in the diff** — not aggregated, not as a fixture "just for testing";
- **no card image files.** The screenshots in `docs/screenshots/` are the maintainer's own,
  published once and deliberately; they are not a precedent for putting card art in a PR;
- **no person's name, e-mail, IP, hostname or machine path** in code, comment or commit message;
- **the comment updated along with the code.** Almost every non-obvious decision in this repository
  has a paragraph explaining what was measured and what was discarded. If you change the decision,
  change the paragraph.

## Commits

Small, message in English, imperative, no final period:

```
add language filter to the inventory
fix slot count in a set with secret cards
```

The history before this convention is in Portuguese and is not being rewritten.

## What will not be accepted

- A PR that raises the request rate against LigaPokemon or TCGdex, or that loosens the allowed-route
  check. The default pace is compliance with their `robots.txt`, not a preference.
- A PR that "slims down" the Docker image with `--prod`, `standalone` or a multi-stage that throws
  `node_modules` away — the entrypoint depends on `tsx` at runtime, and that breaks the seed and the
  sync silently. `AGENTS.md` explains it.
- A PR that translates the code's comments or domain identifiers into English. See the glossary
  above.
- A PR that implements authentication, multi-user or public exposure. It is not a gap; it is scope.
