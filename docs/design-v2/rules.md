# Rules matrix — v1, v2, both

Every rule of [`AGENTS.md`](../../AGENTS.md) that deals with the interface, the phone, plain HTTP,
the password access, the PWA or images, with where it applies during the transition:

- **both** — holds for the v1 and the v2, word for word. The v2 consumes the same API and the same
  domain contract, so most rules are here.
- **v1 only** — true of the v1 and kept there until the v1 leaves; the v2 follows the new wording
  given in the same row.
- **v2 only** — a rule the v1 does not have.

The eight business rules are not in this matrix: they hold for both, unchanged, and
[`parity.md`](./parity.md) lists which of their cases each action touches. Rules are cited by the
`AGENTS.md` section and the bold lead of the bullet, not by line, so the citation survives edits.

Where a v1-only rule has a v2 rewrite, the rewrite is the v2's rule from phase 0 on. When the v1
leaves (phase 6), the v1-only rows go and the v2 wording moves into `AGENTS.md`.

---

## 1. Mobile layout

Section "Mobile layout — below 768px, and only there".

| Rule | Scope | For the v2 |
|---|---|---|
| Opening: "the desktop layout (768px and up) does not change because of it" | **v1 only** | The v2 redoes the desktop too. **New wording:** the v2 has two arrangements, the glass rail (768 px and up) and the floating tab bar (below 768 px), and **every v2 screen is checked in both**. A change in *behaviour* (not only in look) that reaches one of the two is a decision made on purpose, never a side effect. |
| **Mobile means width below 768px**; `max-md:` in CSS, `useEhMobile()` in code; touch capability never decides on its own | **both** | The v2 swaps the rail for the tab bar at the same 768 px. Container queries are allowed for components, never for the shell breakpoint, which stays a media query. |
| **Nothing new reaches the desktop by accident** | **v1 only** | Replaced by the "two arrangements, both checked" wording above. In the v1 it keeps protecting the v1's desktop until the v1 leaves. |
| **Fields are 16px on mobile** | **both** | Includes every v2 field: the "Almost there" filter, searches, the "up to R$ X" ceiling field. |
| **Touch targets are at least 44 x 44px, 8px apart** | **both** | Check the shortcut chips and the binder pager dots in particular. Informative badges are still not targets. |
| **One tree, not two** | **both** | The v2 adds a case: **Binder and Whole set are the same list of slots** in two sizes, never two lists. A page-turn animation may build a second, short-lived copy of the two faces only for the duration of the turn, only `aria-hidden`/`inert`, and never with state (refs, marks) inside it. |
| **Dex → Cadastrar virtualizes its list below 768px, and only that screen does** | **v1 only** | **New wording:** a grid or list of the v2 is virtualized above a **measured** threshold, at every width, with the window as the scroller. Package 1d delivers the reusable virtual grid and fixes the threshold by measuring a full collection and the relevant Dex screens (budget of nodes, images and response time); until it is measured, no number is a rule. A v2 screen that renders more than the threshold without virtualizing says why. The v1 keeps its rule: its desktop scrolls in an inner pane, so its window virtualizer only works on the phone. |
| **Nothing only on hover or in `title`** | **both** | The v2 adds a corollary: **tilt and holo under the pointer are an enhancement, never information** — the copy's variant also shows as text or a badge. The prototype breaks this rule (slot number only on hover, the fan opening on `:hover`, an explanation in a `title`); the v2 does not copy those. |
| **Overlays share one stack** (`use-camada.ts`): Esc closes only the top layer, focus containment belongs to the top modal layer, scroll lock reference-counted; the `Modal` is a bottom sheet on mobile with its actions in `rodape`, kept in view at the bottom of the sheet | **both**, with two v2 additions | The whole rule holds for the v2, bottom sheet included. (1) **Scroll lock at every width in the v2.** The v1 locks only below 768 px because its desktop scrolls in an inner pane; the v2's window scrolls at every width, so a dialog without the lock would let the page scroll under it on the desktop. The v1 keeps its behaviour. (2) **Focus and position return to the right cell** when a layer closes, even when the cell that opened it left the DOM through virtualization. The card detail is a layer of this stack and contains focus from the moment it opens. |
| **Quantity steppers use `Quantidade`** (controlled, `value` required) | **both** | Whatever the v2 stepper looks like, it stays controlled: crossing 768 px remounts it. |
| **A fixed bottom action bar reserves its height in the page padding** | **both** | More critical in the v2: the buy bar (total and "copy list") sits above the floating tab bar, so the reserve is the sum of both bars plus `env(safe-area-inset-bottom)`. |
| Checking: phone widths (320, 393, sideways) in pt and en, desktop compared before and after at 768, 1024 and 1400 px, then a real iPhone | **v1 only** as worded | **New wording:** every v2 screen is seen in both arrangements, in pt and en, at 320, 393, ~734, **768**, 1024 and 1400 px, and on a real iPhone at every phase. The v1 is compared before and after package 0a and must come out identical. Screenshots are taken with the Chromium already on the machine (decision 8); emulation still reproduces neither focus zoom, nor the virtual keyboard over fixed bars, nor `dvh`. |

