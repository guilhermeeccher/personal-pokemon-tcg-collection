# AGENTS.md — Pokémon Collection

A cataloging system for a physical Pokémon card collection. Local, internal network, a single user,
no authentication.

**This file is the repository's engineering contract**, and it is written mainly for the AI of
whoever is going to contribute: read it end to end before writing a line. It is not presentation
documentation — the [README](./README.md) exists for that — it is the list of what must not be
broken and why. A good part of these rules was learned by getting it wrong; reverting one of them
for elegance costs more than it looks.

It is **self-contained**. There is no external document to consult: if a rule here is incomplete,
the bug is in this file, and fixing it is part of the PR.

> **A note on `spec §N` in the code comments.** Several comments cite sections of a functional
> specification that is **not part of this repository**. Treat the citation as a historical mark,
> not as a reference to follow: what the comment explains has to stand on its own. If you need that
> section to understand the decision, the comment is incomplete — improve the comment, do not go
> looking for the document.

---

## Language: documentation in English, code in Portuguese

This is a deliberate decision, not a backlog item.

**The documentation is in English** — README, this file, `CONTRIBUTING.md`, `NOTICE.md`, the
templates and `.env.example`. The project is shared with an international audience, and whoever is
installing it has to be able to read the manual.

**The code is in Portuguese and stays that way.** Domain identifiers (`copia`, `colecao`, `vaga`,
`carta_catalogo`, `escolha_compra`), database columns, enum values, route paths and the roughly
7,000 lines of comments are all in Portuguese. **A pull request must not translate them.** A PR
whose diff is a translation of comments or identifiers is closed.

Two reasons, both practical:

- **The domain vocabulary maps to database columns with real data in them.** `vaga` is a table,
  `variante_copia` is an enum with rows depending on it, `idioma` has the value `jp` written into
  live data. Renaming any of it is a migration over somebody's collection, and nothing is gained.
- **The comments carry the reasoning behind the decisions, which is the point of them.** They record
  what was measured and what was discarded. Running that through a translation is how the nuance
  gets lost, and how a paragraph that used to be true stops being true.

`CONTRIBUTING.md` carries a Portuguese → English glossary of the domain vocabulary. Read it once and
the code reads fine.

---

## Inviolable business rules

These eight rules are the product. If a code change breaks any of them, the change is wrong — not
the rule.

1. **Exclusive allocation.** A copy fills at most one slot, in a single collection. Guaranteed by a
   uniqueness constraint in the database, not only in the application.
2. **Pokédex eligibility.** Only a card with **exactly one** `dexId` fills a Pokédex slot. Tag team
   and multi-Pokémon cards are ineligible.
3. **Forms do not split the slot.** Alolan Raichu and Raichu compete for slot 26. The form is
   displayed, it never creates a new slot.
4. **A set counts the official numbering** (`cardCount.official`). The "include secrets" flag on the
   collection switches it to `cardCount.total`.
5. **The selection is always the user's.** The system suggests eligible candidates; it never fills a
   slot on its own.
6. **The empty slot is a first-class output.** Every Pokédex or Set collection exposes the list of
   what is missing. It is the reason the system exists.
7. **A copy's language is the language of the physical card**, regardless of the catalog row that
   identifies it. The catalog row answers "which card is this"; the copy answers "what mine is
   like". Never tie one to the other — 33 sets have no card-by-card data in pt upstream, and
   physical cards in Portuguese from those sets exist.
8. **A swap is atomic, and an upgrade is a flag.** Replacing the copy in a slot happens in a single
   transaction (`trocarCopiaDaVaga`): the slot is never left empty because of a swap that failed
   halfway — and inside it a refusal leaves by exception, never by `return`, which would close the
   transaction successfully. The system flags the upgrade and waits for the click; it never swaps on
   its own (this is rule 5 applied to an already filled slot). The ladder (rarity > language >
   variant, `promo` out of it) lives in `lib/dominio/melhoria-vaga.ts` and **is not translated into
   a SQL `CASE`** — the SQL matches the pairs, the pure module decides.

---

## What never enters the repository

Three absolute prohibitions. A PR that brings any of these is refused without discussion of merit,
because none of them is undone by `git revert`: the data would already be in the public history.

1. **No collection data.** `copia`, `colecao`, `vaga`, `escolha_compra` and the price tables belong
   to whoever installed the system. They do not go into the repository in any form — not aggregated,
   not anonymized, not as a fixture "just for testing". A test that needs data uses made-up data
   inside the test itself.
2. **No card image files**, and no per-card image reference. Images come from the CDN at display
   time, or are downloaded by each installation into a local Docker volume. A list of already
   downloaded images would say which cards whoever generated the file has at home — that is
   collection data coming in through the back door.
3. **No person's name, e-mail, IP, hostname or machine path** in code, comment, commit message or
   document. This is deliberate and was done once, by hand, across the whole repository. Narrative
   comments still apply — what changes is the subject: write "decision of 2026-09-02", not the name
   of who decided; "the user supplied the photo", not who supplied it.

