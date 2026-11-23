# Action parity matrix

Every action a user can take on each of the 23 screens of the v1, with the v2 package that owns it,
the operation it reuses, the evidence that accepts it, and the business-rule cases it touches. A
bridge page is replaced by its v2 screen **only when every row of that screen is `delivered`, or
`deferred` to a named package with a working "Do it in v1" link** (see the [README](./README.md),
"A bridge leaves only when parity is checked"). Phase 6 starts only when every row of the matrix is
`delivered`: nothing may still be deferred.

## How to read it

**v1 code** is `file:line` in the v1 as package 0a left it: the screens under `src/app/(v1)/v1/`,
the login under `src/app/(v1)/login/` (moved to `src/app/(v2)/login/` by package 1f), and the shared `src/app/_componentes/`, `src/app/_acoes/`
and `src/app/api/`, which did not move. The line is where the action starts (the button, the field,
or the handler that sends the request). Every reference was checked by script against the code it
cites; a v1 fix that shifts lines should update the rows it touches.

**Owner** is a package of the plan in the README. When an action is built inside a shared
component by one package and placed on the screen by another, the cell names both, builder first:
`1b → 1d` means package 1b builds it in the card detail and package 1d makes it reachable on that
screen. The row is `delivered` only when the action works on that screen, so the screen's package
marks it. A component reused as is (0b's Card) is named in "Reuses".

**Reuses** is the API route the v1 calls (and the `lib/db` function behind it for writes), or the
function the v1 uses on the client. The v2 reuses it unchanged unless the row says otherwise; a
v2 package that needs a new read (package 1a, 2a) adds it without changing these. A row that also
depends on one of package 1a's reads names it, marked "(1a)"; those reads are described in
[`data-contract.md`](./data-contract.md). The row's state is still set by the screen's package.

**Rules** are the business rules of `AGENTS.md` (R1 to R8) with the case the action has to keep,
and, when no business rule applies, the contract section it touches.

**Evidence** combines the codes below with what is specific to the row. Every row also needs the
general screen check (both arrangements, pt and en, the six widths): it is not repeated.

| Code | Evidence that accepts the action |
|---|---|
| `REQ` | The v2 sends the same request as the v1 — method, path and body shape — checked in the network log, and the screen reflects the response. |
| `REF` | Every refusal the route can return is shown, translated through `recusa.ts`: validation (400), gone (404), stale list or preview (409), with the screen state it leads to (re-read, close the preview). |
| `CONF` | The action asks through the v2 confirmation dialog, which replaces a v1 `window.confirm` or inline two-step confirm; cancelling sends nothing. |
| `TX` | The operation is all-or-nothing on the server: the package shows a refusal after the first write leaves nothing written, and reviews the transaction explicitly (these transactions have no automated test). |
| `NAV` | The link lands on the root equivalent of the v1 target, query intact; while that screen is still a bridge, the 307 to `/v1` carries the query. |
| `URL` | The query keys the v1 reads (or writes) are the same in the v2. |
| `DL` | The download is the same file: same route, same `Content-Disposition`, same columns. |
| `VIEW` | Screen-only state, no request: the same data gives the same result as the v1. |
| `HTTP` | Works over plain HTTP on the local network (no secure-context API). |
| `OFF` | With `MODULO_LIVING_DEX` off, the screen and its routes answer 404, with no 307 first. |

**State** is `pending` (not done), `deferred → <package>` (the v2 screen ships without it and shows
a "Do it in v1" link to the same screen in the v1; the row moves to the named package, which turns it
`delivered`), or `delivered` (done, with the evidence named in the PR). Every row starts `pending`.

---

## Shell (every screen)

Not one of the 23 screens, but every screen depends on it.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| SH-01 | Navigate through the menu (rail on desktop, drawer on mobile); the current item lights up by path prefix | `src/app/_componentes/nav.tsx:64`, `nav-estrutura.ts` (`encontrarAtivo`) | 0c | the menu map of `nav-estrutura.ts` (content, not form) | `NAV`; the item for `/colecoes/<id>` is "Collections" | Living Dex off: no Dex group | pending |
| SH-02 | Open and close the mobile drawer | `src/app/_componentes/nav.tsx:205` | 0c | — | `VIEW`; becomes the tab bar | Mobile layout (overlay stack) | pending |
| SH-03 | Go home through the brand | `src/app/_componentes/nav.tsx:91` | 0c | — | `NAV` to `/` | — | pending |
| SH-04 | Switch the interface language (pt / en) | `src/app/_componentes/seletor-locale.tsx:57` | 0c | server action `definirLocale` (`src/app/_acoes/definir-locale.ts`) | `REQ`; the current page re-renders in the other language under both root layouts (measured by package 0a: both have the layout route `/`, which `revalidatePath("/", "layout")` refreshes) | Access: server action checks session and origin | pending |
| SH-05 | Sign out ("Sair"), navigate only after the server confirms; "Back" afterwards reloads into the login | `src/app/_componentes/nav.tsx:139`, `:155` | 0c (bfcache script in 0a's layout) | `DELETE /api/sessao` | `REQ`; with the password module on, Back after Sign out lands on `/login` on a v2 page too | Access: session, bfcache | pending |

## 1. `/` — Home

v1: `src/app/(v1)/v1/page.tsx` (server read `lerTcgInicio`, `resumoDexInicio`) and `src/app/(v1)/v1/inicio.tsx`.
Read-only screen: every action is a link. Owner of the screen: **2a**. Package 2a replaced the bridge of `/` with the v2 home: the showcase (the overview's gems
in a fan, each card opening the card detail in copy mode), Almost there, "Entered in the last 7
days" (decision 5, a new block with no v1 row: it only opens the card detail, whose actions are
the detail's own rows), Your collections and the Living Dex summary. Every row was checked in pt
and en at 320, 393, 734, 768, 1024 and 1400 px, with the module on and off, with data and empty.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| INI-01 | Open a card-module shortcut (collections, inventory, entry by set) | `src/app/(v1)/v1/inicio.tsx:57`, `:150` | 2a | — | `NAV`. **2a:** the shortcut chips under the showcase (Collections, Inventory, Entry by set) land on `/colecoes` (v2) and on the bridges of `/inventario` and `/cadastro/set` (307 to `/v1/...`); with no copy at all, the empty showcase also offers Entry by set and Search | — | delivered |
| INI-02 | Open the card overview ("Overview") | `src/app/(v1)/v1/inicio.tsx:101`, `:139` | 2a | — | `NAV` to `/inventario/visao-geral`. **2a:** the Overview chip; the bridge answered 307 to `/v1/inventario/visao-geral` | — | delivered |
| INI-03 | Open the inventory from the totals | `src/app/(v1)/v1/inicio.tsx:186` | 2a | `lerTcgInicio` totals | `NAV`. **2a:** the cards and units figures of the showcase link to `/inventario` (bridge, 307 to `/v1/inventario`); the numbers are `lerTcgInicio`'s, the same as the v1 | — | delivered |
| INI-04 | Open the collections list ("See all", empty state) | `src/app/(v1)/v1/inicio.tsx:194`, `:202` | 2a | — | `NAV`. **2a:** the collections figure, "All collections" over Almost there, "See all (N)" and the empty state's "Create your first collection" land on `/colecoes`, a v2 page | — | delivered |
| INI-05 | Open one collection from "Your collections" (up to 4, with divisions) | `src/app/(v1)/v1/inicio.tsx:242` | 2a | `lerTcgInicio` (`src/lib/db/inicio.ts`), order of `listarColecoes` | `NAV` to `/colecoes/<id>`. **2a:** "Your collections" lists the first four in `listarColecoes` order (`lerTcgInicio`, never re-sorted), each a link to `/colecoes/<id>` (bridge until 1d, 307 with the id intact); a custom collection shows its count, no bar | Groups: order comes from the server, not re-sorted | delivered |
| INI-06 | Open a collection from "Almost there" (the divisions closest to complete, with what is missing) | `src/app/(v1)/v1/inicio.tsx:278` | 2a | `listarQuaseLa` | `NAV`; the missing thumbnails are the empty slots. **2a:** one card per division of `listarQuaseLa` (chosen among all collections, ties in `listarColecoes` order), linking to `/colecoes/<id>`; Pokédex thumbnails are the species silhouette, set thumbnails the expected card greyed; the percentage floors and never reads 100 with slots missing; the first one also feeds the lead line and its "Open …" button | R6 (the missing list is the output); R4 (set divisions count official numbering) | delivered |
| INI-07 | Open a Dex shortcut (plans, trophies, Pokédex) | `src/app/(v1)/v1/inicio.tsx:63`, `:150` | 2a | — | `NAV`; `OFF` hides the whole Dex block. **2a:** Plans, Trophies and Pokédex chips in the Living Dex panel, landing on the Dex bridge; with `MODULO_LIVING_DEX` off the panel is not rendered and the summary is not read, and `/dex` answered 404 | Living Dex optional | delivered |
| INI-08 | Open the Dex overview | `src/app/(v1)/v1/inicio.tsx:105`, `:139` | 2a | — | `NAV` to `/dex`; `OFF`. **2a:** "Overview" in the panel header and both track rings link to `/dex` | Living Dex optional | delivered |
| INI-09 | Open a Dex pending item: received to put away, Pokémon to take to HOME | `src/app/(v1)/v1/inicio.tsx:335`, `:340` | 2a | `resumoDexInicio` | `NAV`; counts equal the v1's. **2a:** "N received to put away" to `/dex/recebidos`, "N Pokémon to take to HOME" to `/dex/pokedex`, only when non-zero; with three records born in HOME both `/` and `/v1` read "3 received to put away" (same `resumoDexInicio`) | Living Dex: "Received", "Take to HOME" | delivered |
| INI-10 | Open the active plans and their tasks | `src/app/(v1)/v1/inicio.tsx:359`, `:367`, `:382` | 2a | `resumoDexInicio` | `NAV` to `/dex/planos`. **2a:** up to two active plans with up to two open tasks each, the "+N" lines, and the empty state's "Open Plans", all to `/dex/planos` | — | delivered |
| INI-11 | Open HOME trophies, open owned games | `src/app/(v1)/v1/inicio.tsx:477`, `:500` | 2a | — | `NAV` (`/dex/trofeus?jogo=home`, `/dex/jogos`). **2a:** the next HOME trophy (computed, never marked) links to `/dex/trofeus?jogo=home` (307 kept the query), "Mark the games you own" to `/dex/jogos` | HOME trophies are computed | delivered |

## 2. `/colecoes` — Collections list

v1: `src/app/(v1)/v1/colecoes/pagina-cliente.tsx` and the files beside it. The file already separates the
"view" mode from "organize". **1c** delivers "view" and keeps a "Do it in v1" link for everything
of **4b** until 4b ships (the plan's "Organize leads to the v1 until 4b"): the bridge of
`/colecoes` is replaced by 1c with the 4b rows `deferred → 4b`, and 4b turns them `delivered`.
The "Do it in v1" link is the **Organize in v1** button (`/v1/colecoes`) with a line saying what lives there: groups, order, batch actions, suggestions and the thematic collection. It goes away when 4b delivers.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| COL-01 | See the collections in sections by group, in display order | `src/app/(v1)/v1/colecoes/pagina-cliente.tsx:143` | 1c | `listarColecoes`, `ordenarColecoes` (read on the server: the page does not call `GET /api/colecoes`) | `REQ`; same order as the v1, collections and groups from one read; stale responses discarded (`:20-28`). **1c:** the page reads on the server (`lerListaColecoesV2`: `listarColecoesNaVitrine` + `listarGruposColecao`), in `listarColecoes` order, and never sorts; the DOM order matched `GET /api/colecoes` on a six-collection install with one group (the group's two first, then "no group"); a collection whose group is missing from the groups read falls into "no group" (`secoesDaLista`, tested). No client fetch, so there is no stale response to discard | Groups: one ordering source, never re-sorted on screen | delivered |
| COL-02 | Open a collection | `src/app/(v1)/v1/colecoes/pagina-cliente.tsx:458` | 1c | — | `NAV`. **1c:** each card is one link to `/colecoes/<id>`; clicking it landed on `/v1/colecoes/<id>` (bridge until 1d) | — | delivered |
| COL-03 | Create a new collection | `src/app/(v1)/v1/colecoes/pagina-cliente.tsx:281` | 1c | — | `NAV` to `/colecoes/nova`. **1c:** "New collection" lands on `/colecoes/nova`, a real v2 page | — | delivered |
| COL-04 | Open "What's missing" across collections | `src/app/(v1)/v1/colecoes/pagina-cliente.tsx:278` | 1c | — | `NAV` to `/colecoes/falta`. **1c:** "Missing cards" lands on `/v1/colecoes/falta` through the `/colecoes/falta` bridge (until 1e) | R6 | delivered |
| COL-05 | See and follow the notice of free copies that fit empty slots | `src/app/(v1)/v1/colecoes/pagina-cliente.tsx:180`, `:290` | 1c | `GET /api/copias/elegiveis-vagas-vazias` | `REQ`; counts "ready" and "out of pattern" match the v1. **1c:** the notice reads `GET /api/copias/elegiveis-vagas-vazias` in the browser after the list, so a failure shows nothing; with one free copy it read "1 free copy…" and its button went to `/colecoes/falta`; counts are the route's own | R5 (suggests, never allocates); R2, R3 (eligibility) | delivered |
| COL-06 | Retry a failed list read | `src/app/(v1)/v1/colecoes/pagina-cliente.tsx:340` | 1c | the same server read as COL-01 | `REQ`. **1c:** with the database stopped the page shows the error with "Try again"; with the database back, the click re-rendered the list (`router.refresh`, 9 cards), and the error never reads as an empty list | — | delivered |
| COL-07 | Enter and leave "Organize" | `src/app/(v1)/v1/colecoes/pagina-cliente.tsx:275` | 4b | — | `VIEW` | — | deferred → 4b |
| COL-08 | Move a group up or down | `src/app/(v1)/v1/colecoes/pagina-cliente.tsx:376`, `:385`, `:206` | 4b | `PUT /api/grupos-colecao/ordem` | `REQ`, `REF` (409 stale list → re-read, nothing applied) | Groups: whole list, exactly the current set; up/down, never drag | deferred → 4b |
| COL-09 | Move a collection up or down inside its section | `src/app/(v1)/v1/colecoes/pagina-cliente.tsx:479`, `:488`, `:216` | 4b | `PUT /api/colecoes/ordem` | `REQ`, `REF` (409) | Groups: whole section list; up/down, never drag | deferred → 4b |
| COL-10 | Move a collection to another group or to "no group" | `src/app/(v1)/v1/colecoes/pagina-cliente.tsx:499`, `:220` | 4b | `PATCH /api/colecoes/:id/grupo` | `REQ`, `REF` | Groups: one level, at most one group; under the organization lock | deferred → 4b |
| COL-11 | Create a group (name, optional linked series) | `src/app/(v1)/v1/colecoes/pagina-cliente.tsx:328`, `src/app/(v1)/v1/colecoes/modal-grupo.tsx:51`, `:87` | 4b | `GET /api/grupos-colecao/series`, `POST /api/grupos-colecao` | `REQ`, `REF` | Groups: series is Western only, case-sensitive | deferred → 4b |
| COL-12 | Rename a group or change its linked series | `src/app/(v1)/v1/colecoes/pagina-cliente.tsx:393`, `src/app/(v1)/v1/colecoes/modal-grupo.tsx:86` | 4b | `PATCH /api/grupos-colecao/:id` | `REQ`, `REF` | Groups | deferred → 4b |
| COL-13 | Delete a group (its collections go to the end of "no group") | `src/app/(v1)/v1/colecoes/pagina-cliente.tsx:402`, `src/app/(v1)/v1/colecoes/modal-grupo.tsx:167` | 4b | `DELETE /api/grupos-colecao/:id` | `REQ`, `CONF`, `TX` (moving the collections and deleting the group in one transaction) | Groups: deleting a group never deletes a collection | deferred → 4b |
| COL-14 | "Create missing collections" of a linked group: preview, tick sets, rename each, re-read, create | `src/app/(v1)/v1/colecoes/pagina-cliente.tsx:412`, `src/app/(v1)/v1/colecoes/modal-faltantes.tsx:73`, `:212`, `:237`, `:254`, `:153` | 4b | `GET`/`POST /api/grupos-colecao/:id/faltantes` (`criarFaltantesDoGrupo`, through `resolverCriacaoColecao` and `inserirColecaoComVagas`) | `REQ`, `REF` (409 when the series or a set changed since the preview; 404 when the group is gone, preview closed), `TX` (all or nothing) | R4 (each set counts official numbering); catalog per card pt→en; promo and energy sets come unticked | deferred → 4b |
| COL-15 | "Bring the existing ones" into a linked group: preview, tick, re-read, bring | `src/app/(v1)/v1/colecoes/pagina-cliente.tsx:420`, `src/app/(v1)/v1/colecoes/modal-existentes.tsx:71`, `:203`, `:219`, `:147` | 4b | `GET`/`POST /api/grupos-colecao/:id/existentes` | `REQ` (each item carries `grupoOrigemId`), `REF` (409 when a source group changed), `TX` | Groups: only those in no group come ticked | deferred → 4b |
| COL-16 | Collapse or expand the suggestions section (remembered per device) | `src/app/(v1)/v1/colecoes/secao-sugestoes.tsx:190` | 4b | `localStorage`, in `try/catch` | `VIEW`, `HTTP` | — | deferred → 4b |
| COL-17 | See all suggestions or only the first six; retry a failed read | `src/app/(v1)/v1/colecoes/secao-sugestoes.tsx:255`, `:201`, `:110` | 4b | `GET /api/sugestoes` | `REQ`; same order (rounds across kinds) | Suggestions: order, thresholds | deferred → 4b |
| COL-18 | Create a set collection from a suggestion (prefilled new-collection screen) | `src/app/(v1)/v1/colecoes/secao-sugestoes.tsx:230` | 4b | — | `NAV` to `/colecoes/nova?set=<id>`, `URL` | R5 (nothing created without the click) | deferred → 4b |
| COL-19 | Create a thematic collection from a suggestion: name, group, create; open the existing one when the theme already has a collection | `src/app/(v1)/v1/colecoes/secao-sugestoes.tsx:240`, `src/app/(v1)/v1/colecoes/modal-tema.tsx:84`, `:146`, `:159` | 4b | `POST /api/colecoes` (`parametro.tema`) | `REQ`, `REF` (409 `temaJaTemColecao` → link to the existing collection) | R5; Suggestions: one thematic collection per theme, created under the lock | deferred → 4b |
| COL-20 | Dismiss a suggestion forever ("Not interested", two steps) | `src/app/(v1)/v1/colecoes/secao-sugestoes.tsx:245`, `:218`, `:221`, `:142` | 4b | `POST /api/sugestoes/dispensar` | `REQ`, `CONF` | Suggestions: "Not interested" is forever | deferred → 4b |
| COL-21 | After creating a thematic collection, allocate "your cards that fit": tick, all, none, re-read, confirm | `src/app/(v1)/v1/colecoes/pagina-cliente.tsx:252`, `src/app/(v1)/v1/colecoes/modal-cartas-do-tema.tsx:89`, `:253`, `:225`, `:228`, `:289`, `:169` | 4b | `GET`/`POST /api/colecoes/:id/cartas-do-tema` (`alocarCartasDoTema`) | `REQ` (each item carries the preview's quantity and "already in"), `REF` (409 when anything changed; nothing written), `TX` | R1 (a free copy only, one slot); R5 (one copy per card pre-ticked, a second only by the user); R7 (required language checked on the physical copy) | deferred → 4b |
| COL-22 | Zoom a card in "your cards that fit" without losing the ticks | `src/app/(v1)/v1/colecoes/modal-cartas-do-tema.tsx:272` | 4b (1d on the collection page, CID-13) | 0b's Card | closing the zoom keeps the ticks; nothing only on hover. **1d:** delivered on the collection page (CID-13): the thumbnail opens the card detail in copy mode above the list, and closing it kept every tick; the list page's flow after creating a thematic collection (COL-21) stays with 4b | — | deferred → 4b |

## 3. `/colecoes/[id]` — Collection

v1: `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx` and `bloco-tema.tsx`. **1d owns the page** and every
collection operation; the slot actions live in the card detail (**1b**), which 1d integrates; the
buy marking lives in the "What's missing" tab (**1e**). Rows marked `1b → 1d` are built by 1b and
placed on this page by 1d.

**1d (2026-11-23):** the bridge is replaced by the v2 page (`src/app/(v2)/colecoes/[id]/`). The
general check was done on invented data (a 165-slot set, a 266-slot set with secrets, a national
Pokédex, a scoped Pokédex, a custom and a thematic collection): pt and en, at 320, 393, 734 (sideways),
768, 1024 and 1400 px, the three types, the four binder sizes and the whole-list sizes, with reduced
motion and with light mode (the page-turn animation stops in both); no horizontal scroll at any of
them. Requests were read from the page's own `fetch` log; "another tab" in the evidence below is a
direct API call made between the screen's read and the click. The transactions are the v1's routes,
unchanged; for each `TX` row the refusal came back with the slot and allocation counts unchanged, and
the route's transaction was read again (the check runs inside it, before any write).

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| CID-01 | See the collection: header, progress, divisions, warnings, and the grid of slots (empty slots included) | `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx:102` | 1d | `GET /api/colecoes/:id` (`obterColecaoComVagas`); in the v2, 1a's aggregated read `GET /api/colecoes/:id/grade` | `REQ` or 1a's read with the same slots; the grid shows before the upgrades arrive. **1d:** one read, `GET /api/colecoes/:id/grade`, draws the header (name, type, theme, catalog, secrets and required-language chips, notes), the ring (`N of M`; the custom one shows only `N cards`), the divisions with their counts, both catalog warnings, and every slot — empty ones in the binder and the whole list, set slots with the expected card dimmed, Pokédex slots with the species sprite (R3: never a card); the upgrade flag comes in the same read, so the grid shows with it | R6 (every empty slot shown); R4 (official count, secrets per flag); R3 (forms share the slot, shown not split); missing-catalog warning measures the catalog | delivered |
| CID-02 | See which slots have an upgrade (loaded apart) | `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx:121` | 1d | `GET /api/colecoes/:id/melhorias`; in the v2, the flag per slot comes in `GET /api/colecoes/:id/grade` (`upgrade`), the candidates still from this route (1a) | `REQ`. **1d:** the flag per slot comes in `GET …/grade` (`upgrade`) and is the Upgrades tab's count and each slot's badge; the tab reads `GET /api/colecoes/:id/melhorias` for the best candidate and its axis (“Variant: normal → reverse”), rereading it on every new grid; if that read fails the list stays, with the axis. Nothing is swapped here: “See the swap” opens the slot's detail | R8 (flagged, never swapped) | delivered |
| CID-03 | Back to the collections list | `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx:196`, `:266` | 1d | — | `NAV`. **1d:** the “Collections” link above the name goes to `/colecoes` (the v2 list) | — | delivered |
| CID-04 | Filter: only empty slots; only slots with an upgrade | `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx:478`, `:489` | 1d | — | `VIEW`. **1d:** the filters became tabs: What's missing lists exactly the empty slots (a 251-slot scoped Pokédex showed its 191 empty ones and no filled one) and Upgrades exactly the slots with the flag; the binder and the whole list keep every slot | R6 | delivered |
| CID-05 | Filter a Pokédex by region | `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx:416` | 1d | — | `VIEW`. **1d:** the binder pages by national number (`No. 1–18`), and each region of the header is a jump: “Hoenn” turned the binder to the page holding no. 252, “Whole Pokédex” scrolls to it; no slot is hidden | R2, R3 | delivered |
| CID-06 | Edit name, required language and notes | `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx:310`, `:777` | 1d | `PATCH /api/colecoes/:id` (`atualizarColecao`) | `REQ`, `REF`. **1d:** Settings sends `PATCH /api/colecoes/:id` `{"nome","notas","idiomaExigido"}` as the v1 (`{"nome":"… (editada)","notas":null,"idiomaExigido":null}` → 200, grid reread); a blank name came back 400 “Edição inválida.” inside the dialog, what was typed kept, the name unchanged in the database | R7 (required language is about the physical copy) | delivered |
| CID-07 | Turn "include secrets" on or off (off asks first) | `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx:854`, `:857`, `:862` | 1d | `PATCH /api/colecoes/:id/secretas` (`alternarSecretasDaColecao`) | `REQ`, `CONF`, `REF`, `TX`. **1d:** the switch in Settings; turning it off asks first (cancel sent nothing) and then `PATCH …/secretas` `{"incluirSecretas":false}`; with 29 filled secret slots the server refused 400 (`secretasPreenchidas`, shown in the dialog) and the collection kept its 266 slots | R4 (`official` ↔ `total`); removed recipe cards stay out (`parametro.excluidas`); slots leaving take their allocation (R1, copy freed, never deleted) | delivered |
| CID-08 | Add or remove a region of a Pokédex scope (removing asks first) | `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx:910`, `:912`, `:927` | 1d | `PATCH /api/colecoes/:id/escopo` (`alterarEscopoDaColecaoPokedex`) | `REQ`, `CONF`, `REF`, `TX`. **1d:** the region chips in Settings (`proximoEscopo`, tested: all regions become `nacional`, canonical order, the last region cannot be removed); removing Johto asked first, sent `{"escopo":"regioes","regioes":["kanto"]}` and came back 400 “9 filled slots — johto (9)”, nothing changed; adding Hoenn sent `["kanto","johto","hoenn"]` → 200 and the grid grew | R2 (one `dexId`); R6; buy choices of slots that left are kept and drop off the list | delivered |
| CID-09 | Enter "Edit cards" mode (set collection) | `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx:318` | 1d | — | `VIEW`. **1d:** “Edit cards” (a set) toggles the mode: the remove button on every slot of the binder and the whole list, and the single-card search above the tabs; “Done editing” leaves it | — | delivered |
| CID-10 | Add a single card from any set: search by name, set, number; add it as an empty slot | `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx:995`, `:1004`, `:1025`, `:1029` | 1d | `GET /api/cartas`, `POST /api/colecoes/:id/cartas` (`incluirCartaNaColecao`) | `REQ`, `REF`. **1d:** `GET /api/cartas?set=sv04&numero=002`, then `POST …/cartas` `{"setId":"sv04","localId":"002"}` → 201 and the slot appeared; one line per card in the collection's catalog language, Japanese only in a Japanese collection (`umaLinhaPorCarta`, tested); a card another tab had just added came back 400 “Esta carta já está na coleção.”, the slot count unchanged and the grid reread | R4 (the slot key carries the set, `set/local_id`, never shown raw); catalog language per card; a removed recipe card added again leaves `excluidas` | delivered |
| CID-11 | Remove a slot (the "×" in edit mode; a filled slot frees its copy) | `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx:629`, `:173`, `:175`, `:181` | 1d | `DELETE /api/colecoes/:id/vagas/:vagaId` (`excluirVagaDaColecao`) | `REQ`, `CONF`, `REF`, `TX`. **1d:** the slot's remove button asks first, with the stronger text for a filled slot (cancel sent nothing); `DELETE …/vagas/:vagaId` → 200, the notice says when the copy became free, grid reread; a slot another tab had removed came back 404 “Vaga não encontrada.” and the grid was reread | R1 (the copy is freed, never deleted); recipe card remembered in `excluidas`; buy triage kept | delivered |
| CID-12 | Add a copy to a custom collection: search free copies, add, confirm an out-of-pattern one | `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx:1150`, `:1160`, `:1257`, `:1244`, `:1170` | 1d | `GET /api/copias?q=…`, `POST /api/colecoes/:id/copias` (`adicionarCopiaEmColecaoCustomizada`) | `REQ`, `CONF`, `REF`, `TX`. **1d:** “Add a copy” searches `GET /api/copias?alocacao=livre&tamanhoPagina=20&pagina=1`; a copy outside the required language asks first and only then sends `{"copiaId","permitirForaDePadrao":true}` (→ 201, grid reread); a copy another tab took meanwhile came back 400 “Esta cópia já está alocada em outra vaga.”, the search was redone and the collection kept its 31 slots | R1; R7 (required language on the physical copy); the slot is born with the allocation (custom has no universe) | delivered |
| CID-13 | Thematic collection: open "your cards that fit this theme", tick, confirm | `src/app/(v1)/v1/colecoes/[id]/bloco-tema.tsx:60`, `:83`; modal as COL-21 | 1d | `GET`/`POST /api/colecoes/:id/cartas-do-tema` | as COL-21. **1d:** the theme block reads the count (`GET …/cartas-do-tema`, reread on every new grid), “See cards” opens the list in a v2 dialog: one copy per card ticked, out-of-language never tickable, all/none, `POST …/cartas-do-tema` with each item's `quantidade` and `jaNaColecao` (14 items, one a 2-unit lot → 201); with one copy taken by another tab the batch came back 409, nothing was written (15 slots before and after) and the list was reread with the marks of unchanged rows kept (`marcasAposReler`, tested). The thumbnail opens the card detail in copy mode above the dialog and closing it kept every tick (COL-22 on this page) | as COL-21 | delivered |
| CID-14 | Download the collection as CSV | `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx:307` | 1d | `GET /api/colecoes/:id/exportar` | `DL`. **1d:** Settings → “Download CSV” is a plain link to `GET /api/colecoes/:id/exportar`, the same file | No collection data in the repository (the file is the user's) | delivered |
| CID-15 | Delete the collection (copies are never deleted) | `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx:327`, `:139`, `:141`, `:143` | 1d | `DELETE /api/colecoes/:id` (`excluirColecao`) | `REQ`, `CONF`, `REF`, `NAV`. **1d:** Settings → “Delete collection” asks first (cancel sent nothing), `DELETE /api/colecoes/:id` → 200 and the page lands on `/colecoes`; a collection another tab had deleted came back 404 and the page said “Coleção não encontrada.” with the way back | R1 (allocations released); groups: its section is renumbered under the lock | delivered |
| CID-16 | Open the buy options of the collection (Pokédex and set) | `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx:300` | 1e | — | `NAV` to `/colecoes/<id>/opcoes-compra` (a bridge until 4a); in the v2, opened from the "What's missing" tab. **1d:** until 1e, the tab shows the empty slots and a “Do it in v1” link to `/v1/colecoes/<id>`, whose “Verificar opções faltantes” opens the buy options | R6 (empty slots are cards to buy; custom has none) | deferred → 1e |
| CID-17 | Allocate a free copy to an empty slot: list the candidates, pick one, confirm an out-of-pattern one | `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx:736`, `:1295`, `:1396`, `:1383`, `:1302` | 1b → 1d (detail, slot mode) | `GET /api/vagas/:id/candidatos`, `POST /api/vagas/:id/alocar` (`alocarCopiaNaVaga`); in the v2, `livres` per slot in `GET /api/colecoes/:id/grade` and the copies in `GET /api/cartas/:cartaId/detalhe` (1a) | `REQ`, `CONF`, `REF`, `TX`. **1d:** tapping a slot opens the detail in slot mode with the transition (the card leaves the grid, a placeholder of the same size stays); allocating sent `POST /api/vagas/:id/alocar` `{"copiaId","permitirForaDePadrao":false}` → 200 and the grid was reread; closing returned focus to the slot's button. The refusals and the lot split are 1b's, unchanged | R1 (one slot, one collection, database constraint); R2 (exactly one `dexId` for Pokédex); R3 (forms compete for the slot); R5 (the user picks; the button stays visible and disabled with no candidate); R7 | delivered |
| CID-18 | Deallocate the copy of a slot (asks first) | `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx:690`, `:151`, `:152`, `:158` | 1b → 1d (detail, slot mode) | `DELETE /api/vagas/:id/alocar` (`desalocarVaga`); in the v2, the slot's copy from `GET /api/colecoes/:id/grade` or `GET /api/cartas/:cartaId/detalhe` (1a) | `REQ`, `CONF`, `REF`. **1d:** the detail's “Desalocar” asked first and sent `DELETE /api/vagas/:id/alocar` → 200; the grid was reread and the slot read “no. 001, Bulbasaur, empty, 1 free copy fits”. In a custom collection the slot disappears: the detail closed itself and focus went to the slot now in its place | R1 (copy back to free); R6 (the slot becomes an empty slot again); buy choice of that slot comes back to the list | delivered |
| CID-19 | Swap the slot's copy for a better one: see the candidates and the axis, confirm the swap | `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx:683`, `:1641`, `:1622`, `:1473`, `:1477` | 1b → 1d (detail, slot mode) | `POST /api/vagas/:id/trocar` (`trocarCopiaDaVaga`); in the v2, the flag from `GET /api/colecoes/:id/grade` (1a) | `REQ`, `CONF`, `REF`, `TX`. **1d:** from the binder, the whole list or Upgrades (“See the swap”): the detail's swap asked first and sent `POST /api/vagas/:id/trocar` `{"copiaId"}` → 200; the grid was reread and, the slot having left Upgrades, focus went to the slot now in its place (`vagaDoFoco`, tested) | R8 (atomic swap, flagged upgrade, never automatic; ladder rarity > language > variant, promo outside, decided in `melhoria-vaga.ts`); R1 | delivered |
| CID-20 | Discard an upgrade suggestion, or restore a discarded one; read what discarding means | `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx:1647`, `:1609`, `:1508`, `:1511`, `:1656` | 1b → 1d (detail, slot mode) | `POST`/`DELETE /api/vagas/:id/melhorias/descartar` (`descartarMelhoria`, `restaurarMelhoria`); in the v2, the flag from `GET /api/colecoes/:id/grade` (1a) | `REQ`, `REF`. **1d:** from Upgrades, the detail's “Descartar” sent `POST /api/vagas/:id/melhorias/descartar` → 200 and “Restaurar” `DELETE` on the same path → 200; each one reread the grid and the tab's candidates (`GET …/melhorias`) | R8 | delivered |
| CID-21 | Zoom a card image (hover with delay on desktop, tap on mobile) | `src/app/(v1)/v1/colecoes/[id]/pagina-cliente.tsx:644` (`ImagemCartaComZoom`) | 1b → 1d (the detail replaces the zoom) | the image origin of `imagem-carta-zoom.tsx`, ported into 0b's Card; in the v2, the high image and the card's data from `GET /api/cartas/:cartaId/detalhe` (1a) | the detail opens from the card; the user's own photo and the borrowed-photo mark show as in the v1; **1d:** the card in every slot opens the detail (the v2's zoom), by tap and by keyboard; the user's own photo and the borrowed-photo mark show through 0b's Card in the grid and in the detail | Nothing only on hover | delivered |

## 4. `/colecoes/nova` — New collection

v1: `src/app/(v1)/v1/colecoes/nova/pagina-cliente.tsx`. Owner: **1c**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| NOV-01 | Name the collection | `src/app/(v1)/v1/colecoes/nova/pagina-cliente.tsx:244` | 1c | — | `VIEW`. **1c:** required name field; whitespace-only reaches the server, which answers `colecaoInvalida` with the line "nome ausente ou vazio", shown | — | delivered |
| NOV-02 | Choose the type: Pokédex, Set, Custom | `src/app/(v1)/v1/colecoes/nova/pagina-cliente.tsx:256` | 1c | — | `VIEW`. **1c:** Pokédex, Set and Custom through the segmented control; one collection of each type created from this form | — | delivered |
| NOV-03 | Pokédex: national or by regions, and pick the regions | `src/app/(v1)/v1/colecoes/nova/pagina-cliente.tsx:273`, `:282`, `:288` | 1c | `ds/grade-escopo` (logic) | `VIEW`. **1c:** national or by region (nine toggle buttons with the number range); no region refuses before any request ("Pick at least one region"); the body carries `regioes` in the order picked; a Kanto-only Pokédex created 151 slots | R2, R3 | delivered |
| NOV-04 | Set: add sets to the recipe, remove one, keep the chosen order | `src/app/(v1)/v1/colecoes/nova/pagina-cliente.tsx:324`, `:144`, `:312`; `src/app/_componentes/seletor-expansao.tsx:84` | 1c | `GET /api/sets` (`SeletorExpansao`) | `REQ`; the same sets offered as in the v1 (every catalog language). **1c:** the recipe list adds in order, does not repeat, removes; two sets (`30th`, `30th-c`) went to `POST /api/colecoes` as `parametro.sets` in that order; no set refuses ("Pick a set"). **Decision of 2026-11-22, v2 only (the v1 still sends pt for any set, so a Japanese-only set is refused there):** each recipe entry remembers the catalog it was chosen from, decided by the chosen set's catalog and never by its id (`catalogoDoSetEscolhido`: a Japanese-only set is Japanese; a set in both, like `neo1`, is Japanese only when chosen under the "Japanese" filter); a Japanese-only recipe sends `idiomaCatalogo: jp` with no language to pick (a collection of `neo1` + `M6a` in Japanese came out with 199 slots, `neo1` contributing its 96 Japanese cards), a Western recipe is unchanged, and a mixed recipe shows a warning and never sends (0 `POST` in the network log; the warning at 393 and 1400 px, pt and en). The v2 has its own picker (`seletor-de-set.tsx`) over `GET /api/sets`, since it cannot import the v1's | R4; set recipe in order | delivered |
| NOV-04b | Set picker: filter the sets by catalog language, search by name, code or id, pick one | `src/app/_componentes/seletor-expansao.tsx:138`, `:155`, `:165` | 1c | `SeletorExpansao` logic | `VIEW`; same results as the v1 for the same query. **1c:** same pure functions as the v1 (`agruparSetsPorSerie`, `filtrarSetsPorIdioma`, `formatarRotuloSet`) plus `buscarSets` (name, code or id, tested); counts per language are over the whole catalog (319 / 93 / 202 / 121 on the test install) | — | delivered |
| NOV-05 | Set: catalog language preference (pt or en; a warning when a set has no pt rows) and "include secrets" | `src/app/(v1)/v1/colecoes/nova/pagina-cliente.tsx:338`, `:352` | 1c | — | `VIEW`. **1c:** catalog language pt or en with the missing-pt note (Western recipes only; a Japanese-only recipe sends `jp` and the field is not shown), and the secrets checkbox with `{total}` and `{oficiais}` from `totaisDeSecretas` (a set with no official numbering counts the total on both sides; a set chosen as Japanese whose row on screen is the Western one, like `neo1`, shows the checkbox without totals rather than another catalog's numbers) | R4 (`official` / `total`); catalog language per card, Japanese never a fallback | delivered |
| NOV-06 | Required language, group, notes | `src/app/(v1)/v1/colecoes/nova/pagina-cliente.tsx:372`, `:85`, `:386`, `:398` | 1c | `GET /api/colecoes` (groups) | `REQ`. **1c:** required language, group (only when groups exist, read from `GET /api/colecoes`; goes to the end of its section: two collections created in a group came out as order 0 and 1) and notes | R7 (required language is of the physical copy) | delivered |
| NOV-07 | Create, see validation errors line by line, land on the new collection | `src/app/(v1)/v1/colecoes/nova/pagina-cliente.tsx:163`, `:190`, `:210` | 1c | `POST /api/colecoes` (`resolverCriacaoColecao`, `criarColecaoComVagas`) | `REQ`, `REF` (each validation error), `NAV` to `/colecoes/<id>`. **1c:** the body captured in the browser is the v1's, field by field (`nome`, `tipo`, `parametro`, `idiomaExigido`, `notas`, `grupoId`); refusals go through `recusa.ts`, now at `src/app/_comum/recusa.ts` (rule 16); success lands on `/colecoes/<id>` (then the 1d bridge to `/v1`) | R4; R6 (slots born empty); groups: goes to the end of its section | delivered |
| NOV-08 | Arrive prefilled from a suggestion (`?set=`), retry the prefill or start blank | `src/app/(v1)/v1/colecoes/nova/page.tsx:9`, `src/app/(v1)/v1/colecoes/nova/pagina-cliente.tsx:231`, `:234` | 1c | `GET /api/sets` | `URL` (`set`), `REQ`. **1c:** `?set=dc1` opened as Set, that set, catalog pt, no secrets, name "2015 - DCR - Crise Dupla", and created a collection from it; an unknown id shows the warning and a normal form; the form stays disabled until the set resolves, with "Try again" and "Continue without the suggestion" on a failed read; a Japanese row never resolves the suggestion (`resolverSetInicial`, tested) | Suggestions: a suggested set has an active pt/en row, the filter the prefill resolves against | delivered |

## 5. `/colecoes/falta` — What's missing, all collections

v1: `src/app/(v1)/v1/colecoes/falta/pagina-cliente.tsx`. Read-only. Owner: **1e**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| FAL-01 | See every empty slot of every Pokédex and set collection, by collection, marked "can be allocated now" | `src/app/(v1)/v1/colecoes/falta/pagina-cliente.tsx:69`, `:78` | 1e | `GET /api/colecoes`, `GET /api/colecoes/:id` per collection; in the v2, 1a's "missing" read `GET /api/colecoes/:id/falta` per collection (or the `livres` of `GET /api/colecoes/:id/grade`) | `REQ` or 1a's read with the same slots and the same "can allocate" marks | R6 (the reason the system exists); R5 (allocating happens in the collection, never here) | pending |
| FAL-02 | Filter to slots that can be allocated now | `src/app/(v1)/v1/colecoes/falta/pagina-cliente.tsx:138` | 1e | —; in the v2, `livres` from `GET /api/colecoes/:id/falta` (1a) | `VIEW` | R2, R3 (eligibility from the server) | pending |
| FAL-03 | Open a collection; back to the list | `src/app/(v1)/v1/colecoes/falta/pagina-cliente.tsx:158`, `:115` | 1e | — | `NAV` | — | pending |

## 6. `/colecoes/[id]/opcoes-compra` — Buy options

v1: `src/app/(v1)/v1/colecoes/[id]/opcoes-compra/pagina-cliente.tsx` and `painel-sem-estoque.tsx`. **4a owns
the page** (same URL in the v2). The marking, the "best of each slot" shortcut, the tabs and the
copy are also delivered earlier by **1e** inside the collection's "What's missing" tab, over the
same routes; for this page's bridge, every row has to be delivered by 4a.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| OPC-01 | See the empty slots with their options, prices, choices, the source (Liga or Cardmarket) and the state of the last round | `src/app/(v1)/v1/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:445` | 4a | `GET /api/colecoes/:id/opcoes-compra` | `REQ`; the out-of-stock filter hides as in the v1 and never hides a selected card | R6; R2 (Pokédex candidates have exactly one `dexId`); R3 (forms compete); Buy options from the catalog; Out of stock | pending |
| OPC-02 | Follow a round in progress (polling) | `src/app/(v1)/v1/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:500` | 4a | `GET /api/colecoes/:id/opcoes-compra` | period derived from the interval (`clamp(intervalo × 250 ms, 5 s, 60 s)`), never a fixed number | Liga: nothing may double the pace | pending |
| OPC-03 | Set the price ceiling, the order of options, the order of a set's slots | `src/app/(v1)/v1/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:792`, `:816`, `:804` | 4a | `filtrarCandidatas` (Cardmarket, screen filter); the Liga scan reads them as round parameters | `VIEW` on Cardmarket (no new round); same results as the v1 | Ceiling hides only a known price above it, a card with no price stays, a selected card is never hidden | pending |
| OPC-04 | Liga: include cards outside the catalog; re-query everything (ignore the 24 h freshness) | `src/app/(v1)/v1/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:832`, `:842` | 4a | body of `POST /api/colecoes/:id/opcoes-compra` | `REQ` | Liga: a new scan does not redo what it has | pending |
| OPC-05 | Start a Liga scan of the collection's empty slots | `src/app/(v1)/v1/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:851`, `:526`, `:538` | 4a | `POST /api/colecoes/:id/opcoes-compra` (`criarVarredura`, `executarVarredura`) | `REQ`, `REF` (round alive, blocked, nothing to scan); on an install blocked by the Liga, the screen explains that new lookups are unavailable and never works around it (decision 3) | Liga hard rules (pace from `robots.txt`, allowed routes, block aborts) | pending |
| OPC-06 | Cardmarket: look up candidate prices (one round in the whole app) | `src/app/(v1)/v1/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:851`, `:572`, `:577` | 4a | `POST /api/colecoes/:id/opcoes-compra` (`iniciarRodadaCandidatas`) | `REQ`, `REF` (`cotacaoIndisponivel` 503, round alive, all fresh within 7 days) | Cardmarket: PTAX per round, one card at a time, 7-day validity | pending |
| OPC-07 | Mark or unmark one option of a slot (several per slot allowed) | `src/app/(v1)/v1/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:1289`, `:617`, `:611`, `:635` | 4a (also 1e, tab) | `PATCH /api/colecoes/:id/opcoes-compra/selecao` (`marcarEscolhas`, `desmarcarEscolhas`); in the 1e tab, `alvo` and `escolhas` from `GET /api/colecoes/:id/falta` and `GET …/falta/alternativas` (1a) | `REQ` (Cardmarket `{cartas:[{chave,cartaId}]}`, Liga `{ids}`, unmark by `escolhaId`), `REF` (Liga marking needs a scan; unmarking does not) | R5 (the user marks); R2 (a Cardmarket card must be a candidate of an empty slot); Buy triage: choice tied to the slot, durable | pending |
| OPC-08 | Mark the best option of each slot with no choice yet | `src/app/(v1)/v1/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:967`, `:662`, `:687` | 4a (also 1e, tab) | `PATCH …/selecao` in one batch (up to 1,100); in the 1e tab, each slot's `proposta` and the `criterio` from `GET /api/colecoes/:id/falta` (1a) | `REQ`; on Cardmarket only a priced first option is marked; the criterion and the card are visible (decision 2) | R5 (an explicit click of the user) | pending |
| OPC-09 | Switch between the Liga list tabs (≤ 110 cards each, one per region in a Pokédex) | `src/app/(v1)/v1/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:1082` | 4a (also 1e, tab) | `abasLiga` from the GET (`dividirListaCompra`); in the 1e tab, `lista.abasLiga` from `GET /api/colecoes/:id/falta`, the same assembly (1a) | `VIEW`; the tabs are the server's, not rebuilt on the client | Export: 110 per search, same function for screen and download | pending |
| OPC-10 | Copy the active tab's list | `src/app/(v1)/v1/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:1055`, `:696` | 4a (also 1e, tab) | `copiarTexto` (`src/app/_comum/copiar-texto.ts`, moved there by 1e); in the 1e tab, the tab `texto` from `GET /api/colecoes/:id/falta` (1a) | `HTTP` (works by IP over plain HTTP); the text equals the per-tab download | HTTP rule | pending |
| OPC-11 | Download the active tab as a Liga list | `src/app/(v1)/v1/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:1046` | 4a | `GET /api/colecoes/:id/opcoes-compra/exportar?formato=liga&aba=` | `DL`; the tab `id` matches the screen's | Export | pending |
| OPC-12 | Download the buy list as CSV or as text | `src/app/(v1)/v1/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:1010`, `:1016` | 4a | `GET …/exportar?formato=csv` and `?formato=texto` | `DL`; the CSV says which source each price came from | `precosDasEscolhas` (one function for screen and export) | pending |
| OPC-13 | Show only slots with an option; collapse or expand all, a group, or one slot (remembered per device) | `src/app/(v1)/v1/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:1147`, `:1169`, `:1172`, `:1198`, `:1201`, `:1219`, `:305`, `:417` | 4a | `localStorage`, in `try/catch` | `VIEW`, `HTTP` | — | pending |
| OPC-14 | Out of stock: paste the Liga notice, preview, confirm (records and unmarks in one transaction) or cancel | `src/app/(v1)/v1/colecoes/[id]/opcoes-compra/painel-sem-estoque.tsx:140`, `:155`, `:209`, `:217`, `:81` | 4a | `POST /api/colecoes/:id/opcoes-compra/sem-estoque` (preview, then confirm) | `REQ`, `REF`, `TX` (record and unmark together) | Out of stock: key name + number/total, global, 30 days, only this collection's empty slots unmarked | pending |
| OPC-14b | Open the out-of-stock panel | `src/app/(v1)/v1/colecoes/[id]/opcoes-compra/painel-sem-estoque.tsx:128` | 4a | — | `VIEW` | — | pending |
| OPC-18 | Read the explanations: options with no price, choices kept from older scans; per option, out of stock, outside the catalog, a choice no candidate explains, no price, and the price detail (euro, PTAX, date, criterion) | `src/app/(v1)/v1/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:993`, `:1003`, `:1329`, `:1334`, `:1339`, `:1348`, `:1353` | 4a | `Dica` texts | open by tap and by keyboard | Nothing only on hover; Cardmarket "no price" wording | pending |
| OPC-15 | Out of stock: see the cards on record and offer one again | `src/app/(v1)/v1/colecoes/[id]/opcoes-compra/painel-sem-estoque.tsx:68`, `:244`, `:112` | 4a | `GET` and `DELETE …/sem-estoque?item=` | `REQ`, `REF` | Out of stock | pending |
| OPC-16 | Open the card's page on the Liga site | `src/app/(v1)/v1/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:1366` | 4a | `caminhoBuscaLiga` | external link, same URL | Liga: only `cards/search` and `cards/card` | pending |
| OPC-17 | Back to the collection; zoom a card | `src/app/(v1)/v1/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:759`, `:1300` | 4a | 0b's Card | `NAV` | — | pending |

## 7. `/cadastro/set` — Entry by set

v1: `src/app/(v1)/v1/cadastro/set/pagina-cliente.tsx` (batch logic in `src/lib/dominio/grade-set.ts`). Owner:
**3a**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| CSET-01 | Pick a set (set picker: filter by catalog language, search by name, code or id) and load its cards (with "you have N") | `src/app/(v1)/v1/cadastro/set/pagina-cliente.tsx:205`, `:115`, `:127`; `src/app/_componentes/seletor-expansao.tsx:138`, `:155`, `:165` | 3a | `GET /api/sets`, `GET /api/sets/:setId/cartas` | `REQ`; mixed-catalog warning as in the v1 | Catalog language per card (pt→en) | pending |
| CSET-02 | Set the batch defaults: variant, physical language, condition (a summary with a toggle on mobile) | `src/app/(v1)/v1/cadastro/set/pagina-cliente.tsx:286`, `:292`, `:298`, `:262` | 3a | reducer `reduzirGrade` | `VIEW` | R7 (language of the physical card, independent of the catalog row) | pending |
| CSET-03 | Filter the grid by number | `src/app/(v1)/v1/cadastro/set/pagina-cliente.tsx:317` | 3a | — | `VIEW` | — | pending |
| CSET-04 | Type a quantity per card; Enter jumps to the next | `src/app/(v1)/v1/cadastro/set/pagina-cliente.tsx:372`, `:392`, `:151` | 3a | `Quantidade` (controlled) | `VIEW`; keyboard flow kept; fields 16 px on mobile | Mobile: `Quantidade` controlled | pending |
| CSET-05 | Override variant, language or condition on one card; see an out-of-pattern variant warning | `src/app/(v1)/v1/cadastro/set/pagina-cliente.tsx:419`, `:432`, `:445`, `:66` | 3a | — | `VIEW` | R7 | pending |
| CSET-06 | Save the whole batch and see the result line by line | `src/app/(v1)/v1/cadastro/set/pagina-cliente.tsx:306`, `:157`, `:170` | 3a | `POST /api/sets/:setId/copias` (`inserirLoteCopias`) | `REQ`, `REF` per line; fixed bottom bar reserves its height | R7; an identical free copy is merged into the existing row (`fusao-copias.ts`) | pending |
| CSET-07 | Zoom a card | `src/app/(v1)/v1/cadastro/set/pagina-cliente.tsx:347` | 3a | 0b's Card | nothing only on hover | — | pending |

## 8. `/cadastro/busca` — Entry by search

v1: `src/app/(v1)/v1/cadastro/busca/pagina-cliente.tsx` and `src/app/_componentes/cadastrar-carta-manual.tsx`.
Owner: **3b**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| CBUS-01 | Search a card by name, set and number | `src/app/(v1)/v1/cadastro/busca/pagina-cliente.tsx:205`, `:84`, `:98` | 3b | `GET /api/cartas` | `REQ` | — | pending |
| CBUS-02 | Quick search by set code + number | `src/app/(v1)/v1/cadastro/busca/pagina-cliente.tsx:235`, `:108`, `:120` | 3b | `GET /api/cartas` | `REQ` | — | pending |
| CBUS-03 | Pick a result; cancel the pick | `src/app/(v1)/v1/cadastro/busca/pagina-cliente.tsx:315`, `:140`, `:398` | 3b | — | `VIEW`; the form scrolls into view on mobile | — | pending |
| CBUS-04 | Fill the copy (quantity, variant, physical language, condition, location) and save | `src/app/(v1)/v1/cadastro/busca/pagina-cliente.tsx:342`, `:349`, `:362`, `:375`, `:388`, `:154`, `:165` | 3b | `POST /api/copias` (`inserirCopia`) | `REQ`, `REF` | R7 (physical language); merge into an identical free copy | pending |
| CBUS-05 | Enter a card by hand when it is not in the catalog (set, number, official count, name, set name, catalog language, `dexId`) | `src/app/(v1)/v1/cadastro/busca/pagina-cliente.tsx:270`, `src/app/_componentes/cadastrar-carta-manual.tsx:43`, `:88`, `:93` | 3b | `POST /api/cartas/manual` (`criarCartaManual`) | `REQ`, `REF`; the row is born `origem = manual` | R2 (`dexId`: one makes the card Pokédex-eligible); catalog seed: a manual row is never demoted to `sync` | pending |
| CBUS-06 | Zoom a result | `src/app/(v1)/v1/cadastro/busca/pagina-cliente.tsx:292` | 3b | 0b's Card | — | — | pending |

## 9. `/inventario` — Inventory

v1: `src/app/(v1)/v1/inventario/pagina-cliente.tsx` and `src/app/_componentes/adicionar-imagem-local.tsx`.
**2b owns the page**, the list and the bulk edit; the per-copy operations live in the card detail in
copy mode (**1b**), which 2b integrates (rows marked `1b → 2b`).

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| INV-01 | See the inventory, 50 per page, and page through it | `src/app/(v1)/v1/inventario/pagina-cliente.tsx:149`, `:697`, `:705`, `:206` | 2b | `GET /api/copias` (`listarCopias`) | `REQ`. **2b:** the page reads `GET /api/copias?pagina=1&tamanhoPagina=50` (66 invented copies: 50 rows, "Page 1 of 2"); "Next" sent `GET /api/copias?pagina=2&tamanhoPagina=50` (16 rows) and wrote `?pagina=2` in the address, and a reload kept page 2 (`pagina` is the one key the v2 adds; the v1 ignores it). A page left past the end by a removal goes back to the last one (`paginaAlemDoFim`, tested). Paginated, not virtualized: measured at 393 px with CPU 4×, a page of 50 is ~1,500 nodes, 0 `will-change`, 0 `preserve-3d`, 2 `backdrop-filter` surfaces (the shell's) and 3 with the detail open, tap to paint ~30 ms | — | delivered |
| INV-02 | Arrive with filters in the URL (from the overview, the duplicates, the home) | `src/app/(v1)/v1/inventario/pagina-cliente.tsx:167`, `:180` | 2b | `filtros-inventario.ts` keys | `URL`: `set`, `idioma`, `raridade`, `variante`, `condicao`, `alocacao` (and the others the v1 reads) keep their names and values. **2b:** the server page reads the keys from `searchParams` (`filtrosDaUrl`, tested against the v1's `params.get`); `/v1/inventario?set=30th&alocacao=livre&condicao=LP` and `/inventario?…` (same query) sent the identical `GET /api/copias?set=30th&condicao=LP&alocacao=livre&pagina=1&tamanhoPagina=50` and showed the same rows; the screen writes the current cut back with the same keys (`history.replaceState`), and follows the router's URL, so a navigation to another cut while the screen is open (the "Inventory" tab on a filtered list, Back) reloads that cut; unknown keys are ignored (`?constructor=1` included). A value the API refuses (`?idioma=xx`) shows an error with "Clear filters" instead of the v1's silent empty list | — | delivered |
| INV-03 | Search by text; filter by set, language, rarity, variant, condition, graded, allocation, missing image, location; open and close the filters; clear them | `src/app/(v1)/v1/inventario/pagina-cliente.tsx:311`, `:346`–`:441`, `:334`, `:447`, `:199`, `:212` | 2b | `GET /api/copias?…` | `REQ`, `URL`. **2b:** each select reads at once with the v1's query (`idioma=en` added: `GET /api/copias?set=30th&idioma=en&alocacao=livre&pagina=1&tamanhoPagina=50`); typing "pika" letter by letter sent one request (`q=pika`) after a 300 ms pause, and each read aborts the previous one; "Filters (n)" opens the panel below 768 px (always open from 768 px, CSS only); "Clear filters". The language filter is labelled "Physical language" | R7 (the language filter is the physical copy's) | delivered |
| INV-04 | Download the inventory as CSV; download the Liga upload format | `src/app/(v1)/v1/inventario/pagina-cliente.tsx:293`, `:298` | 2b | `GET /api/copias/exportar`, `GET /api/copias/exportar-liga` | `DL`. **2b:** the same two routes as plain `<a download>` links; `Content-Disposition: attachment; filename="inventario-pokemon-<date>.csv"` (`text/csv`) and `filename="ligapokemon-<date>.zip"` (`application/zip`). What the v1 had in a `title` is visible text under the header | Export to LigaPokemon: the upload format (`exportacao-liga.ts`) | delivered |
| INV-05 | Select copies one by one, all on the page, or clear the selection | `src/app/(v1)/v1/inventario/pagina-cliente.tsx:539`, `:509`, `:486`, `:219`, `:228` | 2b | — | `VIEW`; fixed bottom bar on mobile reserves its height. **2b:** a checkbox per row (44 px), "Select all on this page" (indeterminate when some), "Clear"; a filter or page change empties the selection, as in the v1, and a re-read prunes ids no longer on the page (`podarSelecao`, tested). The selection bar is `sticky`, so it takes its own height in the flow: scrolled to the end at 1400 px, the last row ends at 700 px and the bar starts at 716 px; below 768 px it sits above the tab bar (`--v2-topo-abas`). No `backdrop-filter` on it | — | delivered |
| INV-06 | Bulk edit the selection: condition, location, physical language, variant; confirm step; apply | `src/app/(v1)/v1/inventario/pagina-cliente.tsx:477`, `:1260`–`:1325`, `:1245`, `:1232`, `:1177`, `:1187` | 2b | `PATCH /api/copias/massa` (`atualizarCopiasEmMassa`) | `REQ`, `CONF`, `REF`, `TX`. **2b:** "Apply" asks through the v2 confirmation, listing the changes ("Condition: LP · Location: Caixa A"); Cancel sent nothing; confirming sent the v1's body `PATCH /api/copias/massa {"copiaIds":[3 ids],"patch":{"condicao":"LP","localizacao":"Caixa A"}}`, the three rows re-read with the new values and the selection cleared. Only variants every selected card has are offered (`variantesEmComum`, tested). `REF`: a copy removed in another tab after selecting gave `copiasNaoEncontradasNadaAlterado` in the dialog, the list re-read and the selection was pruned to 1. `TX`: a direct `PATCH` with `condicao: DMG` and a variant one of the two cards lacks was refused (`varianteForaDoCatalogoNaSelecao`) and neither row changed, condition included (every check runs before the single `UPDATE`, in one transaction). While a read of another cut is pending the list is `inert` (nothing acts on rows that are no longer the ones asked for); "Edit selected" and "Apply" are off while the list is read again, and a confirmation whose selection changed meanwhile is refused on screen | R7 (changing the physical language never touches the catalog row) | delivered |
| INV-07 | Edit one copy: quantity, variant, physical language, condition, location, grading (company, grade, certificate), acquisition (date, origin, price), notes | `src/app/(v1)/v1/inventario/pagina-cliente.tsx:670`, `:755`, `:784`, `:789` | 1b → 2b (detail, copy mode) | `PATCH /api/copias/:id` (`atualizarCopia`); in the v2, the copy's current fields from `GET /api/cartas/:cartaId/detalhe` (1a) | `REQ`, `REF`. **2b:** tapping a row opens the detail in copy mode (`GET /api/cartas/30th-013/detalhe?copia=<id>`); "Edit" → quantity 2 sent `PATCH /api/copias/<id> {"quantidade":2,"localizacao":"Caixa B"}` and `onMudou` re-read the list ("2 units", "In Caixa B") | R7; R1 (an allocated copy keeps its single slot) | delivered |
| INV-08 | Allocate a free copy to a destination: list eligible slots and custom collections, pick, confirm an out-of-pattern one | `src/app/(v1)/v1/inventario/pagina-cliente.tsx:662`, `:988`, `:1110`, `:1093`, `:1001`, `:1006` | 1b → 2b (detail, copy mode) | `GET /api/copias/:id/destinos`, then `POST /api/vagas/:id/alocar` or `POST /api/colecoes/:id/copias`; in the v2, the copy and its allocation from `GET /api/cartas/:cartaId/detalhe` (1a) | `REQ`, `CONF`, `REF`, `TX` (lot split). **2b:** from the detail, "Allocate to a collection" listed the set slot and the custom collection; allocating the 2-unit copy sent `POST /api/vagas/<id>/alocar {"copiaId":…,"permitirForaDePadrao":false}`, the lot split (one row free, one "In Teste 30th, slot 013") and the list re-read | R1; R2; R3; R5 (the user picks the destination); R7 (required language) | delivered |
| INV-09 | Deallocate an allocated copy (asks first) | `src/app/(v1)/v1/inventario/pagina-cliente.tsx:654`, `:252`, `:254`, `:262` | 1b → 2b (detail, copy mode) | `DELETE /api/vagas/:vagaId/alocar`; in the v2, the allocation from `GET /api/cartas/:cartaId/detalhe` (1a) | `REQ`, `CONF`, `REF`. **2b:** opened from the allocated row, "Deallocate" asked ("It leaves slot 013 of Teste 30th…"); Cancel sent nothing; confirming sent `DELETE /api/vagas/<id>/alocar` and the list re-read | R1; R6 (the slot is empty again) | delivered |
| INV-10 | Delete a copy (asks first) | `src/app/(v1)/v1/inventario/pagina-cliente.tsx:677`, `:234`, `:235`, `:243` | 2b | `DELETE /api/copias/:id` (`removerCopia`) | `REQ`, `CONF`, `REF`. **2b:** the row's "Remove" (icon, 44 px, named for the screen reader) asks through the v2 confirmation, naming set, number and units, and for an allocated copy that its slot becomes empty; Cancel sent nothing; confirming sent `DELETE /api/copias/<id>` with a notice and a re-read; when another tab had already removed it, the 404 says so (the route's text is Portuguese only, so the phrase is the screen's) and re-reads | R1 (an allocated copy leaves its slot, which becomes empty, R6) | delivered |
| INV-11 | Add, replace or remove the card's own photo: upload a file, give a link, or map the set to MyPCards | `src/app/(v1)/v1/inventario/pagina-cliente.tsx:566`, `:581`; `src/app/_componentes/adicionar-imagem-local.tsx:75`, `:181`, `:212`, `:152`, `:156`, `:131`, `:135` | 1b → 2b (detail, copy mode) | `POST`/`DELETE /api/imagens-locais/:cartaId/:idioma`, `POST /api/sets-mypcards` | `REQ`, `REF`; the image is stored in the install's volume, never in the repository. **2b:** from the detail, a file upload sent `POST /api/imagens-locais/30th-013/pt` and the list re-read; the row's thumbnail then loads `/api/imagens-locais/30th-013/pt` (the user's photo first); "Remove own photo" asked and sent `DELETE /api/imagens-locais/30th-013/pt`. The test image was an invented one-colour PNG, in the install's volume only | No card images in the repository; local images are plain `<img>` | delivered |
| INV-12 | Zoom a copy's image | `src/app/(v1)/v1/inventario/pagina-cliente.tsx:550` | 1b → 2b (the detail replaces the zoom) | 0b's Card; in the v2, the high image from `GET /api/cartas/:cartaId/detalhe` (1a) | the user's own photo is preferred, as in the v1. **2b:** the detail's stage shows the low image and swaps to `high.webp` (`…/30th/013/high.webp` read from the stage), or the user's own photo; the thumbnail flies into it by the view transition (only the opened row carries the name); closing returns focus to the row that opened it | Nothing only on hover | delivered |

## 10. `/inventario/visao-geral` — Overview

v1: `src/app/(v1)/v1/inventario/visao-geral/pagina-cliente.tsx`. Read-only. Owner: **2c**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| VG-01 | See the summary: totals, gems, collections as binder covers, "Almost there", distributions | `src/app/(v1)/v1/inventario/visao-geral/pagina-cliente.tsx:66`, `:116`, `:168` | 2c | `GET /api/inventario/resumo` | `REQ`; gems ordered by the stored price of the active source, never the two sources mixed | Special card prices; R6 ("Almost there") | delivered (2c: `src/app/(v2)/inventario/visao-geral/`). Read in the server by `lerResumoInventario` (`lib/db/resumo-inventario.ts`), the very function behind `GET /api/inventario/resumo`, so the totals, gems, covers, "Almost there" and distributions are the route's; a failed read shows an error with "Try again", never an empty inventory. Gems come ordered by the stored price of the active source; Liga shows BRL as the site gives it, Cardmarket shows the stored BRL value with the euro, the PTAX, its date and, when the value is not the trend, the criterion that decided it (`origem-preco-joias.ts`), and says it is not a Brazilian market price. A gem's photo keeps the borrowed-photo badge (`origem-imagem-joias.ts`) |
| VG-02 | Open the inventory: all, allocated, free | `src/app/(v1)/v1/inventario/visao-geral/pagina-cliente.tsx:91`, `:98`, `:105`, `:112` | 2c | — | `NAV`, `URL` (`alocacao=alocada|livre`) | — | delivered (2c: `/inventario`, `/inventario?alocacao=alocada`, `/inventario?alocacao=livre`; the root path is still a bridge to `/v1/inventario` with the query) |
| VG-03 | Open the inventory filtered by a distribution line: set, rarity, language, condition, variant | `src/app/(v1)/v1/inventario/visao-geral/pagina-cliente.tsx:449`, `:470`, `:491`, `:512`, `:533` | 2c | — | `NAV`, `URL` (keys as INV-02) | R7 (language = physical) | delivered (2c: `hrefInventario` in `lib/dominio/visao-geral-v2.ts`, tested; keys `set`, `raridade`, `idioma`, `condicao`, `variante`; the rarity line "no rarity" has no filter, as in the v1) |
| VG-04 | Open the collections list, a collection cover, an "Almost there" division | `src/app/(v1)/v1/inventario/visao-geral/pagina-cliente.tsx:121`, `:267`, `:360` | 2c | — | `NAV` | R4 (division counts) | delivered (2c: `/colecoes`, `/colecoes/<id>` for a cover and for an "Almost there" row; a bridge or a v2 screen, query-free) |
| VG-05 | Open the duplicates | `src/app/(v1)/v1/inventario/visao-geral/pagina-cliente.tsx:149` | 2c | — | `NAV` | — | delivered (2c: `/inventario/repetidas`, now a v2 screen) |

## 11. `/inventario/repetidas` — Duplicates

v1: `src/app/(v1)/v1/inventario/repetidas/pagina-cliente.tsx`. Owner: **2c**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| REP-01 | See cards with 2 or more units, with allocated, free and physical languages; page through | `src/app/(v1)/v1/inventario/repetidas/pagina-cliente.tsx:76`, `:206`, `:210`, `:97` | 2c | `GET /api/inventario/repetidas` | `REQ` | R7 (the pt and en rows of one card are one card); R1 (allocated counts) | delivered (2c: `src/app/(v2)/inventario/repetidas/`). Same `listarCartasRepetidas` as `GET /api/inventario/repetidas`; 48 cards per page, the page in the URL (`?pagina=N`); a page past the last redirects to the last. The physical language of each copy is written per card (R7) |
| REP-02 | Show only cards with free units | `src/app/(v1)/v1/inventario/repetidas/pagina-cliente.tsx:114`, `:91` | 2c | `GET /api/inventario/repetidas?…` | `REQ` | — | delivered (2c: `?soLivres=true`, the API's own value, in the URL; a segmented control switches it) |
| REP-03 | Zoom a card | `src/app/(v1)/v1/inventario/repetidas/pagina-cliente.tsx:138` | 2c | 0b's Card (the detail in copy mode, if 2c opens it) | — | — | delivered (2c: the card, or "See copies", opens `<DetalheCarta>` in copy mode on a representative copy of the card — a free one first, then the oldest, `lib/dominio/copia-representante.ts` — and every write it makes re-reads the page) |

## 12. `/inventario/precos` — Prices of special cards

v1: `src/app/(v1)/v1/inventario/precos/page.tsx` (reads `PRECO_FONTE`), `pagina-cliente.tsx` and
`grafico-valor-total.tsx`. Owner: **2d**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| PRE-01 | See the prices table of the active source (Liga: BRL as the site gives; Cardmarket: euro, BRL, quote and date, criterion), the summary and the rounds | `src/app/(v1)/v1/inventario/precos/page.tsx:12`, `src/app/(v1)/v1/inventario/precos/pagina-cliente.tsx:255` | 2d | `GET /api/inventario/precos` | `REQ`; Cardmarket rows show the euro value and the quote with its date; "Trend" column with the tag and `Dica` when the value is not the trend | International price reference (never presented as a Brazilian market price; never mixed with the Liga); trend cap | pending |
| PRE-02 | Page through the table | `src/app/(v1)/v1/inventario/precos/pagina-cliente.tsx:592`, `:600` | 2d | — | `VIEW` | — | pending |
| PRE-03 | Start a price round of the active source | `src/app/(v1)/v1/inventario/precos/pagina-cliente.tsx:412`, `:297`, `:302` | 2d | `POST /api/inventario/precos` (`iniciarRodadaCardmarket` or the Liga round) | `REQ`, `REF` (`precosJaConsultados`, `precosEmAndamento`, `semCartasEspeciais`, `cotacaoIndisponivel`, Liga blocked) | Liga pace; one live round per source; Cardmarket PTAX per round | pending |
| PRE-04 | Follow a round in progress (polling) | `src/app/(v1)/v1/inventario/precos/pagina-cliente.tsx:282` | 2d | `GET /api/inventario/precos` | period derived from the interval, never fixed | Liga: nothing may double the pace | pending |
| PRE-05 | Read the total value chart, point at a snapshot | `src/app/(v1)/v1/inventario/precos/grafico-valor-total.tsx:199` | 2d | `listarSerieDePrecos` (in the GET) | one series per source; the text still says the total also rises when cards enter the sum; works by touch | Special card prices: history and snapshots | pending |
| PRE-05b | Open the chart's data as a table | `src/app/(v1)/v1/inventario/precos/grafico-valor-total.tsx:319` | 2d | — | `VIEW`; the same points as the chart | — | pending |
| PRE-07 | Read the explanations: card not found, round error, foil, no price | `src/app/(v1)/v1/inventario/precos/pagina-cliente.tsx:563`, `:652`, `:800`, `:835` | 2d | `Dica` texts | each opens by tap and by keyboard, never only on hover or in `title` | Nothing only on hover | pending |
| PRE-06 | Delete a round (asks first) | `src/app/(v1)/v1/inventario/precos/pagina-cliente.tsx:688`, `:323`, `:324`, `:331` | 2d | `DELETE /api/inventario/precos/rodadas/:id` | `REQ`, `CONF`, `REF` | Prices: a found price is never deleted by this | pending |

## 13. `/login` — Login

v1: `src/app/(v1)/login/page.tsx` and `formulario-login.tsx`. Exists only with `ACESSO_COM_SENHA=1`.
Owner: **1f**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| LOG-01 | Type the password and enter; generic errors (wrong password, too many attempts) | `src/app/(v1)/login/formulario-login.tsx:54`, `:32` | 1f | `POST /api/sessao` | `REQ`, `REF` (the same generic messages, same delay) | Access: origin required, rate limit, no global lock | delivered |
| LOG-02 | Land on the page asked for (`volta`), with a full navigation | `src/app/(v1)/login/page.tsx:33`, `src/app/(v1)/login/formulario-login.tsx:41` | 1f | `sanitizarVolta` | `URL` (`volta`), including `/v1/...` paths; anything else becomes `/` | Access: `volta` | delivered |
| LOG-03 | A session already open skips the login | `src/app/(v1)/login/page.tsx:37` | 1f | `sessaoValida`, `sanitizarVolta` | `/login` with a session goes to `volta`; module off → 404 identical to any missing path | Access: the only page without the guard, exactly one page | delivered |

## 14. `/dex` — Living Dex overview

v1: `src/app/(v1)/v1/dex/page.tsx` (server reads) and `visao-geral-dex.tsx`. Read-only. Owner: **5a**. Every
Dex row also needs `OFF`.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| DEX-01 | See progress per track and region, recent arrivals, trophy shelf, game cards, active plan, what is in a game and not in HOME | `src/app/(v1)/v1/dex/page.tsx:20`, `:22` | 5a | server reads of `page.tsx` | same numbers as the v1; `OFF` | HOME trophies computed; sections counted as the user set them | pending |
| DEX-02 | Open a slot in Register (`?busca=`) from the showcase | `src/app/(v1)/v1/dex/visao-geral-dex.tsx:192` | 5a | — | `NAV`, `URL` (`busca`) | — | pending |
| DEX-03 | Open trophies: HOME, or one game | `src/app/(v1)/v1/dex/visao-geral-dex.tsx:258`, `:294`, `:315`, `:334` | 5a | — | `NAV`, `URL` (`jogo`) | — | pending |
| DEX-04 | Open the plans; open the Pokédex | `src/app/(v1)/v1/dex/visao-geral-dex.tsx:357`, `:407` | 5a | — | `NAV` | — | pending |

## 15. `/dex/pokedex` — Pokédex grid

v1: `src/app/(v1)/v1/dex/pokedex/grade-pokedex.tsx`, `painel-oportunidades.tsx`,
`src/app/(v1)/v1/dex/_componentes/use-transferencia.tsx`. Owner: **5a**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| PKD-01 | Turn a section (regional, gender, special) on or off in the count; read why the base section always counts | `src/app/(v1)/v1/dex/pokedex/grade-pokedex.tsx:198`, `:117`, `:122`, `:187` | 5a | `PATCH /api/dex/secoes` | `REQ`, `REF`; toggling never touches a record; the explanation opens by tap and keyboard | Living Dex: sections | pending |
| PKD-02 | Switch view (main / cosmetic) and track (normal / shiny) | `src/app/(v1)/v1/dex/pokedex/grade-pokedex.tsx:148`, `:217` | 5a | — | `VIEW` | Cosmetic forms are a view; tracks | pending |
| PKD-03 | Filter by region, search (species and form names, both languages), filter by state and category | `src/app/(v1)/v1/dex/pokedex/grade-pokedex.tsx:230`, `:242`, `:251`, `:266` | 5a | — | `VIEW` | `forma_pt` in pt; gender pairs labelled | pending |
| PKD-04 | Open a slot in Register | `src/app/(v1)/v1/dex/pokedex/grade-pokedex.tsx:304` | 5a | — | `NAV`, `URL` (`busca`) | — | pending |
| PKD-05 | "Take to HOME": expand a game, move one Pokémon or the whole group to HOME, confirm leaving a send-only game | `src/app/(v1)/v1/dex/pokedex/painel-oportunidades.tsx:66`, `:74`, `:93`; `src/app/(v1)/v1/dex/_componentes/use-transferencia.tsx:42`, `:73` | 5a | `POST /api/dex/registros/mover` (`moverRegistros`) | `REQ`, `CONF` (409 `dexConfirmarSemVolta` → dialog → resend with `confirmarSemVolta: true`), `REF`, `TX` | Living Dex: send-only confirmation never automatic; non-transferable never leaves | pending |

## 16. `/dex/caixas` — HOME boxes

v1: `src/app/(v1)/v1/dex/caixas/caixas-home.tsx`. Owner: **5b**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| CX-01 | Set the reserved boxes before National 1 (0 to 20) | `src/app/(v1)/v1/dex/caixas/caixas-home.tsx:114`, `:86`, `:92` | 5b | `PATCH /api/dex/preferencias` | `REQ`, `REF`; every box number shifts, positions do not | Living Dex: reserved boxes shift only the number | pending |
| CX-02 | Switch track; jump to a group's first box | `src/app/(v1)/v1/dex/caixas/caixas-home.tsx:173`, `:188` | 5b | — | `VIEW`; box numbers keep their gaps | Boxes: computed, never stored; anchors | pending |
| CX-03 | Open a slot: Register on desktop, a detail sheet on mobile, then Register | `src/app/(v1)/v1/dex/caixas/caixas-home.tsx:281`, `:284`, `:331`, `:339` | 5b | — | `NAV`, `URL` (`busca`); nothing only on hover | — | pending |

## 17. `/dex/recebidos` — Received

v1: `src/app/(v1)/v1/dex/recebidos/recebidos-home.tsx`. Owner: **5b**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| REC-01 | See what arrived in HOME and was not put away, by destination box, extra copies apart | `src/app/(v1)/v1/dex/recebidos/page.tsx:19`, `:21`; `src/app/(v1)/v1/dex/recebidos/recebidos-home.tsx:67` | 5b | server reads | same grouping as the v1 | "Received": `a_guardar` stored, not derived | pending |
| REC-02 | "Put away" everything, one box, or those with no place | `src/app/(v1)/v1/dex/recebidos/recebidos-home.tsx:99`, `:126`, `:191`, `:72`, `:76` | 5b | `POST /api/dex/registros/guardar` (`guardarRegistros`) | `REQ`, `REF` | — | pending |

## 18. `/dex/cadastrar` — Register by game

v1: `src/app/(v1)/v1/dex/cadastrar/page.tsx` and `cadastro-por-jogo.tsx` (virtualized below 768 px). Owner:
**5c**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| DCAD-01 | Pick the game (owned, active) or HOME; arrive with `?jogo=` and `?busca=` | `src/app/(v1)/v1/dex/cadastrar/cadastro-por-jogo.tsx:563`, `src/app/(v1)/v1/dex/cadastrar/page.tsx:18` | 5c | — | `URL` (`jogo`, `busca`), `OFF` | Records: HOME is a valid origin | pending |
| DCAD-02 | Go manage owned games | `src/app/(v1)/v1/dex/cadastrar/cadastro-por-jogo.tsx:570` | 5c | — | `NAV` | — | pending |
| DCAD-03 | Switch view; filter by text; only what I do not have; show all (outside the game's catalog) | `src/app/(v1)/v1/dex/cadastrar/cadastro-por-jogo.tsx:581`, `:594`, `:597`, `:602` | 5c | — | `VIEW`; trade, event and locked-checkpoint marks shown, never refused | Availability catalog; checkpoints mark, never refuse | pending |
| DCAD-04 | Type normal and shiny quantities per Pokémon; clear them | `src/app/(v1)/v1/dex/cadastrar/cadastro-por-jogo.tsx:218`, `:373`, `:615` | 5c | `Quantidade` (controlled) | `VIEW`; the list stays virtualized and the measured tap time does not regress | Mobile: the virtualizer rule (v1 below 768 px; v2 by the measured threshold) | pending |
| DCAD-05 | Register the batch | `src/app/(v1)/v1/dex/cadastrar/cadastro-por-jogo.tsx:619`, `:522`, `:528` | 5c | `POST /api/dex/registros` (`criarRegistrosEmLote`) | `REQ`, `REF` (one refusal refuses all), `TX` | Records come in by game, in batches; the game's catalog is the screen's default filter, not a refusal — a form outside it, picked through "show all", is registered as in the v1 (`expandirLoteCadastro` validates through `validarNovoRegistro`) | pending |

## 19. `/dex/novo-cadastro` — New registration (send to HOME)

v1: `src/app/(v1)/v1/dex/novo-cadastro/page.tsx` and `novo-cadastro.tsx`. Owner: **5d**, with its own
definition of done.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| NCAD-01 | Step 1: switch track; search; only missing; jump to a group's box | `src/app/(v1)/v1/dex/novo-cadastro/novo-cadastro.tsx:947`, `:959`, `:962`, `:970` | 5d | — | `VIEW`; the selection survives the filters | — | pending |
| NCAD-02 | Step 1: mark or unmark slots on the box grid (both tracks); toggle the pair of the last one | `src/app/(v1)/v1/dex/novo-cadastro/novo-cadastro.tsx:430`, `:1032` | 5d | — | `VIEW`; only slots not in HOME, shiny only where released | Send to HOME: one item per slot and track | pending |
| NCAD-02b | Step 1: identify a slot already in HOME (name, form, box, position) by tap or keyboard focus, without adding it to the batch | `src/app/(v1)/v1/dex/novo-cadastro/novo-cadastro.tsx:430`, `:431` | 5d | — | `VIEW`; the selection does not change | — | pending |
| NCAD-03 | Step 1: clear; continue to step 2 | `src/app/(v1)/v1/dex/novo-cadastro/novo-cadastro.tsx:1043`, `:1047`, `:614`, `:821` | 5d | — | `VIEW` | — | pending |
| NCAD-04 | Step 2: pick the game left from (remembered per device); manage games; remove an item; back | `src/app/(v1)/v1/dex/novo-cadastro/novo-cadastro.tsx:1184`, `:214`, `:222`, `:1191`, `:1243`, `:1053`, `:828` | 5d | `localStorage`, in `try/catch` | `VIEW`, `HTTP` | The game left from is not the historical origin | pending |
| NCAD-05 | Send the batch to HOME; confirm leaving a send-only game; see readable refusals; go to Received | `src/app/(v1)/v1/dex/novo-cadastro/novo-cadastro.tsx:1065`, `:816`, `:773`, `:778`, `:1267`, `:1096` | 5d | `POST /api/dex/registros/enviar` (`enviarAoHome`) | `REQ`, `CONF` (409 `dexConfirmarSemVolta`, once per batch), `REF` (`recusas-legiveis.ts`), `TX` (serialized by its own advisory lock) | Send to HOME rules: never confirmed automatically; non-transferable refused | pending |

## 20. `/dex/inventario` — Dex inventory

v1: `src/app/(v1)/v1/dex/inventario/inventario-dex.tsx`. Owner: **5e**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| DINV-01 | Filter by location, search, open more filters, only shiny, clear | `src/app/(v1)/v1/dex/inventario/inventario-dex.tsx:121`, `:136`, `:141`, `:152`, `:145` | 5e | — | `VIEW` | One row per Pokémon, grouped only on screen | pending |
| DINV-02 | Move one Pokémon of a group to HOME | `src/app/(v1)/v1/dex/inventario/inventario-dex.tsx:226` | 5e | `POST /api/dex/registros/mover` (via `use-transferencia`) | `REQ`, `CONF` (send-only), `REF` | Leaving a send-only game needs confirmation | pending |
| DINV-03 | Move one Pokémon to a game | `src/app/(v1)/v1/dex/inventario/inventario-dex.tsx:237` | 5e | `POST /api/dex/registros/mover` | `REQ`, `CONF`, `REF` | Nothing enters a send-only game; Let's Go only takes Let's Go Pokémon | pending |
| DINV-04 | Correct a group (shiny, origin, capture date, notes) — never the location | `src/app/(v1)/v1/dex/inventario/inventario-dex.tsx:247`, `:315`, `:320` | 5e | `PATCH /api/dex/registros` (`corrigirRegistros`) | `REQ`, `REF` | Moving and correcting are separate operations | pending |
| DINV-05 | Delete one Pokémon of a group (asks first) | `src/app/(v1)/v1/dex/inventario/inventario-dex.tsx:255`, `:104`, `:105`, `:107` | 5e | `DELETE /api/dex/registros/:id` | `REQ`, `CONF`, `REF` | Each Pokémon is deleted on its own | pending |

## 21. `/dex/jogos` — My games

v1: `src/app/(v1)/v1/dex/jogos/lista-jogos.tsx`. Owner: **5e**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| JOG-01 | Add an owned game (game, since, notes) | `src/app/(v1)/v1/dex/jogos/lista-jogos.tsx:192`, `:70`, `:73` | 5e | `POST /api/dex/jogos` | `REQ`, `REF` | The game list is fixed in code | pending |
| JOG-02 | Edit a game's "since" and notes | `src/app/(v1)/v1/dex/jogos/lista-jogos.tsx:152`, `:118`, `:120` | 5e | `PATCH /api/dex/jogos/:id` | `REQ`, `REF` | — | pending |
| JOG-03 | Stop or resume a game | `src/app/(v1)/v1/dex/jogos/lista-jogos.tsx:163` | 5e | `PATCH /api/dex/jogos/:id` (`ativo`) | `REQ`, `REF` | A stopped game keeps its records and takes no new ones | pending |
| JOG-04 | Remove a game (asks first) | `src/app/(v1)/v1/dex/jogos/lista-jogos.tsx:172`, `:173` | 5e | `DELETE /api/dex/jogos/:id` | `REQ`, `CONF`, `REF` (refused while a record sits in it) | — | pending |
| JOG-05 | Open a game's trophies | `src/app/(v1)/v1/dex/jogos/lista-jogos.tsx:97` | 5e | — | `NAV`, `URL` (`jogo`) | — | pending |

## 22. `/dex/trofeus` — Trophies

v1: `src/app/(v1)/v1/dex/trofeus/page.tsx` (reads `?jogo=`) and `painel-trofeus.tsx`. Owner: **5e**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| TRO-01 | Pick the game; arrive with `?jogo=`; show only what is missing | `src/app/(v1)/v1/dex/trofeus/painel-trofeus.tsx:134`, `:170`, `src/app/(v1)/v1/dex/trofeus/page.tsx:19` | 5e | — | `VIEW`, `URL` (`jogo`) | Trophies in story order, platinum derived | pending |
| TRO-02 | Mark a trophy earned, with a date; cancel | `src/app/(v1)/v1/dex/trofeus/painel-trofeus.tsx:245`, `:224`, `:226`, `:229`, `:93` | 5e | `POST /api/dex/trofeus` | `REQ`, `REF` (`dexTrofeuCalculado` for HOME) | HOME trophies are computed, never marked | pending |
| TRO-03 | Undo an earned trophy (asks first) | `src/app/(v1)/v1/dex/trofeus/painel-trofeus.tsx:236`, `:101`, `:102` | 5e | `DELETE /api/dex/trofeus/:id` | `REQ`, `CONF`, `REF` | — | pending |
| TRO-04 | "Hunt": create a plan aimed at a trophy and go to the plans | `src/app/(v1)/v1/dex/trofeus/painel-trofeus.tsx:212`, `:249`, `:106` | 5e | `POST /api/dex/planos` | `REQ`, `REF`, `NAV` to `/dex/planos` | — | pending |

## 23. `/dex/planos` — Plans

v1: `src/app/(v1)/v1/dex/planos/painel-planos.tsx` and `etapas-tarefa.tsx`. Owner: **5e**, with its own
definition of done.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| PLA-01 | Create a plan (title, goal, start, end) | `src/app/(v1)/v1/dex/planos/painel-planos.tsx:410`, `:357`, `:359` | 5e | `POST /api/dex/planos` | `REQ`, `REF` | — | pending |
| PLA-02 | Conclude, close or reactivate a plan | `src/app/(v1)/v1/dex/planos/painel-planos.tsx:308`, `:311`, `:318`, `:112` | 5e | `PATCH /api/dex/planos/:id` | `REQ`, `REF` | A closed plan is history; steps change only in an active plan | pending |
| PLA-03 | Add a task (title, type, game) | `src/app/(v1)/v1/dex/planos/painel-planos.tsx:304`, `:247`, `:249` | 5e | `POST /api/dex/planos/:id/tarefas` | `REQ`, `REF` | — | pending |
| PLA-04 | Mark a task done, dropped, or reopen it; a finished catch, evolve or trade task **offers** Register on its game | `src/app/(v1)/v1/dex/planos/painel-planos.tsx:216`, `:219`, `:224`, `:107`, `:335`, `:338` | 5e | `PATCH /api/dex/tarefas/:id`; link `linkCadastro` (`:114`) | `REQ`, `REF`, `NAV`, `URL` (`jogo`, `busca`); nothing is recorded by the offer | Finishing offers, never records | pending |
| PLA-05 | Expand a task to see its steps; open a trophy the plan aims at | `src/app/(v1)/v1/dex/planos/painel-planos.tsx:168`, `:145` | 5e | — | `VIEW`, `NAV` | — | pending |
| PLA-06 | Add or edit a step (text and optional details) | `src/app/(v1)/v1/dex/planos/etapas-tarefa.tsx:199`, `:176`, `:93`, `:65` | 5e | `POST /api/dex/tarefas/:id/etapas`, `PATCH /api/dex/etapas/:id` | `REQ`, `REF` (1–200 / 2,000 characters, 50 steps) | Steps change only while the task is open in an active plan | pending |
| PLA-07 | Check or uncheck a step | `src/app/(v1)/v1/dex/planos/etapas-tarefa.tsx:145`, `:73` | 5e | `PATCH /api/dex/etapas/:id` (`feita`) | `REQ`, `REF` | Checking the last step never finishes the task | pending |
| PLA-08 | Organize steps: move up or down | `src/app/(v1)/v1/dex/planos/etapas-tarefa.tsx:208`, `:159`, `:168`, `:83` | 5e | `PUT /api/dex/tarefas/:id/etapas/ordem` | `REQ`, `REF` (stale list refused) | Up/down, never drag; renumbered 1..n | pending |
| PLA-10 | Open the history of closed plans (where a plan is reactivated, PLA-02) | `src/app/(v1)/v1/dex/planos/painel-planos.tsx:418` | 5e | — | `VIEW` | A closed plan is history | pending |
| PLA-09 | Delete a step (asks first) | `src/app/(v1)/v1/dex/planos/etapas-tarefa.tsx:180`, `:78`, `:79` | 5e | `DELETE /api/dex/etapas/:id` | `REQ`, `CONF`, `REF` | Order renumbered | pending |

---

## Coverage of the business rules

Phase 6 needs every case below delivered on the v2. The rows that carry each rule:

| Rule | Cases and rows |
|---|---|
| R1 Exclusive allocation | allocate (CID-17, INV-08, COL-21, CID-12), swap (CID-19), deallocate (CID-18, INV-09), remove a filled slot (CID-11), secrets off and scope change free copies (CID-07, CID-08), delete a collection (CID-15), delete an allocated copy (INV-10) |
| R2 Pokédex eligibility | candidates and destinations (CID-17, INV-08, COL-05), Pokédex buy candidates (OPC-01, OPC-07), scope (CID-08, NOV-03), manual card `dexId` (CBUS-05) |
| R3 Forms do not split the slot | grid display (CID-01), candidates (CID-17, INV-08, OPC-01), region filter (CID-05) |
| R4 Official numbering, secrets by flag | creation (NOV-05, NOV-07, COL-14), secrets toggle (CID-07), single card key (CID-10), counts (CID-01, INI-06, VG-04) |
| R5 The selection is the user's | allocate (CID-17, INV-08), theme cards (COL-21), suggestions (COL-18, COL-19, COL-05), buy marking and shortcut (OPC-07, OPC-08), What's missing never allocates (FAL-01) |
| R6 The empty slot is first-class | grid (CID-01, CID-04), What's missing (FAL-01, OPC-01), Almost there (INI-06, VG-01), a slot emptied by deallocate or delete (CID-18, INV-09, INV-10) |
| R7 Copy language is the physical card's | entry (CSET-02, CSET-05, CBUS-04), edit and bulk edit (INV-07, INV-06), required language (CID-06, CID-12, NOV-06, COL-21), filters (INV-03, VG-03), duplicates (REP-01) |
| R8 Atomic swap, upgrade is a flag | upgrade flag (CID-02), swap (CID-19), discard and restore (CID-20) |
