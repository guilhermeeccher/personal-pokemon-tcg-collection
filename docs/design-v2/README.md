# Design v2

The v2 is a rewrite of the **whole frontend** in a new visual language: dark only, liquid glass
surfaces, holographic cards that tilt under the finger, and a card detail that grows out of the card
you touched. It redoes all 23 screens of today's interface, login and Living Dex included. It does
not touch the domain: **the eight business rules in [`AGENTS.md`](../../AGENTS.md) do not change**,
the 66 API routes are reused as they are, and no database migration is planned.

This folder is the contract of the transition. Three documents, read in this order:

| Document | What it holds |
|---|---|
| this README | what the v2 is, how the two versions live side by side, the phases and packages, and the nine product decisions |
| [`rules.md`](./rules.md) | every interface, mobile, HTTP, access, PWA and image rule of `AGENTS.md`, marked **v1 only**, **v2 only** or **both**, with the new wording of those that change, plus the technical foundations of the v2 |
| [`parity.md`](./parity.md) | every action a user can take on each of the 23 v1 screens, the v2 package that owns it, the operation it reuses, the evidence that accepts it, and its state |

Where this folder and `AGENTS.md` disagree about the v1, `AGENTS.md` wins: it is the v1's contract
and stays in force until the v1 is removed. Where they disagree about the v2, this folder wins, and
`AGENTS.md` says so in its "Design v2" section.

The visual reference is a prototype approved on 2026-11-22. It is **not** in the repository and never
will be: it carries card art, which the repository forbids (`AGENTS.md`, "What never enters the
repository"). It is a reference for look and behaviour, not for implementation — several things it
does are wrong for this app, and `rules.md` lists them as rules.

---

## The transition

### Two versions, two root layouts

The current interface becomes **the v1** and moves to `/v1`. The v2 opens at the root. Each screen
of the v2 goes live when it is ready; until then, the root path of that screen sends the user to the
same screen in `/v1`.

The separation is done with **route groups and two root layouts** (decision of 2026-11-22; the
alternatives were one shared root layout with a nested `/v1` layout, or a fallback rewrite in
`next.config.ts`):

```
src/app/
  (v1)/
    layout.tsx            ← today's root layout, unchanged
    globals.css, tokens/  ← moved, content unchanged
    login/                ← URL /login, in the v1 skin until package 1f
    v1/
      page.tsx, inicio.tsx, cadastro/, colecoes/, inventario/, dex/
  (v2)/
    layout.tsx, v2.css    ← dark skin, intl, lang, data-pwa, PWA metadata, bfcache
    page.tsx, colecoes/…  ← real v2 screens, or bridge pages
    dex/[[...resto]]/page.tsx  ← one bridge for the whole Dex until package 5-0
  _componentes/, _acoes/  ← stay where they are (the v1 imports them)
  api/, manifest.webmanifest/, robots.txt/, pwa/, favicon.ico  ← do not move
```

- **Changing root layout reloads the whole document.** That is what isolates the CSS: the v1's
  cream stylesheet and ~250 colour classes never meet the v2's dark one, and nothing in the v1 is
  rewritten. A move between v1 and v2 is a full page load; that is accepted for a temporary
  transition.
- **What stays at the root, unchanged:** the API, `/login`, the manifest, `robots.txt`, the PWA
  icons and the favicon. The proxy and the password-access module do not change: a route group
  changes the folder, not the URL.
- **The v1 keeps its own components** in `src/app/_componentes/`. The v2's live in a folder of its
  own, and the v2 does not import the v1's skin (see `rules.md`, "Isolation").

Three behaviours of Next 16.3 depend on having no top-level `app/layout.tsx`, and package 0a confirms
them before any v2 screen exists:

- `TODO(0a)`: the 404 of a path that matches nothing — whether Next requires a
  `global-not-found.tsx` (and its flag) without a top-level layout, and what its body looks like.
  The password module's "404 while off" contract keeps holding by construction (its paths are
  rewritten to a folder with no route), but the body of the 404 page changes from today's build.
- `TODO(0a)`: whether `src/app/favicon.ico` is still injected in the `<head>` of both root layouts.
- `TODO(0a)`: whether the language switch's `revalidatePath("/", "layout")`
  (`src/app/_acoes/definir-locale.ts`) refreshes pages under both root layouts.

### Bridge pages

Every screen the v2 has not done yet has, in its place, a **bridge page**: three lines that call
`await exigirSessao()` and redirect with **307** to `/v1/<same screen>`, the query string intact.

- **307, never 308.** A browser keeps a 308 forever and would keep going to `/v1` after the v2
  screen exists.