**The one exception, and where it stops.** The screenshots in `docs/screenshots/` show the
interface with real cards in it, so they carry both card art and a view of one collection —
rules 1 and 2 would otherwise forbid them. They exist because a README has to show what the
program looks like, and they were published once, deliberately, by the person the collection
belongs to. That covers those files and nothing else. It does not transfer: a pull request adds
no card art and no collection data, including there. The screenshots illustrate the program;
nothing in the program reads them.

Git does not cover the data: the database and the image files live in Docker volumes, outside
the repository, and backing them up is the responsibility of whoever installs the system.

---

## Stack — decided, not to be reopened

| Item | Decision |
|---|---|
| Framework | Next.js (App Router) + strict TypeScript |
| Database | PostgreSQL 17 |
| ORM / migrations | Drizzle + drizzle-kit (SQL-first: a migration is readable, reviewable SQL) |
| UI | Tailwind CSS |
| Packages | pnpm |
| Tests | Vitest for the business rules; no e2e |
| Runtime | Docker Compose |
| App port | **3010** on the host by default, changeable through `PORTA_HOST` in `.env` (3000 stays free for other services) |
| Database port | **not published on the host** — only on Compose's internal network |
| Auth | none. Local network, single user. Do not implement login. |

If a decision in this table needs to change, **stop and open an issue** — do not swap it out on your
own inside a PR about something else.

---

## Environment and commands

What your machine needs: **Node.js 22 or newer**, for the `pnpm` commands, and **Docker Engine with
the Compose v2 plugin**, to bring the application up. Nothing beyond that, and nothing specific to
one particular machine — if a step only works on your computer, the step is wrong.

`pnpm` is not installed separately: it comes with Node, through corepack, at the version pinned in
`package.json`.

```bash
corepack enable pnpm            # prerequisite, once only
pnpm install --frozen-lockfile
pnpm exec next typegen          # MANDATORY before the first typecheck — see below
pnpm typecheck                  # tsc --noEmit
pnpm test                       # Vitest
pnpm lint
pnpm db:generate                # generates a migration from the Drizzle schema
pnpm db:migrate                 # applies migrations
pnpm seed:catalogo              # loads the versioned catalog from seed/
pnpm sync:catalogo              # syncs the TCGdex catalog (pt, en and jp) — incremental
pnpm sync:catalogo --profundo   # revisits every set card by card (~2h30)
pnpm importar:catalogo-repo --idioma pt --simular   # what the data repository has that the API lacks
docker compose up -d --build
```

**`pnpm exec next typegen` before `typecheck`, always.** `LayoutProps` and the other route types are
generated by Next into `.next/types/`, which is gitignored. On a clean checkout, `pnpm typecheck`
without the typegen fails with `Cannot find name 'LayoutProps'` — and the error looks like the
contributor's fault when it is only a missing step. That is why CI runs the typegen.

The tests **need no database**: the business rules are pure modules. A test that requires a running
Postgres is in the wrong place.

Migrations are applied when the container comes up, before the app serves traffic.
`scripts/migrate.mjs` filters Postgres's informational messages (NOTICE/INFO/DEBUG/LOG) down to a
one-line summary, because the `DROP ... CASCADE` in migration `0016` dumped an object that looks
like an error on the first boot. That is a notice filter, not an error filter: a migration failure
still lands in the `catch` and exits with code 1, and **wrapping `migrate` in an empty `catch` would
be the wrong way to silence any noise** — the container would come up with half a schema and nobody
would find out.

---

## Image packaging — `tsx` is a runtime dependency

The image is single and deliberately "fat": a full `pnpm install`, no `--prod`, no Next
`standalone`, and no multi-stage that throws `node_modules` away.

**This is not sloppiness, it is a requirement.** `docker/entrypoint.sh` runs, at runtime and outside
the server bundle, `scripts/migrate.mjs` (migrations) and `scripts/seed-catalogo.ts` (the catalog
load on the first boot) — and the second one is TypeScript, executed by `./node_modules/.bin/tsx`.
The operational commands (`sync:catalogo`, `baixar:imagens-mypcards`, the backfills) are all `tsx`
as well, and run through `docker compose exec app`.

A "slim down the image" PR with `pnpm install --prod`, with `output: "standalone"` or with a final
stage that copies only `.next` **breaks the seed and the sync**, and breaks them in the worst way:
the build passes, the container comes up, and the first boot of a fresh install ends with an empty
catalog. If you want to touch this, the test is bringing up a Compose from scratch, with a new
volume, and counting the 48,372 cards in the database — not `docker build` passing.

---

## Code conventions

- **The code is in Portuguese, and a PR must not translate it.** Domain identifiers (`copia`,
  `colecao`, `vaga`, `carta_catalogo`), database columns, enum values and the comments stay in
  Portuguese; English is for infrastructure (`createServer`, `handler`). The domain vocabulary is
  the one from the eight rules above — do not rename `vaga` to `slot` in the middle of the code. Two
  reasons: the vocabulary maps to database columns that have real data in them, so renaming it is a
  migration over somebody's collection; and the comments carry the reasoning behind the decisions,
  what was measured and what was discarded, which is the point of having them. **A PR whose diff is
  a translation of comments or identifiers is closed.** The glossary for reading the code is in
  [`CONTRIBUTING.md`](./CONTRIBUTING.md).
