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
| **Dex → Cadastrar virtualizes its list below 768px, and only that screen does** | **v1 only** | **New wording:** a grid or list of the v2 is virtualized above a **measured** threshold, at every width, with the window as the scroller. Package 1d delivers the reusable virtual grid and fixes the threshold by measuring a full collection and the relevant Dex screens (budget of nodes, images and response time); until it is measured, no number is a rule. A v2 screen that renders more than the threshold without virtualizing says why. The v1 keeps its rule: its desktop scrolls in an inner pane, so its window virtualizer only works on the phone. **Measured by package 1d (2026-11-23): 300 items**, with the budget and the numbers in section 7, rule 13; the Dex lists measure themselves against the same budget when their packages port them. |
| **Nothing only on hover or in `title`** | **both** | The v2 adds a corollary: **tilt and holo under the pointer are an enhancement, never information** — the copy's variant also shows as text or a badge. The prototype breaks this rule (slot number only on hover, the fan opening on `:hover`, an explanation in a `title`); the v2 does not copy those. |
| **Overlays share one stack** (`use-camada.ts`): Esc closes only the top layer, focus containment belongs to the top modal layer, scroll lock reference-counted; the `Modal` is a bottom sheet on mobile with its actions in `rodape`, kept in view at the bottom of the sheet | **both**, with two v2 additions | The whole rule holds for the v2, bottom sheet included. (1) **Scroll lock at every width in the v2.** The v1 locks only below 768 px because its desktop scrolls in an inner pane; the v2's window scrolls at every width, so a dialog without the lock would let the page scroll under it on the desktop. The v1 keeps its behaviour. (2) **Focus and position return to the right cell** when a layer closes, even when the cell that opened it left the DOM through virtualization. The card detail is a layer of this stack and contains focus from the moment it opens. **Delivered by package 0c:** the stack is ported, not imported (`(v2)/_componentes/primitivos/camadas.ts`, pure and tested, and `use-camada.ts`), with the levels `janela` < `detalhe` < `confirmacao` < `balao`, whose z-index comes from the same table (the layer seen on top is the one that gets Esc and Tab); a modal layer locks scroll by default at every width (`scrollbar-gutter: stable` keeps the desktop from shifting), and a dialog over another dialog does not blur again (one veil spends the budget); every layer takes a `devolverFocoPara` resolver, called on close and allowed to be async, so a virtual grid can scroll the cell back in and hand it over. Focus goes to the first of resolver, opener and the main content that is still in the DOM. |
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
| Copy through `copiar-texto.ts` (`execCommand` fallback), never the Clipboard API directly | **both** | The v2's "copy list" goes through the same function. Package 1e moved it to `src/app/_comum/copiar-texto.ts` (section 7, rule 16), with the v1's importer updated — never a second copy. |
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
| Layer 2, **every `page.tsx`** except `/login` calls `await exigirSessao()` first; a client page lives in `pagina-cliente.tsx` behind a server wrapper; server actions call `exigirSessaoNaAcao()` | **both** | Every v2 page, **bridges included**, starts with `await exigirSessao()`. The login exception stays **exactly one page**: package 0a pointed it at `(v1)/login/page.tsx`, package 1f moved it to `(v2)/login/page.tsx` and pointed it there — never a looser pattern that would exempt any `login/page.tsx`, and never two pages for `/login`. |
| Layer 3, every route handler wrapped in `comAcesso` | **both** | No route handler moves. |
| **`cobertura-estatica.test.ts` enforces all three** | **both** | Since package 0a: the login exception was exactly `(v1)/login/page.tsx`, and since package 1f it is exactly `(v2)/login/page.tsx` (and a test checks that file exists); the test finds both root layouts, `(v1)/layout.tsx` and `(v2)/layout.tsx`, and fails if a top-level `app/layout.tsx` comes back; neither layout may reach `@/lib/db`. No `global-not-found.tsx` exists (package 0c did not adopt it, see "Open points"); the test still lists it among the special files, so one added later may not reach the database either. |
| **Session**, **Origin**, **Two `GET` handlers write**, **Login rate limit** | **both** | Unchanged: cookies are `Path=/`, origins do not change with `/v1`. |
| **`volta`** accepts only a relative path of the site | **both** | `/v1/...` passes as is; `/login` is still the only path refused by name. After a sign-in the client does `window.location.replace(volta)`, a full document load, so a `volta` into a v1 screen lands in the v1's layout. |
| The login screen (package 1f) | **v2** | One `v2-vidro` card (one of the three blur surfaces) on the ambient light, with the Poké Ball, a 16 px password field and a 44 px button; the shell recognises `/login` and renders neither rail nor tab bar (`CAMINHO_SEM_MENU` in `casca.tsx`), the same reason the v1 hid its menu there: every link would bounce back. The messages are `v2Login`; the wording and the generic errors are the v1's, and the fixed delay is the server's. |
| **Headers** (`X-Robots-Tag`, `X-Frame-Options`, `frame-ancestors`, `Referrer-Policy`, `nosniff`, `no-store`) | **both** | Present on `/v1/...` and on every bridge 307. The CSP is only `frame-ancestors`: inline `<svg>`, `data:` mask URIs and `feImage href=data:` keep working. If a `script-src` or `img-src` ever enters, the v2's effects are reviewed. |
| **The 404 while off** (`x-acesso-desligado` + `beforeFiles` rewrite) | **both** | Holds by construction: the private folder is a path with no route. With no top-level layout and no `global-not-found.tsx` (package 0c did not adopt it, see "Open points"), that is Next's default 404, and package 0c measured it byte-for-byte equal to the 404 of an unknown path on `/login`, `/api/sessao`, `/robots.txt` and `/manifest.webmanifest`. |
| **Metadata routes are route handlers** with `force-dynamic` | **both** | They do not move. |
| **Turning it off on a published install**: public route first, module second | **both** | — |

---

## 4. PWA

Bullet **"PWA, only with the module on"** of the same section.

