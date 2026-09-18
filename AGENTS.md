# AGENTS.md — Coleção Pokémon

Sistema de catalogação de coleção física de cartas Pokémon. Local, rede interna, um único usuário,
sem autenticação.

**Este arquivo é o contrato de engenharia do repositório**, e é escrito principalmente para a IA de
quem for contribuir: leia-o inteiro antes de escrever uma linha. Ele não é documentação de
apresentação — para isso existe o [README](./README.md) —, é a lista do que não pode ser quebrado e
do porquê. Boa parte destas regras foi aprendida errando; reverter uma delas por elegância custa
mais do que parece.

Ele é **autocontido**. Não existe documento externo a consultar: se uma regra aqui não estiver
completa, o bug é deste arquivo, e corrigi-lo faz parte do PR.

> **Nota sobre `spec §N` nos comentários do código.** Vários comentários citam seções de uma
> especificação funcional que **não faz parte deste repositório**. Trate a citação como marca
> histórica, não como referência a seguir: o que o comentário explica tem que se sustentar sozinho.
> Se você precisar da tal seção para entender a decisão, o comentário está incompleto — melhore o
> comentário, não vá procurar o documento.

---

## Regras de negócio invioláveis

Estas oito regras são o produto. Se uma mudança de código quebrar qualquer uma delas, a mudança está
errada — não a regra.

1. **Alocação exclusiva.** Uma cópia ocupa no máximo uma vaga, em uma coleção só. Garantido por
   constraint de unicidade no banco, não apenas na aplicação.
2. **Elegibilidade da Pokédex.** Só carta com **exatamente um** `dexId` ocupa vaga de Pokédex. Tag
   team e carta multi-Pokémon são inelegíveis.
3. **Formas não desdobram a vaga.** Raichu de Alola e Raichu disputam a vaga 26. A forma é exibida,
   nunca cria vaga nova.
4. **Set conta a numeração oficial** (`cardCount.official`). A flag "incluir secretas" na coleção
   troca para `cardCount.total`.
5. **A seleção é sempre do usuário.** O sistema sugere candidatos elegíveis; nunca preenche vaga
   sozinho.
6. **Vaga vazia é saída de primeira classe.** Toda coleção Pokédex ou Set expõe a lista do que falta.
   É a razão de o sistema existir.
7. **Idioma da cópia é o idioma da carta física**, independente da linha de catálogo que a
   identifica. A linha de catálogo responde "que carta é esta"; a cópia responde "como é a minha".
   Nunca amarre um ao outro — 33 sets não têm carta a carta em pt no upstream, e existem cartas
   físicas em português desses sets.
8. **Troca é atômica, e melhoria é sinalização.** Substituir a cópia de uma vaga acontece numa
   transação só (`trocarCopiaDaVaga`): a vaga nunca fica vazia por causa de uma troca que falhou no
   meio — e dentro dela a recusa sai por exceção, nunca por `return`, que fecharia a transação com
   sucesso. O sistema sinaliza a melhoria e espera o clique; nunca troca sozinho (é a regra 5
   aplicada à vaga já preenchida). A escada (raridade > idioma > variante, `promo` fora) vive em
   `lib/dominio/melhoria-vaga.ts` e **não é traduzida para `CASE` em SQL** — o SQL casa os pares, o
   módulo puro decide.

---

## O que nunca entra no repositório

Três proibições absolutas. Um PR que traga qualquer uma delas é recusado sem discussão de mérito,
porque nenhuma delas é desfeita por `git revert`: o dado já estaria no histórico público.

1. **Nenhum dado de coleção.** `copia`, `colecao`, `vaga`, `escolha_compra` e as tabelas de preço são
   de quem instalou o sistema. Não vão para o repositório em forma nenhuma — nem agregada, nem
   anonimizada, nem como fixture "só para testar". Teste que precisa de dado usa dado inventado no
   próprio teste.
2. **Nenhum byte de imagem de carta**, e nenhuma referência de imagem por carta. As imagens vêm do
   CDN na hora de exibir, ou são baixadas por cada instalação para um volume Docker local. Uma lista
   de imagens já baixadas diria quais cartas quem gerou o arquivo tem em casa — é dado de coleção
   entrando pela porta dos fundos.
