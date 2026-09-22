# NOTICE — third-party work

This file records what, inside this repository, was not produced here. The code is MIT (see
[`LICENSE`](./LICENSE)); what is below has an owner of its own and a condition of its own.

The trademark disclaimer — Nintendo, Creatures, GAME FREAK, The Pokémon Company — is in the
[README](./README.md#disclaimer) and applies to the whole project.

---

## TCGdex — `seed/carta-catalogo.csv.gz`

The catalog file versioned in `seed/` is a **derivative work** of the data repository
[`tcgdex/cards-database`](https://github.com/tcgdex/cards-database), distributed under the MIT
license. It was assembled from TCGdex's public API (`api.tcgdex.net`) and carries, card by card,
metadata that is theirs: id, set, series, name, category, rarity, Pokédex numbers, illustrator, set
counts and available variants.

The MIT license permits redistribution and permits derivative work, and **charges one thing in
return**: that the copyright notice and the permission notice travel with the copy. That is why the
text below is reproduced here in full, not summarized — summarizing it would break exactly the
condition that lets us distribute the catalog together with the project.

```
MIT License

Copyright (c) 2021 TCGdex

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**What does not come with it: the images.** The catalog stores the URL of the art on the TCGdex CDN
(`assets.tcgdex.net`), never the file. The image is loaded by the browser of whoever installed the
system, at display time, straight from the source. Not one byte of card art is versioned in this
repository, and that is a decision, not an accident: redistributing the image file is a different
responsibility from redistributing metadata under MIT.

## mypcards — `seed/set-mypcards.csv`

A minority of the cards in the catalog have no photo in any TCGdex source — whole energy sets, promos
and galleries that were never digitized there. For those, the project uses
[mypcards](https://www.mypcards.com/) as a secondary source, and the screen marks the photo as such.

What is versioned is **only the mapping** `set → mypcards internal set id`: one number per expansion,
collected by hand, without which the image URL cannot be assembled. That number is internal to them
and cannot be derived from our catalog (`src/lib/dominio/mypcards.ts` documents the URL format and
how it was taken apart).

The mapping is a fact of interoperability, not their content — but the credit is owed all the same,
because without the site's cataloging work it would not exist. **No mypcards image is in this
repository.** Each installation downloads its own, from the source, into a local Docker volume
(`pnpm baixar:imagens-mypcards`).

## LigaPokemon

The price collector reads public pages of [LigaPokemon](https://www.ligapokemon.com.br/). Nothing
from their site is redistributed here: what stays in the repository is the code that reads, and what
stays in each installation is the price that installation looked up.

Access obeys their `robots.txt` by default, read live — the why and the cost of that are in the
[README](./README.md#ligapokemon-prices).
