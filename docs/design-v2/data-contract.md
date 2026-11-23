# Data contract — the v2 reads (package 1a)

Four read-only routes that the v2 collection screens, the "What's missing" tab and the card detail
are built on. They add no business rule and change no existing route's response; every write still
goes through the routes the v1 uses (the `parity.md` "Reuses" column). The shapes are typed in
`src/lib/dominio/tipos-cliente.ts`, block "Design v2" (`GradeColecaoV2DTO`, `FaltaColecaoV2DTO`,
`AlternativasDaVagaV2DTO`, `DetalheCartaV2DTO`); the assembly is pure and tested in
`src/lib/dominio/grade-colecao.ts`, `falta-colecao.ts` and `detalhe-carta.ts`.

All four are wrapped in `comAcesso` (401 without a session when the password access is on), are in
the coverage test's list of `GET` routes, and only `select`: the grid and the detail run in one
`read only`, REPEATABLE READ transaction, so a copy and the slot it sits in come from the same
instant. None of them closes a dead price round, which the buy options `GET` does.

## `GET /api/colecoes/:id/grade` — the whole grid in one call

Set, Pokédex and custom, one shape. The collection fields of `GET /api/colecoes/:id` (name, type,
`parametro`, divisions, warnings, `progressoPorRegiao`, `multiplosSets`, `temaRotulo`) plus
`totalVagas`, `vagasPreenchidas` and `vagas`, in display order, every slot included (R6).

Each slot: `id`, `chave`, `numero` (the printed number in a set, the national number, the custom
sequence — never the raw `set/local_id` key), and then, **only when they have a value** (an absent
field is null, zero or empty):

| Field | What it is |
|---|---|
| `especie` | Pokédex only: the species of the slot |
| `cartaNome`, `cartaLocalId`, `setNome` | the card shown: the copy's, or the expected card of an empty set slot |
| `divisao`, `energia` | the division the slot counts in; the type that tints it |
| `imagemUrl`, `imagemOrigem` | the raw image URL (`urlImagemCarta(url, "low")` for the grid) and its origin; an empty Pokédex slot has none and uses `urlSpritePokemon(chave)` |
| `carta` | `{ cartaId, idiomaCatalogo, raridade }` of the card shown — what opens the detail; absent on an empty Pokédex slot (R3: no single expected card) |
| `copia` | `{ id, variante, idioma, condicao, desde }`: the allocated copy, its **physical** language (R7) and when it entered the slot (`vaga.atualizado_em`) |
| `livres` | free copies that fit the empty slot (allocate in the detail; R5) |
| `upgrade` | the axis (`raridade`, `idioma`, `variante`) of the best free copy that beats the allocated one; a flag, never a swap (R8) |
| `escolhas` | `[{ id, cartaId, nome }]`: the buy choices of the **empty** slot; `id` unmarks it (`PATCH …/opcoes-compra/selecao` with `{ ids: [id], selecionada: false }`) |

Size, measured with invented data in the real shape (`grade-colecao.test.ts`, which also fails if a
new field blows it up): about **270 KB** for a national Pokédex (1,025 slots) and **100 KB** for a
250-slot set, uncompressed. On a live install with invented data: 57 KB for a 165-slot set, 20 KB for
a 151-slot Pokédex with two copies. For comparison, the buy options `GET` of that same 151-slot
Pokédex on the Cardmarket source is 1.3 MB, because it carries every candidate with its image.

## `GET /api/colecoes/:id/falta` — what's missing, lean

Optional `?ordenacao=preferencia|preco&teto=<reais>` (empty `teto` = no ceiling): the Cardmarket
screen filter, applied without a new price round. Without them the buy options screen's default
applies (Pokédex: preference, R$ 20; set: price, no ceiling — a set always orders by price). On the
Liga source the criterion is the last scan's filters and the parameters change nothing. A custom
collection answers `vagas: []` with `criterio`, `estado` and `lista` null. An invalid parameter is
400 `corpoInvalido`.