- Business rules live in pure, tested modules (`lib/dominio/`), outside React components and route
  handlers. **The eight rules above have to be testable without a database.**
- No `any`. No `@ts-ignore` without a comment justifying it.
- No committed secrets. Configuration through `.env`, with a versioned, commented `.env.example`.
- **A comment explains why, not what.** The code in this repository is commented above average, on
  purpose: almost every non-obvious decision has a paragraph saying what was measured and what was
  discarded. Keep the standard; deleting those comments is deleting the reason.
- Commits small, message in English, imperative: `add TCGdex catalog sync`. The existing history is
  in Portuguese and is not being rewritten; the convention applies from here on.

---

## Catalog sync contract

- Base: `https://api.tcgdex.net/v2/<idioma>/` — no key.
- **The language code in the URL is ISO**: Japanese is `ja`, not `jp`. Our database enum uses `jp`
  and has real data written against it — translate it in `codigoIdiomaUpstream`, **never rename the
  enum**.
- **Polite client — a hard rule, learned the expensive way.** In August 2026 the sync ran ~35,000
  requests with 40 in parallel and no rate ceiling; TCGdex blocked the IP in their firewall
  (connection refused for us, 200 for the rest of the world). Therefore:
  - A global requests-per-second ceiling in the client (`lib/sync/limitador.ts`), default 6/s.
    Concurrency limits what is in flight; only the limiter limits what leaves per second.
  - Default concurrency 4 (cards) and 2 (sets). **Do not raise it without a stated reason.**
  - A User-Agent identifying the client on every request. An anonymous client at volume is the first
    one to get blocked.
  - **A block aborts the whole sync on the spot** (`ErroBloqueioUpstream`), with no retry and
    without draining the queue — insisting renews the block. 429, 403 and a socket failure
    (`ECONNREFUSED`/`ECONNRESET`) are a block; 5xx and timeouts are transient (retry); 404 is
    permanent (skip the item).
- Flow: `GET /sets` → for each set, `GET /sets/{id}` (which brings the card list) → materialize into
  `carta_catalogo`.
- **Incremental by default.** `GET /sets/{id}` already returns the ids of the set's cards; if that
  list matches the active cards we have stored, the set is skipped and no detail request is made —
  only a local UPDATE that refreshes the set metadata and renews `atualizado_em`
  (`tocarSetInalterado`). A round with no new release drops from ~53,000 requests to ~470.
  `pnpm sync:catalogo --profundo` (or `SYNC_PROFUNDO=1`) revisits everything card by card; it is the
  only way to catch a metadata correction on a card that already exists, and it takes ~2h30 across
  the three languages.
- **A skipped set can never be deactivated.** Two independent protections, and both have to keep
  existing: the touch renews the clock on the rows, and `decidirInativacaoCatalogo` excludes the
  skipped sets from the UPDATE. Without that, a normal round would mark the entire catalog inactive
  in silence, with real copies pointing at those rows.
- **Idempotent:** running it twice in a row cannot duplicate a row or change a count. Key: (`id`,
  `idioma`).
- **Never deletes.** A card that disappears upstream is flagged (`ativa = false`), not deleted —
  there may be a user copy pointing at it.
- **Never blocks usage.** The app always reads the local table. If the API is down, the sync fails
  and records the error; the app keeps working with the last state.
- **Does not sync the `Pokémon TCG Pocket` series** (a digital game, it does not exist on paper).
  Nothing digital enters the catalog.
- `forma` is derived from the card name through a normalization table (e.g. "de Alola" → `alola`). A
  name that matches no pattern becomes `normal` — never guess.

### Catalog seed

`seed/carta-catalogo.csv.gz` and `seed/set-mypcards.csv` are what make a fresh install useful from
birth, and they obey **the same contract as the sync**: upsert by (`id`, `idioma`), never delete,
never deactivate, zero network.

Two columns stay out of the upsert's UPDATE, on purpose: `ativa` (a card the sync deactivated stays
deactivated) and `origem` (a row created by hand by the user, `origem = manual`, or filled in from
the data repository, `origem = repo`, is never demoted to `sync`, which would expose it to
deactivation). Do not "simplify" this into an upsert that updates everything.

A seed failure **does not take the app down**: the entrypoint uses `if !` precisely so that `set -e`
does not kill the container. The format of the files, the regeneration and the reason for every
detail are in [`seed/README.md`](./seed/README.md) and in `lib/dominio/seed-catalogo.ts`.

### Filling the gap from the data repository — `origem = repo`

TCGdex's data repository (`github.com/tcgdex/cards-database`) runs ahead of their API. The 30th
Celebration set was translated to Portuguese in the repository while the API still answered with two
cards. `pnpm importar:catalogo-repo --idioma pt` (or `en`) reads a local clone and fills that gap:

- **It only inserts.** A row whose (`id`, `idioma`) already exists — from the API, the seed or an
  earlier import — is left exactly as it is. The API stays the owner of the Western catalog.
- **The row is born `origem = repo`**, and that is what keeps it alive: deactivation only touches
  `origem = sync`, and the API, not knowing the card yet, would deactivate it on the next deep sync.
  When the API starts publishing the card, its upsert turns `repo` into `sync`, and from then on the
  API answers for it.
