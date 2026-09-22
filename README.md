# Pokémon Collection

A catalog of your **physical** Pokémon card collection, running on your own machine. You start two
containers, open the browser and begin typing in what is in the box — the 47,720-card catalog comes
with it and loads by itself on the first boot.

The question it exists to answer is not "how much do I have", it is **"what is missing"**.

<!-- Screenshots would go here: home, quick entry by set, the grid of a collection and the list of what is missing. -->

---

## Disclaimer

**This is a fan project, with no connection to Nintendo, Creatures Inc., GAME FREAK inc. or The
Pokémon Company International.** It is not an official product, it is not endorsed by any of them,
and it has no relationship with LigaPokemon, TCGdex or mypcards beyond reading public data that they
publish.

Pokémon, the names of the cards, the Pokémon and the expansions, the artwork and every related
trademark belong to their respective owners. **This repository redistributes no card art**: images
are loaded at display time, straight from the source, by the installation that uses them (see
[Card images](#card-images)).

It is a personal, non-commercial tool for organizing a collection that already exists on paper.
Nothing here is meant for selling, professional grading or reproducing a card.

---

## What it is, and who it is for

It is a **local, single-user system with no login**, built for people who have Pokémon cards at home,
kept in a binder or a box, and want to know what they have and what they are missing.

It fits well if you:

- are building a **Pokédex** (one slot per species) and want the list of what has not come in yet;
- are closing out an **expansion** card by card and need to know which numbers are missing;
- have duplicates scattered around and want to set aside what can be traded;
- like having the data at home, in a Postgres that is yours, instead of in a spreadsheet or in a
  service that can shut down.

It is not for anyone who wants a public, multi-user site, or sales and trading control.

### What it does

- **Quick entry by set** — pick the expansion, tick the whole card grid and submit in one go. This is
  the path for typing in a large collection without dying halfway through.
- **Entry by search** — for a single card, by name, set or number.
- **Inventory** with search and filters: set, language, rarity, variant, condition, graded, location,
  allocated or free.
- **Collections** of three kinds: Pokédex, complete set or custom. Each one has a grid of slots, copy
  allocation and **the list of what is missing** — which is the main output of the system.
- **Duplicates** — what is left over for trading, with total, allocated and free per card.
- **Overview** — totals and distribution by expansion, rarity, language, condition and variant, plus
  the progress of each collection.
- **Upgrade flagging** — when a copy better than the one in the slot comes in (rarity, language,
  variant), the system tells you. It never swaps on its own: the decision is always yours.
- **LigaPokemon prices** — an optional lookup, to build the list of what to buy. Read
  [the section on it](#ligapokemon-prices) before turning it on.
- **Export** — inventory as CSV, a collection in LigaPokemon's import format, and a buy list ready to
  paste.

---

## Requirements

- **Docker Engine** with the **Compose v2** plugin (`docker compose`, no hyphen). That is everything
  the application needs to run.
- **Node.js 22+**, only if you are going to run the `pnpm` commands on your machine — tests, lint and
  typecheck. To just use the system, it is not needed.
- A few GB of disk across Docker images, catalog and database.

---

## Installing from scratch

### 1. Clone the repository and enter the folder

```bash
git clone <repository-url> colecao-pokemon
cd colecao-pokemon
```

### 2. Enable pnpm (optional)

```bash
corepack enable pnpm
```

`corepack` ships with Node 22 and installs the pnpm version pinned in `package.json`. **It is only
needed to run `pnpm` commands outside the container** (tests, lint). The Docker image does this on
its own — if you only want to use the system, skip this step.

If you get `EACCES: permission denied` pointing at `/usr/bin/pnpm`, it is because your Node is
installed system-wide and `corepack` is trying to write to a root directory. Use `sudo corepack
enable pnpm`, or install into a folder of your own that is on the `PATH`:

```bash
corepack enable --install-directory ~/.local/bin pnpm
```

### 3. Create the `.env`

```bash
cp .env.example .env
```

Open `.env` and replace `troque-esta-senha` with your password. **It appears in two places** —
`POSTGRES_PASSWORD` and, again, inside `DATABASE_URL`. The two have to match, or the database comes
up with one password while the application tries to get in with another:

```dotenv
POSTGRES_PASSWORD=your-password
DATABASE_URL=postgresql://colecao_pokemon:your-password@db:5432/colecao_pokemon
```

The `db` in the URL is the name of the database service inside Compose, not a host of yours — do not
change it.

The rest of the file is optional, ships commented, and explains the reason for each variable.

### 4. Bring it up

```bash
docker compose up -d --build
```

The first run takes a while: it pulls the base images, installs the dependencies and builds the
application. The following ones are a matter of seconds.

If startup stops with `Bind for 0.0.0.0:3010 failed: port is already allocated`, port 3010 is already
taken by something else on your machine. Pick another one in `.env` and bring it up again — it is the
only place that needs to change:

```dotenv
PORTA_HOST=3011
```

On startup the container applies the migrations and, **if the catalog is empty, loads the 47,720
cards from the file versioned in `seed/`** — with no network request at all. To follow along:

```bash
docker compose logs -f app
```

You will see `Migrations aplicadas.`, then `[entrypoint] verificando catálogo...` and, on the first
boot, the catalog load. The `.dados/` folder that comes with the clone is the optional mount point
for the TCGdex data clone — you can ignore it, and why it exists is
[further down](#tcgdex-catalog-from-a-local-clone).

### 5. Open it

- On the machine itself: **http://localhost:3010**
- From another device on the same local network: `http://<machine-ip>:3010`

(If you changed `PORTA_HOST` in the previous step, use the port you picked.)

There is no login screen, because there is no login. The first place to go is **Quick entry by set**.

### Stopping and coming back

```bash
docker compose stop      # stops, keeping the data
docker compose up -d     # back up
```

---

## The catalog comes ready

What makes a fresh install useful from birth is the `seed/` directory: the entire catalog — 47,720
rows in Portuguese, English and Japanese — versioned as a compressed CSV of ~1 MB.

**That is the point of the project.** Without it, a fresh install would start with an empty database
and would need hours of syncing against the TCGdex API — which has already blocked this project's IP
once, for too many requests — or a ~220 MB clone of their data repository. With it, the first boot is
offline and finishes in minutes.

The load is automatic and happens **only when the catalog is empty**: an install that already has a
catalog is left alone. To reload it by hand, at any time:

```bash
docker compose exec app pnpm seed:catalogo
```

It is idempotent — it upserts per card and language, **never deletes** and never marks a card
inactive. Running it twice does not duplicate a row or change a count. How to regenerate the files
when new expansions come out, and the reason for every detail of the format, is in
[`seed/README.md`](./seed/README.md).

To pull new releases straight from upstream, there is the incremental sync:

```bash
docker compose exec app pnpm sync:catalogo
```

It is a client that is polite out of obligation: a request-per-second ceiling, limited concurrency, an
identified User-Agent, and it aborts everything on the spot if it gets blocked. Do not raise those
numbers without knowing what you are doing — see `AGENTS.md`.

### TCGdex catalog from a local clone

The commands `pnpm importar:catalogo-repo`, `pnpm importar:tipos-catalogo` and
`pnpm preencher:serie-id-ocidental` read the data from a clone of the
[TCGdex data repository](https://github.com/tcgdex/cards-database) instead of the API. With the seed
above, this path became rare — it existed to bring in the Japanese catalog, which now ships with the
project — but it stays available for anyone who wants data straight from upstream without touching
the API.

`compose.yaml` mounts that clone at `/upstream-dados-tcgdex`, and the host path comes from
`TCGDEX_REPO_HOST_PATH`. **The recommendation is to clone wherever you want and point the variable
at it:**

```bash
git clone --depth 1 https://github.com/tcgdex/cards-database.git ~/tcgdex-cards-database
# in .env:
# TCGDEX_REPO_HOST_PATH=/your/path/tcgdex-cards-database
```

It is about 220 MB, and the clone does not update itself — run `git pull` in it when you want newer
data.

#### Why there is an empty `.dados/tcgdex-cards-database/` folder in the repository

Because the mount default points at it, and **a bind mount that does not exist is created by the
Docker daemon, which runs as root**. If the folder did not come with the clone, every install would
gain a `root:root` directory inside the project — and an `rm -rf` on the project, on uninstall day,
would fail with `Permission denied` without `sudo`. Versioning it empty makes you the owner.

The side effect is that `git clone` refuses a non-empty directory, so you cannot clone the TCGdex
repository straight into it without deleting the `.gitkeep` first. That is why the recommended path
above is the environment variable.

---

## Card images

Each card's art is loaded **at display time, straight from the TCGdex CDN**. Not one image byte is in
this repository, and none is copied into your database by default.

A minority of cards have no photo in any TCGdex source — whole energy sets, promos and galleries that
were never digitized there. For those there are two paths, both manual and both optional:

- **mypcards as a secondary source.** You paste the link to the set on their site into the screen;
  from there the command below downloads the photos of your cards into a local Docker volume, and the
  screen marks the origin with a badge. The mapping of known sets comes in the seed.

  ```bash
  docker compose exec app pnpm baixar:imagens-mypcards
  ```

- **Your own upload.** You send your own photo for the card.

In both cases the files stay in the `imagens_locais` volume, on your machine, outside the repository.

---

## LigaPokemon prices

The system can query [LigaPokemon](https://www.ligapokemon.com.br/) to build the list of what to buy:
for each empty slot in your collection, which cards are for sale and for how much. It is optional and
only runs when you ask for it.

### The default pace obeys their robots.txt

The interval between two requests **is not chosen by this project**: it is the `Crawl-delay` declared
in LigaPokemon's `robots.txt`, read live and respected as written. Today that value is **360
seconds**. If they loosen it, you benefit the same day; if they tighten it, you obey the same day. A
read failure — network down, 5xx, malformed file — falls back to the conservative value, never to the
aggressive one.

Only the routes their file allows are accessed (`cards/search` and `cards/card`), and that is checked
before each request goes out. The file can add a prohibition; it can never remove one that is
hardcoded.

### The cost of this is time, and it is a lot of time

A full scan of a Pokédex goes through around 161 empty slots. At 360 seconds per request, **that
takes about 16 hours**.

The project was built for that scale: the scan runs in the background, writes after every slot it
queries and, when triggered again, **skips whatever was queried in the last 24 hours**. Restarting
the container halfway through does not send it back to the start — you click again and it picks up
where it stopped. The screen shows slots queried, slots remaining and an estimated finish.

### If you want to go faster, the decision is yours

```dotenv
LIGA_INTERVALO_SEGUNDOS=3
```

Setting this variable in `.env` makes the value you give it the one that applies, and the choice
becomes yours.

An honest note from whoever maintains the project: **3 seconds is the value this project used
day to day, with no trouble.** It is slower than what the browser itself would generate opening the
same pages — a page in the browser pulls dozens of images and scripts that the collector does not
pull — and it is faster than their file asks for.

That is the experience of **one** installation, not a promise and not a recommendation. Lowering the
interval is the decision and the risk of whoever configures it, and the concrete risk is an IP block:
this project already took one from TCGdex, out of haste, before the limiter existed. The
repository's default stays obeying the file, because shipping a tool that disobeys by default would
hand whoever installs it a risk that person did not choose.

---

## What this project is **not**

- **It has no authentication.** None. There is no login, no user password and no session, and that is
  a project decision, not an open item.
- **It is single-user.** There is no multi-user, no profile and no separation of data by person.
  Whoever opens the page sees and edits everything.
- **It was not made for the internet.** It is for your local network. Publishing this port on the
  internet hands your database to anyone who finds the address. If you need remote access, use a VPN
  — do not open the port on the router.
- **It is not a service, and it has no support.** It is a personal project, open because it may be
  useful to more people. There is no SLA, no guarantee of a reply and no commitment to compatibility
  between versions. The MIT license says this in legal terms; this paragraph says it in plain words.
- **It does no deck building, no selling, no trading, no card scanning by photo and no native app.**

### Your data is yours, and so is the backup

Your collection and your images live in Docker volumes (`pgdata` and `imagens_locais`), **outside the
repository**. None of it ever enters git. In exchange, `git pull` backs up nothing: taking care of
those volumes is the responsibility of whoever installs the system.

A database dump, with Compose running:

```bash
docker compose exec -T db pg_dump -U colecao_pokemon colecao_pokemon > backup.sql
```

(Change the user and the database if you changed the values in `.env`.)

---

## Development and contributing

Contributions are welcome. The short path:

```bash
corepack enable pnpm
pnpm install
pnpm exec next typegen   # generates Next's route types; without this, typecheck fails
pnpm typecheck
pnpm test
pnpm lint
```

The business rules live in pure modules and **the tests need no database** — they run in seconds, on
a clean checkout.

Before opening a PR, read [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the process and
[`AGENTS.md`](./AGENTS.md) for the engineering contract. `AGENTS.md` is written for coding assistants
too: if you use one, point it there before asking for the change.

---

## License and credits

The code is MIT — see [`LICENSE`](./LICENSE).

The card catalog in `seed/` is a derivative work of the **TCGdex** data repository, also MIT, and the
attribution their license requires is in [`NOTICE.md`](./NOTICE.md), along with the credit to
**mypcards** for the image mapping. Read `NOTICE.md` before redistributing this repository.
