# AGENTS.md — Coleção Pokémon

Sistema de controle de coleção física de cartas Pokémon. Uso pessoal, rede local, um único usuário.

**Leia antes de escrever qualquer código.** A especificação funcional completa (a "spec", citada ao
longo deste arquivo por seção — §3.1, §5 Fase 2 etc.) e o backlog por fase são documentos externos e
não fazem parte deste repositório. **Este arquivo é a fonte de verdade da execução:** regras de
negócio, stack, convenções e contratos valem para qualquer mudança de código.

---

## Regras de negócio invioláveis

Estas oito regras são o produto. Se uma mudança de código quebrar qualquer uma delas, a mudança está errada — não a regra.

1. **Alocação exclusiva.** Uma cópia ocupa no máximo uma vaga, em uma coleção só. Garantido por constraint de unicidade no banco, não apenas na aplicação.
2. **Elegibilidade da Pokédex.** Só carta com **exatamente um** `dexId` ocupa vaga de Pokédex. Tag team e carta multi-Pokémon são inelegíveis.
3. **Formas não desdobram a vaga.** Raichu de Alola e Raichu disputam a vaga 26. A forma é exibida, nunca cria vaga nova.
4. **Set conta a numeração oficial** (`cardCount.official`). A flag "incluir secretas" na coleção troca para `cardCount.total`.
5. **A seleção é sempre do usuário.** O sistema sugere candidatos elegíveis; nunca preenche vaga sozinho.
6. **Vaga vazia é saída de primeira classe.** Toda coleção Pokédex ou Set expõe a lista do que falta. É a razão de o sistema existir.
7. **Idioma da cópia é o idioma da carta física**, independente da linha de catálogo que a identifica. A linha de catálogo responde "que carta é esta"; a cópia responde "como é a minha". Nunca amarre um ao outro — 33 sets não têm carta a carta em pt no upstream, e existem cartas físicas em português desses sets.
8. **Troca é atômica, e melhoria é sinalização.** Substituir a cópia de uma vaga acontece numa transação só (`trocarCopiaDaVaga`): a vaga nunca fica vazia por causa de uma troca que falhou no meio — e dentro dela a recusa sai por exceção, nunca por `return`, que fecharia a transação com sucesso. O sistema sinaliza a melhoria e espera o clique; nunca troca sozinho (é a regra 5 aplicada à vaga já preenchida). A escada (raridade > idioma > variante, `promo` fora) vive em `lib/dominio/melhoria-vaga.ts` e **não é traduzida para `CASE` em SQL** — o SQL casa os pares, o módulo puro decide.

---

## Stack — decidida, não reabrir

| Item | Decisão |
|---|---|
| Framework | Next.js (App Router) + TypeScript estrito |
| Banco | PostgreSQL 17 |
| ORM / migrations | Drizzle + drizzle-kit (SQL-first: migration é SQL legível e revisável) |
| UI | Tailwind CSS |
| Pacotes | pnpm |
| Testes | Vitest para as regras de negócio; sem e2e no MVP |
| Runtime | Docker Compose |
| Porta da app | **3010** no host (3000 fica livre para outros serviços) |
| Porta do banco | **não publicar no host** — só na rede interna do Compose |
| Auth | nenhuma. Rede local, usuário único. Não implementar login. |

Se uma decisão dessa tabela precisar mudar, **pare e pergunte** — não troque por conta própria.

## Comandos

O servidor tem Node 22, npm, Docker 29 e Docker Compose v5. **`pnpm` não está instalado** — habilite via corepack antes de qualquer coisa:

```bash
corepack enable pnpm     # pré-requisito, uma vez só
pnpm install
pnpm dev                  # desenvolvimento local
pnpm test                 # Vitest
pnpm typecheck            # tsc --noEmit
pnpm lint
pnpm db:generate          # gera migration a partir do schema Drizzle
pnpm db:migrate           # aplica migrations
pnpm sync:catalogo        # sincroniza o catálogo TCGdex (pt, en e jp) — incremental
pnpm sync:catalogo --profundo  # revisita todo set carta a carta (~2h30)
docker compose up -d --build
```