The v1's desktop shell, where the body does not scroll and an inner pane does, is a fact of the v1
layout rather than an `AGENTS.md` rule. The v2 does not copy it: **the window is the scroller at
every width** (section 7).

---

## 2. Plain HTTP on the local network

Section "The app is HTTP on the local network — what that forbids in the browser".

| Rule | Scope | For the v2 |
|---|---|---|
| The default install is plain HTTP on the machine's IP; no secure-context-only API | **both** | More important in the v2. Besides `navigator.clipboard`, the prototype relies on two more APIs that do not exist there: `navigator.userAgentData` (its engine detection, so the glass refraction never turns on over HTTP) and `deviceorientation`. The v2 uses neither for anything that must work by default. |
| Copy through `copiar-texto.ts` (`execCommand` fallback), never the Clipboard API directly | **both** | The v2's "copy list" goes through the same function. It lives in `src/app/_componentes/`, which the v2 may not import, so the first v2 package that needs it moves it to `src/app/_comum/` (section 7, rule 16) — never a second copy. |
| Same restriction for geolocation, notifications, service workers | **both** | — |

---

## 3. Password access

Section "Optional password access (`ACESSO_COM_SENHA=1`)". The proxy, the module and the API do not
move, and a route group changes the folder, not the URL, so almost all of it holds for both
unchanged.

| Rule | Scope | For the v2 |
|---|---|---|
| Configuration: only `1` turns it on, the hash format, `SEGREDO_SESSAO`, `ORIGENS_PERMITIDAS`, compose passthrough, **fail closed** (503) | **both** | The bridges and the v2 pages answer 503 like everything else when the configuration is incomplete. |
| Layer 1, `src/proxy.ts`: closed list of public method + path pairs, 307 to `/login?volta=...`, 401 JSON otherwise | **both** | `/v1/**` and the bridges are covered by the existing matcher; no public pair is added. |
| Layer 2, **every `page.tsx`** except `/login` calls `await exigirSessao()` first; a client page lives in `pagina-cliente.tsx` behind a server wrapper; server actions call `exigirSessaoNaAcao()` | **both** | Every v2 page, **bridges included**, starts with `await exigirSessao()`. The login exception stays **exactly one page**: package 0a points it at `(v1)/login/page.tsx`, package 1f moves it to the v2 and points it there — never a looser pattern that would exempt any `login/page.tsx`, and never two pages for `/login`. |
| Layer 3, every route handler wrapped in `comAcesso` | **both** | No route handler moves. |
| **`cobertura-estatica.test.ts` enforces all three** | **both** | Since package 0a: the login exception is exactly `(v1)/login/page.tsx` (and a test checks that file exists); the test finds both root layouts, `(v1)/layout.tsx` and `(v2)/layout.tsx`, and fails if a top-level `app/layout.tsx` comes back; neither layout may reach `@/lib/db`. `global-not-found` is already in its list of special files, so if package 0c adds one it may not reach the database either. |
| **Session**, **Origin**, **Two `GET` handlers write**, **Login rate limit** | **both** | Unchanged: cookies are `Path=/`, origins do not change with `/v1`. |
| **`volta`** accepts only a relative path of the site | **both** | `/v1/...` passes as is; `/login` is still the only path refused by name. |
| **Headers** (`X-Robots-Tag`, `X-Frame-Options`, `frame-ancestors`, `Referrer-Policy`, `nosniff`, `no-store`) | **both** | Present on `/v1/...` and on every bridge 307. The CSP is only `frame-ancestors`: inline `<svg>`, `data:` mask URIs and `feImage href=data:` keep working. If a `script-src` or `img-src` ever enters, the v2's effects are reviewed. |
| **The 404 while off** (`x-acesso-desligado` + `beforeFiles` rewrite) | **both** | Holds by construction: the private folder is a path with no route. Measured by package 0a: same status, headers and body hash as any missing path, in GET and POST. That body is now Next's default 404 (no layout of ours), not the v1 layout's; see the README. |
| **Metadata routes are route handlers** with `force-dynamic` | **both** | They do not move. |
| **Turning it off on a published install**: public route first, module second | **both** | — |