| Rule | Scope | For the v2 |
|---|---|---|
| Manifest, icons from `/pwa/[arquivo]`, Apple metadata — only with the module on | **both** | Unchanged (decision 9). The v2 root layout carries the same metadata as the v1's, so a v2 page does not lose the manifest. Both layouts render one shared head: the decision is in `lib/pwa/cabeca.ts` (`metadadosPwa`, `viewportPwa`, `atributosHtmlPwa`, `SCRIPT_BFCACHE`, pure and tested), rendered by `src/app/_comum/cabeca.tsx`. Change it there, never in one layout. |
| `data-pwa` on `<html>` and the bfcache script — only with the module on | **both** | Both root layouts have them. Without the script, "Sign out" followed by "Back" would show a cached v2 page. |
| `viewport-fit=cover` — only with the module on | **v1 only** | **New wording (decision 9):** the v2 always sets `viewportFit: "cover"`, and its safe areas are its own rules, **not** under `[data-pwa]`: the floating tab bar depends on `env(safe-area-inset-*)` with the module off too. Manifest, icons and Apple metadata stay conditional. **Delivered by package 0c:** `viewportV2()` in `lib/pwa/cabeca.ts`; the insets are `--v2-seguro-*` tokens in `v2.css`, used by the rail, the tab bar, the content padding, the sheet and the floating notice. Checked with the module on and off: off, the v2 head has `viewport-fit=cover` and `theme-color` and nothing of the PWA; on, it adds the manifest, the Apple metadata, `data-pwa` and the bfcache script. |
| Safe-area rules under `[data-pwa]` (`(v1)/globals.css`, `body > header|nav|div`) | **v1 only** | They depend on the v1's DOM, which the v1 keeps. The v2 writes its own (above). |
| No service worker | **both** | — |
| `start_url` and `scope` of the manifest are `/` | **both** | Unchanged: `/` covers `/v1`, and the installed app opens at the root, which today bridges to `/v1` and later is the v2, with no reinstall. |
| The installed app's colours: `background_color` and `theme_color` of the manifest (`COR_FUNDO`, `COR_TEMA`) | **both** | **Decided in package 0c (2026-11-22): dark now, for both versions** — the v2's background, `#06070B`, which a test keeps equal to `--v2-fundo`. There is one manifest and its `start_url` is `/`, the v2's root; iOS stores the manifest at install time, so waiting for the v2 home would make everyone who installs during the transition reinstall. The cost: while `/` is still a bridge, the dark launch is followed by the cream v1. Nothing in the v1 changes once a page has loaded. |
| `statusBarStyle` of the Apple metadata | **v1 only** as `default` | **The v2 uses `black-translucent`**: white text over the page, which runs under the status bar; that is safe only because the v2 always pads the top safe area. Each root layout sends its own (`metadadosPwa(acesso, "v1" \| "v2")`), since iOS reads it from the page that opens. |

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
| A new Set collection's recipe is Japanese-only or Western-only, decided by the chosen set's catalog and never by its `set_id` (`neo1` to `neo4` share it with English and are other cards); a Japanese-only recipe sends `idiomaCatalogo: jp` on its own, a mixed one is refused on screen. **v2 only** (decision of 2026-11-22): the v1 sends pt for any set | same |
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
   in CSS, Safari accepts the value, ignores it and drops the blur with it. **Delivered by package
   0c:** `decidirRefracao` (`casca/refracao.ts`, pure and tested) turns it on only with a secure
   context, the `Chromium` brand of `navigator.userAgentData` and full effects; plain HTTP on the
   local network never runs a functional test. Only surfaces marked `data-v2-lente` (the rail, the
   tab bar, the search button) get it. The shell spends two blur surfaces on the phone (tab bar and
   search button) and one on the desktop (rail); a dialog's veil is the third. The dialog panel,
   the floating notice, buttons and segmented controls have no `backdrop-filter`.
6. **Reduced motion and light mode are reactive.** Both listen for changes at runtime and turn off
   springs, the page turn and continuous animation, with **the same final state** of the screen.
   **Only reduced motion turns off view transitions**, the root crossfade included (`v2.css`
   stops every `::view-transition-*` animation under it). Light mode keeps them: they are short,
   one at a time, run on the compositor and carry the card from the grid to the detail; what light
   mode cuts is the cost of every frame (`preferencias-movimento.ts` has the reasoning).
   Reduced motion works on its own, regardless of the light-mode heuristic. Light
   mode is automatic by heuristic, with a switch that always wins (decision 7); package 0b
   specifies the signals, the behaviour without them, the persistence and the precedence. **The
   shell reads one attribute only, `html[data-v2-efeitos="leve"]`** (written by
   `AtributoEfeitos`, `casca/efeitos.tsx`): under it the ambient light stops drifting, the iris
   stops sliding, the glass sheen under the pointer and the refraction go away. The shell is the
   attribute's only writer: `Casca` renders `<AtributoEfeitos modo={useMovimento().modo} />`
   above the choice of shell, so it holds on `/login` too, and a screen never renders a second
   one. The switch is `InterruptorModoLeve` fed by `useEscolhaModo()` (`_componentes/movimento/`);
   `/laboratorio` shows it, and the settings screen will. Without the attribute the effects are
   full. A continuously animated element carries the class
   `v2-anima`, which both reduced motion and light mode stop.
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

10. **Dark only.** The v2 has one theme, `color-scheme: dark`. The v1 is light only and stays so.
    The v1 layout avoids `themeColor` because Safari on the Mac would tint the window. **The v2
    sets it** (package 0c), always, to its background, with `color-scheme: dark` in the viewport:
    on a dark-only interface, tinting the window and Android's bar with the page's own colour is
    the point.
11. **The window is the scroller at every width.** The rail and the tab bar are fixed or sticky
    glass over the document's own scroll. The prototype scrolls inside a box with
    `overflow: hidden` on the body; the v2 does not copy that (on iOS the address bar collapse and
    the safe-area insets follow the document scroll).
12. **Glass that looks right without refraction.** Two levels: glass (bars and panels, with blur)
    and panel (inner cards, translucent background and edge, no blur). Refraction is an optional
    enhancement (rule 5e). In code: `.v2-vidro` (blur, specular rim, pointer sheen) only for the
    shell and a dialog's veil; `.v2-painel` for anything that may repeat; `.v2-painel-flutuante`
    for a surface over the veil (the dialog panel), drawn like glass without the blur.