3. **Nenhum nome de pessoa, e-mail, IP, hostname ou caminho de máquina** em código, comentário,
   mensagem de commit ou documento. Isto é deliberado e foi feito uma vez, a mão, no repositório
   inteiro. Comentário narrativo continua valendo — o que muda é o sujeito: escreva "decisão de
   2026-09-02", não o nome de quem decidiu; "o usuário forneceu a foto", não quem forneceu.

O git não cobre os dados: o banco e os bytes das imagens vivem em volumes Docker, fora do
repositório, e o backup deles é responsabilidade de quem instala.

---

## Stack — decidida, não reabrir

| Item | Decisão |
|---|---|
| Framework | Next.js (App Router) + TypeScript estrito |
| Banco | PostgreSQL 17 |
| ORM / migrations | Drizzle + drizzle-kit (SQL-first: migration é SQL legível e revisável) |
| UI | Tailwind CSS |
| Pacotes | pnpm |
| Testes | Vitest para as regras de negócio; sem e2e |
| Runtime | Docker Compose |
| Porta da app | **3010** no host por padrão, trocável por `PORTA_HOST` no `.env` (3000 fica livre para outros serviços) |
| Porta do banco | **não publicar no host** — só na rede interna do Compose |
| Auth | nenhuma. Rede local, usuário único. Não implementar login. |

Se uma decisão dessa tabela precisar mudar, **pare e abra uma issue** — não troque por conta própria
dentro de um PR sobre outro assunto.

---

## Ambiente e comandos

O que a sua máquina precisa ter: **Node.js 22 ou mais novo**, para os comandos `pnpm`, e **Docker
Engine com o plugin Compose v2**, para subir a aplicação. Nada além disso, e nada específico de uma
máquina em particular — se um passo só funciona no seu computador, ele está errado.

O `pnpm` não se instala à parte: vem com o Node, pelo corepack, na versão fixada no `package.json`.

```bash
corepack enable pnpm            # pré-requisito, uma vez só
pnpm install --frozen-lockfile
pnpm exec next typegen          # OBRIGATÓRIO antes do primeiro typecheck — ver abaixo
pnpm typecheck                  # tsc --noEmit
pnpm test                       # Vitest
pnpm lint
pnpm db:generate                # gera migration a partir do schema Drizzle
pnpm db:migrate                 # aplica migrations
pnpm seed:catalogo              # carrega o catálogo versionado de seed/
pnpm sync:catalogo              # sincroniza o catálogo TCGdex (pt, en e jp) — incremental
pnpm sync:catalogo --profundo   # revisita todo set carta a carta (~2h30)
docker compose up -d --build
```

**`pnpm exec next typegen` antes do `typecheck`, sempre.** `LayoutProps` e os outros tipos de rota
são gerados pelo Next em `.next/types/`, que é gitignorado. Num checkout limpo, `pnpm typecheck` sem
o typegen falha com `Cannot find name 'LayoutProps'` — e o erro parece culpa de quem contribuiu,
quando é só uma etapa faltando. O CI roda o typegen por isso.

Os testes **não precisam de banco**: as regras de negócio são módulos puros. Teste que exija Postgres
no ar está no lugar errado.

Migrations são aplicadas na subida do container, antes de a app servir tráfego. O `scripts/migrate.mjs`
filtra os avisos informativos do Postgres (NOTICE/INFO/DEBUG/LOG) para um resumo de uma linha, porque
o `DROP ... CASCADE` da migration `0016` despejava um objeto que parece erro no primeiro boot. Isso é
filtro de aviso, não de erro: falha de migration continua caindo no `catch` e saindo com código 1, e
**envolver o `migrate` num `catch` vazio seria o jeito errado de calar qualquer ruído** — o container
subiria com o schema pela metade e ninguém ficaria sabendo.

---

## Empacotamento da imagem — `tsx` é dependência de runtime