---

## 4. PWA

Bullet **"PWA, only with the module on"** of the same section.

| Rule | Scope | For the v2 |
|---|---|---|
| Manifest, icons from `/pwa/[arquivo]`, Apple metadata — only with the module on | **both** | Unchanged (decision 9). The v2 root layout carries the same metadata as the v1's, so a v2 page does not lose the manifest. Both layouts render one shared head: the decision is in `lib/pwa/cabeca.ts` (`metadadosPwa`, `viewportPwa`, `atributosHtmlPwa`, `SCRIPT_BFCACHE`, pure and tested), rendered by `src/app/_comum/cabeca.tsx`. Change it there, never in one layout. |
| `data-pwa` on `<html>` and the bfcache script — only with the module on | **both** | Both root layouts have them. Without the script, "Sign out" followed by "Back" would show a cached v2 page. |
| `viewport-fit=cover` — only with the module on | **v1 only** | **New wording (decision 9):** the v2 always sets `viewportFit: "cover"`, and its safe areas are its own rules, **not** under `[data-pwa]`: the floating tab bar depends on `env(safe-area-inset-*)` with the module off too. Manifest, icons and Apple metadata stay conditional. Package 0c delivers it; until then the v2 skeleton uses the shared `viewportPwa`, conditional like the v1's. |
| Safe-area rules under `[data-pwa]` (`(v1)/globals.css`, `body > header|nav|div`) | **v1 only** | They depend on the v1's DOM, which the v1 keeps. The v2 writes its own (above), in package 0c. |
| No service worker | **both** | — |
| `start_url` and `scope` of the manifest are `/` | **both** | Unchanged: `/` covers `/v1`, and the installed app opens at the root, which today bridges to `/v1` and later is the v2, with no reinstall. |
| The splash colour (`COR_FUNDO`, cream, `lib/pwa/identidade.ts`) and `statusBarStyle: "default"` (`lib/pwa/cabeca.ts`) | **v1 only** | Package 0c makes them dark. Both are shared by the two layouts, so the change reaches the v1's installed app too. iOS stores the manifest at install time, so the user may have to reinstall to see the new splash. |

---

## 5. Images