- **A page, not `redirects()` in `next.config.ts`.** A config redirect runs before the proxy (the
  307 would leave without the security headers, and would answer even when the password module is
  misconfigured and everything should be a 503), it is built without the `.env` (it cannot know
  whether the Living Dex is on), and it beats the file system (a forgotten entry would hide a
  finished v2 screen). A bridge page goes through the proxy, the session guard and
  `cobertura-estatica.test.ts` with no new exception.
- **13 bridges in phase 0:** 12 for the card screens (`/`, `/cadastro/busca`, `/cadastro/set`,
  `/colecoes`, `/colecoes/[id]`, `/colecoes/[id]/opcoes-compra`, `/colecoes/falta`,
  `/colecoes/nova`, `/inventario`, `/inventario/precos`, `/inventario/repetidas`,
  `/inventario/visao-geral`) and **one catch-all for the Dex**, `(v2)/dex/[[...resto]]`, which
  checks the module flag **before** redirecting: with `MODULO_LIVING_DEX` off, `/dex/...` answers
  404 directly, never a 307 first.
- **No catch-all at the root of the v2.** It would swallow the password module's private 404 paths.
  A catch-all exists only below `/dex`.
- **The destination is built by a pure, tested function** (`lib/dominio/destino-v1.ts`): it keeps
  repeated keys, accents, `+` and `%` in the query, and encodes the `[id]` segment.
- **`telas-v1.test.ts`** keeps the pairing honest: every page under `(v1)/v1/**` has a root
  counterpart (a real v2 page or a bridge), every bridge points at a v1 screen that exists, and no
  screen path literal in the v1 starts without `/v1` (paths under `/api/`, `/login`, `/pwa/` and `#`
  anchors are allowed). The 82 hand-written screen paths in 19 v1 files get the `/v1` prefix in
  package 0a.
- **A v1 flow ends in the v1.** The v1 never links to the root. The v2, on the other hand, may link
  to a root path whose screen is still a bridge: the link is already right when the screen arrives.
- To see what is still bridged: `grep -rl irParaV1 'src/app/(v2)'`.

### A bridge leaves only when parity is checked

A v2 screen existing is not enough to remove its bridge. The package replaces the bridge with the
real page **only after every v1 action of that screen is marked `delivered` in
[`parity.md`](./parity.md)**, each with its acceptance evidence. Counting finished pages does not
show that the edit form, the batch button or the confirmation of a destructive action made it
across; the matrix does.

An action deliberately left to a later package keeps an **explicit way to do it in the v1**: the v2
screen shows a "Do it in v1" link (`/v1/<screen>`, with the context in the query when the v1 reads
it) next to where the action will live, and `parity.md` marks the row `deferred` with the package
that will deliver it. The link goes away when that package delivers the action.

### New functionality goes only to the v2

From the start of phase 0, **new functionality enters only the v2**. The v1 gets fixes, not
features. It is temporary and leaves in phase 6.

---

## Phases and packages

Each package is one worker in its own worktree, branched from `main`. **At most four packages run in
parallel.** Before the merge, every package goes through a review by a second model, requested by
the worker itself, at high effort — very high for the packages marked ⚑, which touch routing,
access, a transaction or a rule. The coordinator merges into `main` one package at a time.

**Integration files.** `lib/dominio/tipos-cliente.ts`, `lib/db/consultas.ts` and `messages/*.json`
are touched by almost every package. Parallel packages use their own message namespaces and types,
and the merge of those three files is always sequential.

### Phase 0 — Base (goes live with no new screen visible)

| Package | Delivers | Depends on |
|---|---|---|
| **0a ⚑ v1 at `/v1`** | the route groups; the **two minimal root layouts** (the v1's unchanged; the v2's dark, with metadata, intl, `lang`, `data-pwa` and the bfcache script); login moved into `(v1)`; the 82 paths prefixed; the 13 bridges; `destino-v1` with its test; `telas-v1.test.ts`; the adjustments to `cobertura-estatica.test.ts`; the three Next behaviours confirmed; v1 screenshots before and after (320, 393, ~734, 768, 1024, 1400 px), which must come out equal | — |
| **0b Card and motion** | the Card component (holo per variant, spring tilt, image origin ported from the v1) and the spring and `<ViewTransition>` utilities, **in a folder of the v2's own**, without touching `imagem-carta-zoom.tsx`, the old CSS and tokens, or the layouts; consumes a token interface fixed in its specification; includes the React canary types file; reduced motion and light mode fully specified (signals used, behaviour without them, persistence, precedence of the switch); pure tests | — (parallel to 0a) |
| **0d Contract** | this folder: the rules matrix and the action parity matrix; the "Design v2" section in `AGENTS.md` and the route table in `CONTRIBUTING.md`. **Approved by the project owner before it lands** | drafted in parallel to 0a; closed after it |
| **0c Shell and primitives** | expands 0a's skeleton: tokens, glass, rail and tab bar, button / field / panel / modal / confirmation / notice, layers with scroll lock at every width and focus return; v2 safe areas separate from the PWA (decision 9); keeps metadata, intl and bfcache | 0a, 0d |