13. **A reusable virtual grid**, delivered by package 1d, with a measured threshold (section 1). It
    keeps selection outside the window, keyboard navigation, column changes, anchors and focus, and
    keeps the card that opened the detail mounted while the detail is open. **Delivered by package
    1d:** `GradeVirtual` (`src/app/(v2)/_componentes/grade/`), its interface and budget in rule 28,
    and the threshold, **300 items**, measured as below.

    **The measurement (2026-11-23).** Chromium with an iPhone profile (393 × 852, DPR 3, touch, the
    iPhone Safari user agent) and the CPU throttled 4×, the production build, invented data, the
    whole-list tab of each collection. "Loaded images" is the `<img>` elements in the DOM that
    finished loading after scrolling to the middle; "tap" is the longest Event Timing duration of a
    tap that opens the card detail (pointer down, up and click), six taps on cards in the middle of
    the list, so the first one is cold.

    | Slots | Mounted | DOM nodes (page) | `<img>` in DOM | Loaded images | Tap, worst / median |
    |---|---|---|---|---|---|
    | 165 (set), all mounted | 165 | 1,442 | 165 | ≤ 57 | 64 / 40 ms |
    | 266 (set with secrets), all mounted | 266 | 2,268 | 265 | 52 | 72–88 / 48–56 ms |
    | 493 (Pokédex, four regions), all mounted | 493 | 3,940 | 482 | 184 | 104 / 48 ms |
    | 649 (Pokédex, five regions), all mounted | 649 | 5,120 | 636 | 313 | 80 / 32 ms |
    | 1,025 (national Pokédex), all mounted | 1,025 | 7,914 | 936 | 318 | 168–192 / 32 ms |
    | 493, virtual | 24–52 | 412–607 | 51 | 27 | 40 / 32 ms |
    | 649, virtual | 20–56 | 387–639 | 56 | 44 | 40 / 32 ms |
    | 1,025, virtual | 20–52 | 406–630 | 43 | 25 | 56 / 32 ms |

    **The budget it fixes**, for one grid on one screen: about 2,500 DOM nodes, about 60 loaded card
    images (a `low.webp` is ~0.3 MiB decoded; with everything mounted, every image the user ever
    scrolled past stays in the DOM, and the count only grows), and a cold tap under 100 ms. Mounting
    everything stays inside it up to the 266-slot set and leaves it from about 500 slots (the tap
    passes 100 ms and the loaded images triple); 300 keeps the biggest sets (a set with secrets is
    usually under 300) in one plain tree and virtualizes every Pokédex past three regions. Virtual,
    the cost is flat: ~600 nodes and ~50 images at any size. The median tap does not move with the
    size, so the worst (cold) tap and the memory decide. The Dex screens have their own lists (forms,
    boxes) and measure them when their package ports them onto this grid (5a, 5c), against the same
    budget; the Pokédex grid (5a) is measured in rule 38.
14. **New components the v1 does not have.** The **card detail** absorbs the v1's allocate,
    upgrade, edit-copy and destination modals and the zoom, and is born with two modes, slot and
    copy. A glass **confirmation dialog** replaces the twelve `window.confirm` calls of the v1: a
    destructive or irreversible action asks through it, and cancelling sends nothing. Package 0c
    delivers it (`primitivos/dialogo-confirmacao.tsx`): focus opens on "Cancel", Esc cancels, a tap
    outside does nothing, and `useConfirmacao()` returns a promise of a boolean, so a
    `window.confirm` becomes `await confirmar({ titulo, rotuloConfirmar })`.
15. **What stays the same:** plain HTTP (copy by `execCommand`, no Clipboard API), 16 px fields on
    the phone, 44 px touch targets, nothing only on hover, one tree, pt and en.

### Isolation between the two versions

16. **The v2 does not import the v1's skin.** No file under `src/app/(v2)/` imports from
    `src/app/_componentes/` or `src/app/(v1)/` (`telas-v1.test.ts`): without the v1's tokens their
    classes have no colour. **The ban has no exceptions.** A skinless helper both versions need
    (`use-eh-mobile.ts`, `use-camada.ts` and the like, in
    `_componentes/` today; `recusa.ts` already moved, by package 1c, and `copiar-texto.ts` by 1e) moves to `src/app/_comum/`, with its v1 importers updated in the same
    change — the precedent is the PWA head, `_comum/cabeca.tsx` — and is never copied. The first v2
    package that needs one moves it. Shared code outside `src/app` (`lib/`, `messages/`) is not
    affected. The v2 has its own stylesheet, `(v2)/v2.css`: today only `color-scheme: dark` and the
    dark background; its Tailwind entry, tokens and fonts arrive with package 0c.
17. **The v1 never links to the root**, and its screen paths all start with `/v1` (enforced by
    `telas-v1.test.ts`). The v2 may link to a root path that is still a bridge.
18. **Bridges are 307**, call `exigirSessao()` first, keep the query, and exist only where a v2
    screen does not; a Dex bridge (one per screen, no catch-all) returns 404 with the module off before any redirect. A bridge is
    replaced by the real page only when every action of that screen is `delivered` in
    [`parity.md`](./parity.md), or `deferred` to a named package with a working "Do it in v1" link.
19. **Display preferences** of the v2 (binder size, whole-set size, light-mode switch) are per
    device, in `localStorage`, read after hydration, every access in `try/catch`, with a key
    prefixed `v2-` so it never collides with the v1's.

---

### Shell and primitives (package 0c)

20. **Where they live.** The shell in `src/app/(v2)/_componentes/casca/`, the primitives (button,
    field, panel and inline notice, floating notice, segmented control, dialog and bottom sheet,
    confirmation, the layer stack) in `.../primitivos/`. Tokens and material in `v2.css`; the
    token names are the interface with the Card (`--v2-tinta`, `--v2-tinta-2`, `--v2-tinta-3`,
    `--v2-fundo`, `--v2-raio-carta`, `--v2-sombra-carta`, `--v2-curva-mola`, `--v2-curva-suave`,
    `--v2-iris`) and do not get renamed. The v2's Tailwind entry scans only `src/app/(v2)/` and
    starts with no colours but the v2's.
21. **The v2 has its own navigation map** (`casca/mapa-navegacao.ts`), pointing at the root; an
    item whose v2 screen does not exist yet lands on its bridge. The tab bar (decision of
    2026-11-22) has Home, Collections, Inventory, **Dex** when the Living Dex is on, and **More**,
    a sheet with the whole map, the language and "Sign out" — five positions with the module on,
    four with it off — plus the round search button. The Dex tab opens `/dex` and lights up on
    every `/dex/...` path. Below 360 px the tabs show only their icons, with the name kept for
    screen readers, and the bar shrinks (54 px tall, 12 px side margins, 4 px inside) so that five
    tabs still get 44 px each at 320 px. The tabs touch each other, with no 8 px gap: the bar is
    one composite control, like the segmented control and like the iOS tab bar.