- `--simular` lists what would come in, per set, without writing. Run it first.
- Without `--idioma` the importer keeps its original job: the Japanese catalog from `data-asia/`, by
  upsert.

### Set collections: a recipe, then a list of slots you edit

Since 2026-09-30 a Set collection is created from a **recipe** — one or more sets
(`parametro.sets`, in the chosen order) — and from then on it **is its list of slots**, which the
user edits card by card: `POST /api/colecoes/:id/cartas` adds a single card from any set as an empty
slot, `DELETE /api/colecoes/:id/vagas/:vagaId` takes one out. Rule 4 still applies to each set of the
recipe at creation and in the secrets toggle.

- **The slot key carries the set: `set/local_id`** (`30th/001`, `lib/dominio/chave-vaga-set.ts`).
  Two sets in one collection both have a card `001`, and a single card may come from anywhere. The
  set lives in the key, and not in a column of its own, because `liga_opcao` and `escolha_compra`
  identify a slot by `(collection, chave)` too: qualified, the three stay unique and correct with no
  schema change. Whoever needs the printed number (a label, the Liga search, the order) reads it with
  `lerChaveVagaSet`/`rotuloChaveVaga` — **never parse the key by hand, and never show it raw**.
  Pokédex keys are still the national number, custom ones the sequence.
- **Removing a filled slot takes the allocation with it** (the user's decision, with a confirmation
  on screen): the copy is never deleted, it only becomes free in the inventory again. The buy triage
  of that slot is kept and drops off the list on its own, as with a Pokédex scope change.
- **A removed recipe card is remembered in `parametro.excluidas`**, so the secrets toggle does not
  bring it back. Adding it again clears it.
- **The missing-catalog warning measures the catalog, not the slots** (`avisosDaReceita`): with an
  editable collection, a removal would read as a false "incomplete catalog" and a single card would
  hide a real gap.
- **The Buy by List gets one tab per set** when the collection joins sets, like one per region in a
  Pokédex; a single-set collection keeps the plain tab.

### Catalog language is decided card by card

A Set collection's `idiomaCatalogo` is a **preference**, not a filter. Each number in the set uses its
row in the preferred language when it exists and the other Western row when it does not
(`ordemIdiomasPorCarta`, `escolherLinhaPorCarta` in `lib/dominio/idioma-catalogo.ts`): pt → en,
en → pt. The universe of slots is the union of both, and the counts are the larger of the two
(`contagensDoSet`). This is rule 7 carried one step further: the catalog row only says which card it
is, so swapping pt for en on a card does not change the card.

- **Why card by card:** upstream translates a set a little at a time. Deciding for the whole set gave
  two bad answers for the 30th Celebration — stay in pt and materialize 2 slots out of 128, or fall
  back to en and lose the two that did exist in pt.
- **Japanese is never a fallback for pt/en, nor the other way round.** pt and en share the card id
  and number (`30th-001` in both, checked across the 13,907 cards that exist in both). Japanese sets
  have their own `set_id`, and the four that share one with English (`neo1` to `neo4`) number the
  cards differently and hold different cards — `neo1` has 111 cards `1..111` in en and 96
  `001..096` in jp, with no number in common. Mixing them would create slots for cards that are not
  in the set.
- The same rule serves the collection screen, slot creation, the secrets toggle, the missing-catalog
  warning, the set registration grid and the Buy by List. **Do not reintroduce a single-language
  query in any of them**: the grid sends `idiomaCatalogo` per item for this reason, and the batch
  route checks each card's variants against its own row.

---

## LigaPokemon price collector — hard rules

The source is **LigaPokemon**, read through the site's public search (`lib/liga/cliente.ts`).

- **Pace: their `robots.txt` is in charge.** The interval between requests is the `Crawl-delay` read
  **live** from LigaPokemon's `robots.txt` (`lib/liga/ritmo.ts`), today 360 s, with jitter. Do not
  hardcode the number: if they loosen it, everyone benefits; if they tighten it, everyone obeys. A
  15-minute cache, and **a read failure falls back to the conservative value, never to the
  aggressive one** — an expired cache that could not be renewed also falls back to the conservative
  one. `LIGA_INTERVALO_SEGUNDOS` overrides it: that is an explicit choice by whoever installed the
  system, documented in `.env.example` and in the README. **Do not lower the default and do not
  raise the pace on your own**, and do not accept a PR that does. The default is compliance, not
  preference: it is what allows the tool to be distributed without transferring risk to whoever
  installs it.
- **Nothing may double the pace behind our back.** The window that declares a round dead is
  **derived from the interval**, not a fixed number: with a fixed value of 120 s, at 360 s every
  live round would be declared dead — and a dead round frees a second one to run in parallel,
  doubling the requests against their site. For the same reason the screen's polling is
  `clamp(intervalo × 250 ms, 5 s, 60 s)`, and not a fixed number. Any new time constant on that path
  has to come out of the interval.
- **Only `cards/search` and `cards/card`.** Their `robots.txt` forbids `cards/pricehistory`, `bzr/`,
  `colecao/` and `ecom/`; nothing in the code touches them, and nothing should start touching them.
  The guarantee is checked before each request goes out (`exigirRotaPermitida`), with a fixed list
  **plus** whatever the file we read says — the file can add a prohibition, never remove one that is
  hardcoded. A file that is down does not amount to "anything goes".