### Phase 1 — Collections (the core of the prototype)

| Package | Delivers | Depends on |
|---|---|---|
| **1a ⚑ Collection reads** | aggregated grid read (slots with rarity, copy, upgrade, free copy, identifiable buy choices); the "missing" DTO (proposed candidate and its criterion, price with source, date and quote, current choices, alternatives on demand, **the out-of-stock filter preserved**, including the exception for a selected card, and the Liga tabs through the official `abasLiga`); the card detail read (illustrator, types, copies, active-source price, short series for an owned card) | 0a |
| **1b Card detail** | the detail layer in its two modes, slot and copy: allocate, swap, deallocate, mark to buy, local photo, **edit the copy** (quantity, physical language, variant, condition, location, grading, acquisition, notes) | 0b, 0c, 1a |
| **1c List and new collection** | `/colecoes` in "view" mode ("Organize" leads to the v1 until 4b) and `/colecoes/nova` | 0c |
| **1d Collection** | **owner of the page `/colecoes/[id]` and of the tab contract**: Binder 3×3 to 6×6, Whole set, Upgrades, every collection operation (name, notes, secrets, scope, required language, add and remove a single card, add to a custom collection, delete) and the **reusable virtual grid** with its measurement | 1a, 1b, decision 1 |
| **1e What's missing** | its own components, integrated into 1d's tab structure: mark by tap and by drag, "mark the best of each slot" as an explicit shortcut with the criterion visible, multiple choices kept, manual choice when there is no price (works before the first price round), Liga source preserved (decision 3), copy the list; `/colecoes/falta` | 1a, 1b, 1d's structure, decisions 2 and 3 |
| **1f Login** | `/login` in the v2 look: moves the page between the groups and updates the exact exception in the coverage test (never two pages for `/login`) | 0c |

### Phase 2 — Home and inventory

Phases 2, 3 and 5 have no dependency column of their own: when each of their packages starts is
set by the dispatch order below.

| Package | Delivers | Dispatched |
|---|---|---|
| **2a ⚑ Home** | showcase, "Almost there", recent entries (decision 5) with the `criado_em` fix in both lot-split paths, with evidence that the date is kept and of rollback after a refusal past the first write; Dex summary | step 4, once 1b closes; needs decision 5 |
| **2b Inventory** | `/inventario` with the detail in copy mode and the **bulk edit**; the URL filter keys stay the same | step 4, once 1b closes |
| **2c Overview and duplicates** | `/inventario/visao-geral`, `/inventario/repetidas` | step 4, once 1b closes |
| **2d Prices** | `/inventario/precos` (rounds, chart, two sources) | step 5 |

### Phase 3 — Card entry

| Package | Delivers | Dispatched |
|---|---|---|
| **3a Entry by set** | `/cadastro/set` (batch grid, phone first) | step 5 |
| **3b Entry by search** | `/cadastro/busca`, **with the manual card entry** | step 5 |

### Phase 4 — Advanced buying and organizing

| Package | Delivers | Depends on |
|---|---|---|
| **4a Buy options** | its own page `/colecoes/[id]/opcoes-compra` in the v2 (the same URL as today), opened from the "What's missing" tab: price round, out-of-stock paste, filters, exports | 1e |
| **4b Organize collections** | groups, order, batch actions, suggestions, thematic collection, inside `/colecoes` | **1c** |

### Phase 5 — Living Dex (a third of the frontend)

Every Dex screen writes, including those that look read-only (the Pokédex sections, the boxes
preference, "Put away" on Received); the existing mutations and confirmations are kept on all of
them.

| Package | Delivers | Dispatched |
|---|---|---|
| **5-0 Dex bridges** | replaces the single Dex bridge with one bridge per screen, keeping the direct 404 with the module off; names the owner of the Dex shared components | step 6 |
| **5a Overview and Pokédex** | `/dex`, `/dex/pokedex` | after 5-0 |
| **5b Boxes and received** | `/dex/caixas`, `/dex/recebidos` | after 5-0 |
| **5c Register** | `/dex/cadastrar` (virtualized) | after 5-0 |
| **5d New registration** | `/dex/novo-cadastro` (two steps), with its own definition of done | after 5-0 |
| **5e Inventory, games, trophies and plans** | the four screens; the split is reassessed by size, and plans get their own definition of done | after 5-0 |