Migrations são aplicadas na subida do container, antes de a app servir tráfego.

## Convenções de código

- Português nos nomes de domínio (`copia`, `colecao`, `vaga`, `carta_catalogo`); inglês no que é infraestrutura (`createServer`, `handler`). O vocabulário do domínio é o da spec — não traduza `vaga` para `slot` no meio do código.
- Regras de negócio ficam em módulos puros e testados (`lib/dominio/`), fora de componentes React e de route handlers. As seis regras acima precisam ser testáveis sem banco.
- Sem `any`. Sem `@ts-ignore` sem comentário justificando.
- Nada de segredo commitado. Configuração por `.env`, com `.env.example` versionado.
- Commits pequenos, mensagem em português, imperativo: `adiciona sync do catálogo TCGdex`.
- **O git não cobre os dados.** O banco (as cópias cadastradas) e os bytes das imagens locais vivem em volumes Docker, fora do repositório — o backup deles é responsabilidade de quem instala. Nunca commite dado de coleção nem imagem de carta.

## Contrato do sync de catálogo

- Base: `https://api.tcgdex.net/v2/<idioma>/` — sem chave, idiomas `pt` e `en`.
- **Código de idioma na URL é ISO**: o japonês é `ja`, não `jp`. Nosso enum de banco usa `jp` e tem dado real gravado — traduza em `codigoIdiomaUpstream`, **nunca renomeie o enum**.
- **Cliente educado — regra dura, aprendida do jeito caro.** Em 2026-08-25 o sync rodou ~35.000 requisições com 40 em paralelo e sem teto de taxa; a TCGdex bloqueou o IP deste servidor no firewall (connection refused para nós, 200 para o resto do mundo). Portanto:
  - Teto global de requisições por segundo no cliente (`lib/sync/limitador.ts`), padrão 6/s. Concorrência limita o que está em voo; só o limitador limita o que parte por segundo.
  - Concorrência padrão 4 (cartas) e 2 (sets). **Não subir sem motivo declarado.**
  - User-Agent identificando o cliente em toda requisição.
  - **Bloqueio aborta o sync inteiro na hora** (`ErroBloqueioUpstream`), sem retry e sem drenar a fila — insistir renova o bloqueio. 429, 403 e falha de socket (`ECONNREFUSED`/`ECONNRESET`) são bloqueio; 5xx e timeout são transitórios (retry); 404 é permanente (pula o item).
- Fluxo: `GET /sets` → para cada set, `GET /sets/{id}` (traz a lista de cartas) → materializa em `carta_catalogo`.
- **Incremental por padrão** (desde 2026-08-26). `GET /sets/{id}` já devolve os ids das cartas do set; se essa lista bate com as cartas ativas que temos gravadas, o set é pulado e nenhuma requisição de detalhe é feita — só um UPDATE local que atualiza os metadados de set e renova `atualizado_em` (`tocarSetInalterado`). Rodada sem lançamento cai de ~53.000 requisições para ~470. `pnpm sync:catalogo --profundo` (ou `SYNC_PROFUNDO=1`) revisita tudo carta a carta; é o único jeito de capturar correção de metadado numa carta que já existe, e leva ~2h30 nos três idiomas.
- **Set pulado nunca pode ser inativado.** Duas proteções independentes, e ambas devem continuar existindo: o toque renova o relógio das linhas, e `decidirInativacaoCatalogo` exclui os sets pulados do UPDATE. Sem isso, uma rodada normal marcaria o catálogo inteiro como inativo em silêncio, com cópias reais apontando para essas linhas.
- **Idempotente:** rodar duas vezes seguidas não pode duplicar linha nem alterar contagem. Chave: (`id`, `idioma`).
- **Nunca apaga.** Carta que sumir do upstream é marcada (`ativa = false`), não deletada — pode haver cópia do usuário apontando para ela.
- **Nunca bloqueia o uso.** A app lê sempre a tabela local. Se a API estiver fora, o sync falha e registra erro; a app continua funcionando com o último estado.
- **Não sincroniza a série `Pokémon TCG Pocket`** (jogo digital, não existe em papel). Decisão de 2026-08-24: nada de digital entra no catálogo.
- `forma` é derivada do nome da carta por tabela de normalização (ex.: "de Alola" → `alola`). Nome que não casar com nenhum padrão vira `normal` — nunca chute.