22. **The laboratory**, `/laboratorio`, shows the shell and every primitive in its states, the
    light-mode switch wired to local state and the refraction decision. It is development only
    (`notFound()` when `NODE_ENV` is `production`), it is not a screen of the app and it is not in
    `parity.md`. A package that adds a shared component shows it there, and checks its layout in
    the laboratory at the widths of section 1.

### Card detail (package 1b)

23. **One component, two modes, no page.** `DetalheCarta`
    (`src/app/(v2)/_componentes/detalhe/detalhe-carta.tsx`) is the layer the collection (1d), the
    inventory (2b) and the home (2a) open from a card. It is the v2 dialog (`primitivos/modal`) at the
    `detalhe` level of the layer stack, so it is a panel from 768 px and a bottom sheet below, with
    Esc, focus and scroll lock from the stack; confirmations open above it at the `confirmacao` level.
    Its forms and lists are inline sections, never a second dialog: a `janela` would sit **under** the
    detail. The collection page (package 1d) opens it in slot mode from every tab, and in copy mode
    from "your cards that fit this theme"; `/laboratorio?colecao=<id>&vaga=<id>` and
    `/laboratorio?carta=<id>&copia=<id>` (add `&abrir=1` to open on load) prove it with real ids.
24. **Its interface.**

    ```ts
    <DetalheCarta
      abertura={null | { modo: "vaga", colecao: { id, nome, tipo, idiomaExigido }, vaga: VagaGradeV2DTO }
                     | { modo: "copia", cartaId, copiaId, previa?: { nome, imagemUrl, imagemOrigem?, raridade?, variante? } }}
      onFechar={() => setAberta(null)}        // called inside startTransition
      onMudou={(evento: EventoDetalhe) => …}  // after every successful write, and when a refusal or a
                                              // read shows the state changed underneath ("desatualizada")
      chaveTransicao?={key of the card that opened it}
      devolverFocoPara?={ResolvedorFoco}      // the virtual grid's resolver (rule 13)
      secaoCompra?={(ctx: { colecao, vaga, aoMudar }) => ReactNode}
    />
    ```

    - **Slot mode takes the slot from the grid** (`GET /api/colecoes/:id/grade`) and the opener keeps
      it current: on `onMudou` it re-reads the grid and passes the new `VagaGradeV2DTO` (same `id`).
      Right after a write of its own, the detail reads the slot through the card detail
      (`contexto.vaga.copiaId`) until the new slot arrives, so it never offers a stale action. A
      custom collection's slot is deleted on deallocation; the detail then closes itself.
    - **Copy mode reads everything itself** (`GET /api/cartas/:cartaId/detalhe?copia=`); `previa` only
      lets the stage show the card before that read returns. Another copy of the same card can be
      put in focus from the copy list.
    - **The buy extension point.** In an empty slot the detail shows the slot's current buy choices
      read-only (`vaga.escolhas`). When `secaoCompra` is given (package 1e), its output **replaces**
      that block; `aoMudar()` makes the detail re-read and emit `{ tipo: "compra" }`. The detail
      itself never marks or unmarks a purchase.
25. **The view transition is the opener's half too.** The detail's stage card carries
    `nomeTransicaoCarta(chaveTransicao, true)` while open. The opener gives the clicked card the same
    name in an **urgent** update and, in the same handler, opens the detail inside
    `startTransition` while that card leaves the grid (a placeholder of the same size takes its
    place): React commits the urgent update first, so the name is in the DOM when the "before" view
    is captured, and only that one card of the grid ever carries a name. Keep the name on that card
    after closing, so the detail's card flies back to it; `onFechar` already runs inside
    `startTransition`. `TransicaoVista` turns all of it off with reduced motion or light mode.
26. **What it shows and decides.** The pure rules are in `estado-detalhe.ts` (what each slot state
    shows, which read to ask, the order of the copies, the variants offered, the "from → to" of an
    upgrade axis, and which refusal re-reads), `edicao-copia.ts` (the `PATCH /api/copias/:id` body:
    the v1's keys, **only those that changed**, normalized like the route) and `serie-preco.ts` (the
    short price series, x by time). A 400 keeps the screen; a 404, a 409, or a candidate taken by
    another tab (`copiaJaAlocada`, `vagaJaPreenchida`…) re-reads everything and emits
    `{ tipo: "desatualizada" }`; when the thing that was opened is gone, the detail says so and only
    offers to close. The own-photo requests live in `src/app/_comum/imagem-local.ts`, skinless, so the
    v2 does not import the v1's dialog.

### Collection page and virtual grid (package 1d)