| Rule | Where in `AGENTS.md` | Scope | For the v2 |
|---|---|---|---|
| No card image files and no per-card image reference in the repository | "What never enters the repository", 2 | **both** | The prototype embeds card art; none of it, and no list of image URLs, enters the repository. |
| The screenshots in `docs/screenshots/` are the one exception | "What never enters the repository" | **both** | Layout-check screenshots taken by a package are evidence for its review, **not** files for the repository. |
| Local images are plain `<img>`; do not move them to `next/image`; `/_next/image` only for one absolute `https:` URL | "Optional password access", **Headers** | **both** | The v2 does not send TCGdex images through the optimizer either: `low` and `high` are already small `webp`. |
| Image origin: the user's own photo beats the CDN, the image ladder skips a stored URL verified missing | "Catalog seed" (image check columns) and `lib/imagens.ts` | **both** | The Card component ports the v1's origin and fallback logic (`imagem-carta-zoom.tsx`), only the drawing changes. |
| `low.webp` in grids, `high.webp` only in the detail and the showcase | — | **v2 only** | See section 7, rule 8. |
| Living Dex sprites from the PokeAPI CDN at display time, the small ones | "Optional module: Living Dex", **Sprites come from the PokeAPI sprites CDN** | **both** | — |

---

## 6. Screen-facing rules from the domain sections

These live in domain sections of `AGENTS.md` but say what a screen may and may not do. The v2
consumes the same API, so **all of them hold for both**.

| Rule | Section of `AGENTS.md` |
|---|---|
| A slot key is never parsed by hand and never shown raw (`lerChaveVagaSet`, `rotuloChaveVaga`) | "Set collections: a recipe, then a list of slots you edit" |
| Removing a filled slot frees the copy, with a confirmation on screen | same |
| The catalog language is decided card by card; no single-language query on any screen | "Catalog language is decided card by card" |
| The collection list comes in display order; **do not sort it again on a screen** | "Collection groups and order" |
| Order changes by up/down buttons, never drag (drag fights page scroll on a phone) | same, and Living Dex task steps |
| A batch carries what its preview showed and is refused whole (409) when that changed; the screen closes the preview on a 404 | same |
| Nothing is created or allocated from a suggestion without the click; "Not interested" is forever | "Collection suggestions" |
| The API is language-neutral; the screen labels types, rarities, forms and themes, and shows the value as stored when there is no entry | same |
| One copy per physical card comes ticked in "Your cards that fit this theme"; never a second copy of the same card | same |
| The Liga polling period is derived from the interval, `clamp(intervalo × 250 ms, 5 s, 60 s)`; no fixed time constant on that path | "LigaPokemon price collector — hard rules" |
| The screen reads a snapshot, never the site | same |
| A card already selected is never hidden by the out-of-stock filter | "Out of stock — fed back from their Buy by List" |
| The price chart keeps saying the total also rises when cards enter the sum; the Liga keeps its own series | "Special card prices", "International price reference" |
| A Cardmarket price shows the euro value, the quote and its date, is called comparable to the Liga's **lowest** price, and is never summed with, charted with or compared with Liga values | "International price reference" |
| The column headed "Trend" shows the stored value, with a visible tag and a `Dica` when it is not the trend | "The trend cap, and the value is stored" |
| With `PRECO_FONTE=cardmarket`, ceiling and order are a screen filter (with `liga` they stay parameters of the scan, as in the v1); a card with no price stays; a selected card is never hidden; "Mark the best of each slot" marks only a priced first option | "Buy options from the catalog — the same switch" |
| The screen and the export use the same functions (`lista-compra.ts`, `precosDasEscolhas`, `dividirListaCompra`), so a tab's `id` is the same in both | "Buy triage", "Export to LigaPokemon" |
| Living Dex off: menu group not rendered, `/dex/...` pages and `/api/dex/...` answer 404; a page calls `connection()` before reading the flag | "Optional module: Living Dex" |
| Gender pairs are labelled; `forma_pt` in Portuguese; box numbers on screen have gaps on purpose | same |
| Leaving a send-only game needs the user's confirmation (409 `dexConfirmarSemVolta`), never automatic | same |
| Finishing a catch, evolve or trade task **offers** the add screen and never records | same, "Plans, tasks and planning sessions" |
| Checking the last step never finishes the task | same |
| The add screen shows only the game's catalog, with "show all"; locked species are marked, never refused | same |
| HOME trophies are computed, never marked | same, "Trophies" |

---