| Field | What it is |
|---|---|
| `fonte` | the install's price source (`PRECO_FONTE`); the two are never mixed |
| `criterio` | `{ fonte, ordenacao, tetoPreco, origem: "padrao" \| "pedido" \| "varredura", exigePreco: true }`, what ordered the options and decides the proposal; null on Liga without any scan |
| `estado` | Cardmarket: `precosCandidatas` (`cartas`, `comPreco`, `semPrecoNoCardmarket`, `aBuscar`, `validadeDias`, the same summary as the buy options screen) and the last `rodada`; Liga: the last `varredura` (new lookups stay unavailable since 2026-11-11; nothing here works around it) |
| `lista` | the paste list exactly as the buy options screen builds it (`resumoDaListaDeCompra`): `abasLiga` (tabs of up to 110, one per region in a Pokédex, the official `abasDaLista`), `multiplas`, `total`, `semPreco`, `precoMaisAntigo`, `selecionadas`, `guardadas` |
| `vagas` | every empty slot (R6), in display order |

Each empty slot: `vagaId`, `chave`, `numero`, `rotulo` (species or card name; null when the catalog
does not know it), `dex`, `setNome`, `livres` ("can be allocated now"), `opcoes` (how many options
are offered), `descartadas` (hidden by the ceiling), `semEstoque` (hidden as out of stock), and:

- **`proposta`** — the option "mark the best of each slot" would mark, or null with `semProposta`:
  `semOpcao` (nothing to offer), `jaTemEscolha` (the slot already has a choice; the shortcut never
  adds a second card to it), `semPreco` (Cardmarket before a price round, or a card it has no price
  for: the slot is marked by hand from the alternatives). The proposal is the first option in the
  criterion's order and must have a price — the v1 shortcut's rule, plus the `jaTemEscolha` guard,
  which also covers a Liga slot whose choice came from the catalog and matches no scan option. The
  proposal carries its image.
- **`escolhas`** — `[{ escolhaId, cartaId, nome, edicaoNome, numero, total, raridade, preco }]`,
  each unmarked by `escolhaId`; several per slot are allowed.

An option (`proposta`, and each item of the alternatives):

| Field | What it is |
|---|---|
| `id` | the same id as on the buy options screen |
| `alvo` | how to mark it: `{ tipo: "candidata", chave, cartaId }` → `PATCH …/selecao` `{ cartas: [{ chave, cartaId }], selecionada }`; `{ tipo: "opcaoLiga", id }` → `{ ids: [id], selecionada }`; `{ tipo: "escolha", escolhaId }` → unmark only, `{ ids: [escolhaId], selecionada: false }` |
| `cartaId`, `nome`, `nomeExibicao?`, `edicaoNome`, `numero`, `total`, `raridade` | the card; `nome` is the Liga line's name |
| `imagemUrl?`, `imagemOrigem?` | only where the read sends images |
| `selecionada`, `semEstoque` | marked by a current choice; out of stock (only a marked one is still shown) |
| `preco` | `{ fonte, valor, em, cardmarket? }` or null. Cardmarket: the stored value in BRL converted by the PTAX, with `valorEur`, `criterioValor`, `tendenciaEur` (only when the 30-day average replaced the trend), `cotacao` and `cotacaoData`. Liga: the lowest in-stock price the scan saw, unconverted, dated by the scan |
| `consultadaSemPrecoEm?` | Cardmarket: asked, and it had no price — when |

The out-of-stock filter is the buy options screen's, unchanged: a card the Liga returned as out of
stock is hidden, **except when it is marked**, which keeps it, flagged, so it can still be unmarked.

## `GET /api/colecoes/:id/falta/alternativas?chave=<slot key>`

Every option of one empty slot, with images, in the criterion's order: what the tab opens when a
Pokédex slot has several cards, has no price yet, or already has choices. Same `ordenacao` and `teto`
as above; same options the buy options screen would show for that slot. Answers `vagaId`, `chave`,
`criterio`, `opcoes`, `descartadas`, `semEstoque`. A slot that does not exist, or was filled, is 404
`vagaNaoEncontrada`; no `chave` is 400.

## `GET /api/cartas/:cartaId/detalhe`

Optional `idioma=pt|en|jp` (the catalog row to show), `copia=<id>` (opened from a copy: it must be a
copy of this card, and its row is shown), `vaga=<id>` (the slot that opened it). 404
`cartaNaoEncontradaNoCatalogo`, `copiaNaoEncontrada` or `vagaNaoEncontrada`; 400 `corpoInvalido`.

