# Coleção Pokémon

Um catálogo da sua coleção **física** de cartas Pokémon, que roda na sua máquina. Você sobe dois
containers, abre o navegador e começa a digitar o que tem na caixa — o catálogo de 47.720 cartas já
vem junto e carrega sozinho no primeiro boot.

A pergunta que ele existe para responder não é "quanto eu tenho", é **"o que está faltando"**.

<!-- Screenshots entrariam aqui: home, cadastro rápido por set, grade de uma coleção e a lista do que falta. -->

---

## Disclaimer

**Este é um projeto de fã, sem nenhum vínculo com a Nintendo, a Creatures Inc., a GAME FREAK inc. ou
The Pokémon Company International.** Não é um produto oficial, não é endossado por nenhuma delas e
não tem relação com a LigaPokemon, a TCGdex ou o mypcards além de ler dados públicos que eles
publicam.

Pokémon, os nomes das cartas, dos Pokémon e das expansões, as artes e todas as marcas relacionadas
são propriedade dos seus respectivos donos. **Este repositório não redistribui arte de carta**: as
imagens são carregadas na hora de exibir, direto da fonte, pela instalação de quem usa (ver
[Imagens das cartas](#imagens-das-cartas)).

É uma ferramenta pessoal, de uso não comercial, para organizar uma coleção que já existe em papel.
Nada aqui serve para vender, avaliar profissionalmente ou reproduzir carta.

---

## O que é, e para quem

É um sistema **local, de um usuário só, sem login**, feito para quem tem cartas Pokémon em casa,
guardadas em fichário ou caixa, e quer saber o que tem e o que falta.

Serve bem para quem:

- está montando uma **Pokédex** (uma vaga por espécie) e quer a lista do que ainda não entrou;
- está fechando uma **expansão** carta a carta e precisa saber quais números faltam;
- tem repetidas espalhadas e quer separar o que dá para trocar;
- gosta de ter o dado em casa, num Postgres que é seu, em vez de numa planilha ou num serviço que
  pode fechar.

Não serve para quem quer um site público, multiusuário, ou controle de venda e negociação.

### O que ele faz

- **Cadastro rápido por set** — escolhe a expansão, marca a grade inteira de cartas e envia de uma
  vez. É o caminho para digitar uma coleção grande sem morrer no meio.
- **Cadastro por busca** — para carta avulsa, por nome, set ou número.
- **Inventário** com busca e filtros: set, idioma, raridade, variante, condição, graded, localização,
  alocada ou livre.
- **Coleções** de três tipos: Pokédex, set completo ou customizada. Cada uma tem grade de vagas,
  alocação de cópias e **a lista do que falta** — que é a saída principal do sistema.
- **Repetidas** — o que sobra para troca, com total, alocadas e livres por carta.
- **Visão geral** — totais e distribuição por expansão, raridade, idioma, condição e variante, mais o
  progresso de cada coleção.
- **Sinalização de melhoria** — quando entra uma cópia melhor que a que está na vaga (raridade,
  idioma, variante), o sistema avisa. Ele nunca troca sozinho: a decisão é sempre sua.
- **Preços da LigaPokemon** — consulta opcional, para montar a lista do que comprar. Leia
  [a seção dedicada](#preços-da-ligapokemon) antes de ligar.
- **Exportação** — inventário em CSV, coleção no formato de importação da LigaPokemon e lista de
  compra pronta para colar.

---

## Requisitos

- **Docker Engine** com o plugin **Compose v2** (`docker compose`, sem hífen). É tudo que a
  aplicação precisa para rodar.
- **Node.js 22+**, só se você for rodar os comandos `pnpm` na sua máquina — testes, lint e
  typecheck. Para apenas usar o sistema, não é necessário.
- Alguns GB de disco entre imagens Docker, catálogo e banco.

---

## Instalação do zero

### 1. Clone o repositório e entre na pasta

```bash
git clone <url-do-repositório> colecao-pokemon
cd colecao-pokemon
```

### 2. Habilite o pnpm (opcional)

```bash
corepack enable pnpm
```

O `corepack` vem junto com o Node 22 e instala a versão de pnpm fixada no `package.json`. **Só é
necessário para rodar comando `pnpm` fora do container** (testes, lint). A imagem Docker faz isso por
conta própria — se você só quer usar o sistema, pule este passo.

Se der `EACCES: permission denied` apontando para `/usr/bin/pnpm`, é porque o seu Node está instalado
para o sistema inteiro e o `corepack` tenta escrever num diretório do root. Use `sudo corepack enable
pnpm`, ou instale numa pasta sua que esteja no `PATH`:

```bash
corepack enable --install-directory ~/.local/bin pnpm
```

### 3. Crie o `.env`

```bash
cp .env.example .env
```

Abra o `.env` e troque `troque-esta-senha` pela sua senha. **Ela aparece em dois lugares** —
`POSTGRES_PASSWORD` e, de novo, dentro da `DATABASE_URL`. Os dois precisam bater, ou o banco sobe com
uma senha e a aplicação tenta entrar com outra:

```dotenv
POSTGRES_PASSWORD=a-sua-senha
DATABASE_URL=postgresql://colecao_pokemon:a-sua-senha@db:5432/colecao_pokemon
```

O `db` na URL é o nome do serviço do banco dentro do Compose, não um host seu — não troque.

O resto do arquivo é opcional, já vem comentado e explica o motivo de cada variável.

### 4. Suba

```bash
docker compose up -d --build
```

A primeira vez demora: ela baixa as imagens base, instala as dependências e compila a aplicação. Nas
seguintes é questão de segundos.

Se a subida parar com `Bind for 0.0.0.0:3010 failed: port is already allocated`, a porta 3010 já está
ocupada por outra coisa na sua máquina. Escolha outra no `.env` e suba de novo — é o único lugar que
precisa mudar:

```dotenv
PORTA_HOST=3011
```

Na subida, o container aplica as migrations e, **se o catálogo estiver vazio, carrega as 47.720
cartas do arquivo versionado em `seed/`** — sem nenhuma requisição de rede. Para acompanhar:

```bash
docker compose logs -f app
```

Você vai ver `Migrations aplicadas.`, depois `[entrypoint] verificando catálogo...` e, no primeiro
boot, o carregamento do catálogo. A pasta `.dados/` que já vem no clone é o ponto de montagem opcional
do clone de dados da TCGdex — pode ignorá-la, e o porquê de ela existir está
[mais abaixo](#catálogo-da-tcgdex-a-partir-de-um-clone-local).

### 5. Abra

- Na própria máquina: **http://localhost:3010**
- De outro aparelho na mesma rede local: `http://<ip-da-máquina>:3010`

(Se você trocou `PORTA_HOST` no passo anterior, use a porta que escolheu.)

Não há tela de login, porque não há login. O primeiro lugar para ir é **Cadastro rápido por set**.

### Para parar e para voltar

```bash
docker compose stop      # para, mantendo os dados
docker compose up -d     # volta
```

---

## O catálogo já vem pronto

O que faz uma instalação nova nascer útil é o diretório `seed/`: o catálogo inteiro — 47.720 linhas
em português, inglês e japonês — versionado como um CSV comprimido de ~1 MB.

**Isso é o ponto do projeto.** Sem ele, uma instalação nova começaria com o banco vazio e precisaria
de horas de sincronização contra a API da TCGdex — que já bloqueou o IP deste projeto uma vez, por
excesso de requisições — ou do download de um clone de ~220 MB do repositório de dados deles. Com
ele, o primeiro boot é offline e termina em minutos.

O carregamento é automático e acontece **só quando o catálogo está vazio**: instalação que já tem
catálogo não é tocada. Para recarregar à mão, a qualquer momento:

```bash
docker compose exec app pnpm seed:catalogo
```

É idempotente — faz upsert por carta e idioma, **nunca apaga** e nunca marca carta como inativa.
Rodar duas vezes não duplica linha nem altera contagem. Como regerar os arquivos quando saírem
expansões novas, e o porquê de cada detalhe do formato, está em
[`seed/README.md`](./seed/README.md).

Para buscar lançamentos direto do upstream, existe o sync incremental:

```bash
docker compose exec app pnpm sync:catalogo
```

Ele é um cliente educado por obrigação: teto de requisições por segundo, concorrência limitada,
User-Agent identificado, e aborta tudo na hora se levar bloqueio. Não aumente esses números sem
saber o que está fazendo — ver `AGENTS.md`.

### Catálogo da TCGdex a partir de um clone local

Os comandos `pnpm importar:catalogo-repo`, `pnpm importar:tipos-catalogo` e
`pnpm preencher:serie-id-ocidental` leem os dados de um clone do
[repositório de dados da TCGdex](https://github.com/tcgdex/cards-database) em vez da API. Com o seed
acima, esse caminho ficou raro — ele existia para trazer o catálogo japonês, que agora já vem junto —
mas continua disponível para quem quiser dados direto do upstream sem tocar na API.

O `compose.yaml` monta esse clone em `/upstream-dados-tcgdex`, e o caminho no host vem de
`TCGDEX_REPO_HOST_PATH`. **O recomendado é clonar onde você quiser e apontar a variável:**

```bash
git clone --depth 1 https://github.com/tcgdex/cards-database.git ~/tcgdex-cards-database
# no .env:
# TCGDEX_REPO_HOST_PATH=/home/voce/tcgdex-cards-database
```

São cerca de 220 MB, e o clone não é atualizado sozinho — rode `git pull` nele quando quiser dados
mais novos.

#### Por que existe uma pasta `.dados/tcgdex-cards-database/` vazia no repositório

Porque o default do mount aponta para ela, e **bind mount que não existe é criado pelo daemon do
Docker, que roda como root**. Se a pasta não viesse no clone, toda instalação ganharia um diretório
`root:root` dentro do projeto — e um `rm -rf` no projeto, no dia da desinstalação, falharia com
`Permission denied` sem `sudo`. Versioná-la vazia faz o dono ser você.

O efeito colateral é que `git clone` recusa diretório não-vazio, então não dá para clonar o
repositório da TCGdex direto ali sem antes apagar o `.gitkeep`. É por isso que o caminho recomendado
acima é a variável de ambiente.

---

## Imagens das cartas

A arte de cada carta é carregada **na hora de exibir, direto do CDN da TCGdex**. Nenhum byte de
imagem está neste repositório e nenhum é copiado para o seu banco por padrão.

Uma minoria de cartas não tem foto em fonte nenhuma da TCGdex — sets inteiros de energia, promos e
galerias que nunca foram digitalizados lá. Para essas existem dois caminhos, ambos manuais e
opcionais:

- **mypcards como fonte secundária.** Você cola, na tela, o link do set no site deles; a partir daí
  o comando abaixo baixa as fotos das suas cartas para um volume Docker local, e a tela marca a
  origem com um selo. O mapeamento de sets já conhecido vem no seed.

  ```bash
  docker compose exec app pnpm baixar:imagens-mypcards
  ```

- **Upload seu.** Você envia a sua própria foto para a carta.

Nos dois casos os arquivos ficam no volume `imagens_locais`, na sua máquina, fora do repositório.

---

## Preços da LigaPokemon

O sistema pode consultar a [LigaPokemon](https://www.ligapokemon.com.br/) para montar a lista do que
comprar: para cada vaga vazia da sua coleção, quais cartas estão à venda e por quanto. É opcional e
só roda quando você pede.

### O ritmo padrão obedece o robots.txt deles

O intervalo entre duas requisições **não é escolhido por este projeto**: é o `Crawl-delay` declarado
no `robots.txt` da LigaPokemon, lido ao vivo e respeitado como está escrito. Hoje esse valor é
**360 segundos**. Se eles afrouxarem, você se beneficia no mesmo dia; se apertarem, você obedece no
mesmo dia. Falha na leitura — rede fora, 5xx, arquivo malformado — cai no valor conservador, nunca no
agressivo.

Só as rotas que o arquivo deles permite são acessadas (`cards/search` e `cards/card`), e isso é
verificado antes de cada requisição sair. O arquivo pode acrescentar proibição; nunca liberar o que
está cravado no código.

### O custo disso é tempo, e é muito tempo

Uma varredura completa de uma Pokédex passa por cerca de 161 vagas vazias. A 360 segundos por
requisição, **isso leva por volta de 16 horas**.

O projeto foi construído para essa escala: a varredura roda em segundo plano, grava a cada vaga
consultada e, ao ser disparada de novo, **pula o que já foi consultado nas últimas 24 horas**.
Reiniciar o container no meio não faz recomeçar do zero — você clica de novo e ele continua de onde
parou. A tela mostra vagas consultadas, restantes e previsão de término.

### Se você quiser ir mais rápido, a decisão é sua

```dotenv
LIGA_INTERVALO_SEGUNDOS=3
```

Definindo essa variável no `.env`, vale o valor que você informar, e a escolha passa a ser sua.

Registro honesto de quem mantém o projeto: **3 segundos é o valor que este projeto usou no dia a dia,
sem problema.** É mais devagar do que o próprio navegador geraria abrindo as mesmas páginas — uma
página no browser puxa dezenas de imagens e scripts que o coletor não puxa — e é mais rápido do que o
arquivo deles pede.

Isso é a experiência de **uma** instalação, não uma promessa e não uma recomendação. Baixar o
intervalo é decisão e risco de quem configura, e o risco concreto é bloqueio de IP: este projeto já
levou um da TCGdex, por pressa, antes de o limitador existir. O padrão do repositório continua sendo
obedecer o arquivo, porque distribuir uma ferramenta que desobedece por padrão seria transferir para
quem instala um risco que essa pessoa não escolheu.

---

## O que este projeto **não** é

- **Não tem autenticação.** Nenhuma. Não há login, senha de usuário nem sessão, e isso é decisão de
  projeto, não pendência aberta.
- **É de um usuário só.** Não existe multiusuário, perfil ou separação de dados por pessoa. Quem
  abre a página vê e edita tudo.
- **Não foi feito para a internet.** Ele é para a sua rede local. Publicar essa porta na internet
  entrega a sua base de dados a qualquer um que encontre o endereço. Se você precisa de acesso
  remoto, use VPN — não abra a porta no roteador.
- **Não é um serviço, e não tem suporte.** É um projeto pessoal, aberto porque pode ser útil a mais
  gente. Não há SLA, não há garantia de resposta e não há compromisso de compatibilidade entre
  versões. A licença MIT diz isso em termos jurídicos; este parágrafo diz em português.
- **Não faz deck building, venda, negociação, escaneamento de carta por foto nem aplicativo nativo.**

### Os seus dados são seus, e o backup também

A sua coleção e as suas imagens vivem em volumes Docker (`pgdata` e `imagens_locais`), **fora do
repositório**. Nada disso entra no git em momento nenhum. Em compensação, `git pull` não faz backup
de nada: cuidar desses volumes é responsabilidade de quem instala.

Um dump do banco, com o Compose no ar:

```bash
docker compose exec -T db pg_dump -U colecao_pokemon colecao_pokemon > backup.sql
```

(Troque o usuário e o banco se você mudou os valores no `.env`.)

---

## Desenvolvimento e contribuição

Contribuição é bem-vinda. O caminho curto:

```bash
corepack enable pnpm
pnpm install
pnpm exec next typegen   # gera os tipos de rota do Next; sem isso o typecheck falha
pnpm typecheck
pnpm test
pnpm lint
```

As regras de negócio vivem em módulos puros e **os testes não precisam de banco** — rodam em
segundos, num checkout limpo.

Antes de abrir um PR, leia [`CONTRIBUTING.md`](./CONTRIBUTING.md) para o processo e
[`AGENTS.md`](./AGENTS.md) para o contrato de engenharia. O `AGENTS.md` é escrito também para
assistentes de código: se você usa um, aponte-o para lá antes de pedir a mudança.

---

## Licença e créditos

O código é MIT — ver [`LICENSE`](./LICENSE).

O catálogo de cartas em `seed/` é obra derivada do repositório de dados da **TCGdex**, também MIT, e
a atribuição que a licença deles exige está em [`NOTICE.md`](./NOTICE.md), junto do crédito ao
**mypcards** pelo mapeamento de imagens. Leia o `NOTICE.md` antes de redistribuir este repositório.