## 7. New rules of the v2

Rules the v1 does not have. Rules 1 to 9 come from what the prototype gets wrong for this app; the
rest are the technical foundations of the v2.

### What the prototype must not teach

1. **Tilt and holo are an enhancement, never information.** What the holo says (the copy's
   variant) is also in text or a badge.
2. **A drag gesture never fights scrolling.** Marking by drag works only on the **horizontal** axis
   (the vertical one scrolls; to mark a column, tap card by card or use a shortcut); the gesture
   starts only after an **8 px** threshold; `touch-action: none` only on the detail's stage, where
   the card tilts under the finger, and never on an area larger than the card; elsewhere cards and
   painting grids use `touch-action: pan-y`. The rule is proven on an iPhone, not in an emulator.
3. **The left edge belongs to Safari's "back".** No horizontal gesture starts within ~20 px of the
   left edge (the binder page turn included), and **every gesture has an equivalent button**.
4. **No long-press callout on cards.** Every interactive card has `-webkit-touch-callout: none` and
   `user-select: none`, so pressing it does not open iOS's image menu.
5. **Composition budget.** (a) `will-change`, `preserve-3d`, `mix-blend-mode` and the holo layers
   only on the **active** card (under the finger or pointer, the detail, the showcase fan), never on
   every card of a list; (b) at most **three** `backdrop-filter` surfaces alive at once, never
   nested and never per list item; (c) **never `var()` inside `backdrop-filter`** (WebKit drops the
   whole declaration); (d) `container-type` never on an ancestor of a fixed bar (containment would
   make the bar fixed to that box, not to the window); (e) a `backdrop-filter` with `url()`
   (refraction) is written only by JavaScript, only on Blink, and only over HTTPS (decision 6) —
   in CSS, Safari accepts the value, ignores it and drops the blur with it.
6. **Reduced motion and light mode are reactive.** Both listen for changes at runtime and turn off
   view transitions, springs, the page turn and continuous animation, with **the same final state**
   of the screen. Reduced motion works on its own, regardless of the light-mode heuristic. Light
   mode is automatic by heuristic, with a switch that always wins (decision 7); package 0b
   specifies the signals, the behaviour without them, the persistence and the precedence.
7. **One view transition at a time, and only through React.** `<ViewTransition>` from React, which
   Next 16.3.2 ships with no flag; **do not add `experimental.viewTransition`** to `next.config.ts`
   (it no longer exists). No `document.startViewTransition` by hand next to it — React interrupts a
   transition it did not start. A shared name lives only on the active pair. **The card detail is
   client state (a layer over the screen), not a route**: a dynamic route would rarely render in the
   same commit, and the card in the grid would not become the card in the detail.
8. **Images.** `low.webp` in grids and lists, always; `high.webp` only in the detail and the
   showcase, **one at a time**; the detail shows the cached `low` first and swaps to `high` when
   `img.decode()` resolves. No card art and no list of image URLs enters the repository.
9. **Fonts through `next/font`**, which downloads at build time and serves them from the app,
   never through a Google Fonts `<link>`: the phone on the local network may have no internet.

### Foundations

10. **Dark only.** The v2 has one theme, `color-scheme: dark` (already set by the skeleton in
    `(v2)/v2.css`). The v1 is light only and stays so. The shared PWA head avoids `themeColor`
    because Safari on the Mac would tint the window; whether the v2 sets a dark `theme-color` is
    decided in package 0c.
11. **The window is the scroller at every width.** The rail and the tab bar are fixed or sticky
    glass over the document's own scroll. The prototype scrolls inside a box with
    `overflow: hidden` on the body; the v2 does not copy that (on iOS the address bar collapse and
    the safe-area insets follow the document scroll).
12. **Glass that looks right without refraction.** Two levels: glass (bars and panels, with blur)
    and panel (inner cards, translucent background and edge, no blur). Refraction is an optional
    enhancement (rule 5e).