| Field | What it is |
|---|---|
| `carta` | the row shown: name, set, number, `setQtdOficial`, rarity (`raridade`, as stored on that row), `raridadeCanonica`, `tipos`, `ilustrador`, `dexIds`, `ativa`, `imagemUrl`, `imagemAlta` (`high.webp`, or the user's own photo as is), `imagemOrigem`, the five `variante…Disponivel` flags, and `idiomas` (the rows the card has). `raridadeCanonica` is the rarity to label with (`raridadesCarta`, keyed by the en spelling): the en row's rarity for the same `carta_id`, else the stored one — the `raridadeCanonica` rule of the collection suggestions in `AGENTS.md`. A Japanese row keeps its stored rarity: `neo1` to `neo4` share the id with English and are other cards (`raridadeCanonicaDaFicha`, `lib/dominio/detalhe-carta.ts`) |
| `especial` | the card enters the inventory price rounds when owned (not a plain common or uncommon) |
| `copias` | **every** copy of the physical card (`carta_id`: any catalog row, any physical language, R7), with the editable fields, `criadoEm` (when the row was entered: units merged into an existing row keep that row's date; the part split off a lot keeps the original's date since package 2a, while a split made before it carries the split's date) and `alocacao` (`vagaId`, `chave`, `numero`, collection id, name and type, `desde`) or null |
| `preco` | `{ fonte, origem, preco, motivo? }`, in the active source only. Owned and special: the inventory price (Liga: `valor` is the average, else the lowest, with `liga: { minimo, medio, maximo }`). Owned common/uncommon: `motivo: "naoEspecial"`, never priced. Owned special not asked yet: `naoConsultada`; asked with no price: `semPrecoNaFonte`. Not owned: the Cardmarket candidate price if a collection price round asked it (`origem: "candidata"`), else `foraDoInventario` |
| `serie` | `{ fonte, pontos: [{ em, valor }] }`, up to 30 most recent found lookups, oldest first, from the active source's history; null unless the card is owned and special — candidates have no history by decision, and the two sources are never one series |
| `contexto` | the `vaga` that opened it (id, key, number, its copy, collection) and the `copiaId` asked |

Allocate, swap, deallocate, edit a copy and mark a purchase keep their routes; the detail only reads.

## The home read (package 2a) — server-side, no route

The v2 home (`/`) reads on the server, in `src/app/(v2)/page.tsx`, through `lerInicioV2`
(`src/lib/db/inicio-v2.ts`), and adds no route: after a write in the card detail the screen calls
`router.refresh()` and the read runs again. The shapes are in `src/lib/dominio/inicio-v2.ts`
(`InicioV2DTO`). Only `select`.

- **Totals, "Your collections" and "Almost there"** are the v1 home's, read by the same function
  (`lerTcgInicio`): the first four collections in `listarColecoes` order, and the divisions closest to
  complete chosen among **all** of them. The Living Dex summary is `resumoDexInicio`, read only with
  the module on.
- **`vitrine`** is the overview's gems rule (`listarJoias`, the stored price in the active source
  first, then the look), cut to three, each with the copy a tap opens in the detail: the card's
  oldest copy (`montarVitrine`). The image comes with its origin from the same rung of the image
  ladder. No price travels: on the home a price would need its source, quote and date.
- **`cadastradas`** — "Entered in the last 7 days" (decision 5): copies whose `criado_em` falls in
  today and the six days before it, as **calendar days in the São Paulo time zone**, from 00:00 of the
  first day (`janelaCadastradas`, `cadastradas-recentes.ts`, pure and tested, daylight saving
  included). It carries `hoje` and `desde`, the counts of the whole window (`copias` rows, `unidades`
  summed, distinct `cartas`) and the 12 most recent copies with their day. What it does not reach,
  and the screen says so: units merged on entry into an existing row keep that row's date, and a
  copy split off a lot before package 2a carries the date of the split. Since package 2a the part
  split off a lot keeps the original's `criado_em` in both split paths (allocation to a slot, which
  the swap also uses, and addition to a custom collection, which the theme batch also uses:
  `parteSeparadaDoLote`, `divisao-lote.ts`). No old date is repaired by inference.