## Pontos de parada — pare e devolva a decisão ao mantenedor

Trabalho autônomo vai até a Fase 5. Além disso, e nestes casos, **pare e pergunte em vez de improvisar**:

- **Fase 6 (preço): destravada em 2026-09-02.** A fonte é a **LigaPokemon**, lida pela busca do site (`lib/liga/cliente.ts`). Continua valendo: **não use cotação de câmbio para converter**, e não exponha preço internacional como se fosse valor de mercado brasileiro. Regras duras do coletor, todas já decididas:
  - **Ritmo: 1 requisição a cada 3 s com jitter.** O `robots.txt` deles pede `Crawl-delay: 360`; o intervalo menor foi decisão explícita, ciente da diferença. **Não aumentar o ritmo** — este servidor já levou bloqueio de IP por isso em agosto.
  - **Só `cards/search` e `cards/card`.** O `robots.txt` proíbe `cards/pricehistory`, `bzr/`, `colecao/` e `ecom/`; nada no código toca nelas, e nada deve passar a tocar.
  - **Bloqueio aborta a rodada**, sem retry (`ErroBloqueioLiga`).
  - **A tela lê snapshot, nunca o site.** Consulta ao vivo na renderização vira dezenas de requisições por abertura de página.
  - **`liga_edicao.set_id` nunca é preenchido por palpite** — edição vinculada errado aponta preço de um set para carta de outro.
  - **A triagem de compra é DURÁVEL e não vive na varredura** (desde 2026-09-17, `escolha_compra`). Até ali a marcação era uma coluna de `liga_opcao`, então rodada nova nascia zerada: uma triagem de 126 cartas da Pokédex seria apagada inteira pela atualização de preço seguinte. O que decorre disso:
    - A escolha é presa à **vaga**, não à rodada, e a ponte com a varredura é a `identidade` da carta (`lib/dominio/identidade-carta.ts`: edição + número, sem zero à esquerda). **Nunca ligue a escolha a um `liga_opcao.id`** — aquela linha morre com a rodada.
    - **Rodada nova atualiza preço, nunca apaga escolha.** Carta que não reapareceu mantém preço e data da última vez: sumir calada tiraria da lista uma carta que o usuário decidiu comprar.
    - **Várias cartas por vaga é permitido** (decisão fechada): na Pokédex a vaga é uma espécie e o usuário pode acompanhar mais de uma carta do mesmo Pokémon.
    - **Vaga preenchida não apaga a escolha** — só a tira da lista. A cópia saindo da vaga, ela volta.
    - A marcação da grade é **derivada** da escolha. `liga_opcao.selecionada` não existe mais.
    - A lista para colar existe **sem varredura nenhuma**, e é montada por `lib/liga/lista-compra.ts` — a mesma função para a tela e para a exportação.
  - **Coleção de set entrou em 2026-09-03**, com a mesma tela e o mesmo motor. O que muda é o alvo: na Pokédex a vaga é uma espécie e ganha dezenas de opções; no set a vaga é uma carta específica e tem no máximo uma, a da edição e do número certos (`lib/dominio/liga-set.ts`).
  - **Não existe listar a edição inteira — medido, não suposto.** Qualquer filtro de edição no termo da busca (`ed=PFL`, `edid=738`, os dois juntos, exatamente como o site escreve o próprio link) faz a página trocar para renderização por JavaScript e voltar sem nenhuma linha de carta no HTML. Só a busca por **nome** responde HTML. Não vale tentar de novo; a economia possível é parar de paginar quando a carta aparece.
  - **O termo de busca do set é o nome em INGLÊS**, tirado da linha `en` do mesmo set e número. A Liga escreve `Wondrous Patch` onde o nosso catálogo em pt escreve `Fragmento Encantado` — buscar em português devolveria zero nas cartas de Treinador, e zero é indistinguível de "não tem à venda". O nome em pt entra só como segunda tentativa, quando a primeira não achou.
  - **Camada 2 (ofertas por loja): construída e DESFEITA em 2026-09-16. Não reconstrua sem pedido explícito do mantenedor.** Ela funcionava — a página de carta traz o estoque por loja no próprio HTML (`cards_stock`/`cards_stores`), 262 ofertas em 152 lojas numa requisição, e a escada de extra resolveu 31 cartas do MEG batendo linha a linha com um cálculo independente. Foi removida por decisão do mantenedor no mesmo dia, e os motivos valem mais que o código:
    - **A organização por loja é deles, não nossa.** A "Otimizar minha Lista de Compras" roda sobre o marketplace inteiro e com o preço real; nós víamos uma fatia e **nem preço por loja tínhamos** (o preço por oferta vem codificado num sprite de CSS, e a decisão foi não desfazer essa ofuscação).
    - **Dividir a lista por variante piorava o frete.** Como o seletor de Extras deles vale para a lista inteira, pedir Reverse Foil numa carta e normal em outra exigia duas listas — e duas listas viram **duas otimizações de loja independentes** lá dentro, que é o oposto do objetivo que originou a frente.
    - **Não ficava fluido:** duas colagens, dois ajustes de seletor, mais um passo de "buscar variantes" antes.
    - Consequência aceita: **não há preferência por Reverse Foil.** Ela é incompatível com lista única, e lista única é o que faz a otimização deles funcionar.
    - O código saiu inteiro (migration `0016` derruba as tabelas).