- **A new scan does not redo what it already has.** At 360 s a Pokédex takes ~16 hours, and at that
  scale a container restart is routine. A slot with an option recorded in the last 24 h is skipped
  (`lib/dominio/frescor-consulta.ts`), so triggering it again picks up where it stopped. The filter
  lives in `vagasParaVarrer`, not in `listarVagasVazias*`: the screen keeps listing every empty slot.
  **Do not turn this into a queue, a worker or a job that resumes by itself when the container comes
  up** — it was left out on purpose.
  A known blind spot, declared in the code: a queried slot that found no offer writes no row, so it
  has no age and gets queried again. Closing that would require a migration; the error goes to the
  safe side.
- **A block aborts the round**, with no retry (`ErroBloqueioLiga`).
- **The screen reads a snapshot, never the site.** A live query during rendering turns into dozens
  of requests per page open.
- **No currency conversion.** Do not convert an international price and do not expose it as if it
  were a Brazilian market value.
- **`liga_edicao.set_id` is never filled by guesswork** — an edition linked to the wrong set points
  the price of one set at a card from another.
- **The set's search term is the ENGLISH name**, taken from the `en` row for the same set and
  number. Liga writes `Wondrous Patch` where our pt catalog writes `Fragmento Encantado`; searching
  in Portuguese would return zero on Trainer cards, and zero is indistinguishable from "none for
  sale". The pt name comes in only as a second attempt.
- **There is no listing of a whole edition — measured, not assumed.** Any edition filter in the
  search term (`ed=PFL`, `edid=738`, both together, exactly as the site writes its own link) makes
  the page switch to JavaScript rendering and come back with no card row in the HTML. Only the
  search by **name** answers with HTML. It is not worth another try.

### Buy triage — it is durable, and it does not live in the scan

The choice of what to buy lives in `escolha_compra`. It used to be a column on `liga_opcao`, and
every new round was born empty: a triage of 126 cards would be wiped out entirely by the next price
update. What follows from that, and cannot be reverted:

- The choice is attached to the **slot**, not to the round, and the bridge to the scan is the card's
  `identidade` (`lib/dominio/identidade-carta.ts`: edition + number, no leading zero). **Never tie
  the choice to a `liga_opcao.id`** — that row dies with the round.
- **A new round updates prices, it never deletes a choice.** A card that did not reappear keeps the
  price and date from the last time: disappearing quietly would take a card the user decided to buy
  off the list.
- **Several cards per slot is allowed.** In the Pokédex a slot is a species, and the user may be
  tracking more than one card of the same Pokémon.
- **A filled slot does not delete the choice** — it only takes it off the list. When the copy leaves
  the slot, it comes back.
- The grid's marking is **derived** from the choice. `liga_opcao.selecionada` no longer exists.
- The list to paste exists **with no scan at all**, and is assembled by `lib/liga/lista-compra.ts` —
  the same function for the screen and for the export.

### Out of stock — fed back from their Buy by List

The scan price is the lowest in **any** condition, so a card with no NM offer keeps coming back with
a price. When their Buy by List answers "Cards sem estoque", the user pastes that notice on the
screen (`lib/dominio/sem-estoque-liga.ts`, table `sem_estoque_liga`):

- **The key is the card as Liga sees it: name + number/total**, no edition — our paste line carries
  no edition, so neither does their answer. Two editions sharing name and numbering go out together.
- **Global, not per collection** — stock belongs to the store. **Valid for 30 days**, then the card
  is offered again on its own; pasting again renews it. The quality is stored and not used yet.
- **Hidden at read time, not at write time**, in the options GET: an expired record brings the card
  back with no new scan. **A card that is already selected is never hidden** — it stays, flagged, so
  the user can still unselect it from the grid.
- Pasting is two steps: a preview, then a confirm that records and unselects **in one transaction**,
  and only the choices of **this collection's empty slots** — the list the paste came from.

### Special card prices — a second, separate round

`/inventario/precos` prices **every owned card except plain commons and uncommons**: the exclusion
is by the explicit strings (`Comum`, `Common`, `Incomum`, `Uncommon`), not by rarity class, because
`classificarRaridade` sends null, "None" and "Promo" to `comum` and those must be priced (so must
plain rares, and every card of set `30th-c`, whose upstream rarity is the literal "None"). The rule
is pure and tested (`lib/dominio/precos-cartas-especiais.ts`). It follows every rule above, with these
specifics:

- **Own tables, never `liga_varredura`.** `preco_carta_liga` (one row per `carta_id`, upserted) and
  `liga_rodada_preco` (the round). A scan round is tied to a collection (`colecao_id` NOT NULL);
  this one belongs to the inventory. Do not make that column nullable to share the code.
- **One lookup per physical card.** The pt and en rows of a `carta_id` are the same card; the
  English name is searched first, the other name only if it differs and the first found nothing.
- **A row is never deleted, and a "not found" never overwrites a price already found** — the last
  known price with its date beats an empty row (same reasoning as the buy triage).