27. **The collection page owns the tabs.** `/colecoes/[id]` (`src/app/(v2)/colecoes/[id]/`) reads
    `GET /api/colecoes/:id/grade` once and rereads it after every write, aborting the read before
    it; a failed reread keeps the grid on screen and says it may be stale. The tabs
    (`vista-colecao.ts`, pure and tested), decision 1:

    | Type | Tabs |
    |---|---|
    | Set | Binder, Whole set, Upgrades, What's missing |
    | Pokédex | Binder (pages by national number), Whole Pokédex (virtual), Upgrades, What's missing |
    | Custom | the whole list only, in allocation order, no denominator (no empty slot, and `…/melhorias` answers empty for it) |

    - The tab is in the URL (`?aba=fichario|inteiro|upgrades|falta`), written with
      `history.replaceState` (no server round trip); an unknown value, or a tab the type does not
      have, falls back to the first.
    - **Binder and the whole list are one list of slots in two sizes** (the `Bolso` component),
      never two lists. The binder is 3×3 to 6×6, pages instead of filters: one page open, or two
      (the open binder, always starting on an even page) when the binder itself is 720 px wide or
      more — the component's own width, not the shell's 768 px. Pages turn by the arrows, the page
      field, or a wide horizontal swipe that never starts within 24 px of the left edge (rule 3);
      the dots are informative only, never targets. The new page slides in with a CSS animation
      marked `v2-anima`, so reduced motion and light mode drop it with the same final state; there
      is no copy of the pages during the turn. The place in the binder is the first slot in view,
      not a page number: changing the size, turning the phone or entering "Edit cards" keeps that
      slot in view.
    - **The binder never goes under 44 px pockets.** A size whose pockets would be narrower than
      44 px with 8 px between them is disabled (`maiorGradeQueCabe`): at 320 px the 6×6 would give
      38 px pockets, so it is off there and a stored 6×6 shows as 5×5. In "Edit cards" every pocket
      gets a remove button of its own under the card (44 px tall, 8 px below it — two targets,
      never one over the other), so the binder goes up to 4×4 and the whole list starts at size L
      for the label to fit.
    - **Upgrades mounts 100 rows at a time** (two cards each), with "Show more": the list is the
      slots with a better free copy, almost always a few, and a row has no fixed height to
      virtualize (on the phone its button wraps to a line of its own). A candidate is shown only if
      it was computed against the copy in the slot now.
    - The divisions (Pokédex regions, a set's main and secret parts, the sets of a joined
      collection) are jumps: the binder turns to the page where the division starts, the whole list
      scrolls to it. The v1's region filter became this navigation; no slot is ever hidden.
    - Display preferences are per device (rule 19): `v2-colecao-fichario` (3–6) and
      `v2-colecao-tamanho` (0–3, the whole-list card size), read through `useSyncExternalStore`, so
      the server and the hydration see the default and the stored value comes in right after.
    - **Opening the detail** is rule 25's opener half: the touched card gets the name in an urgent
      update and the detail opens in `startTransition`; `onMudou` rereads the grid and the detail
      receives the new slot by id. **Focus comes back to the slot's cell**: the binder turns to its
      page, the whole list scrolls it in through `elementoDe`; when the slot left the tab (allocated
      from What's missing, swapped from Upgrades, removed from the collection), to the slot now in
      the same place of that tab's list (`vagaDoFoco`).
    - Every collection operation keeps the v1's route and body: name, required language and notes,
      secrets and the Pokédex scope live in a **Settings** dialog with the CSV and Delete; turning
      secrets off and removing a region ask through the confirmation dialog and say that a filled
      slot makes the server refuse, as it does. "Edit cards" (a set) shows the remove button on
      every slot and the single-card search above the tabs.
28. **The virtual grid's interface** (`grade-virtual.tsx`; the geometry is pure, in
    `geometria-grade.ts`, and tested):

    ```ts
    <GradeVirtual
      itens={readonly T[]}
      chaveDe={(item) => string}                    // stable key; selection lives outside, by key
      renderizar={(item, celula, indice) => ReactNode} // spread `celula` on the focusable element
      minCelula={px} vaoX?={px} vaoY?={px}          // columns = what fits; cells are uniform
      proporcao?={825 / 600} alturaExtra?={px}       // card ratio, plus a fixed caption
      limiar?={LIMIAR_VIRTUALIZACAO}                 // 300; at or below it everything is mounted
      manterMontadas?={readonly string[]}            // keys kept mounted out of range
      rotulo={string}                                // the list's accessible name
      ref={ControleGradeVirtual}                     // rolarAte(i), elementoDe(key), indiceNoPonto(x, y)
    />
    ```

    - The window scrolls at every width; the grid takes the height of all its rows and mounts the
      visible rows plus three on each side. Cells are placed by `top`/`left` (no transform, no
      `will-change`, no `container-type`), with `role="list"`, and each cell is a `listitem` with
      `aria-setsize`/`aria-posinset`, so a screen reader knows the whole size.
    - **Keyboard:** one cell in the Tab order (the active one, or the first really in view — not a
      spare row above the window — when Tab comes from outside); arrows move by cell or row, Home/End to the ends of the list, PageUp/PageDown
      by a window of rows; the target is mounted and scrolled in before it takes focus. The focused
      cell stays mounted when it scrolls away.
    - **Geometry changes keep the anchor:** a width or size change that moves the rows (other
      columns, or the same columns with taller cells) puts the first item that was in view back
      where it was.
    - **`elementoDe(key)`** scrolls the item in, waits two frames for it to mount and returns its
      focusable element: pass it, wrapped, as a layer's `devolverFocoPara`.
    - **`indiceNoPonto(clientX, clientY)`** maps a pointer to an item (the gaps belong to none): the
      drag marking of package 1e uses it, on the horizontal axis only (rule 2).
    - **Nothing lives in a cell.** Marks, selection and "open" are the caller's, by key; a cell that
      leaves the range and comes back loses nothing.
29. **The "What's missing" slot for package 1e.** The page renders `AbaFalta` from
    `src/app/(v2)/colecoes/[id]/_componentes/aba-falta.tsx` when the tab is `falta`, and passes that
    file's `secaoCompraDoDetalhe` to the detail as `secaoCompra` (rule 24). Package 1e replaces the
    body of `AbaFalta` and fills `secaoCompraDoDetalhe`, keeping the signature; the page does not
    change. `AbaFalta` receives `ContextoAbaFalta`: `colecao` (the whole grid DTO), `vazias` (the
    empty slots in grid order), `versaoGrade` (bumps on every new grid: reread `GET …/falta` with
    it), `abrirVaga(vaga)`, `reler()`, `abertaId`/`parAtivo` (for the transition), `tamanho` (the
    whole-list size preference) and `controle` (the grid handle the page uses to return focus —
    pass it to the `GradeVirtual` the tab renders).

### What's missing and marking to buy (package 1e)