- **Fase 7 (LigaPokemon):** dois fluxos distintos, que **não compartilham formato**. **Subir a coleção** foi aprendido em 2026-08-29 de dois exports reais do site (`lib/dominio/exportacao-liga.ts`). A **Compra por Lista** foi aprendida em **2026-09-16**, do que a tela logada instrui: `[Quantidade] [Card]`, ex. `2 Charizard (1/111)`.
  - **Uma lista só, e isso é decisão, não simplificação.** Ver a camada 2 acima: agrupar por variante quebra a otimização de lojas deles.
  - **Duas coisas do formato NÃO foram verificadas** contra uma colagem real, e estão declaradas como incertas em `exportacao-lista-compra.ts`: o zero à esquerda (mandamos `003`, como a busca deles devolve) e o desempate de edição (`(003/132)` não diz `MEG`). Não converta essas incertezas em afirmação sem uma colagem que as responda.
- Qualquer mudança nas oito regras de negócio ou na tabela de stack.
- Qualquer coisa que exponha o sistema fora da rede local.
- Migration destrutiva sobre dados reais de coleção (drop/alter que perde coluna preenchida).

## A app é HTTP na rede local — o que isso proíbe no navegador

A app é aberta por `http://<ip-da-máquina>:3010`, não por `localhost`. Nesse endereço o navegador **não** está em *secure context*, e toda API marcada como "secure context only" simplesmente não existe: `navigator.clipboard` é `undefined`, e chamá-la estoura antes de fazer nada.

Foi assim que o botão "Copiar" das listas nasceu quebrado em 2026-09-16 — funcionava em `localhost` no servidor e não funcionava na tela de quem abria pelo IP. A queda para `document.execCommand("copy")` vive em `app/_componentes/copiar-texto.ts`; use-a em vez de chamar a Clipboard API direto. A mesma restrição vale para geolocalização, notificações, service worker e afins.

## Definição de pronto

Uma fase só está pronta quando: os critérios de aceite daquela fase na spec passam; `pnpm typecheck`, `pnpm lint` e `pnpm test` passam; as regras de negócio tocadas têm teste; e a app sobe via `docker compose up -d --build` sem intervenção manual.

## Fora de escopo — não construa

Deck building e legalidade de formato; controle de venda, negociação e trade; scanner de carta por foto; multiusuário e login; app nativo.