- **A "not found" is an answer only for the page cap it was asked with** (`paginas_max`). The search
  is by name, cheapest first, so an expensive card with a common name can sit past the last page
  read; raising `MAX_PAGINAS_PRECO` makes old "not found" rows stale and they are asked again.
  The cap costs requests, never pace: the limiter is per request.
- **The dead-round window is derived from the interval and from this round's worst case**
  (`janelaSemBatimentoSegundos(intervalo, REQUISICOES_NO_PIOR_CASO_POR_CARTA)`), so raising the cap
  raises the window with it.
- **History is append-only, and each finished round leaves a snapshot.** Every consult appends a row
  to `preco_carta_liga_historico` (found or not, even when the upsert kept the older price); when a
  round ends, including an abort on a block, `liga_snapshot_preco` records the state of the whole
  price table (`fotografarPrecos`, pure, `lib/dominio/historico-precos.ts`). The chart on the screen
  plots it, and it must keep saying that the total also rises when cards enter the sum.
- The overview's "gems" are ordered by the stored average price (cards with a price first), then
  by the showcase rule. Prices are BRL as the site gives them; no conversion.

### Export to LigaPokemon

Two distinct flows, which **share no format**: uploading the collection (learned from real exports
from the site, `lib/dominio/exportacao-liga.ts`) and the Buy by List (`[Quantidade] [Card]`, e.g.
`2 Charizard (1/111)`).

**The Buy by List takes at most 110 cards per search**, so the list to paste comes in tabs
(`dividirListaCompra`, `LIMITE_COMPRA_POR_LISTA`): one tab per region in a Pokédex, one plain tab in
a set, and a group above the limit becomes `Kanto (1/2)`, `Kanto (2/2)`. This knowingly softens the
single-list decision below — each paste is a separate store optimization on their side — and the
region split was chosen over packing tabs to 110 regardless of region. The screen and the per-tab
download use the same function, so a tab's `id` is the same in both.

Two things about the buy list format **have not been verified** against a real paste, and are
declared uncertain in `exportacao-lista-compra.ts`: the leading zero (we send `003`, the way their
search returns it) and the edition tiebreak (`(003/132)` does not say `MEG`). **Do not turn those
uncertainties into statements** without a paste that answers them.

---

## Optional module: Living Dex

A tracker for a Pokémon HOME living dex, living in the same app: every species and every form HOME
stores, in a **normal** and a **shiny** track. It is optional and off by default.

- **Turned on by `MODULO_LIVING_DEX=1`, and only by `1`** (`lib/modulos.ts`). Off, its menu group
  does not render, `/dex/...` pages and `/api/dex/...` routes answer 404, and `pnpm seed:dex` exits
  without touching the database. The flag is read at request time — a page of the module calls
  `connection()` before checking it, so the build never freezes the value.
- **Its migrations are not conditional.** The `dex_*` tables exist in every install, empty when the
  module is off. A migration that depended on an environment variable would leave installs with
  different schemas, and the next migration would break on half of them.
- **It shares the app and the database, never the data.** No `dex_*` table references a card table
  and no card table references a `dex_*` one. The eight rules above are about cards; the module does
  not bend any of them.

### The slot catalog — `dex_forma`, from `seed/dex-forma.csv`

- **A slot is a species in one form that HOME keeps in a box of its own.** Battle-only forms, Megas,
  Gigantamax and Totems are not slots. The data comes from PokeAPI; what it cannot say — whether HOME
  stores a form — is decided in `lib/dominio/dex-classificacao.ts`.
- **Every non-default form goes through an explicit rule, and a form no rule knows is never
  guessed.** `pnpm gerar:seed-dex` fails and lists it, and nothing is written. When PokeAPI publishes
  a new form, someone adds a rule, with the reason in a comment. The current list was closed against
  two curated HOME living-dex lists and matches them form by form; the disagreements between those
  sources are decided one by one in the comments of the rules. Do not "simplify" the rules into
  something derived from PokeAPI flags — that is exactly what does not work.
- **Two tracks, and one Pokémon fills one slot.** The same forms are slots in the normal and in the
  shiny track; a shiny fills the shiny track only. A form never released as shiny
  (`shiny_obtenivel = false`) stays in the grid and leaves only the shiny track's total. **In doubt,
  it stays obtainable** — a wrong `true` shows a slot to hunt, a wrong `false` hides one.
- **Sections and views.** `base` always counts; `regional`, `genero` and `especial` are toggled by
  the user (`dex_secao`, `lib/dominio/dex-secoes.ts`), all on by default, and a section that is off
  also disappears from the add screen. Toggling never touches a record. **Cosmetic forms are not a
  toggle but a view of their own** (`VistaDex`): 63 Alcremie, 20 Vivillon and 28 Unown used to flood
  the grid, so they live beside the main view, with their own progress, the way the shiny track
  lives beside the normal one. View and track are independent. A form that only changes the
  look is `cosmetica` even when it comes from an event (Pikachu's caps, Original Color Magearna,
  Dada Zarude): `especial` is for forms that change type, ability, moves or stats.