A imagem é única e deliberadamente "gorda": `pnpm install` completo, sem `--prod`, sem o `standalone`
do Next e sem multi-stage que descarte `node_modules`.

**Isso não é desleixo, é requisito.** O `docker/entrypoint.sh` roda, em runtime e fora do bundle do
servidor, `scripts/migrate.mjs` (migrations) e `scripts/seed-catalogo.ts` (carga do catálogo no
primeiro boot) — e o segundo é TypeScript, executado por `./node_modules/.bin/tsx`. Os comandos
operacionais (`sync:catalogo`, `baixar:imagens-mypcards`, os backfills) são todos `tsx` também, e
rodam por `docker compose exec app`.

Um PR de "enxugar a imagem" com `pnpm install --prod`, com `output: "standalone"` ou com um estágio
final que copie só o `.next` **quebra o seed e o sync**, e quebra do jeito pior: o build passa, o
container sobe, e o primeiro boot de uma instalação nova termina com o catálogo vazio. Se você quiser
mexer nisso, o teste é subir um Compose do zero, com volume novo, e conferir as 47.720 cartas no
banco — não é o `docker build` passar.

---

## Convenções de código

- Português nos nomes de domínio (`copia`, `colecao`, `vaga`, `carta_catalogo`); inglês no que é
  infraestrutura (`createServer`, `handler`). O vocabulário do domínio é o das oito regras acima —
  não traduza `vaga` para `slot` no meio do código.
- Regras de negócio ficam em módulos puros e testados (`lib/dominio/`), fora de componentes React e
  de route handlers. **As oito regras acima precisam ser testáveis sem banco.**
- Sem `any`. Sem `@ts-ignore` sem comentário justificando.
- Nada de segredo commitado. Configuração por `.env`, com `.env.example` versionado e comentado.
- **Comentário explica o porquê, não o quê.** O código deste repositório é comentado acima da média,
  de propósito: quase toda decisão não óbvia tem um parágrafo dizendo o que foi medido e o que foi
  descartado. Mantenha o padrão; apagar esses comentários é apagar o motivo.
- Commits pequenos, mensagem em português, no imperativo: `adiciona sync do catálogo TCGdex`.

---

## Contrato do sync de catálogo

- Base: `https://api.tcgdex.net/v2/<idioma>/` — sem chave.
- **Código de idioma na URL é ISO**: o japonês é `ja`, não `jp`. Nosso enum de banco usa `jp` e tem
  dado real gravado — traduza em `codigoIdiomaUpstream`, **nunca renomeie o enum**.
- **Cliente educado — regra dura, aprendida do jeito caro.** Em agosto de 2026 o sync rodou ~35.000
  requisições com 40 em paralelo e sem teto de taxa; a TCGdex bloqueou o IP no firewall deles
  (connection refused para nós, 200 para o resto do mundo). Portanto:
  - Teto global de requisições por segundo no cliente (`lib/sync/limitador.ts`), padrão 6/s.
    Concorrência limita o que está em voo; só o limitador limita o que parte por segundo.
  - Concorrência padrão 4 (cartas) e 2 (sets). **Não subir sem motivo declarado.**
  - User-Agent identificando o cliente em toda requisição. Cliente anônimo em volume é o primeiro a
    ser bloqueado.
  - **Bloqueio aborta o sync inteiro na hora** (`ErroBloqueioUpstream`), sem retry e sem drenar a
    fila — insistir renova o bloqueio. 429, 403 e falha de socket (`ECONNREFUSED`/`ECONNRESET`) são
    bloqueio; 5xx e timeout são transitórios (retry); 404 é permanente (pula o item).
- Fluxo: `GET /sets` → para cada set, `GET /sets/{id}` (traz a lista de cartas) → materializa em
  `carta_catalogo`.
- **Incremental por padrão.** `GET /sets/{id}` já devolve os ids das cartas do set; se essa lista bate
  com as cartas ativas que temos gravadas, o set é pulado e nenhuma requisição de detalhe é feita —
  só um UPDATE local que atualiza os metadados de set e renova `atualizado_em`
  (`tocarSetInalterado`). Rodada sem lançamento cai de ~53.000 requisições para ~470.
  `pnpm sync:catalogo --profundo` (ou `SYNC_PROFUNDO=1`) revisita tudo carta a carta; é o único jeito
  de capturar correção de metadado numa carta que já existe, e leva ~2h30 nos três idiomas.
