# Como contribuir

Obrigado pelo interesse. Este é um projeto pessoal aberto: não há SLA nem garantia de resposta, mas
PR bem feito é bem-vindo.

## Antes de escrever código

Leia o [`AGENTS.md`](./AGENTS.md). Ele é o contrato de estilo e de engenharia do repositório — regras
de negócio invioláveis, convenções, contratos do sync e do coletor de preço, e a lista de decisões
que **não** se reabrem dentro de um PR. Se você usa um assistente de código, aponte-o para lá antes
de pedir a mudança.

Para mudança grande, mudança de stack ou qualquer coisa que a seção "Pontos de parada" do
`AGENTS.md` cobre: **abra uma issue antes**. É mais barato discordar em texto do que em diff.

## Ambiente

Node.js 22 ou mais novo, e Docker com o plugin Compose v2 se você for subir a aplicação.

```bash
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm exec next typegen
```

Se o `corepack enable` der `EACCES` apontando para `/usr/bin/pnpm`, o seu Node está instalado para o
sistema inteiro: use `sudo corepack enable pnpm` ou
`corepack enable --install-directory ~/.local/bin pnpm`.

O `next typegen` não é opcional: `LayoutProps` e os outros tipos de rota são gerados em `.next/types/`,
que é gitignorado. Sem ele o `typecheck` falha num checkout limpo.

## Rodando os testes

```bash
pnpm test        # Vitest, uma vez
pnpm test:watch  # em watch
pnpm typecheck
pnpm lint
```

**Os testes não precisam de banco.** As regras de negócio vivem em módulos puros em
`src/lib/dominio/`, e é lá que o teste novo deve entrar. Se o seu teste precisa de um Postgres no ar,
provavelmente a lógica está no lugar errado.

Para exercitar a aplicação inteira, suba o Compose seguindo o [README](./README.md#instalação-do-zero).

## O que um PR precisa passar

O CI roda em todo PR e precisa estar verde:

- `pnpm lint`
- `pnpm exec next typegen` e depois `pnpm typecheck`
- `pnpm test`
- `docker build .` — pega quebra de empacotamento que o build local não pega

Além do CI, para o PR ser aceito:

- **regra de negócio tocada tem teste**, e o teste roda sem banco;
- **nenhum dado de coleção no diff** — nem agregado, nem como fixture "só para testar";
- **nenhum byte de imagem de carta**;
- **nenhum nome de pessoa, e-mail, IP, hostname ou caminho de máquina** em código, comentário ou
  mensagem de commit;
- **comentário atualizado junto do código.** Quase toda decisão não óbvia deste repositório tem um
  parágrafo explicando o que foi medido e o que foi descartado. Se você muda a decisão, muda o
  parágrafo.

## Commits

Pequenos, mensagem em português, no imperativo, sem ponto final:

```
adiciona filtro de idioma no inventário
corrige contagem de vagas em set com secretas
```

## O que não vai ser aceito

- PR que aumente a cadência de requisições contra a LigaPokemon ou a TCGdex, ou que afrouxe a
  checagem de rota permitida. O ritmo padrão é conformidade com o `robots.txt` deles, não
  preferência.
- PR que "enxugue" a imagem Docker com `--prod`, `standalone` ou multi-stage que descarte
  `node_modules` — o entrypoint depende de `tsx` em runtime, e isso quebra o seed e o sync em
  silêncio. O `AGENTS.md` explica.
- PR que implemente autenticação, multiusuário ou exposição pública. Não é lacuna; é escopo.