- **Gender pairs are labelled on screen.** A species with a gender difference has two slots, and the
  screens say which is which (`rotuloDaForma`: male and female in the interface language). PokeAPI
  names the male "Male" for some species and leaves it blank for others; do not rely on its name.
- **The seed runs on every boot, not only on an empty table** — unlike the card seed. The file is the
  only source of this catalog and it is small, so a corrected classification reaches every install on
  the next boot. A slot that left the file is **deactivated, never deleted**: a user record may point
  at it.
- **Sprites come from the PokeAPI sprites CDN at display time** (`urlSpriteDex`), the small ones, not
  HOME's renders: a grid shows hundreds of slots and a HOME render is ~80 KB against ~0.6 KB. No
  sprite file enters the repository.

### Games and records — `dex_jogo_possuido`, `dex_registro`

- **The game list is fixed in code** (`lib/dominio/dex-jogos.ts`), one row per version, and the user
  only marks which ones they own. Each game carries how it connects to HOME: `ida_e_volta` (goes and
  comes back) or `so_envio` (only sends: GO, FireRed, LeafGreen). **That value is checked against the
  official HOME transfer page, never filled from memory**, and the date of the check is in the
  comment. A HOME update changes it; it lives in that one place.
- **A record is one Pokémon the user has**: a slot (`forma_id`), shiny or not, the game it came from
  and where it is now (`local`: `home` or a game id). Both are catalog ids, not owned-game ids: a
  Pokémon may come from a game the user does not own (a trade).
- **The slot state is derived from the records on every read, never stored**
  (`lib/dominio/dex-estado.ts`): missing, in a game, or in HOME. A shiny record fills the shiny track
  only.
- **The records describe only what HOME allows** (`lib/dominio/dex-registro.ts`): nothing enters a
  `so_envio` game — a record can be there only if it was born there; Let's Go only takes Let's Go
  Pokémon; the location is HOME or an owned, active game. **Leaving a `so_envio` game needs the
  user's confirmation**: the move route answers 409 with `dexConfirmarSemVolta` until the screen
  resends with `confirmarSemVolta: true`. Never make that confirmation automatic.
- **Records come in by game, in batches** (`POST /api/dex/registros`, `{ jogoId, itens }`), like the
  card set grid: every Pokémon becomes one record, born in that game and still in it. One refusal
  refuses the whole batch, and nothing is written.
- **One row per Pokémon in the database, grouped only on screen.** The inventory groups records that
  are identical except for the id (`agruparInventario`); its actions move or delete **one** Pokémon of
  the group, and a correction applies to the whole group. Do not add a quantity column to
  `dex_registro`: each Pokémon has to be movable on its own.
- **Moving and correcting are separate operations.** `POST /api/dex/registros/mover` (`{ ids, local }`)
  changes the location of one or many records under the rules above, in one transaction, asking for
  the one-way confirmation once per batch; `PATCH /api/dex/registros` (`{ ids, ... }`) fixes the other
  fields and leaves the location alone. A game marked as stopped keeps its records and takes no new
  ones; it can only be removed when no record sits in it.