- **Set pulado nunca pode ser inativado.** Duas proteções independentes, e ambas devem continuar
  existindo: o toque renova o relógio das linhas, e `decidirInativacaoCatalogo` exclui os sets
  pulados do UPDATE. Sem isso, uma rodada normal marcaria o catálogo inteiro como inativo em
  silêncio, com cópias reais apontando para essas linhas.
- **Idempotente:** rodar duas vezes seguidas não pode duplicar linha nem alterar contagem. Chave:
  (`id`, `idioma`).
- **Nunca apaga.** Carta que sumir do upstream é marcada (`ativa = false`), não deletada — pode haver
  cópia do usuário apontando para ela.
- **Nunca bloqueia o uso.** A app lê sempre a tabela local. Se a API estiver fora, o sync falha e
  registra erro; a app continua funcionando com o último estado.
- **Não sincroniza a série `Pokémon TCG Pocket`** (jogo digital, não existe em papel). Nada de
  digital entra no catálogo.
- `forma` é derivada do nome da carta por tabela de normalização (ex.: "de Alola" → `alola`). Nome que
  não casar com nenhum padrão vira `normal` — nunca chute.

### Seed do catálogo

`seed/carta-catalogo.csv.gz` e `seed/set-mypcards.csv` são o que faz uma instalação nova nascer útil,
e obedecem **o mesmo contrato do sync**: upsert por (`id`, `idioma`), nunca apaga, nunca inativa,
zero rede.

Duas colunas ficam de fora do UPDATE do upsert, de propósito: `ativa` (carta que o sync inativou
continua inativa) e `origem` (linha criada à mão pelo usuário, `origem = manual`, jamais é rebaixada
para `sync`, o que a exporia à inativação). Não "simplifique" isso para um upsert que atualiza tudo.

Falha do seed **não derruba a app**: o entrypoint usa `if !` justamente para o `set -e` não matar o
container. O formato dos arquivos, a regeração e o porquê de cada detalhe estão em
[`seed/README.md`](./seed/README.md) e em `lib/dominio/seed-catalogo.ts`.

---

## Coletor de preço da LigaPokemon — regras duras

A fonte é a **LigaPokemon**, lida pela busca pública do site (`lib/liga/cliente.ts`).

- **Ritmo: o `robots.txt` deles manda.** O intervalo entre requisições é o `Crawl-delay` lido **ao
  vivo** do `robots.txt` da LigaPokemon (`lib/liga/ritmo.ts`), hoje 360 s, com jitter. Não fixe o
  número no código: se eles afrouxarem, todo mundo se beneficia; se apertarem, todo mundo obedece.
  Cache de 15 minutos, e **falha na leitura cai no valor conservador, nunca no agressivo** — cache
  vencido que não pôde ser renovado também cai no conservador. `LIGA_INTERVALO_SEGUNDOS` sobrepõe: é
  escolha explícita de quem instalou, documentada no `.env.example` e no README.
  **Não baixe o padrão e não aumente o ritmo por conta própria**, e não aceite PR que faça isso. O
  padrão é conformidade, não preferência: é ele que permite distribuir a ferramenta sem transferir
  risco para quem a instala.
- **Nada pode dobrar o ritmo pelas costas.** A janela que declara uma rodada morta é **derivada do
  intervalo**, não um número fixo: com um valor fixo de 120 s, a 360 s toda rodada viva seria
  declarada morta — e rodada morta libera uma segunda em paralelo, dobrando as requisições contra o
  site deles. Pelo mesmo motivo o polling da tela é `clamp(intervalo × 250 ms, 5 s, 60 s)`, e não um
  número fixo. Qualquer constante de tempo nova nesse caminho tem que sair do intervalo.
