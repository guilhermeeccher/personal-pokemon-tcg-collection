# NOTICE — trabalhos de terceiros

Este arquivo registra o que, dentro deste repositório, não foi produzido aqui. O código é MIT
(ver [`LICENSE`](./LICENSE)); o que está abaixo tem dono próprio e condição própria.

A isenção de marca — Nintendo, Creatures, GAME FREAK, The Pokémon Company — está no
[README](./README.md#disclaimer) e vale para o projeto inteiro.

---

## TCGdex — `seed/carta-catalogo.csv.gz`

O arquivo de catálogo versionado em `seed/` é **obra derivada** do repositório de dados
[`tcgdex/cards-database`](https://github.com/tcgdex/cards-database), distribuído sob licença MIT.
Ele foi montado a partir da API pública da TCGdex (`api.tcgdex.net`) e carrega, carta a carta,
metadado que é deles: id, set, série, nome, categoria, raridade, números da Pokédex, ilustrador,
contagens do set e variantes disponíveis.

A licença MIT permite redistribuir e permite obra derivada, e **cobra uma coisa em troca**: que o
aviso de copyright e o aviso de permissão acompanhem a cópia. É por isso que o texto abaixo está
reproduzido aqui inteiro, e não resumido — resumir seria descumprir exatamente a condição que nos
permite distribuir o catálogo junto com o projeto.

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

**O que não vem junto: as imagens.** O catálogo guarda a URL da arte no CDN da TCGdex
(`assets.tcgdex.net`), nunca o arquivo. A imagem é carregada pelo navegador de quem instalou, na
hora de exibir, direto da fonte. Nenhum byte de arte de carta está versionado neste repositório, e
isso é decisão, não acaso: redistribuir o arquivo de imagem é uma responsabilidade diferente de
redistribuir metadado sob MIT.

## mypcards — `seed/set-mypcards.csv`

Uma minoria das cartas do catálogo não tem foto em fonte nenhuma da TCGdex — sets inteiros de
energia, promos e galerias que nunca foram digitalizados lá. Para essas, o projeto usa o
[mypcards](https://www.mypcards.com/) como fonte secundária, e a tela marca a foto como tal.

O que está versionado é **só o mapeamento** `set → id interno do set no mypcards`: um número por
expansão, levantado a mão, sem o qual não é possível montar a URL da imagem. Esse número é interno
deles e não é derivável do nosso catálogo (`src/lib/dominio/mypcards.ts` documenta o formato da
URL e como ele foi decomposto).

O mapeamento é fato de interoperabilidade, não conteúdo deles — mas o crédito é devido do mesmo
jeito, porque sem o trabalho de catalogação do site ele não existiria. **Nenhuma imagem do mypcards
está neste repositório.** Cada instalação baixa as suas, da fonte, para um volume Docker local
(`pnpm baixar:imagens-mypcards`).

## LigaPokemon

O coletor de preço lê páginas públicas da [LigaPokemon](https://www.ligapokemon.com.br/). Nada do
site deles é redistribuído aqui: o que fica no repositório é o código que lê, e o que fica na
instalação de cada um é o preço que aquela instalação consultou.

O acesso obedece o `robots.txt` deles por padrão, lido ao vivo — o porquê e o custo disso estão no
[README](./README.md#preços-da-ligapokemon).
