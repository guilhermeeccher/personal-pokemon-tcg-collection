# Action parity matrix

Every action a user can take on each of the 23 screens of the v1, with the v2 package that owns it,
the operation it reuses, the evidence that accepts it, and the business-rule cases it touches. A
bridge page is replaced by its v2 screen **only when every row of that screen is `delivered`, or
`deferred` to a named package with a working "Do it in v1" link** (see the [README](./README.md),
"A bridge leaves only when parity is checked"). Phase 6 starts only when every row of the matrix is
`delivered`: nothing may still be deferred.

## How to read it

**v1 code** is `file:line` at commit `cc47f24`, before package 0a moved the v1. After the move, a
screen file under `src/app/<x>` lives at `src/app/(v1)/v1/<x>` and the login at
`src/app/(v1)/login/`; `src/app/_componentes/` and `src/app/api/` do not move. The line is where the
action starts (the button, the field, or the handler that sends the request).

**Owner** is a package of the plan in the README. When an action is built inside a shared
component by one package and placed on the screen by another, the cell names both, builder first:
`1b → 1d` means package 1b builds it in the card detail and package 1d makes it reachable on that
screen. The row is `delivered` only when the action works on that screen, so the screen's package
marks it. A component reused as is (0b's Card) is named in "Reuses".

**Reuses** is the API route the v1 calls (and the `lib/db` function behind it for writes), or the
function the v1 uses on the client. The v2 reuses it unchanged unless the row says otherwise; a
v2 package that needs a new read (package 1a, 2a) adds it without changing these.

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
| SH-04 | Switch the interface language (pt / en) | `src/app/_componentes/seletor-locale.tsx:57` | 0c | server action `definirLocale` (`src/app/_acoes/definir-locale.ts`) | `REQ`; the current page re-renders in the other language under both root layouts (`TODO(0a)`: `revalidatePath` with two root layouts) | Access: server action checks session and origin | pending |
| SH-05 | Sign out ("Sair"), navigate only after the server confirms; "Back" afterwards reloads into the login | `src/app/_componentes/nav.tsx:139`, `:155` | 0c (bfcache script in 0a's layout) | `DELETE /api/sessao` | `REQ`; with the password module on, Back after Sign out lands on `/login` on a v2 page too | Access: session, bfcache | pending |

## 1. `/` — Home

v1: `src/app/page.tsx` (server read `lerTcgInicio`, `resumoDexInicio`) and `src/app/inicio.tsx`.
Read-only screen: every action is a link. Owner of the screen: **2a**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| INI-01 | Open a card-module shortcut (collections, inventory, entry by set) | `src/app/inicio.tsx:57`, `:150` | 2a | — | `NAV` | — | pending |
| INI-02 | Open the card overview ("Overview") | `src/app/inicio.tsx:101`, `:139` | 2a | — | `NAV` to `/inventario/visao-geral` | — | pending |
| INI-03 | Open the inventory from the totals | `src/app/inicio.tsx:186` | 2a | `lerTcgInicio` totals | `NAV` | — | pending |
| INI-04 | Open the collections list ("See all", empty state) | `src/app/inicio.tsx:194`, `:202` | 2a | — | `NAV` | — | pending |
| INI-05 | Open one collection from "Your collections" (up to 4, with divisions) | `src/app/inicio.tsx:242` | 2a | `lerTcgInicio` (`src/lib/db/inicio.ts`), order of `listarColecoes` | `NAV` to `/colecoes/<id>` | Groups: order comes from the server, not re-sorted | pending |
| INI-06 | Open a collection from "Almost there" (the divisions closest to complete, with what is missing) | `src/app/inicio.tsx:278` | 2a | `listarQuaseLa` | `NAV`; the missing thumbnails are the empty slots | R6 (the missing list is the output); R4 (set divisions count official numbering) | pending |
| INI-07 | Open a Dex shortcut (plans, trophies, Pokédex) | `src/app/inicio.tsx:63`, `:150` | 2a | — | `NAV`; `OFF` hides the whole Dex block | Living Dex optional | pending |
| INI-08 | Open the Dex overview | `src/app/inicio.tsx:105`, `:139` | 2a | — | `NAV` to `/dex`; `OFF` | Living Dex optional | pending |
| INI-09 | Open a Dex pending item: received to put away, Pokémon to take to HOME | `src/app/inicio.tsx:335`, `:340` | 2a | `resumoDexInicio` | `NAV`; counts equal the v1's | Living Dex: "Received", "Take to HOME" | pending |
| INI-10 | Open the active plans and their tasks | `src/app/inicio.tsx:359`, `:367`, `:382` | 2a | `resumoDexInicio` | `NAV` to `/dex/planos` | — | pending |
| INI-11 | Open HOME trophies, open owned games | `src/app/inicio.tsx:477`, `:500` | 2a | — | `NAV` (`/dex/trofeus?jogo=home`, `/dex/jogos`) | HOME trophies are computed | pending |

## 2. `/colecoes` — Collections list

v1: `src/app/colecoes/pagina-cliente.tsx` and the files beside it. The file already separates the
"view" mode from "organize". **1c** delivers "view" and keeps a "Do it in v1" link for everything
of **4b** until 4b ships (the plan's "Organize leads to the v1 until 4b"): the bridge of
`/colecoes` is replaced by 1c with the 4b rows `deferred → 4b`, and 4b turns them `delivered`.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| COL-01 | See the collections in sections by group, in display order | `src/app/colecoes/pagina-cliente.tsx:143` | 1c | `GET /api/colecoes` (`listarColecoes`, `ordenarColecoes`) | `REQ`; same order as the v1, collections and groups from one read; stale responses discarded (`:20-28`) | Groups: one ordering source, never re-sorted on screen | pending |
| COL-02 | Open a collection | `src/app/colecoes/pagina-cliente.tsx:458` | 1c | — | `NAV` | — | pending |
| COL-03 | Create a new collection | `src/app/colecoes/pagina-cliente.tsx:281` | 1c | — | `NAV` to `/colecoes/nova` | — | pending |
| COL-04 | Open "What's missing" across collections | `src/app/colecoes/pagina-cliente.tsx:278` | 1c | — | `NAV` to `/colecoes/falta` | R6 | pending |
| COL-05 | See and follow the notice of free copies that fit empty slots | `src/app/colecoes/pagina-cliente.tsx:180`, `:290` | 1c | `GET /api/copias/elegiveis-vagas-vazias` | `REQ`; counts "ready" and "out of pattern" match the v1 | R5 (suggests, never allocates); R2, R3 (eligibility) | pending |
| COL-06 | Retry a failed list read | `src/app/colecoes/pagina-cliente.tsx:340` | 1c | `GET /api/colecoes` | `REQ` | — | pending |
| COL-07 | Enter and leave "Organize" | `src/app/colecoes/pagina-cliente.tsx:275` | 4b | — | `VIEW` | — | pending |
| COL-08 | Move a group up or down | `src/app/colecoes/pagina-cliente.tsx:376`, `:385`, `:206` | 4b | `PUT /api/grupos-colecao/ordem` | `REQ`, `REF` (409 stale list → re-read, nothing applied) | Groups: whole list, exactly the current set; up/down, never drag | pending |
| COL-09 | Move a collection up or down inside its section | `src/app/colecoes/pagina-cliente.tsx:479`, `:488`, `:216` | 4b | `PUT /api/colecoes/ordem` | `REQ`, `REF` (409) | Groups: whole section list; up/down, never drag | pending |
| COL-10 | Move a collection to another group or to "no group" | `src/app/colecoes/pagina-cliente.tsx:499`, `:220` | 4b | `PATCH /api/colecoes/:id/grupo` | `REQ`, `REF` | Groups: one level, at most one group; under the organization lock | pending |
| COL-11 | Create a group (name, optional linked series) | `src/app/colecoes/pagina-cliente.tsx:328`, `src/app/colecoes/modal-grupo.tsx:51`, `:87` | 4b | `GET /api/grupos-colecao/series`, `POST /api/grupos-colecao` | `REQ`, `REF` | Groups: series is Western only, case-sensitive | pending |
| COL-12 | Rename a group or change its linked series | `src/app/colecoes/pagina-cliente.tsx:393`, `src/app/colecoes/modal-grupo.tsx:86` | 4b | `PATCH /api/grupos-colecao/:id` | `REQ`, `REF` | Groups | pending |
| COL-13 | Delete a group (its collections go to the end of "no group") | `src/app/colecoes/pagina-cliente.tsx:402`, `src/app/colecoes/modal-grupo.tsx:167` | 4b | `DELETE /api/grupos-colecao/:id` | `REQ`, `CONF`, `TX` (moving the collections and deleting the group in one transaction) | Groups: deleting a group never deletes a collection | pending |
| COL-14 | "Create missing collections" of a linked group: preview, tick sets, rename each, re-read, create | `src/app/colecoes/pagina-cliente.tsx:412`, `src/app/colecoes/modal-faltantes.tsx:73`, `:212`, `:237`, `:254`, `:153` | 4b | `GET`/`POST /api/grupos-colecao/:id/faltantes` (`criarFaltantesDoGrupo`, through `resolverCriacaoColecao` and `inserirColecaoComVagas`) | `REQ`, `REF` (409 when the series or a set changed since the preview; 404 when the group is gone, preview closed), `TX` (all or nothing) | R4 (each set counts official numbering); catalog per card pt→en; promo and energy sets come unticked | pending |
| COL-15 | "Bring the existing ones" into a linked group: preview, tick, re-read, bring | `src/app/colecoes/pagina-cliente.tsx:420`, `src/app/colecoes/modal-existentes.tsx:71`, `:203`, `:219`, `:147` | 4b | `GET`/`POST /api/grupos-colecao/:id/existentes` | `REQ` (each item carries `grupoOrigemId`), `REF` (409 when a source group changed), `TX` | Groups: only those in no group come ticked | pending |
| COL-16 | Collapse or expand the suggestions section (remembered per device) | `src/app/colecoes/secao-sugestoes.tsx:190` | 4b | `localStorage`, in `try/catch` | `VIEW`, `HTTP` | — | pending |
| COL-17 | See all suggestions or only the first six; retry a failed read | `src/app/colecoes/secao-sugestoes.tsx:255`, `:201`, `:110` | 4b | `GET /api/sugestoes` | `REQ`; same order (rounds across kinds) | Suggestions: order, thresholds | pending |
| COL-18 | Create a set collection from a suggestion (prefilled new-collection screen) | `src/app/colecoes/secao-sugestoes.tsx:230` | 4b | — | `NAV` to `/colecoes/nova?set=<id>`, `URL` | R5 (nothing created without the click) | pending |
| COL-19 | Create a thematic collection from a suggestion: name, group, create; open the existing one when the theme already has a collection | `src/app/colecoes/secao-sugestoes.tsx:240`, `src/app/colecoes/modal-tema.tsx:84`, `:146`, `:159` | 4b | `POST /api/colecoes` (`parametro.tema`) | `REQ`, `REF` (409 `temaJaTemColecao` → link to the existing collection) | R5; Suggestions: one thematic collection per theme, created under the lock | pending |
| COL-20 | Dismiss a suggestion forever ("Not interested", two steps) | `src/app/colecoes/secao-sugestoes.tsx:245`, `:218`, `:221`, `:142` | 4b | `POST /api/sugestoes/dispensar` | `REQ`, `CONF` | Suggestions: "Not interested" is forever | pending |
| COL-21 | After creating a thematic collection, allocate "your cards that fit": tick, all, none, re-read, confirm | `src/app/colecoes/pagina-cliente.tsx:252`, `src/app/colecoes/modal-cartas-do-tema.tsx:89`, `:253`, `:225`, `:228`, `:289`, `:169` | 4b | `GET`/`POST /api/colecoes/:id/cartas-do-tema` (`alocarCartasDoTema`) | `REQ` (each item carries the preview's quantity and "already in"), `REF` (409 when anything changed; nothing written), `TX` | R1 (a free copy only, one slot); R5 (one copy per card pre-ticked, a second only by the user); R7 (required language checked on the physical copy) | pending |

## 3. `/colecoes/[id]` — Collection

v1: `src/app/colecoes/[id]/pagina-cliente.tsx` and `bloco-tema.tsx`. **1d owns the page** and every
collection operation; the slot actions live in the card detail (**1b**), which 1d integrates; the
buy marking lives in the "What's missing" tab (**1e**). Rows marked `1b → 1d` are built by 1b and
placed on this page by 1d.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| CID-01 | See the collection: header, progress, divisions, warnings, and the grid of slots (empty slots included) | `src/app/colecoes/[id]/pagina-cliente.tsx:102` | 1d | `GET /api/colecoes/:id` (`obterColecaoComVagas`); in the v2, 1a's aggregated read | `REQ` or 1a's read with the same slots; the grid shows before the upgrades arrive | R6 (every empty slot shown); R4 (official count, secrets per flag); R3 (forms share the slot, shown not split); missing-catalog warning measures the catalog | pending |
| CID-02 | See which slots have an upgrade (loaded apart) | `src/app/colecoes/[id]/pagina-cliente.tsx:121` | 1d | `GET /api/colecoes/:id/melhorias` | `REQ` | R8 (flagged, never swapped) | pending |
| CID-03 | Back to the collections list | `src/app/colecoes/[id]/pagina-cliente.tsx:196`, `:266` | 1d | — | `NAV` | — | pending |
| CID-04 | Filter: only empty slots; only slots with an upgrade | `src/app/colecoes/[id]/pagina-cliente.tsx:478`, `:489` | 1d | — | `VIEW`; becomes the tabs (Upgrades, What's missing) and the decision-1 views | R6 | pending |
| CID-05 | Filter a Pokédex by region | `src/app/colecoes/[id]/pagina-cliente.tsx:416` | 1d | — | `VIEW`; decision 1 (Binder pages by national number) | R2, R3 | pending |
| CID-06 | Edit name, required language and notes | `src/app/colecoes/[id]/pagina-cliente.tsx:310`, `:777` | 1d | `PATCH /api/colecoes/:id` (`atualizarColecao`) | `REQ`, `REF` | R7 (required language is about the physical copy) | pending |
| CID-07 | Turn "include secrets" on or off (off asks first) | `src/app/colecoes/[id]/pagina-cliente.tsx:854`, `:857`, `:862` | 1d | `PATCH /api/colecoes/:id/secretas` (`alternarSecretasDaColecao`) | `REQ`, `CONF` (turning off), `REF`, `TX` | R4 (`official` ↔ `total`); removed recipe cards stay out (`parametro.excluidas`); slots leaving take their allocation (R1, copy freed, never deleted) | pending |
| CID-08 | Add or remove a region of a Pokédex scope (removing asks first) | `src/app/colecoes/[id]/pagina-cliente.tsx:910`, `:912`, `:927` | 1d | `PATCH /api/colecoes/:id/escopo` (`alterarEscopoDaColecaoPokedex`) | `REQ`, `CONF` (removing), `REF`, `TX` | R2 (one `dexId`); R6; buy choices of slots that left are kept and drop off the list | pending |
| CID-09 | Enter "Edit cards" mode (set collection) | `src/app/colecoes/[id]/pagina-cliente.tsx:318` | 1d | — | `VIEW` | — | pending |
| CID-10 | Add a single card from any set: search by name, set, number; add it as an empty slot | `src/app/colecoes/[id]/pagina-cliente.tsx:995`, `:1004`, `:1025`, `:1029` | 1d | `GET /api/cartas`, `POST /api/colecoes/:id/cartas` (`incluirCartaNaColecao`) | `REQ`, `REF` (already in the collection) | R4 (the slot key carries the set, `set/local_id`, never shown raw); catalog language per card; a removed recipe card added again leaves `excluidas` | pending |
| CID-11 | Remove a slot (the "×" in edit mode; a filled slot frees its copy) | `src/app/colecoes/[id]/pagina-cliente.tsx:629`, `:173`, `:175`, `:181` | 1d | `DELETE /api/colecoes/:id/vagas/:vagaId` (`excluirVagaDaColecao`) | `REQ`, `CONF` (stronger text for a filled slot), `REF`, `TX` | R1 (the copy is freed, never deleted); recipe card remembered in `excluidas`; buy triage kept | pending |
| CID-12 | Add a copy to a custom collection: search free copies, add, confirm an out-of-pattern one | `src/app/colecoes/[id]/pagina-cliente.tsx:1150`, `:1160`, `:1257`, `:1244`, `:1170` | 1d | `GET /api/copias?q=…`, `POST /api/colecoes/:id/copias` (`adicionarCopiaEmColecaoCustomizada`) | `REQ` (`permitirForaDePadrao` only after the confirm), `CONF`, `REF`, `TX` (lot split) | R1; R7 (required language on the physical copy); the slot is born with the allocation (custom has no universe) | pending |
| CID-13 | Thematic collection: open "your cards that fit this theme", tick, confirm | `src/app/colecoes/[id]/bloco-tema.tsx:60`, `:83`; modal as COL-21 | 1d | `GET`/`POST /api/colecoes/:id/cartas-do-tema` | as COL-21 | as COL-21 | pending |
| CID-14 | Download the collection as CSV | `src/app/colecoes/[id]/pagina-cliente.tsx:307` | 1d | `GET /api/colecoes/:id/exportar` | `DL` | No collection data in the repository (the file is the user's) | pending |
| CID-15 | Delete the collection (copies are never deleted) | `src/app/colecoes/[id]/pagina-cliente.tsx:327`, `:139`, `:141`, `:143` | 1d | `DELETE /api/colecoes/:id` (`excluirColecao`) | `REQ`, `CONF`, `REF`, `NAV` to `/colecoes` afterwards | R1 (allocations released); groups: its section is renumbered under the lock | pending |
| CID-16 | Open the buy options of the collection (Pokédex and set) | `src/app/colecoes/[id]/pagina-cliente.tsx:300` | 1e | — | `NAV` to `/colecoes/<id>/opcoes-compra` (a bridge until 4a); in the v2, opened from the "What's missing" tab | R6 (empty slots are cards to buy; custom has none) | pending |
| CID-17 | Allocate a free copy to an empty slot: list the candidates, pick one, confirm an out-of-pattern one | `src/app/colecoes/[id]/pagina-cliente.tsx:736`, `:1295`, `:1396`, `:1383`, `:1302` | 1b → 1d (detail, slot mode) | `GET /api/vagas/:id/candidatos`, `POST /api/vagas/:id/alocar` (`alocarCopiaNaVaga`) | `REQ`, `CONF` (out of pattern), `REF` (the copy was taken meanwhile), `TX` (lot split) | R1 (one slot, one collection, database constraint); R2 (exactly one `dexId` for Pokédex); R3 (forms compete for the slot); R5 (the user picks; the button stays visible and disabled with no candidate); R7 | pending |
| CID-18 | Deallocate the copy of a slot (asks first) | `src/app/colecoes/[id]/pagina-cliente.tsx:690`, `:151`, `:152`, `:158` | 1b → 1d (detail, slot mode) | `DELETE /api/vagas/:id/alocar` (`desalocarVaga`) | `REQ`, `CONF`, `REF` | R1 (copy back to free); R6 (the slot becomes an empty slot again); buy choice of that slot comes back to the list | pending |
| CID-19 | Swap the slot's copy for a better one: see the candidates and the axis, confirm the swap | `src/app/colecoes/[id]/pagina-cliente.tsx:683`, `:1641`, `:1622`, `:1473`, `:1477` | 1b → 1d (detail, slot mode) | `POST /api/vagas/:id/trocar` (`trocarCopiaDaVaga`) | `REQ`, `CONF`, `REF`, `TX` (the slot is never left empty by a failed swap) | R8 (atomic swap, flagged upgrade, never automatic; ladder rarity > language > variant, promo outside, decided in `melhoria-vaga.ts`); R1 | pending |
| CID-20 | Discard an upgrade suggestion, or restore a discarded one | `src/app/colecoes/[id]/pagina-cliente.tsx:1647`, `:1609`, `:1508`, `:1511` | 1b → 1d (detail, slot mode) | `POST`/`DELETE /api/vagas/:id/melhorias/descartar` (`descartarMelhoria`, `restaurarMelhoria`) | `REQ`, `REF` | R8 | pending |
| CID-21 | Zoom a card image (hover with delay on desktop, tap on mobile) | `src/app/colecoes/[id]/pagina-cliente.tsx:644` (`ImagemCartaComZoom`) | 1b → 1d (the detail replaces the zoom) | the image origin of `imagem-carta-zoom.tsx`, ported into 0b's Card | the detail opens from the card; the user's own photo and the borrowed-photo mark show as in the v1 | Nothing only on hover | pending |

## 4. `/colecoes/nova` — New collection

v1: `src/app/colecoes/nova/pagina-cliente.tsx`. Owner: **1c**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| NOV-01 | Name the collection | `src/app/colecoes/nova/pagina-cliente.tsx:244` | 1c | — | `VIEW` | — | pending |
| NOV-02 | Choose the type: Pokédex, Set, Custom | `src/app/colecoes/nova/pagina-cliente.tsx:256` | 1c | — | `VIEW` | — | pending |
| NOV-03 | Pokédex: national or by regions, and pick the regions | `src/app/colecoes/nova/pagina-cliente.tsx:273`, `:282`, `:288` | 1c | `ds/grade-escopo` (logic) | `VIEW` | R2, R3 | pending |
| NOV-04 | Set: add sets to the recipe, remove one, keep the chosen order | `src/app/colecoes/nova/pagina-cliente.tsx:114`, `:324`, `:312` | 1c | `GET /api/sets` (`SeletorExpansao`) | `REQ`; the same sets offered as in the v1 (every catalog language) | R4; set recipe in order | pending |
| NOV-04b | Set picker: filter the sets by catalog language, search by name, code or id, pick one | `src/app/_componentes/seletor-expansao.tsx:138`, `:155`, `:165` | 1c | `SeletorExpansao` logic | `VIEW`; same results as the v1 for the same query | — | pending |
| NOV-05 | Set: catalog language preference (pt or en; a warning when a set has no pt rows) and "include secrets" | `src/app/colecoes/nova/pagina-cliente.tsx:338`, `:352` | 1c | — | `VIEW` | R4 (`official` / `total`); catalog language per card, Japanese never a fallback | pending |
| NOV-06 | Required language, group, notes | `src/app/colecoes/nova/pagina-cliente.tsx:372`, `:85`, `:386`, `:398` | 1c | `GET /api/colecoes` (groups) | `REQ` | R7 (required language is of the physical copy) | pending |
| NOV-07 | Create, see validation errors line by line, land on the new collection | `src/app/colecoes/nova/pagina-cliente.tsx:163`, `:190`, `:210` | 1c | `POST /api/colecoes` (`resolverCriacaoColecao`, `criarColecaoComVagas`) | `REQ`, `REF` (each validation error), `NAV` to `/colecoes/<id>` | R4; R6 (slots born empty); groups: goes to the end of its section | pending |
| NOV-08 | Arrive prefilled from a suggestion (`?set=`), retry the prefill or start blank | `src/app/colecoes/nova/page.tsx:9`, `src/app/colecoes/nova/pagina-cliente.tsx:231`, `:234` | 1c | `GET /api/sets` | `URL` (`set`), `REQ` | Suggestions: a suggested set has an active pt/en row, the filter the prefill resolves against | pending |

## 5. `/colecoes/falta` — What's missing, all collections

v1: `src/app/colecoes/falta/pagina-cliente.tsx`. Read-only. Owner: **1e**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| FAL-01 | See every empty slot of every Pokédex and set collection, by collection, marked "can be allocated now" | `src/app/colecoes/falta/pagina-cliente.tsx:69`, `:78` | 1e | `GET /api/colecoes`, `GET /api/colecoes/:id` per collection; in the v2, 1a's "missing" read | `REQ` or 1a's read with the same slots and the same "can allocate" marks | R6 (the reason the system exists); R5 (allocating happens in the collection, never here) | pending |
| FAL-02 | Filter to slots that can be allocated now | `src/app/colecoes/falta/pagina-cliente.tsx:138` | 1e | — | `VIEW` | R2, R3 (eligibility from the server) | pending |
| FAL-03 | Open a collection; back to the list | `src/app/colecoes/falta/pagina-cliente.tsx:158`, `:115` | 1e | — | `NAV` | — | pending |

## 6. `/colecoes/[id]/opcoes-compra` — Buy options

v1: `src/app/colecoes/[id]/opcoes-compra/pagina-cliente.tsx` and `painel-sem-estoque.tsx`. **4a owns
the page** (same URL in the v2). The marking, the "best of each slot" shortcut, the tabs and the
copy are also delivered earlier by **1e** inside the collection's "What's missing" tab, over the
same routes; for this page's bridge, every row has to be delivered by 4a.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| OPC-01 | See the empty slots with their options, prices, choices, the source (Liga or Cardmarket) and the state of the last round | `src/app/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:445` | 4a | `GET /api/colecoes/:id/opcoes-compra` | `REQ`; the out-of-stock filter hides as in the v1 and never hides a selected card | R6; R2 (Pokédex candidates have exactly one `dexId`); R3 (forms compete); Buy options from the catalog; Out of stock | pending |
| OPC-02 | Follow a round in progress (polling) | `src/app/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:500` | 4a | `GET /api/colecoes/:id/opcoes-compra` | period derived from the interval (`clamp(intervalo × 250 ms, 5 s, 60 s)`), never a fixed number | Liga: nothing may double the pace | pending |
| OPC-03 | Set the price ceiling, the order of options, the order of a set's slots | `src/app/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:792`, `:816`, `:804` | 4a | `filtrarCandidatas` (Cardmarket, screen filter); the Liga scan reads them as round parameters | `VIEW` on Cardmarket (no new round); same results as the v1 | Ceiling hides only a known price above it, a card with no price stays, a selected card is never hidden | pending |
| OPC-04 | Liga: include cards outside the catalog; re-query everything (ignore the 24 h freshness) | `src/app/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:832`, `:842` | 4a | body of `POST /api/colecoes/:id/opcoes-compra` | `REQ` | Liga: a new scan does not redo what it has | pending |
| OPC-05 | Start a Liga scan of the collection's empty slots | `src/app/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:851`, `:526`, `:538` | 4a | `POST /api/colecoes/:id/opcoes-compra` (`criarVarredura`, `executarVarredura`) | `REQ`, `REF` (round alive, blocked, nothing to scan); on an install blocked by the Liga, the screen explains that new lookups are unavailable and never works around it (decision 3) | Liga hard rules (pace from `robots.txt`, allowed routes, block aborts) | pending |
| OPC-06 | Cardmarket: look up candidate prices (one round in the whole app) | `src/app/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:851`, `:572`, `:577` | 4a | `POST /api/colecoes/:id/opcoes-compra` (`iniciarRodadaCandidatas`) | `REQ`, `REF` (`cotacaoIndisponivel` 503, round alive, all fresh within 7 days) | Cardmarket: PTAX per round, one card at a time, 7-day validity | pending |
| OPC-07 | Mark or unmark one option of a slot (several per slot allowed) | `src/app/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:1289`, `:617`, `:611`, `:635` | 4a (also 1e, tab) | `PATCH /api/colecoes/:id/opcoes-compra/selecao` (`marcarEscolhas`, `desmarcarEscolhas`) | `REQ` (Cardmarket `{cartas:[{chave,cartaId}]}`, Liga `{ids}`, unmark by `escolhaId`), `REF` (Liga marking needs a scan; unmarking does not) | R5 (the user marks); R2 (a Cardmarket card must be a candidate of an empty slot); Buy triage: choice tied to the slot, durable | pending |
| OPC-08 | Mark the best option of each slot with no choice yet | `src/app/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:967`, `:662`, `:687` | 4a (also 1e, tab) | `PATCH …/selecao` in one batch (up to 1,100) | `REQ`; on Cardmarket only a priced first option is marked; the criterion and the card are visible (decision 2) | R5 (an explicit click of the user) | pending |
| OPC-09 | Switch between the Liga list tabs (≤ 110 cards each, one per region in a Pokédex) | `src/app/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:1082` | 4a (also 1e, tab) | `abasLiga` from the GET (`dividirListaCompra`) | `VIEW`; the tabs are the server's, not rebuilt on the client | Export: 110 per search, same function for screen and download | pending |
| OPC-10 | Copy the active tab's list | `src/app/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:1055`, `:696` | 4a (also 1e, tab) | `copiarTexto` (`src/app/_componentes/copiar-texto.ts`) | `HTTP` (works by IP over plain HTTP); the text equals the per-tab download | HTTP rule | pending |
| OPC-11 | Download the active tab as a Liga list | `src/app/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:1046` | 4a | `GET /api/colecoes/:id/opcoes-compra/exportar?formato=liga&aba=` | `DL`; the tab `id` matches the screen's | Export | pending |
| OPC-12 | Download the buy list as CSV or as text | `src/app/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:1010`, `:1016` | 4a | `GET …/exportar?formato=csv` and `?formato=texto` | `DL`; the CSV says which source each price came from | `precosDasEscolhas` (one function for screen and export) | pending |
| OPC-13 | Show only slots with an option; collapse or expand all, a group, or one slot (remembered per device) | `src/app/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:1147`, `:1169`, `:1172`, `:1198`, `:1201`, `:1219`, `:305`, `:417` | 4a | `localStorage`, in `try/catch` | `VIEW`, `HTTP` | — | pending |
| OPC-14 | Out of stock: paste the Liga notice, preview, confirm (records and unmarks in one transaction) or cancel | `src/app/colecoes/[id]/opcoes-compra/painel-sem-estoque.tsx:140`, `:155`, `:209`, `:217`, `:81` | 4a | `POST /api/colecoes/:id/opcoes-compra/sem-estoque` (preview, then confirm) | `REQ`, `REF`, `TX` (record and unmark together) | Out of stock: key name + number/total, global, 30 days, only this collection's empty slots unmarked | pending |
| OPC-14b | Open the out-of-stock panel | `src/app/colecoes/[id]/opcoes-compra/painel-sem-estoque.tsx:128` | 4a | — | `VIEW` | — | pending |
| OPC-18 | Read the explanations: options with no price, choices kept from older scans | `src/app/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:993`, `:1003` | 4a | `Dica` texts | open by tap and by keyboard | Nothing only on hover; Cardmarket "no price" wording | pending |
| OPC-15 | Out of stock: see the cards on record and offer one again | `src/app/colecoes/[id]/opcoes-compra/painel-sem-estoque.tsx:68`, `:244`, `:112` | 4a | `GET` and `DELETE …/sem-estoque?item=` | `REQ`, `REF` | Out of stock | pending |
| OPC-16 | Open the card's page on the Liga site | `src/app/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:1366` | 4a | `caminhoBuscaLiga` | external link, same URL | Liga: only `cards/search` and `cards/card` | pending |
| OPC-17 | Back to the collection; zoom a card | `src/app/colecoes/[id]/opcoes-compra/pagina-cliente.tsx:759`, `:1300` | 4a | 0b's Card | `NAV` | — | pending |

## 7. `/cadastro/set` — Entry by set

v1: `src/app/cadastro/set/pagina-cliente.tsx` (batch logic in `src/lib/dominio/grade-set.ts`). Owner:
**3a**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| CSET-01 | Pick a set (set picker: filter by catalog language, search by name, code or id) and load its cards (with "you have N") | `src/app/cadastro/set/pagina-cliente.tsx:205`, `:115`, `:127`; `src/app/_componentes/seletor-expansao.tsx:138`, `:155`, `:165` | 3a | `GET /api/sets`, `GET /api/sets/:setId/cartas` | `REQ`; mixed-catalog warning as in the v1 | Catalog language per card (pt→en) | pending |
| CSET-02 | Set the batch defaults: variant, physical language, condition (a summary with a toggle on mobile) | `src/app/cadastro/set/pagina-cliente.tsx:286`, `:292`, `:298`, `:262` | 3a | reducer `reduzirGrade` | `VIEW` | R7 (language of the physical card, independent of the catalog row) | pending |
| CSET-03 | Filter the grid by number | `src/app/cadastro/set/pagina-cliente.tsx:317` | 3a | — | `VIEW` | — | pending |
| CSET-04 | Type a quantity per card; Enter jumps to the next | `src/app/cadastro/set/pagina-cliente.tsx:372`, `:392`, `:151` | 3a | `Quantidade` (controlled) | `VIEW`; keyboard flow kept; fields 16 px on mobile | Mobile: `Quantidade` controlled | pending |
| CSET-05 | Override variant, language or condition on one card; see an out-of-pattern variant warning | `src/app/cadastro/set/pagina-cliente.tsx:419`, `:432`, `:445`, `:66` | 3a | — | `VIEW` | R7 | pending |
| CSET-06 | Save the whole batch and see the result line by line | `src/app/cadastro/set/pagina-cliente.tsx:306`, `:157`, `:170` | 3a | `POST /api/sets/:setId/copias` (`inserirLoteCopias`) | `REQ`, `REF` per line; fixed bottom bar reserves its height | R7; an identical free copy is merged into the existing row (`fusao-copias.ts`) | pending |
| CSET-07 | Zoom a card | `src/app/cadastro/set/pagina-cliente.tsx:347` | 3a | 0b's Card | nothing only on hover | — | pending |

## 8. `/cadastro/busca` — Entry by search

v1: `src/app/cadastro/busca/pagina-cliente.tsx` and `src/app/_componentes/cadastrar-carta-manual.tsx`.
Owner: **3b**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| CBUS-01 | Search a card by name, set and number | `src/app/cadastro/busca/pagina-cliente.tsx:205`, `:84`, `:98` | 3b | `GET /api/cartas` | `REQ` | — | pending |
| CBUS-02 | Quick search by set code + number | `src/app/cadastro/busca/pagina-cliente.tsx:235`, `:108`, `:120` | 3b | `GET /api/cartas` | `REQ` | — | pending |
| CBUS-03 | Pick a result; cancel the pick | `src/app/cadastro/busca/pagina-cliente.tsx:315`, `:140`, `:398` | 3b | — | `VIEW`; the form scrolls into view on mobile | — | pending |
| CBUS-04 | Fill the copy (quantity, variant, physical language, condition, location) and save | `src/app/cadastro/busca/pagina-cliente.tsx:342`, `:349`, `:362`, `:375`, `:388`, `:154`, `:165` | 3b | `POST /api/copias` (`inserirCopia`) | `REQ`, `REF` | R7 (physical language); merge into an identical free copy | pending |
| CBUS-05 | Enter a card by hand when it is not in the catalog (set, number, official count, name, set name, catalog language, `dexId`) | `src/app/cadastro/busca/pagina-cliente.tsx:270`, `src/app/_componentes/cadastrar-carta-manual.tsx:43`, `:88`, `:93` | 3b | `POST /api/cartas/manual` (`criarCartaManual`) | `REQ`, `REF`; the row is born `origem = manual` | R2 (`dexId`: one makes the card Pokédex-eligible); catalog seed: a manual row is never demoted to `sync` | pending |
| CBUS-06 | Zoom a result | `src/app/cadastro/busca/pagina-cliente.tsx:292` | 3b | 0b's Card | — | — | pending |

## 9. `/inventario` — Inventory

v1: `src/app/inventario/pagina-cliente.tsx` and `src/app/_componentes/adicionar-imagem-local.tsx`.
**2b owns the page**, the list and the bulk edit; the per-copy operations live in the card detail in
copy mode (**1b**), which 2b integrates (rows marked `1b → 2b`).

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| INV-01 | See the inventory, 50 per page, and page through it | `src/app/inventario/pagina-cliente.tsx:149`, `:697`, `:705`, `:206` | 2b | `GET /api/copias` (`listarCopias`) | `REQ` | — | pending |
| INV-02 | Arrive with filters in the URL (from the overview, the duplicates, the home) | `src/app/inventario/pagina-cliente.tsx:167`, `:180` | 2b | `filtros-inventario.ts` keys | `URL`: `set`, `idioma`, `raridade`, `variante`, `condicao`, `alocacao` (and the others the v1 reads) keep their names and values | — | pending |
| INV-03 | Search by text; filter by set, language, rarity, variant, condition, graded, allocation, missing image, location; open and close the filters; clear them | `src/app/inventario/pagina-cliente.tsx:311`, `:346`–`:441`, `:334`, `:447`, `:199`, `:212` | 2b | `GET /api/copias?…` | `REQ`, `URL` | R7 (the language filter is the physical copy's) | pending |
| INV-04 | Download the inventory as CSV; download the Liga upload format | `src/app/inventario/pagina-cliente.tsx:293`, `:298` | 2b | `GET /api/copias/exportar`, `GET /api/copias/exportar-liga` | `DL` | Export to LigaPokemon: the upload format (`exportacao-liga.ts`) | pending |
| INV-05 | Select copies one by one, all on the page, or clear the selection | `src/app/inventario/pagina-cliente.tsx:539`, `:509`, `:486`, `:219`, `:228` | 2b | — | `VIEW`; fixed bottom bar on mobile reserves its height | — | pending |
| INV-06 | Bulk edit the selection: condition, location, physical language, variant; confirm step; apply | `src/app/inventario/pagina-cliente.tsx:477`, `:1260`–`:1325`, `:1245`, `:1232`, `:1177`, `:1187` | 2b | `PATCH /api/copias/massa` (`atualizarCopiasEmMassa`) | `REQ`, `CONF`, `REF`, `TX` | R7 (changing the physical language never touches the catalog row) | pending |
| INV-07 | Edit one copy: quantity, variant, physical language, condition, location, grading (company, grade, certificate), acquisition (date, origin, price), notes | `src/app/inventario/pagina-cliente.tsx:670`, `:755`, `:784`, `:789` | 1b → 2b (detail, copy mode) | `PATCH /api/copias/:id` (`atualizarCopia`) | `REQ`, `REF` | R7; R1 (an allocated copy keeps its single slot) | pending |
| INV-08 | Allocate a free copy to a destination: list eligible slots and custom collections, pick, confirm an out-of-pattern one | `src/app/inventario/pagina-cliente.tsx:662`, `:988`, `:1110`, `:1093`, `:1001`, `:1006` | 1b → 2b (detail, copy mode) | `GET /api/copias/:id/destinos`, then `POST /api/vagas/:id/alocar` or `POST /api/colecoes/:id/copias` | `REQ`, `CONF`, `REF`, `TX` (lot split) | R1; R2; R3; R5 (the user picks the destination); R7 (required language) | pending |
| INV-09 | Deallocate an allocated copy (asks first) | `src/app/inventario/pagina-cliente.tsx:654`, `:252`, `:254`, `:262` | 1b → 2b (detail, copy mode) | `DELETE /api/vagas/:vagaId/alocar` | `REQ`, `CONF`, `REF` | R1; R6 (the slot is empty again) | pending |
| INV-10 | Delete a copy (asks first) | `src/app/inventario/pagina-cliente.tsx:677`, `:234`, `:235`, `:243` | 2b | `DELETE /api/copias/:id` (`removerCopia`) | `REQ`, `CONF`, `REF` | R1 (an allocated copy leaves its slot, which becomes empty, R6) | pending |
| INV-11 | Add, replace or remove the card's own photo: upload a file, give a link, or map the set to MyPCards | `src/app/inventario/pagina-cliente.tsx:566`, `:581`; `src/app/_componentes/adicionar-imagem-local.tsx:75`, `:181`, `:212`, `:152`, `:156`, `:131`, `:135` | 1b → 2b (detail, copy mode) | `POST`/`DELETE /api/imagens-locais/:cartaId/:idioma`, `POST /api/sets-mypcards` | `REQ`, `REF`; the image is stored in the install's volume, never in the repository | No card images in the repository; local images are plain `<img>` | pending |
| INV-12 | Zoom a copy's image | `src/app/inventario/pagina-cliente.tsx:550` | 1b → 2b (the detail replaces the zoom) | 0b's Card | the user's own photo is preferred, as in the v1 | Nothing only on hover | pending |

## 10. `/inventario/visao-geral` — Overview

v1: `src/app/inventario/visao-geral/pagina-cliente.tsx`. Read-only. Owner: **2c**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| VG-01 | See the summary: totals, gems, collections as binder covers, "Almost there", distributions | `src/app/inventario/visao-geral/pagina-cliente.tsx:66`, `:116`, `:168` | 2c | `GET /api/inventario/resumo` | `REQ`; gems ordered by the stored price of the active source, never the two sources mixed | Special card prices; R6 ("Almost there") | pending |
| VG-02 | Open the inventory: all, allocated, free | `src/app/inventario/visao-geral/pagina-cliente.tsx:91`, `:98`, `:105`, `:112` | 2c | — | `NAV`, `URL` (`alocacao=alocada|livre`) | — | pending |
| VG-03 | Open the inventory filtered by a distribution line: set, rarity, language, condition, variant | `src/app/inventario/visao-geral/pagina-cliente.tsx:449`, `:470`, `:491`, `:512`, `:533` | 2c | — | `NAV`, `URL` (keys as INV-02) | R7 (language = physical) | pending |
| VG-04 | Open the collections list, a collection cover, an "Almost there" division | `src/app/inventario/visao-geral/pagina-cliente.tsx:121`, `:267`, `:360` | 2c | — | `NAV` | R4 (division counts) | pending |
| VG-05 | Open the duplicates | `src/app/inventario/visao-geral/pagina-cliente.tsx:149` | 2c | — | `NAV` | — | pending |

## 11. `/inventario/repetidas` — Duplicates

v1: `src/app/inventario/repetidas/pagina-cliente.tsx`. Owner: **2c**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| REP-01 | See cards with 2 or more units, with allocated, free and physical languages; page through | `src/app/inventario/repetidas/pagina-cliente.tsx:76`, `:206`, `:210`, `:97` | 2c | `GET /api/inventario/repetidas` | `REQ` | R7 (the pt and en rows of one card are one card); R1 (allocated counts) | pending |
| REP-02 | Show only cards with free units | `src/app/inventario/repetidas/pagina-cliente.tsx:114`, `:91` | 2c | `GET /api/inventario/repetidas?…` | `REQ` | — | pending |
| REP-03 | Zoom a card | `src/app/inventario/repetidas/pagina-cliente.tsx:138` | 2c | 0b's Card (the detail in copy mode, if 2c opens it) | — | — | pending |

## 12. `/inventario/precos` — Prices of special cards

v1: `src/app/inventario/precos/page.tsx` (reads `PRECO_FONTE`), `pagina-cliente.tsx` and
`grafico-valor-total.tsx`. Owner: **2d**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| PRE-01 | See the prices table of the active source (Liga: BRL as the site gives; Cardmarket: euro, BRL, quote and date, criterion), the summary and the rounds | `src/app/inventario/precos/page.tsx:12`, `src/app/inventario/precos/pagina-cliente.tsx:255` | 2d | `GET /api/inventario/precos` | `REQ`; Cardmarket rows show the euro value and the quote with its date; "Trend" column with the tag and `Dica` when the value is not the trend | International price reference (never presented as a Brazilian market price; never mixed with the Liga); trend cap | pending |
| PRE-02 | Page through the table | `src/app/inventario/precos/pagina-cliente.tsx:592`, `:600` | 2d | — | `VIEW` | — | pending |
| PRE-03 | Start a price round of the active source | `src/app/inventario/precos/pagina-cliente.tsx:412`, `:297`, `:302` | 2d | `POST /api/inventario/precos` (`iniciarRodadaCardmarket` or the Liga round) | `REQ`, `REF` (`precosJaConsultados`, `precosEmAndamento`, `semCartasEspeciais`, `cotacaoIndisponivel`, Liga blocked) | Liga pace; one live round per source; Cardmarket PTAX per round | pending |
| PRE-04 | Follow a round in progress (polling) | `src/app/inventario/precos/pagina-cliente.tsx:282` | 2d | `GET /api/inventario/precos` | period derived from the interval, never fixed | Liga: nothing may double the pace | pending |
| PRE-05 | Read the total value chart, point at a snapshot | `src/app/inventario/precos/grafico-valor-total.tsx:199` | 2d | `listarSerieDePrecos` (in the GET) | one series per source; the text still says the total also rises when cards enter the sum; works by touch | Special card prices: history and snapshots | pending |
| PRE-05b | Open the chart's data as a table | `src/app/inventario/precos/grafico-valor-total.tsx:319` | 2d | — | `VIEW`; the same points as the chart | — | pending |
| PRE-07 | Read the explanations: card not found, round error, foil, no price | `src/app/inventario/precos/pagina-cliente.tsx:563`, `:652`, `:800`, `:835` | 2d | `Dica` texts | each opens by tap and by keyboard, never only on hover or in `title` | Nothing only on hover | pending |
| PRE-06 | Delete a round (asks first) | `src/app/inventario/precos/pagina-cliente.tsx:688`, `:323`, `:324`, `:331` | 2d | `DELETE /api/inventario/precos/rodadas/:id` | `REQ`, `CONF`, `REF` | Prices: a found price is never deleted by this | pending |

## 13. `/login` — Login

v1: `src/app/login/page.tsx` and `formulario-login.tsx`. Exists only with `ACESSO_COM_SENHA=1`.
Owner: **1f**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| LOG-01 | Type the password and enter; generic errors (wrong password, too many attempts) | `src/app/login/formulario-login.tsx:54`, `:32` | 1f | `POST /api/sessao` | `REQ`, `REF` (the same generic messages, same delay) | Access: origin required, rate limit, no global lock | pending |
| LOG-02 | Land on the page asked for (`volta`), with a full navigation | `src/app/login/page.tsx:33`, `src/app/login/formulario-login.tsx:41` | 1f | `sanitizarVolta` | `URL` (`volta`), including `/v1/...` paths; anything else becomes `/` | Access: `volta` | pending |
| LOG-03 | A session already open skips the login | `src/app/login/page.tsx:37` | 1f | `sessaoValida`, `sanitizarVolta` | `/login` with a session goes to `volta`; module off → 404 identical to any missing path | Access: the only page without the guard, exactly one page | pending |

## 14. `/dex` — Living Dex overview

v1: `src/app/dex/page.tsx` (server reads) and `visao-geral-dex.tsx`. Read-only. Owner: **5a**. Every
Dex row also needs `OFF`.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| DEX-01 | See progress per track and region, recent arrivals, trophy shelf, game cards, active plan, what is in a game and not in HOME | `src/app/dex/page.tsx:20`, `:22` | 5a | server reads of `page.tsx` | same numbers as the v1; `OFF` | HOME trophies computed; sections counted as the user set them | pending |
| DEX-02 | Open a slot in Register (`?busca=`) from the showcase | `src/app/dex/visao-geral-dex.tsx:192` | 5a | — | `NAV`, `URL` (`busca`) | — | pending |
| DEX-03 | Open trophies: HOME, or one game | `src/app/dex/visao-geral-dex.tsx:258`, `:294`, `:315`, `:334` | 5a | — | `NAV`, `URL` (`jogo`) | — | pending |
| DEX-04 | Open the plans; open the Pokédex | `src/app/dex/visao-geral-dex.tsx:357`, `:407` | 5a | — | `NAV` | — | pending |

## 15. `/dex/pokedex` — Pokédex grid

v1: `src/app/dex/pokedex/grade-pokedex.tsx`, `painel-oportunidades.tsx`,
`src/app/dex/_componentes/use-transferencia.tsx`. Owner: **5a**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| PKD-01 | Turn a section (regional, gender, special) on or off in the count | `src/app/dex/pokedex/grade-pokedex.tsx:198`, `:117`, `:122` | 5a | `PATCH /api/dex/secoes` | `REQ`, `REF`; toggling never touches a record | Living Dex: sections | pending |
| PKD-02 | Switch view (main / cosmetic) and track (normal / shiny) | `src/app/dex/pokedex/grade-pokedex.tsx:148`, `:217` | 5a | — | `VIEW` | Cosmetic forms are a view; tracks | pending |
| PKD-03 | Filter by region, search (species and form names, both languages), filter by state and category | `src/app/dex/pokedex/grade-pokedex.tsx:230`, `:242`, `:251`, `:266` | 5a | — | `VIEW` | `forma_pt` in pt; gender pairs labelled | pending |
| PKD-04 | Open a slot in Register | `src/app/dex/pokedex/grade-pokedex.tsx:304` | 5a | — | `NAV`, `URL` (`busca`) | — | pending |
| PKD-05 | "Take to HOME": expand a game, move one Pokémon or the whole group to HOME, confirm leaving a send-only game | `src/app/dex/pokedex/painel-oportunidades.tsx:66`, `:74`, `:93`; `src/app/dex/_componentes/use-transferencia.tsx:42`, `:73` | 5a | `POST /api/dex/registros/mover` (`moverRegistros`) | `REQ`, `CONF` (409 `dexConfirmarSemVolta` → dialog → resend with `confirmarSemVolta: true`), `REF`, `TX` | Living Dex: send-only confirmation never automatic; non-transferable never leaves | pending |

## 16. `/dex/caixas` — HOME boxes

v1: `src/app/dex/caixas/caixas-home.tsx`. Owner: **5b**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| CX-01 | Set the reserved boxes before National 1 (0 to 20) | `src/app/dex/caixas/caixas-home.tsx:114`, `:86`, `:92` | 5b | `PATCH /api/dex/preferencias` | `REQ`, `REF`; every box number shifts, positions do not | Living Dex: reserved boxes shift only the number | pending |
| CX-02 | Switch track; jump to a group's first box | `src/app/dex/caixas/caixas-home.tsx:173`, `:188` | 5b | — | `VIEW`; box numbers keep their gaps | Boxes: computed, never stored; anchors | pending |
| CX-03 | Open a slot: Register on desktop, a detail sheet on mobile, then Register | `src/app/dex/caixas/caixas-home.tsx:281`, `:284`, `:331`, `:339` | 5b | — | `NAV`, `URL` (`busca`); nothing only on hover | — | pending |

## 17. `/dex/recebidos` — Received

v1: `src/app/dex/recebidos/recebidos-home.tsx`. Owner: **5b**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| REC-01 | See what arrived in HOME and was not put away, by destination box, extra copies apart | `src/app/dex/recebidos/page.tsx:19`, `:21`; `src/app/dex/recebidos/recebidos-home.tsx:67` | 5b | server reads | same grouping as the v1 | "Received": `a_guardar` stored, not derived | pending |
| REC-02 | "Put away" everything, one box, or those with no place | `src/app/dex/recebidos/recebidos-home.tsx:99`, `:126`, `:191`, `:72`, `:76` | 5b | `POST /api/dex/registros/guardar` (`guardarRegistros`) | `REQ`, `REF` | — | pending |

## 18. `/dex/cadastrar` — Register by game

v1: `src/app/dex/cadastrar/page.tsx` and `cadastro-por-jogo.tsx` (virtualized below 768 px). Owner:
**5c**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| DCAD-01 | Pick the game (owned, active) or HOME; arrive with `?jogo=` and `?busca=` | `src/app/dex/cadastrar/cadastro-por-jogo.tsx:563`, `src/app/dex/cadastrar/page.tsx:18` | 5c | — | `URL` (`jogo`, `busca`), `OFF` | Records: HOME is a valid origin | pending |
| DCAD-02 | Go manage owned games | `src/app/dex/cadastrar/cadastro-por-jogo.tsx:570` | 5c | — | `NAV` | — | pending |
| DCAD-03 | Switch view; filter by text; only what I do not have; show all (outside the game's catalog) | `src/app/dex/cadastrar/cadastro-por-jogo.tsx:581`, `:594`, `:597`, `:602` | 5c | — | `VIEW`; trade, event and locked-checkpoint marks shown, never refused | Availability catalog; checkpoints mark, never refuse | pending |
| DCAD-04 | Type normal and shiny quantities per Pokémon; clear them | `src/app/dex/cadastrar/cadastro-por-jogo.tsx:218`, `:373`, `:615` | 5c | `Quantidade` (controlled) | `VIEW`; the list stays virtualized and the measured tap time does not regress | Mobile: the virtualizer rule (v1 below 768 px; v2 by the measured threshold) | pending |
| DCAD-05 | Register the batch | `src/app/dex/cadastrar/cadastro-por-jogo.tsx:619`, `:522`, `:528` | 5c | `POST /api/dex/registros` (`criarRegistrosEmLote`) | `REQ`, `REF` (one refusal refuses all), `TX` | Records come in by game, in batches; the game's catalog is the screen's default filter, not a refusal — a form outside it, picked through "show all", is registered as in the v1 (`expandirLoteCadastro` validates through `validarNovoRegistro`) | pending |

## 19. `/dex/novo-cadastro` — New registration (send to HOME)

v1: `src/app/dex/novo-cadastro/page.tsx` and `novo-cadastro.tsx`. Owner: **5d**, with its own
definition of done.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| NCAD-01 | Step 1: switch track; search; only missing; jump to a group's box | `src/app/dex/novo-cadastro/novo-cadastro.tsx:947`, `:959`, `:962`, `:970` | 5d | — | `VIEW`; the selection survives the filters | — | pending |
| NCAD-02 | Step 1: mark or unmark slots on the box grid (both tracks); toggle the pair of the last one | `src/app/dex/novo-cadastro/novo-cadastro.tsx:430`, `:1032` | 5d | — | `VIEW`; only slots not in HOME, shiny only where released | Send to HOME: one item per slot and track | pending |
| NCAD-02b | Step 1: identify a slot already in HOME (name, form, box, position) by tap or keyboard focus, without adding it to the batch | `src/app/dex/novo-cadastro/novo-cadastro.tsx:430`, `:431` | 5d | — | `VIEW`; the selection does not change | — | pending |
| NCAD-03 | Step 1: clear; continue to step 2 | `src/app/dex/novo-cadastro/novo-cadastro.tsx:1043`, `:1047`, `:614`, `:821` | 5d | — | `VIEW` | — | pending |
| NCAD-04 | Step 2: pick the game left from (remembered per device); manage games; remove an item; back | `src/app/dex/novo-cadastro/novo-cadastro.tsx:1184`, `:214`, `:222`, `:1191`, `:1243`, `:1053`, `:828` | 5d | `localStorage`, in `try/catch` | `VIEW`, `HTTP` | The game left from is not the historical origin | pending |
| NCAD-05 | Send the batch to HOME; confirm leaving a send-only game; see readable refusals; go to Received | `src/app/dex/novo-cadastro/novo-cadastro.tsx:1065`, `:816`, `:773`, `:778`, `:1267`, `:1096` | 5d | `POST /api/dex/registros/enviar` (`enviarAoHome`) | `REQ`, `CONF` (409 `dexConfirmarSemVolta`, once per batch), `REF` (`recusas-legiveis.ts`), `TX` (serialized by its own advisory lock) | Send to HOME rules: never confirmed automatically; non-transferable refused | pending |

## 20. `/dex/inventario` — Dex inventory

v1: `src/app/dex/inventario/inventario-dex.tsx`. Owner: **5e**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| DINV-01 | Filter by location, search, open more filters, only shiny, clear | `src/app/dex/inventario/inventario-dex.tsx:121`, `:136`, `:141`, `:152`, `:145` | 5e | — | `VIEW` | One row per Pokémon, grouped only on screen | pending |
| DINV-02 | Move one Pokémon of a group to HOME | `src/app/dex/inventario/inventario-dex.tsx:226` | 5e | `POST /api/dex/registros/mover` (via `use-transferencia`) | `REQ`, `CONF` (send-only), `REF` | Leaving a send-only game needs confirmation | pending |
| DINV-03 | Move one Pokémon to a game | `src/app/dex/inventario/inventario-dex.tsx:237` | 5e | `POST /api/dex/registros/mover` | `REQ`, `CONF`, `REF` | Nothing enters a send-only game; Let's Go only takes Let's Go Pokémon | pending |
| DINV-04 | Correct a group (shiny, origin, capture date, notes) — never the location | `src/app/dex/inventario/inventario-dex.tsx:247`, `:315`, `:320` | 5e | `PATCH /api/dex/registros` (`corrigirRegistros`) | `REQ`, `REF` | Moving and correcting are separate operations | pending |
| DINV-05 | Delete one Pokémon of a group (asks first) | `src/app/dex/inventario/inventario-dex.tsx:255`, `:104`, `:105`, `:107` | 5e | `DELETE /api/dex/registros/:id` | `REQ`, `CONF`, `REF` | Each Pokémon is deleted on its own | pending |

## 21. `/dex/jogos` — My games

v1: `src/app/dex/jogos/lista-jogos.tsx`. Owner: **5e**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| JOG-01 | Add an owned game (game, since, notes) | `src/app/dex/jogos/lista-jogos.tsx:192`, `:70`, `:73` | 5e | `POST /api/dex/jogos` | `REQ`, `REF` | The game list is fixed in code | pending |
| JOG-02 | Edit a game's "since" and notes | `src/app/dex/jogos/lista-jogos.tsx:152`, `:118`, `:120` | 5e | `PATCH /api/dex/jogos/:id` | `REQ`, `REF` | — | pending |
| JOG-03 | Stop or resume a game | `src/app/dex/jogos/lista-jogos.tsx:163` | 5e | `PATCH /api/dex/jogos/:id` (`ativo`) | `REQ`, `REF` | A stopped game keeps its records and takes no new ones | pending |
| JOG-04 | Remove a game (asks first) | `src/app/dex/jogos/lista-jogos.tsx:172`, `:173` | 5e | `DELETE /api/dex/jogos/:id` | `REQ`, `CONF`, `REF` (refused while a record sits in it) | — | pending |
| JOG-05 | Open a game's trophies | `src/app/dex/jogos/lista-jogos.tsx:97` | 5e | — | `NAV`, `URL` (`jogo`) | — | pending |

## 22. `/dex/trofeus` — Trophies

v1: `src/app/dex/trofeus/page.tsx` (reads `?jogo=`) and `painel-trofeus.tsx`. Owner: **5e**.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| TRO-01 | Pick the game; arrive with `?jogo=`; show only what is missing | `src/app/dex/trofeus/painel-trofeus.tsx:134`, `:170`, `src/app/dex/trofeus/page.tsx:19` | 5e | — | `VIEW`, `URL` (`jogo`) | Trophies in story order, platinum derived | pending |
| TRO-02 | Mark a trophy earned, with a date; cancel | `src/app/dex/trofeus/painel-trofeus.tsx:245`, `:224`, `:226`, `:229`, `:93` | 5e | `POST /api/dex/trofeus` | `REQ`, `REF` (`dexTrofeuCalculado` for HOME) | HOME trophies are computed, never marked | pending |
| TRO-03 | Undo an earned trophy (asks first) | `src/app/dex/trofeus/painel-trofeus.tsx:236`, `:101`, `:102` | 5e | `DELETE /api/dex/trofeus/:id` | `REQ`, `CONF`, `REF` | — | pending |
| TRO-04 | "Hunt": create a plan aimed at a trophy and go to the plans | `src/app/dex/trofeus/painel-trofeus.tsx:212`, `:249`, `:106` | 5e | `POST /api/dex/planos` | `REQ`, `REF`, `NAV` to `/dex/planos` | — | pending |

## 23. `/dex/planos` — Plans

v1: `src/app/dex/planos/painel-planos.tsx` and `etapas-tarefa.tsx`. Owner: **5e**, with its own
definition of done.

| ID | Action | v1 code | Owner | Reuses | Evidence | Rules | State |
|---|---|---|---|---|---|---|---|
| PLA-01 | Create a plan (title, goal, start, end) | `src/app/dex/planos/painel-planos.tsx:410`, `:357`, `:359` | 5e | `POST /api/dex/planos` | `REQ`, `REF` | — | pending |
| PLA-02 | Conclude, close or reactivate a plan | `src/app/dex/planos/painel-planos.tsx:308`, `:311`, `:318`, `:112` | 5e | `PATCH /api/dex/planos/:id` | `REQ`, `REF` | A closed plan is history; steps change only in an active plan | pending |
| PLA-03 | Add a task (title, type, game) | `src/app/dex/planos/painel-planos.tsx:304`, `:247`, `:249` | 5e | `POST /api/dex/planos/:id/tarefas` | `REQ`, `REF` | — | pending |
| PLA-04 | Mark a task done, dropped, or reopen it; a finished catch, evolve or trade task **offers** Register on its game | `src/app/dex/planos/painel-planos.tsx:216`, `:219`, `:224`, `:107`, `:335`, `:338` | 5e | `PATCH /api/dex/tarefas/:id`; link `linkCadastro` (`:114`) | `REQ`, `REF`, `NAV`, `URL` (`jogo`, `busca`); nothing is recorded by the offer | Finishing offers, never records | pending |
| PLA-05 | Expand a task to see its steps; open a trophy the plan aims at | `src/app/dex/planos/painel-planos.tsx:168`, `:145` | 5e | — | `VIEW`, `NAV` | — | pending |
| PLA-06 | Add or edit a step (text and optional details) | `src/app/dex/planos/etapas-tarefa.tsx:199`, `:176`, `:93`, `:65` | 5e | `POST /api/dex/tarefas/:id/etapas`, `PATCH /api/dex/etapas/:id` | `REQ`, `REF` (1–200 / 2,000 characters, 50 steps) | Steps change only while the task is open in an active plan | pending |
| PLA-07 | Check or uncheck a step | `src/app/dex/planos/etapas-tarefa.tsx:145`, `:73` | 5e | `PATCH /api/dex/etapas/:id` (`feita`) | `REQ`, `REF` | Checking the last step never finishes the task | pending |
| PLA-08 | Organize steps: move up or down | `src/app/dex/planos/etapas-tarefa.tsx:208`, `:159`, `:168`, `:83` | 5e | `PUT /api/dex/tarefas/:id/etapas/ordem` | `REQ`, `REF` (stale list refused) | Up/down, never drag; renumbered 1..n | pending |
| PLA-10 | Open the history of closed plans (where a plan is reactivated, PLA-02) | `src/app/dex/planos/painel-planos.tsx:418` | 5e | — | `VIEW` | A closed plan is history | pending |
| PLA-09 | Delete a step (asks first) | `src/app/dex/planos/etapas-tarefa.tsx:180`, `:78`, `:79` | 5e | `DELETE /api/dex/etapas/:id` | `REQ`, `CONF`, `REF` | Order renumbered | pending |

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