- **Só `cards/search` e `cards/card`.** O `robots.txt` proíbe `cards/pricehistory`, `bzr/`,
  `colecao/` e `ecom/`; nada no código toca nelas, e nada deve passar a tocar. A garantia é checada
  antes de cada requisição sair (`exigirRotaPermitida`), com uma lista fixa **mais** o que o arquivo
  lido disser — o arquivo pode acrescentar proibição, nunca remover a que está cravada. Arquivo fora
  do ar não equivale a "pode tudo".
- **Varredura nova não refaz o que já tem.** A 360 s uma Pokédex leva ~16 horas, e nessa escala
  reinício de container é rotina. Vaga com opção gravada nas últimas 24 h é pulada
  (`lib/dominio/frescor-consulta.ts`), então disparar de novo continua de onde parou. O filtro vive
  em `vagasParaVarrer`, não em `listarVagasVazias*`: a tela continua listando toda vaga vazia.
  **Não transforme isso em fila, worker ou job que retoma sozinho na subida do container** — foi
  deixado de fora de propósito.
  Ponto cego conhecido e declarado no código: vaga consultada que não achou oferta não grava linha,
  logo não tem idade e é reconsultada. Fechar isso exigiria migration; o erro é para o lado seguro.
- **Bloqueio aborta a rodada**, sem retry (`ErroBloqueioLiga`).
- **A tela lê snapshot, nunca o site.** Consulta ao vivo na renderização vira dezenas de requisições
  por abertura de página.
- **Nada de cotação de câmbio.** Não converta preço internacional e não o exponha como se fosse valor
  de mercado brasileiro.
- **`liga_edicao.set_id` nunca é preenchido por palpite** — edição vinculada errado aponta preço de um
  set para carta de outro.
- **O termo de busca do set é o nome em INGLÊS**, tirado da linha `en` do mesmo set e número. A Liga
  escreve `Wondrous Patch` onde o nosso catálogo em pt escreve `Fragmento Encantado`; buscar em
  português devolveria zero nas cartas de Treinador, e zero é indistinguível de "não tem à venda". O
  nome em pt entra só como segunda tentativa.
- **Não existe listar a edição inteira — medido, não suposto.** Qualquer filtro de edição no termo da
  busca (`ed=PFL`, `edid=738`, os dois juntos, exatamente como o site escreve o próprio link) faz a
  página trocar para renderização por JavaScript e voltar sem nenhuma linha de carta no HTML. Só a
  busca por **nome** responde HTML. Não vale tentar de novo.

### Triagem de compra — é durável, e não vive na varredura

A escolha do que comprar mora em `escolha_compra`. Antes ela era uma coluna de `liga_opcao`, e cada
rodada nova nascia zerada: uma triagem de 126 cartas seria apagada inteira pela atualização de preço
seguinte. O que decorre disso, e não pode ser revertido:

- A escolha é presa à **vaga**, não à rodada, e a ponte com a varredura é a `identidade` da carta
  (`lib/dominio/identidade-carta.ts`: edição + número, sem zero à esquerda). **Nunca ligue a escolha a
  um `liga_opcao.id`** — aquela linha morre com a rodada.
- **Rodada nova atualiza preço, nunca apaga escolha.** Carta que não reapareceu mantém preço e data
  da última vez: sumir calada tiraria da lista uma carta que o usuário decidiu comprar.
- **Várias cartas por vaga é permitido.** Na Pokédex a vaga é uma espécie, e o usuário pode acompanhar
  mais de uma carta do mesmo Pokémon.
- **Vaga preenchida não apaga a escolha** — só a tira da lista. A cópia saindo da vaga, ela volta.
- A marcação da grade é **derivada** da escolha. `liga_opcao.selecionada` não existe mais.
- A lista para colar existe **sem varredura nenhuma**, e é montada por `lib/liga/lista-compra.ts` — a
  mesma função para a tela e para a exportação.

### Exportação para a LigaPokemon

Dois fluxos distintos, que **não compartilham formato**: subir a coleção (aprendido de exports reais
do site, `lib/dominio/exportacao-liga.ts`) e a Compra por Lista (`[Quantidade] [Card]`, ex.
`2 Charizard (1/111)`).