5a to 5e run in parallel, four at a time.

### Phase 6 — End of the v1

- The `/v1/...` URLs start **redirecting to their root equivalent**, with the query, without loops,
  and with the same treatment of the Dex when the module is off: they entered history and bookmarks
  during the transition. A small compatibility test of those URLs stays.
- The `(v1)/v1/` tree, the bridges, the pairing test, and the v1's layout, CSS and exclusive
  components are deleted as their importers reach zero; comments that cite routes are reviewed;
  `AGENTS.md` is updated (its v1-only rules go, the v2 rules from `rules.md` move in).
- Only after the v2 covers everything, the parity matrix is complete (with the cases of business
  rules 1 to 8) and a period of use the project owner sets has passed. Review ⚑.

### Dispatch order

1. **0a ∥ 0b ∥ draft of 0d.**
2. 0d approved → **0c ∥ 1a.**
3. **1b ∥ 1c ∥ 1f** (1c and 1f depend only on 0c).
4. **1d** → **1e**; in parallel, **2a ∥ 2b ∥ 2c** as soon as 1b closes.
5. **2d ∥ 3a ∥ 3b ∥ 4b** (4b depends on 1c); **4a** after 1e.
6. **5-0** → **5a to 5e**, four at a time.
7. Phase 6.

### When a package is done

- `pnpm exec next typegen && pnpm typecheck && pnpm lint && pnpm test` pass; a rule touched has a
  test with no database; a transactional operation touched comes with evidence of rollback (the
  pure rules of allocation, swap and lot split are tested; the transactions themselves are not, so
  every package that touches them brings its own evidence and an explicit review of the flow).
- The second-model review was done and its findings fixed or justified.
- The actions of that screen are marked `delivered` in `parity.md`, and only then the bridge is
  replaced with the real page; the pairing test passes.
- The screen was seen in both arrangements (rail from 768 px, tab bar below), in pt and en, at 320,
  393, ~734, **768**, 1024 and 1400 px; and on a real iPhone at every phase (the cost of the glass,
  the gestures and the keyboard only show there).
- `docker compose up -d --build` from scratch comes up with no intervention.
- No collection data, card image or personal name in the diff.
- Phase 0 has its own checklist: password on and off, PWA, Living Dex on and off, 307 with the query
  intact, and the v1 identical before and after by screenshot.

---

## The nine product decisions

Decided on 2026-11-22. Each one is a product rule for the v2; the package it binds is in brackets.

1. **Binder and Whole set in a Pokédex or custom collection** [1d]. A **Pokédex** collection (up to
   1,025 slots, no "card of the slot"): the Binder pages by national number, and Whole set becomes
   "Whole Pokédex", virtualized. A **custom** collection (no denominator): only Whole set, in
   allocation order.
2. **Marking to buy a slot with several possible cards** [1e]. In a set, a tap marks the slot's
   card. In a Pokédex, a tap opens the slot's options. "Mark the best of each slot" is an explicit
   shortcut, with the criterion and the card visible. With no price, the choice is manual. Several
   choices per slot stay allowed. "Clear the slot" is a named action, never a tap.
3. **An install with `PRECO_FONTE=liga`** [1e]. What works without the network is preserved:
   marking over options of scans already stored, unmarking, copying the list. The screen explains
   that new lookups are unavailable, and never works around the block. No rule changes.
4. **Marking to buy arrives in phase 1** (package 1e), as in the prototype, not in phase 4 [1e].
5. **"Arrived this week" counts by the copy's entry date** [2a]. Labelled "Entered in the last 7
   days", in the São Paulo time zone. The lot-split fix applies from then on; old splits and units
   merged into an existing row do not count, and the screen says so. Old dates are never repaired by
   inference. No migration.
6. **Glass refraction** [0c]. An enhancement only in Chrome over HTTPS; no functional detection
   over HTTP.
7. **Light mode (fewer effects)** [0b]. Automatic by heuristic, with a switch that always wins.
8. **Layout checking** [0a]. Screenshots with the Chromium already available on the machine, no new
   dependency and no change to the test stack (still "no e2e"); WebKit is checked on a real iPhone.
9. **`viewportFit: "cover"`** [0c]. Always on in the v2, with the v2's safe areas separate from the
   PWA. The manifest, the icons and the Apple metadata stay conditional on the password access.