30. **What the tab does.** `AbaFalta` reads `GET /api/colecoes/:id/falta` (package 1a) with every new
    grid and draws every empty slot (R6) on the page's `GradeVirtual`. Every write is the v1's
    `PATCH /api/colecoes/:id/opcoes-compra/selecao`, with the v1's bodies (`{ cartas: [{ chave,
    cartaId }], selecionada }` on Cardmarket, `{ ids, selecionada }` for a Liga option or a choice).
    The decisions are pure and tested (`compra-falta.ts`, `arrasto-compra.ts`):
    - **A tap** (decision 2): in a set it puts the slot's card on the list and takes it off again;
      with no price yet it is the manual choice of that card (works before the first price round).
      In a Pokédex it opens the slot's options, read on demand (`…/falta/alternativas`). A slot
      with a free copy opens the detail, where allocating fills it; buying it stays possible
      there. A slot with two or more choices opens its options: "Clear the slot" is a named
      action there, with a confirmation, never a tap.
    - **Drag** (set only, where a tap marks): horizontal only, after 8 px, never from the left 24
      px, along the row it started on (`indiceNoPonto(x, y0)`), one direction (the first card's),
      sent as one request when the finger lifts. The grid area has `touch-action: pan-y`, so a
      vertical move scrolls and marks nothing. A `pointercancel` sends nothing and puts the marks
      the drag drew back as they were.
    - **Optimistic, then checked.** A mark shows at once as a pending mark per slot. Requests go
      through **one queue per collection, shared by the tab and the card detail**
      (`envio-selecao.ts`), entered at the gesture, so the server sees the user's gestures in
      order. The queue also keeps, per collection, the requests in flight, the requests finished
      and a generation that a refusal from either side bumps: the list is not copied while a
      request is in flight, nor until a read started after the last finished request arrives
      (a failed read keeps it stale), and a request queued before a refusal is dropped unsent. A
      pending mark is dropped only by a read asked after its request finished; the marks left
      are recounted against each new read; and a cancelled drag never brings back one that a
      read, a refusal or the queue already ended. A refusal (404, 400, 5xx, no network) drops
      every pending mark, says why and rereads. In the slot options, the buttons stay locked
      after a write until the options are read again successfully (a second tap would repeat the
      request instead of undoing it; a failed reread says so and offers "Try again"); a request that changed fewer rows than it carried (`alteradas`: the slot was
      filled, the card stopped being a candidate) says so and rereads.
    - **"Mark the best of each slot"** opens a dialog with the criterion and, slot by slot, the card,
      its price and source, plus how many slots stay out and why; only its confirm sends, and it
      sends exactly the plan shown (`planoDoAtalho`, the 1a `proposta`: no slot with a choice, no
      unpriced card). If the read changed while the dialog was open, confirm sends nothing and
      shows the new plan to be confirmed again.
    - **The list to paste** is the server's (`lista.abasLiga`, the same function as the buy options
      screen and the per-tab download); the tab shows it in a dialog with one tab per region in a
      Pokédex, and copying waits for pending marks to be reread. Copy goes through
      `src/app/_comum/copiar-texto.ts` (plain HTTP).
    - **`PRECO_FONTE=liga`** (decision 3): a notice says new lookups are unavailable; marking works
      only over the options of saved scans, unmarking and copying always. Nothing starts a scan.
    - The buy options page itself (price round, ceiling and order, out-of-stock paste, downloads) is
      package 4a's; until then the tab links to `/v1/colecoes/<id>/opcoes-compra`.
    - `secaoCompraDoDetalhe` renders the same slot options component (`secao-compra-vaga.tsx`) inside
      the card detail.

### Collections list: organize, suggestions, thematic collection (package 4b)

31. **One page, two modes, one order.** `/colecoes` is read on the server (`lerListaColecoesV2`) and
    drawn as cards ("view"); "Organize" swaps the same sections for rows with up/down buttons, a
    group selector and the group actions (`src/app/(v2)/colecoes/_componentes/`). Both modes show the
    order of `listarColecoes` and nothing on screen sorts it. **Every write rereads the page**
    (`router.refresh` inside a transition), whatever its answer, and every control stays disabled
    from the click until the new list has arrived, so the next click always starts from the order
    the server has.
    - **A refusal says what happened, and the screen state follows it** (`organizar.ts`, pure and
      tested): a stale list (409 `ordemDeColecoesDesatualizada`) reads "nothing was applied" — the
      catalogue sentence asks for a reload the screen already did — and rereads; a batch preview
      ("Create missing ones", "Bring existing ones") whose group is gone (404) or lost its series
      (`grupoSemSerie`) closes and the page says why; anything else, a lost response included,
      rereads the preview before the confirm button comes back. Marks survive a reread only where
      they still mean the same choice (`marcasDeFaltantes`, `marcasDeExistentes`).
    - **A batch sends what its preview showed**: the series, and for "Bring existing ones" the group
      each collection leaves (`grupoOrigemId`). The concurrency lives in the routes (the
      organization lock); the screen never re-checks it.
    - **Suggestions** are a client read of `GET /api/sugestoes`, shown in the server's order; the
      collapsed state is a device preference (`v2-colecoes-sugestoes-recolhida`, rule 19), and
      "Not interested" asks through the confirmation dialog.
    - **The thematic collection** is created through `POST /api/colecoes` and goes straight to
      "your cards that fit", which is package 1d's `CartasDoTema`, reused unchanged; its thumbnail
      opens `DetalheCarta` in copy mode above it, and the marks live in the list, not in the detail.
    - The copy is in the `v2Organizar` namespace of `messages/*.json`.

### Prices screen (package 2d)

32. **The screen reads the snapshot; the round is the server's.** `/inventario/precos`
    (`src/app/(v2)/inventario/precos/`) reads `GET /api/inventario/precos` and starts a round with
    `POST /api/inventario/precos`, the v1's requests, with no body. While a round is alive it rereads the
    snapshot every `clamp(interval × 250 ms, 5 s, 60 s)` (`periodoDeAtualizacaoMs`, pure and tested): the
    interval is the Liga's `ritmo.intervaloSegundos`, and the Cardmarket source, which has none, gets
    the rule's 5 s floor, the v1's own value. Never a fixed number, and nothing on the screen can speed a
    round up: it asks our database, never the Liga or TCGdex. Reads are one at a time (a new one cancels
    the one in flight) and skip a hidden tab. Every refusal of the `POST` goes through `recusa.ts`
    (`precosEmAndamento` also rereads, to show the live round); a round the Liga blocks arrives as the
    round's `erro` and is shown as written, and the screen has nothing to do about it: **a block is never
    worked around**.
33. **Two sources, never mixed.** The table, the summary, the chart and the rounds list all come from the
    active source: Liga in BRL as the site gives it, with no conversion; Cardmarket in euro and BRL with the
    quote and its date, the column still headed "Trend" and, when the value is not the trend, a visible
    tag with the explanation. The chart says in writing that the total also rises when cards enter the
    sum (and, on Cardmarket, that it follows the exchange rate), and its reading panel shows the chosen
    point (the last one until someone chooses) by pointer, touch or arrow keys, with the same points in
    a table.
34. **Explanations open by touch and keyboard** (`Explicacao`): a disclosure button with
    `aria-expanded` and the text in line below it, never a `title` and never a floating balloon. The
    v2 has no balloon primitive, and an inline disclosure needs no layer and does not leave a 320 px screen.
35. **The table is a list, one tree.** A card per row on the phone and in a narrow column, grid columns when
    the list itself is 880 px wide or more (`@container`, on the list only — never on an ancestor of
    the detail or of a bar). A row's photo and the copy its card opens come from
    `GET /api/inventario/precos/cartas` (`data-contract.md`), asked only for the page on screen; the card
    opens `<DetalheCarta>` in copy mode on the representative copy (`copia-representante.ts`), and a card
    with no copy any more (its price row is never deleted) says so and does not open. Deleting a round
    asks through the confirmation dialog.

### Dex shared code (package 5-0)

A. **One bridge per Dex screen, and no catch-all in the v2.** `/dex`, `/dex/pokedex`, `/dex/caixas`,
   `/dex/recebidos`, `/dex/cadastrar`, `/dex/novo-cadastro`, `/dex/inventario`, `/dex/jogos`,
   `/dex/trofeus` and `/dex/planos`: `await exigirSessao();`, then **module off → `notFound()`**, then
   `irParaV1` with the query intact. A `/dex/...` path with no v1 screen gets Next's default 404, module
   on or off. `pontes.test.ts` runs each bridge, and `telas-v1.test.ts` fails on any catch-all.
   **With the module off the 404 is the right status with no 307 first, but not byte-identical to the
   404 of a URL with no route** (measured 2026-11-23): `notFound()` in a v2 page renders inside the
   v2 root layout, so the body is the layout's shell around Next's own "404 This page could not be
   found." (about 152 KB, no ETag), against the static 7 KB page of an unknown path. A person sees a
   readable 404 in the v2 shell, with no Dex tab. Equalizing it would need the proxy to mark `/dex/**`
   and a `beforeFiles` rewrite like the password module's; decided against (2026-11-23), because
   `AGENTS.md` asks for a direct 404, not for an indistinguishable one.
B. **Skinless Dex logic goes to `src/app/_comum/dex/`; anything with a look goes to
   `src/app/(v2)/dex/_componentes/`.** Rule 16 holds: no import from `(v1)/` or `_componentes/`, and a
   piece both versions need moves with its v1 importers updated in the same change.
C. **Every shared Dex piece has one owner package and a merge order**, in the table of
   [`README.md`](./README.md) (Phase 5). A package never writes a second copy of a piece it needs:
   it waits for the owner's branch or asks.
D. **The pieces package 5a owns, and their interfaces** (delivered 2026-11-23). Ported from
   `src/app/(v1)/v1/dex/_componentes/`, never imported from there.

   ```ts
   // src/app/_comum/dex/use-rotulo-forma.ts — skinless; the v1 imports it from here too
   const rotulo = useRotuloForma(formas);   // the whole catalog: "male" depends on the female existing
   rotulo.forma(f)  // the form label only (male/female in the interface language, forma_pt in pt), or null
   rotulo.nome(f)   // "Species (form)": for aria-label, alt and a dialog title

   // src/app/(v2)/dex/_componentes/sprite-dex.tsx
   <SpriteDex sprite={f.sprite} shiny={…} tamanho={px} apagado?={…} alt?={…} />

   // src/app/(v2)/dex/_componentes/cartao-pokemon.tsx
   type DadosCartaoPokemon = { sprite, shiny, nome, linhas: readonly string[] };
   <CartaoPokemon dados semNome? tamanhoRender?>{selos}</CartaoPokemon>   // content only
   <FolhaPokemon dados={DadosCartaoPokemon | null} onFechar acoes?={rodapé} devolverFocoPara? />
   const { abrir, fechar, cartao } = useCartaoFlutuante();
   //   <button onPointerEnter={abrir(dados)} onPointerLeave={fechar} …> … {cartao}

   // src/app/(v2)/dex/_componentes/use-transferencia.tsx (logic in _comum/dex/use-mover-registros.ts)
   const { mover, ocupado, erro, dialogo } = useTransferencia(aoConcluir, { aoRecusar?, devolverFocoPara? });
   //   mover(ids, local) → POST /api/dex/registros/mover; render {dialogo} and show {erro}

   // src/app/(v2)/dex/_componentes/caminhos.ts
   hrefCadastroDex(numero)  // /dex/cadastrar?busca=N
   hrefTrofeus(jogoId)      // /dex/trofeus?jogo=…
   ```

   - **The Pokémon card has three paths, and hover is only one of them.** The v1 card opened only
     under a mouse. `FolhaPokemon` is the touch and keyboard path: the v2 dialog (a panel from 768 px,
     a bottom sheet below) with the HOME render, the lines and the screen's actions in the footer;
     a tap on a slot opens it. `useCartaoFlutuante` is the mouse preview, an enhancement: only for
     `pointerType === "mouse"` (an iPhone tap fires pointer-enter too), `aria-hidden`, no pointer
     events, closed by scrolling. The render (~80 KB) is fetched only for the Pokémon opened or
     hovered, one at a time; grids use the sprite.
   - **The move flow never confirms on its own.** `mover` sends `confirmarSemVolta: false`; a 409
     `dexConfirmarSemVolta` opens the v2 confirmation dialog with the route's sentence (it names the
     game), and only "Transfer" resends the same ids with `true`. "Cancel" and Esc send nothing. A
     409 of that key to a request that was already confirmed is a plain refusal, never a second
     question. The sequence lives in `criarFluxoMover` (`_comum/dex/mover-registros.ts`, pure, with
     the POST injected), and its test follows it step by step: the first try with `false`, the 409
     with no second POST, cancel with none, confirm with the same ids and destination and `true`,
     a second click while one is in flight ignored. Every other refusal comes back as `erro`,
     translated by `recusa.ts`; while the dialog is open, an error shows inside it. `aoRecusar(status)`
     lets the screen reread on a 404 or 409 (the list is stale: another tab moved or deleted a
     record). One request at a time: a second click while one is in flight does nothing.
   - **"Take to HOME" is the Pokédex's** (`pokedex/_componentes/levar-ao-home.tsx`), not a shared
     piece; the Dex inventory (5e) uses `useTransferencia` with its own location picker. An open game
     shows 60 Pokémon at a time ("Show more"), so a game with hundreds to take never mounts them all
     on the grid's page; "Send all" still sends the whole group.

E. **The piece package 5e-b owns** (delivered 2026-11-23), moved from
   `src/app/(v1)/v1/dex/_componentes/hoje.ts` with its v1 importers updated in the same change.

   ```ts
   // src/app/_comum/dex/hoje.ts — skinless; the v1 imports it from here too
   hojeLocal()        // "YYYY-MM-DD" in the local time zone, never UTC (21:00 in Brazil is already tomorrow in UTC)
   hojeLocal(agora)   // the same for a given Date; the argument exists for the test
   ```

   It is the default date of an earned trophy and the start of a new plan or of a "Hunt" plan, on
   both versions.

### Overview and Pokédex (package 5a)

36. **`/dex` only reads and navigates.** The server page reads what the v1 page reads, with the same
    functions; the screen computes with the same domain functions (`progressoDex`,
    `progressoPorRegiao`, `comTrofeusDoHome`, `pegueAgora`…), so the counts are the v1's. The
    percentages follow the v2's rule (`percentualSemFechar`: whole numbers, 100% only when complete)
    where the v1 printed one decimal. Every Pokémon of the showcase opens Register (`?busca=`), every
    game card and trophy the trophies (`?jogo=`), the plan the plans; those screens are bridges until
    their package lands, and the 307 carries the query.
37. **`/dex/pokedex` keeps the v1's state on screen, not in the URL** (view, track, region — Kanto by
    default —, search, state, category), as the v1 does. Sections are `PATCH /api/dex/secoes`, applied
    on the 200, with the chips disabled while one is saving; the base section is a disclosure button
    whose explanation opens by tap and keyboard. **A tap on a slot opens the Pokémon card**
    (`FolhaPokemon`) with "Register" in its footer: one tap more than the v1, which navigated straight
    to Register on a tap and showed the card only under a mouse, in exchange for the HOME render, the
    box and position and the flags in writing on a phone. The cell is a fixed-height button
    (`ALTURA_CELULA` in `grade-pokedex.tsx`, summed in `pokedex.module.css`), because the virtual grid
    places rows by computed height: each text line ellipsizes instead of wrapping.
38. **The Pokédex grid, measured against rule 13's budget** (2026-11-23, the same protocol: Chromium,
    iPhone profile 393 × 852, DPR 3, touch, iPhone user agent, CPU 4×, production build, invented
    data; "tap" is the longest Event Timing duration of a tap that opens the card, six taps in the
    middle of the list, the first cold).

    | View | Slots | Mounted | DOM nodes (page) | `<img>` in grid | Loaded | Tap, worst / median |
    |---|---|---|---|---|---|---|
    | Kanto, main (the default) | 210 | 210 | 2,254 | 210 | 132 | 96 / 80 ms |
    | Paldea, main | 125 | 125 | 1,435 | 125 | 90 | 56 / 52 ms |
    | All, cosmetic | 163 | 163 | 1,920 | 163 | 108 | 80 / 60 ms |
    | All, main (virtual) | 1,224 | 36 | 641 | 36 | 36 | 40 / 32 ms |

    Every view stays inside the budget with the 300 threshold unchanged: the largest region (Kanto,
    with its forms) mounts whole at about 2,250 nodes and a cold tap under 100 ms, and "All" past a
    thousand slots virtualizes flat. The image count is not the card budget's: a sprite is 96 × 96
    (about 36 KB decoded, against ~0.3 MiB for a card's `low.webp`), so 210 of them weigh less than
    25 card images. No region reaches 300 slots today; if one does (new forms), it virtualizes on its
    own.

### Trophies and plans (package 5e-b)

Numbered after package 5a's rules; packages that land in parallel renumber at the merge, as before.

39. **`/dex/trofeus` reads what the v1 reads and computes nothing new.** The server page reads the
    same lists with the same functions (`comTrofeusDoHome` for HOME), and the counts are the v1's
    (`progressoTrofeus`: platinum derived, never a row). The tabs are HOME first, then the user's games
    that have trophies (`abasDeTrofeus`); `?jogo=` only picks the tab that opens, as in the v1, and an
    unknown game opens the first. **A HOME trophy has no mark and no undo button**: it counts from the
    records, the route refuses it (`dexTrofeuCalculado`), and only "Hunt" is offered while it is
    missing (`acoesDoTrofeu`). A checkpoint not yet earned shows a lock and "Unlocks N species" in
    text, plus "Locked"; every trophy writes its tier and its state, the colour is only emphasis.
    Marking asks for the date in line, today (`hojeLocal`) already filled in; undoing asks through the
    v2 confirmation dialog; "Hunt" creates a plan aimed at the trophy and goes to `/dex/planos`.
40. **`/dex/planos` shows a refusal next to what caused it, and only a keyed one.** The task, the plan
    or the new-plan form carries the message; when that place left the screen (another tab closed
    the plan and it went to the history, which is collapsed), it shows at the top. A 404 or 409
    rereads the page. The forms check, before sending, what the routes would refuse with an English
    `erro` (`erroDoPlano`, `erroDaEtapa`: empty title, end before start, 1 to 200 characters in a
    step, up to 2,000 in its details), and both screens print only a refusal with a key, translated
    (`fraseDaRecusa`); a keyless 400 shows the screen's generic sentence, never the route's English.
    Tasks start collapsed (the title is the disclosure button) and closed plans live in a history
    opened by a button, where a plan is reactivated.
41. **Task steps keep every rule of `AGENTS.md`, on screen.** Steps change only while the task is open
    in an active plan (`etapasEditaveis`); elsewhere the boxes are disabled and a sentence says why.
    **Checking the last step never finishes the task**: "every step is done, the task stays open"
    shows as a status next to "Mark done" (`avisoTodasFeitas`), and the click stays the user's.
    Order changes by up and down buttons only, each sending the whole list of ids; a stale list
    (`dexOrdemEtapasInvalida`) is shown and reread, and after a move the focus stays on the same
    button of the moved step. At 50 steps the "Add step" button is off with a note; the server's
    `dexEtapasDemais` (another tab filled the task) is shown and the reread list shows the note.
    Deleting a step asks through the confirmation dialog. Finishing a catch, evolve or trade task
    **offers** Register on the task's game (`hrefCadastroDaTarefa`: `jogo` and, for a single slot,
    `busca` with the species), in the task's own row; it never records.

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

- The top-level 404 (package 0c, measured on Next 16.3.2): `experimental.globalNotFound` is
  **not adopted**. It is still experimental, and it turns the 404 of a path with no route from a
  static page into a render per request whose payload carries the requested path — so the
  password module's 404 while off would stop being byte-for-byte the 404 of any unknown path.
  Without it, every path with no route gets Next's default 404, identical for all of them; a v2
  page that calls `notFound()` (the Dex with the module off, the laboratory in production)
  already renders inside the v2's root layout.