Duas coisas do formato da lista de compra **não foram verificadas** contra uma colagem real, e estão
declaradas como incertas em `exportacao-lista-compra.ts`: o zero à esquerda (mandamos `003`, como a
busca deles devolve) e o desempate de edição (`(003/132)` não diz `MEG`). **Não converta essas
incertezas em afirmação** sem uma colagem que as responda.

---

## Pontos de parada — pare e devolva a decisão

Nestes casos, **pare e abra uma issue em vez de improvisar**. Nenhum deles é um bug a corrigir; são
decisões já tomadas, e reabri-las dentro de um PR sobre outro assunto é como elas se perdem.

- **Qualquer mudança nas oito regras de negócio ou na tabela de stack.**
- **Qualquer coisa que exponha o sistema fora da rede local** — auth, CORS aberto, deploy público,
  publicar a porta do banco no host.
- **Qualquer PR que suba a cadência contra a LigaPokemon ou contra a TCGdex**, mude o default para
  algo mais agressivo, ou afrouxe a checagem de rota permitida.
- **Migration destrutiva sobre dados reais de coleção** (drop ou alter que perca coluna preenchida).
- **Reconstruir a camada 2 do coletor: ofertas por loja.** Ela foi construída e **desfeita de
  propósito** em 2026-09-16. Ela funcionava — a página de carta traz o estoque por loja no próprio
  HTML, 262 ofertas em 152 lojas numa requisição —, e mesmo assim saiu. Os motivos valem mais que o
  código:
  - **A organização por loja é deles, não nossa.** A "Otimizar minha Lista de Compras" roda sobre o
    marketplace inteiro e com o preço real; nós víamos uma fatia e **nem preço por loja tínhamos** —
    o preço por oferta vem codificado num sprite de CSS, e a decisão foi não desfazer essa ofuscação.
  - **Dividir a lista por variante piorava o frete.** Como o seletor de Extras deles vale para a
    lista inteira, pedir Reverse Foil numa carta e normal em outra exigia duas listas — e duas listas
    viram duas otimizações de loja independentes lá dentro, que é o oposto do objetivo.
  - **Não ficava fluido:** duas colagens, dois ajustes de seletor, mais um passo de "buscar
    variantes" antes.
  - Consequência aceita: **não há preferência por Reverse Foil.** Ela é incompatível com lista única,
    e lista única é o que faz a otimização deles funcionar.
  - O código saiu inteiro; a migration `0016` derruba as tabelas. Se você acha que vale a pena
    reconstruir, o lugar de discutir isso é uma issue, antes de escrever código.

---

## A app é HTTP na rede local — o que isso proíbe no navegador

A app é aberta por `http://<ip-da-máquina>:3010`, não por `localhost`. Nesse endereço o navegador
**não** está em *secure context*, e toda API marcada como "secure context only" simplesmente não
existe: `navigator.clipboard` é `undefined`, e chamá-la estoura antes de fazer nada.

Foi assim que o botão "Copiar" das listas nasceu quebrado: funcionava em `localhost` na máquina de
quem desenvolveu e não funcionava na tela de quem abria pelo IP. A queda para
`document.execCommand("copy")` vive em `app/_componentes/copiar-texto.ts`; use-a em vez de chamar a
Clipboard API direto. A mesma restrição vale para geolocalização, notificações, service worker e
afins.

---

## Definição de pronto

Uma mudança só está pronta quando:

- `pnpm typecheck`, `pnpm lint` e `pnpm test` passam — com `pnpm exec next typegen` antes do
  typecheck;
- as regras de negócio tocadas têm teste, e o teste roda sem banco;
- a app sobe via `docker compose up -d --build` sem intervenção manual;
- nenhum dado de coleção, imagem de carta ou nome pessoal entrou no diff;
- o comentário que explicava a decisão que você mudou foi atualizado junto — comentário mentindo é
  pior que comentário nenhum.

---

## Fora de escopo — não construa

Deck building e legalidade de formato; controle de venda, negociação e trade; scanner de carta por
foto; multiusuário e login; app nativo.