- **Each game has a catalog of what can be obtained in it** (`lib/dominio/dex-disponibilidade.ts`):
  species as `livre` (playing that game alone), `troca` (other version's exclusive, or trade
  evolution) or `evento` (ticket, purchase bonus, another game's save data); which forms exist
  there; and which forms HOME does not accept from it (`transferivel = false`: Spinda from GO and
  BDSP, Zygarde and Eternatus from GO…). **Like the HOME connection, this is checked data, never
  filled from memory**: every game's comment says where its list came from and when. The add screen
  shows only the game's catalog (with "show all" for a Pokémon from elsewhere); a game without a
  catalog shows every slot. Lists are written as national-number ranges so a correction reads well
  in a diff; a species in two lists fails a test. **Pokémon GO's list is the one that ages fastest**
  — GO releases something almost every month. The catalog says what the game *has*; **when** a save
  reaches it (after the National Pokédex, after the Hall of Fame) is the trophies' job, below.
- **What HOME does not accept from a game never leaves it** — not to HOME and not to another game,
  since every path between games goes through HOME (`dexNaoTransferivel`). Such a record stays in
  the inventory and never shows up in "Take to HOME".
- **"Take to HOME" is the cards' "what can be allocated now"** (`oportunidadesHome`): a slot not in
  HOME, in one track, that a Pokémon the user already has in a game would fill. A slot counts once,
  however many copies exist; with copies in two games, the suggestion comes from the two-way game,
  since that one can come back.

### Trophies — `dex_trofeu`, from `seed/dex-trofeus.json`

- **Each game has a fixed trophy list, PlayStation style**: bronze, silver and gold, in story order,
  and a **platinum that is derived** when every other trophy of the game is earned — it is never a
  row (`lib/dominio/dex-trofeus.ts`).
- **Two kinds.** A `checkpoint` unlocks access to Pokémon in that save (FireRed's National Pokédex,
  the Sevii Islands, BDSP's Ramanas Park) and lists the national numbers it unlocks (`libera`). A
  `marco` is a milestone worth doing (a gym leader, a legendary, the Trainer Tower) and unlocks
  nothing. A species listed by several checkpoints is reachable only when **all** of them are earned.
  Locked species show on the add screen with the checkpoint's name; they are marked, never refused —
  a Pokémon may have come by trade.
- **The list is data, not code.** A new trophy is one more entry in the JSON; it is loaded on every
  boot by `pnpm seed:dex`, upserted, and a trophy that left the file is **deactivated, never
  deleted** — an earned trophy or a task may point at it. Every text exists in `pt-BR` and `en`.
- **What a checkpoint unlocks is checked data, never filled from memory**, like the availability
  catalog: every checkpoint carries its source (`fonte`), and a test fails if it unlocks a species
  that is not in that game's catalog. `requer` only points backwards in the file, so it can't loop.
- **Earning a trophy is one row in `dex_trofeu_obtido`**, by screen (`manual`) or by session
  (`sessao`); undoing deletes the row.

### Plans, tasks and planning sessions

- **Plans and tasks** (`dex_plano`, `dex_tarefa`) are what the user does in the games next. A plan
  may aim at trophies; a task may target slots (`forma_ids`) and a trophy. **Finishing a catch,
  evolve or trade task offers the add screen, already on the task's game; it never records the
  Pokémon itself** (`/dex/cadastrar?jogo=…&busca=…`).
- **Planning sessions run outside the app**, with an assistant, through two commands:
  - `pnpm dex:estado` prints the state that opens a session (markdown, or `--json`): progress, each
    owned game with its trophies, what it reaches now and what is locked behind which checkpoint,
    Pokémon not in HOME yet, active plans and tasks closed since the last session. Read-only.
  - `pnpm dex:aplicar` writes a session batch read from stdin (`lib/dominio/dex-sessao.ts`):
    earned trophies, plans with tasks, task and plan status, and Pokémon the user said they caught.
    **Always run `--simular` first.** Every batch and every item that creates something has a `ref`;
    a ref already applied is skipped (`dex_sessao_ref`), so re-running a batch changes nothing, and a
    later batch can point at an earlier plan by its ref. One invalid item refuses the whole batch.
    Records go in only as born in a game, only with forms in that game's catalog, under the same
    rules as the add screen. **Moving to HOME is not in the batch**: leaving a send-only game needs
    the user's confirmation on screen, and that confirmation is never automatic.

---

## Stopping points — stop and hand the decision back

In these cases, **stop and open an issue instead of improvising**. None of them is a bug to fix;
they are decisions already made, and reopening them inside a PR about something else is how they get
lost.

- **Any change to the eight business rules or to the stack table.**
- **Anything that exposes the system outside the local network** — auth, open CORS, public deploy,
  publishing the database port on the host.
- **Any PR that raises the request rate against LigaPokemon or against TCGdex**, changes the default
  to something more aggressive, or loosens the allowed-route check.
- **A destructive migration over real collection data** (a drop or alter that loses a filled
  column).
- **Rebuilding the collector's layer 2: offers by store.** It was built and **undone on purpose** on
  2026-09-16. It worked — the card page brings the stock by store in the HTML itself, 262 offers
  across 152 stores in one request — and it went out anyway. The reasons are worth more than the
  code:
  - **The organization by store is theirs, not ours.** Their "Otimizar minha Lista de Compras" runs
    over the entire marketplace and with the real price; we saw a slice and **did not even have the
    price per store** — the price per offer comes encoded in a CSS sprite, and the decision was not
    to undo that obfuscation.
  - **Splitting the list by variant made shipping worse.** Since their Extras selector applies to
    the whole list, asking for Reverse Foil on one card and normal on another required two lists —
    and two lists become two independent store optimizations inside their system, which is the
    opposite of the goal.
  - **It was not fluid:** two pastes, two selector adjustments, plus a "fetch variants" step before
    that.
  - Accepted consequence: **there is no Reverse Foil preference.** It is incompatible with a single
    list, and a single list is what makes their optimization work.
  - The code went out whole; migration `0016` drops the tables. If you think it is worth rebuilding,
    the place to discuss that is an issue, before writing code.

---

## The app is HTTP on the local network — what that forbids in the browser

The app is opened at `http://<machine-ip>:3010`, not at `localhost`. At that address the browser is
**not** in a *secure context*, and every API marked "secure context only" simply does not exist:
`navigator.clipboard` is `undefined`, and calling it blows up before doing anything.

That is how the "Copy" button on the lists was born broken: it worked on `localhost` on the machine
where it was developed and did not work on the screen of whoever opened it by IP. The fallback to
`document.execCommand("copy")` lives in `app/_componentes/copiar-texto.ts`; use it instead of
calling the Clipboard API directly. The same restriction applies to geolocation, notifications,
service workers and the like.

---

## Definition of done

A change is only done when:

- `pnpm typecheck`, `pnpm lint` and `pnpm test` pass — with `pnpm exec next typegen` before the
  typecheck;
- the business rules that were touched have tests, and the tests run without a database;
- the app comes up through `docker compose up -d --build` with no manual intervention;
- no collection data, card image or personal name entered the diff;
- the comment that explained the decision you changed was updated along with it — a comment that
  lies is worse than no comment.

---

## Out of scope — do not build

Deck building and format legality; sales, trading and trade control; card scanning by photo;
multi-user and login; native app.
