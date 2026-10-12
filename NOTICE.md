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
system, at display time, straight from the source. No card art file is versioned in this
repository, and that is a decision, not an accident: redistributing the image file is a different
responsibility from redistributing metadata under MIT. The screenshots in `docs/screenshots/`
show the interface with cards displayed in it; they illustrate the program and are not a source
of images for anything.

## mypcards — `seed/set-mypcards.csv`

A minority of the cards in the catalog have no photo in any TCGdex source — whole energy sets, promos
and galleries that were never digitized there. For those, the project uses
[mypcards](https://www.mypcards.com/) as a secondary source, and the screen marks the photo as such.

What is versioned is **only the mapping** `set → mypcards internal set id`: one number per expansion,
collected by hand, without which the image URL cannot be assembled. That number is internal to them
and cannot be derived from our catalog (`src/lib/dominio/mypcards.ts` documents the URL format and
how it was taken apart).

The mapping is a fact of interoperability, not their content — but the credit is owed all the same,
because without the site's cataloging work it would not exist. **No mypcards image file is in this
repository.** Each installation downloads its own, from the source, into a local Docker volume
(`pnpm baixar:imagens-mypcards`).

## LigaPokemon

The price collector reads public pages of [LigaPokemon](https://www.ligapokemon.com.br/). Nothing
from their site is redistributed here: what stays in the repository is the code that reads, and what
stays in each installation is the price that installation looked up.

Access obeys their `robots.txt` by default, read live — the why and the cost of that are in the
[README](./README.md#ligapokemon-prices).

## PokéAPI — `seed/dex-forma.csv`

The Living Dex slot catalog (optional module) is generated from the data files of
[`PokeAPI/pokeapi`](https://github.com/PokeAPI/pokeapi) (`data/v2/csv/`): species, forms, their
English names, generation, and the legendary, mythical and gender-difference flags. That data is
distributed under the BSD 3-Clause license, whose conditions ask that the notice below travel with a
redistribution, so it is reproduced in full:

```
Copyright (c) © 2013–2023 Paul Hallett and PokéAPI contributors
(https://github.com/PokeAPI/pokeapi#contributing). Pokémon and Pokémon character
names are trademarks of Nintendo.

All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice, this
  list of conditions and the following disclaimer in the documentation and/or
  other materials provided with the distribution.

* Neither the name of PokéAPI nor the names of its contributors may be used to
  endorse or promote products derived from this software without specific prior
  written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

**Which forms are slots is not PokeAPI's data** — it is this project's classification
(`src/lib/dominio/dex-classificacao.ts`). It was checked against two curated Pokémon HOME living-dex
lists, consulted and not copied: the SuperEffective dataset and `homestretch-data`. The list of
forms never released as shiny was checked against NationalDex's shiny-locked list. Credit is owed to
all three for the cataloging work that made the check possible.

**No sprite file comes with it.** The catalog stores the sprite's path in the
[`PokeAPI/sprites`](https://github.com/PokeAPI/sprites) repository; the browser of whoever installed
the system loads it at display time, the same way card images are loaded.
