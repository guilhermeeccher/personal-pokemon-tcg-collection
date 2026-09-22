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
volume, and counting the 48,169 cards in the database — not `docker build` passing.

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
deactivated) and `origem` (a row created by hand by the user, `origem = manual`, is never demoted to
`sync`, which would expose it to deactivation). Do not "simplify" this into an upsert that updates
everything.

A seed failure **does not take the app down**: the entrypoint uses `if !` precisely so that `set -e`
does not kill the container. The format of the files, the regeneration and the reason for every
detail are in [`seed/README.md`](./seed/README.md) and in `lib/dominio/seed-catalogo.ts`.

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

### Export to LigaPokemon

Two distinct flows, which **share no format**: uploading the collection (learned from real exports
from the site, `lib/dominio/exportacao-liga.ts`) and the Buy by List (`[Quantidade] [Card]`, e.g.
`2 Charizard (1/111)`).

Two things about the buy list format **have not been verified** against a real paste, and are
declared uncertain in `exportacao-lista-compra.ts`: the leading zero (we send `003`, the way their
search returns it) and the edition tiebreak (`(003/132)` does not say `MEG`). **Do not turn those
uncertainties into statements** without a paste that answers them.

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