13. **A reusable virtual grid**, delivered by package 1d, with a measured threshold (section 1). It
    keeps selection outside the window, keyboard navigation, column changes, anchors and focus, and
    keeps the card that opened the detail mounted while the detail is open.
14. **New components the v1 does not have.** The **card detail** absorbs the v1's allocate,
    upgrade, edit-copy and destination modals and the zoom, and is born with two modes, slot and
    copy. A glass **confirmation dialog** replaces the twelve `window.confirm` calls of the v1: a
    destructive or irreversible action asks through it, and cancelling sends nothing.
15. **What stays the same:** plain HTTP (copy by `execCommand`, no Clipboard API), 16 px fields on
    the phone, 44 px touch targets, nothing only on hover, one tree, pt and en.

### Isolation between the two versions

16. **The v2 does not import the v1's skin.** No file under `src/app/(v2)/` imports from
    `src/app/_componentes/` or `src/app/(v1)/` (`telas-v1.test.ts`): without the v1's tokens their
    classes have no colour. **The ban has no exceptions.** A skinless helper both versions need
    (`copiar-texto.ts`, `recusa.ts`, `use-eh-mobile.ts`, `use-camada.ts` and the like, all in
    `_componentes/` today) moves to `src/app/_comum/`, with its v1 importers updated in the same
    change — the precedent is the PWA head, `_comum/cabeca.tsx` — and is never copied. The first v2
    package that needs one moves it. Shared code outside `src/app` (`lib/`, `messages/`) is not
    affected. The v2 has its own stylesheet, `(v2)/v2.css`: today only `color-scheme: dark` and the
    dark background; its Tailwind entry, tokens and fonts arrive with package 0c.
17. **The v1 never links to the root**, and its screen paths all start with `/v1` (enforced by
    `telas-v1.test.ts`). The v2 may link to a root path that is still a bridge.
18. **Bridges are 307**, call `exigirSessao()` first, keep the query, and exist only where a v2
    screen does not; a Dex bridge returns 404 with the module off before any redirect. A bridge is
    replaced by the real page only when every action of that screen is `delivered` in
    [`parity.md`](./parity.md), or `deferred` to a named package with a working "Do it in v1" link.
19. **Display preferences** of the v2 (binder size, whole-set size, light-mode switch) are per
    device, in `localStorage`, read after hydration, every access in `try/catch`, with a key
    prefixed `v2-` so it never collides with the v1's.

---

## 8. Other rules, checked for the transition

| Rule | Section of `AGENTS.md` | Scope | Note |
|---|---|---|---|
| Documentation in English, code in Portuguese, no translation PRs | "Language", "Code conventions" | **both** | The v2's identifiers and comments are in Portuguese like the rest. |
| The interface in pt-BR and en | (`messages/*.json`) | **both** | The rarity labels differ in count on purpose (en has more entries); do not force them equal. |
| Tests: Vitest for the business rules, **no e2e**; tests need no database | "Stack", "Environment and commands" | **both** | Decision 8 keeps the stack: screenshots are a check, not a test suite. The v2's logic that can be pure (spring, drag painting, virtual ranges, view transition guard, light-mode decision, buy totals in cents) lives in pure modules with tests. |
| Definition of done | "Definition of done" | **both** | The v2 adds the screenshot and iPhone checks of section 1 and the parity check of [`parity.md`](./parity.md). |
| Out of scope: deck building, sales and trading, scanning by photo, accounts, native app | "Out of scope — do not build" | **both** | — |
| Stopping points | "Stopping points" | **both** | Exposing the app, raising the request rate, a destructive migration and rebuilding offers by store stay stopping points for the v2 too. |

## Open points

All owned by package 0c:

- A 404 in the v2's skin: today a path with no route gets Next's default 404; 0c evaluates
  `experimental.globalNotFound` and, if it adopts it, updates the README and section 3.
- The dark splash colour and `statusBarStyle` (section 4).
- The v2's `viewport-fit=cover` and its own safe areas, decision 9 (section 4).
- A dark `theme-color` in the v2 (section 7, rule 10).
