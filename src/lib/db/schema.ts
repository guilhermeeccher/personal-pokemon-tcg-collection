// Schema Drizzle do catálogo e da coleção física.
// Vocabulário do domínio em português, conforme AGENTS.md.
//
// Três camadas, ver spec-tecnica-colecao-pokemon.md §3:
// - carta_catalogo: o que existe no mundo (só o sync escreve).
// - copia: o que o usuário tem fisicamente.
// - colecao + vaga: como ele organiza o que tem.

import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// --- Enums ---------------------------------------------------------------

/** Idiomas suportados pelo catálogo. `jp` reservado para o futuro (spec §2). */
export const idiomaEnum = pgEnum("idioma", ["pt", "en", "jp"]);
/** Ver `carta_catalogo.origem`. */
export const origemCartaEnum = pgEnum("origem_carta", ["sync", "manual"]);

/**
 * Forma derivada do nome da carta (spec §3.1, §9). Nome que não casar com
 * nenhum padrão de `lib/dominio/forma.ts` vira `normal` — nunca é chutado.
 */
export const formaEnum = pgEnum("forma", [
  "normal",
  "alola",
  "galar",
  "hisui",
  "paldea",
  "mega",
  "gigantamax",
]);

/** Variante física de uma cópia específica (spec §3.2). */
export const varianteCopiaEnum = pgEnum("variante_copia", [
  "normal",
  "reverse",
  "holo",
  "primeira_edicao",
  "promo",
]);

/** Condição física da carta (spec §3.2). */
export const condicaoEnum = pgEnum("condicao", ["NM", "LP", "MP", "HP", "DMG"]);

/** Tipo de coleção montada pelo usuário (spec §3.3). */
export const tipoColecaoEnum = pgEnum("tipo_colecao", [
  "pokedex",
  "set",
  "customizada",
]);

/**
 * Como a imagem local de uma carta chegou ao sistema (tarefa "carta sem
 * foto", 2026-08-26). `upload` = arquivo enviado direto; `url` = colada
 * pelo usuário e baixada pelo servidor (o arquivo é armazenado — nunca
 * guardamos só a URL, que pode sumir); `mypcards` = baixada pelo script
 * a partir do CDN deles (2026-08-29).
 *
 * A distinção entre as duas primeiras e `mypcards` NÃO é decorativa: as
 * três são servidas pela mesma rota, então a URL parou de dizer de quem é
 * a foto. Só o usuário troca ou remove a dele pela tela; a do mypcards
 * é do sistema, entra abaixo do catálogo oficial na cadeia de exibição e
 * aparece marcada com selo.
 */
export const origemImagemLocalEnum = pgEnum("origem_imagem_local", [
  "upload",
  "url",
  "mypcards",
]);

// --- 3.1 carta_catalogo ----------------------------------------------------

export const cartaCatalogo = pgTable(
  "carta_catalogo",
  {
    id: text("id").notNull(),
    idioma: idiomaEnum("idioma").notNull(),

    setId: text("set_id").notNull(),
    setNome: text("set_nome").notNull(),
    setSerie: text("set_serie").notNull(),
    /**
     * Id estável da série (ex.: `sv`, `swsh`, `SM` — a caixa é a do
     * upstream, nunca normalizada). Adicionado em 2026-08-26 junto do
     * importador do catálogo japonês (scripts/importar-catalogo-repo.ts):
     * hoje só guardávamos o *nome* da série (`setSerie`), que muda por
     * idioma e faz o seletor de expansão duplicar o mesmo grupo em pt e en.
     * Nullable de propósito — coluna aditiva sobre dado real: preenchida
     * para as linhas que o importador do repositório grava; as linhas de
     * pt/en existentes ficam nulas até o sync normal (`lib/sync/catalogo.ts`)
     * passar a preenchê-la também, quando o acesso à API voltar.
     */
    setSerieId: text("set_serie_id"),
    /**
     * Sigla impressa na carta (ex.: "MEW" no 151) e data de lançamento do
     * set, ambos vindos de `abbreviation.official`/`releaseDate` no nível
     * do SET na TCGdex (confirmado ao vivo em 2026-08-25). Nullable: nem
     * todo set tem sigla oficial no upstream — nunca inventamos uma.
     * Preenchidos pelo backfill (scripts/backfill-metadados-set.ts) e,
     * dali em diante, pelo sync normal.
     */
    setSigla: text("set_sigla"),
    setLancamento: date("set_lancamento"),

    localId: text("local_id").notNull(),
    nome: text("nome").notNull(),
    categoria: text("categoria").notNull(),
    raridade: text("raridade"),

    /** Array de números da Pokédex Nacional. Vazio para Treinador/Energia. */
    dexIds: integer("dex_ids").array().notNull().default([]),

    /** Derivada do nome via lib/dominio/forma.ts — nunca escrita à mão. */
    forma: formaEnum("forma").notNull().default("normal"),

    /**
     * Quem criou esta linha: o sync/importador (`sync`) ou o usuário à
     * mão (`manual`).
     *
     * Existe porque a TCGdex não catalogou tudo: o `SMH` (GX Starter
     * Decks japonês, 131 cartas) não está lá em fonte nenhuma, e ele tem
     * um Charmander desse set — mais 68 sets japoneses sem carta a carta
     * e os sets em pt na mesma situação. Sem uma linha de catálogo, a
     * carta não pode nem ser cadastrada.
     *
     * **A linha manual mora na própria `carta_catalogo`, de propósito.**
     * Assim alocação, vaga de Pokédex, exportação, busca e imagem local
     * funcionam sem nenhum caso especial — nada no resto do sistema
     * precisa saber que ela é manual. O que precisa saber é o **sync**:
     * linha manual nunca é inativada (ver `decidirInativacaoCatalogo`),
     * porque o upstream jamais vai "devolvê-la".
     */
    origem: origemCartaEnum("origem").notNull().default("sync"),

    // Flags de variantes disponíveis para a carta (o que existe a
    // materializar), distinto da variante de uma cópia específica.
    varianteNormalDisponivel: boolean("variante_normal_disponivel")
      .notNull()
      .default(false),
    varianteReverseDisponivel: boolean("variante_reverse_disponivel")
      .notNull()
      .default(false),
    varianteHoloDisponivel: boolean("variante_holo_disponivel")
      .notNull()
      .default(false),
    variantePrimeiraEdicaoDisponivel: boolean(
      "variante_primeira_edicao_disponivel",
    )
      .notNull()
      .default(false),
    variantePromoDisponivel: boolean("variante_promo_disponivel")
      .notNull()
      .default(false),

    /**
     * Tipos da carta ("Darkness", "Fighting"…), como o upstream os
     * escreve. Preenchido por `pnpm importar:tipos-catalogo`, lendo o
     * clone local — a API não é chamada.
     *
     * Existe para a exportação da LigaPokemon, cuja coluna "Cor" é
     * exatamente isso. Vazio significa "não sabemos": Treinador e Energia
     * não têm tipo, e carta que o importador ainda não visitou também
     * fica vazia.
     */
    tipos: text("tipos").array().notNull().default([]),

    /**
     * O `dex_ids` desta linha veio por DEDUÇÃO do nome, não do upstream.
     *
     * A TCGdex publica 586 cartas de categoria Pokémon sem `dexId`
     * nenhum — o mecanismo de "Pokémon de personagem" ("Diglett da
     * Equipe Rocket", "N's Darumaka") e boa parte das `ex`/Mega
     * japonesas. Sem número, a regra 2 as mantém fora da Pokédex para
     * sempre, mesmo com a carta física na mão. O nome da espécie
     * está dentro do nome da carta, e o catálogo já sabe o número dela
     * por outras cartas: `pnpm derivar:dex-ids` liga as duas pontas.
     *
     * A marca existe para a dedução nunca se confundir com dado do
     * upstream — sem ela, daqui a alguns meses ninguém distingue.
     */
    dexIdsDerivado: boolean("dex_ids_derivado").notNull().default(false),

    imagemUrl: text("imagem_url"),

    /**
     * O arquivo desta carta existe no CDN de assets da TCGdex?
     *
     * `null` = ainda não verificado. Só interessa às linhas com
     * `imagem_url` nulo, onde a URL do CDN é montada por dedução a partir
     * de idioma/série/set/número — hoje, só o japonês (o importador do
     * repositório não traz imagem nenhuma, e lá o palpite acerta ~52%).
     *
     * Por que a coluna existe: **o CDN não devolve 404 para arquivo
     * inexistente.** Ele segura a conexão por 60 s e responde 504 (medido
     * em 2026-08-29). Como o navegador abre no máximo 6 conexões por
     * host, cada palpite errado ocupa um slot por um minuto inteiro e as
     * fotos que existem ficam na fila atrás dele. Guardar o resultado da
     * verificação é o que permite parar de tentar o que já se sabe que
     * não existe — `pnpm verificar:imagens-cdn` preenche.
     */
    imagemCdnExiste: boolean("imagem_cdn_existe"),
    imagemCdnVerificadoEm: timestamp("imagem_cdn_verificado_em", {
      withTimezone: true,
    }),

    ilustrador: text("ilustrador"),

    setQtdOficial: integer("set_qtd_oficial").notNull(),
    setQtdTotal: integer("set_qtd_total").notNull(),

    /** Soft-delete: sumiu do upstream, mas pode haver cópia apontando pra cá. */
    ativa: boolean("ativa").notNull().default(true),

    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.idioma] }),
    // Fase 1: grade de cadastro por set e listagem de sets filtram/agrupam
    // por set_id o tempo todo — não é coberto pela PK (id, idioma).
    index("carta_catalogo_set_id_idx").on(t.setId),
  ],
);

// --- 3.2 copia ---------------------------------------------------------------

export const copia = pgTable(
  "copia",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    cartaId: text("carta_id").notNull(),
    /**
     * Junto com `cartaId`, a FK para `carta_catalogo` — identidade da
     * carta ("que carta é esta"), não o idioma físico do exemplar. Ver
     * `idioma` abaixo e spec §3.2.
     */
    idiomaCatalogo: idiomaEnum("idioma_catalogo").notNull(),
    /**
     * Idioma da carta FÍSICA (pt/en/jp) — "como é a minha". Independente
     * de `idiomaCatalogo`: 33 sets não têm carta a carta em pt no
     * upstream, então uma carta brasileira desses sets é identificada
     * pela linha `en` (`idiomaCatalogo = en`) e registra `idioma = pt`
     * como o que ela de fato é (AGENTS.md regra 7).
     */
    idioma: idiomaEnum("idioma").notNull(),

    variante: varianteCopiaEnum("variante").notNull(),
    quantidade: integer("quantidade").notNull().default(1),
    condicao: condicaoEnum("condicao").notNull(),

    // Graded: opcional, os três campos andam juntos.
    gradedEmpresa: text("graded_empresa"),
    gradedNota: text("graded_nota"),
    gradedCertificado: text("graded_certificado"),

    localizacao: text("localizacao"),

    aquisicaoData: date("aquisicao_data"),
    aquisicaoOrigem: text("aquisicao_origem"),
    aquisicaoPreco: numeric("aquisicao_preco", { precision: 10, scale: 2 }),

    notas: text("notas"),

    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "copia_carta_catalogo_fk",
      columns: [t.cartaId, t.idiomaCatalogo],
      foreignColumns: [cartaCatalogo.id, cartaCatalogo.idioma],
    }),
    // Inventário (Fase 1) faz join com carta_catalogo por este par o tempo
    // todo, para trazer nome/imagem/raridade de cada cópia.
    index("copia_carta_catalogo_idx").on(t.cartaId, t.idiomaCatalogo),
  ],
);

// --- 3.3 colecao e vaga -------------------------------------------------------

export const colecao = pgTable("colecao", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  tipo: tipoColecaoEnum("tipo").notNull(),

  /**
   * Parâmetro conforme o tipo: escopo (nacional/região) para pokedex,
   * { setId, incluirSecretas } para set. Ausente/nulo para customizada.
   */
  parametro: jsonb("parametro"),

  idiomaExigido: idiomaEnum("idioma_exigido"),
  notas: text("notas"),

  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const vaga = pgTable(
  "vaga",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    colecaoId: uuid("colecao_id")
      .notNull()
      .references(() => colecao.id, { onDelete: "cascade" }),

    /** Número da Pokédex ou local_id do set, conforme o tipo da coleção. */
    chave: text("chave").notNull(),

    /**
     * Nula = vaga vazia. Regra de negócio 1 (alocação exclusiva): uma cópia
     * ocupa no máximo uma vaga — garantido pela constraint `unique` abaixo,
     * não só pela aplicação. Postgres permite múltiplos NULLs numa coluna
     * UNIQUE, então vagas vazias nunca conflitam entre si.
     */
    copiaId: uuid("copia_id").references(() => copia.id, {
      onDelete: "set null",
    }),

    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Regra de negócio 1 — a constraint que importa: uma cópia, no máximo
    // uma vaga, em qualquer coleção.
    unique("vaga_copia_id_unique").on(t.copiaId),
    // Integridade de modelo: uma vaga por chave dentro da mesma coleção
    // (ex.: só pode existir uma vaga "26" na coleção Pokédex Kanto).
    unique("vaga_colecao_chave_unique").on(t.colecaoId, t.chave),
  ],
);

// --- imagem_local — foto fornecida pelo usuário para carta sem imagem ------

/**
 * Imagem local de uma carta do CATÁLOGO (não da cópia física — decisão de
 * 2026-08-26, tarefa "carta sem foto"). Chave `(carta_id,
 * idioma)`: a mesma chave primária de `carta_catalogo` — ele sobe uma vez
 * e toda cópia daquela carta (em qualquer variante/condição/idioma
 * físico) passa a mostrar a imagem. Migration puramente aditiva: não
 * toca `carta_catalogo`.
 *
 * Guarda metadado suficiente para servir o arquivo e para auditar depois
 * (tipo, tamanho, origem); os BYTES ficam em disco, num volume Docker
 * (compose.yaml, caminho configurável por `IMAGENS_LOCAIS_DIR`) — nunca
 * no Postgres. `arquivoNome` é gerado pelo servidor (nunca o nome que o
 * usuário enviou) — quem serve o arquivo (`GET
 * /api/imagens-locais/[cartaId]/[idioma]`) sempre resolve o caminho a
 * partir desta coluna, nunca de entrada do cliente na rota de leitura.
 */
export const imagemLocal = pgTable(
  "imagem_local",
  {
    cartaId: text("carta_id").notNull(),
    idioma: idiomaEnum("idioma").notNull(),

    /** Nome gerado no disco (uuid + extensão) — nunca o nome enviado pelo usuário. */
    arquivoNome: text("arquivo_nome").notNull(),
    mimeType: text("mime_type").notNull(),
    tamanhoBytes: integer("tamanho_bytes").notNull(),

    origem: origemImagemLocalEnum("origem").notNull(),
    /** Só preenchida quando `origem = 'url'` — guardada para auditoria; o arquivo já foi baixado e é a fonte servida. */
    origemUrl: text("origem_url"),

    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.cartaId, t.idioma] }),
    foreignKey({
      name: "imagem_local_carta_catalogo_fk",
      columns: [t.cartaId, t.idioma],
      foreignColumns: [cartaCatalogo.id, cartaCatalogo.idioma],
    }).onDelete("cascade"),
  ],
);

// --- set_mypcards — id do set no catálogo do mypcards ----------------------

/**
 * Ponte entre o nosso `set_id` e o id interno do set no mypcards, fonte
 * secundária de foto para o que a TCGdex não digitalizou (620 linhas,
 * 15 sets — energias, promos e galerias).
 *
 * Uma linha por set, não por idioma: o mesmo número serve `_pt` e `_en`
 * (conferido no set `mee`, 2026-08-29).
 *
 * **Por que o número é colado à mão.** Ele é interno deles e não sai do
 * nosso catálogo. As páginas do site estão atrás do challenge do
 * Cloudflare — nenhum cliente que não seja navegador passa —, e descobrir
 * por varredura custaria ~2.400 requisições por set. Foi martelando assim
 * que este servidor levou bloqueio de IP da TCGdex em agosto. Então o
 * mapeamento entra por gesto humano: um link colado resolve o set
 * inteiro, e só para set que o usuário de fato quer.
 */
export const setMypcards = pgTable("set_mypcards", {
  /** O nosso `carta_catalogo.set_id`. Sem FK: `set_id` não é chave lá (a chave é por carta). */
  setId: text("set_id").primaryKey(),
  /** Id do set no catálogo deles — o número opaco que só o link revela. */
  numero: integer("numero").notNull(),
  /** O link de onde o número foi extraído, guardado para auditoria. */
  origemUrl: text("origem_url").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

// --- Fase 6 — preço BR pela LigaPokemon ------------------------------------

/**
 * Ponte entre a edição da LigaPokemon e o nosso `set_id`.
 *
 * **Por que existe.** O casamento natural seria pela sigla impressa, e o
 * `exportacao-liga.ts` chegou a concluir em 2026-08-29 que "a sigla deles é
 * idêntica à nossa". Isso valia para os quatro sets modernos do export que
 * originou a conclusão, e **não generaliza**: medido em 2026-09-02 contra 777
 * linhas reais, `TM` (Triumphant), `TRR`, `FL` (FireRed & LeafGreen) e `SV1`
 * não casam com nada nosso, e o catálogo japonês não tem sigla — lá o
 * identificador impresso é o próprio `set_id`.
 *
 * A chave estável é o `edid`, id numérico interno deles que vem em toda linha
 * de resultado da busca. Por decisão de 2026-09-02 a tabela é
 * **colhida das varreduras**, não varrida de propósito: cada rodada grava os
 * pares que encontrou e tenta casar; o que não casar fica com `set_id` nulo,
 * à espera de confirmação humana. Cobertura cresce com o uso, a custo zero de
 * requisição.
 */
export const ligaEdicao = pgTable("liga_edicao", {
  /** `edid` — id interno da edição no site deles. */
  edid: integer("edid").primaryKey(),
  /** Sigla como eles escrevem: `MEG`, `SW`, `QSG-G`. */
  sigla: text("sigla").notNull(),
  /** Nome por extenso, como aparece na linha de resultado. */
  nome: text("nome").notNull(),
  /** O nosso `carta_catalogo.set_id`. Nulo enquanto o casamento não foi confirmado. */
  setId: text("set_id"),
  /** Como o vínculo foi estabelecido — auditoria de quem decidiu o quê. */
  origemVinculo: text("origem_vinculo"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Uma varredura de opções de compra: o disparo do botão "Verificar opções
 * faltantes" numa coleção, com os parâmetros que o usuário escolheu.
 *
 * Guardar a rodada inteira, e não só as linhas, é o que permite dizer na tela
 * "consultado há 2 horas com teto de R$ 20" — preço de marketplace envelhece,
 * e preço sem data é armadilha.
 */
export const ligaVarredura = pgTable("liga_varredura", {
  id: uuid("id").primaryKey().defaultRandom(),
  colecaoId: uuid("colecao_id")
    .notNull()
    .references(() => colecao.id, { onDelete: "cascade" }),
  /** Filtros aplicados, como vieram da tela (`lib/dominio/liga-opcoes.ts`). */
  filtros: jsonb("filtros").notNull(),
  /** Vagas consultadas nesta rodada. */
  vagasConsultadas: integer("vagas_consultadas").notNull().default(0),
  /** Requisições efetivamente disparadas — para conferir o custo contra o site deles. */
  requisicoes: integer("requisicoes").notNull().default(0),
  /** Preenchido quando a rodada termina; nulo enquanto está rodando. */
  concluidaEm: timestamp("concluida_em", { withTimezone: true }),
  /**
   * Tocado a cada espécie consultada. É o batimento cardíaco da rodada: sem
   * ele, uma varredura morta por reinício do container fica "em andamento"
   * para sempre, e o sistema não tem como saber a diferença entre trabalhando
   * e morta. Aconteceu de verdade em 2026-09-02.
   */
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  /** Mensagem de erro quando a rodada abortou (bloqueio do site, rede). */
  erro: text("erro"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Uma opção de compra encontrada para uma vaga vazia, com o preço no instante
 * da varredura. Serve os dois tipos de coleção que têm vaga vazia: Pokédex
 * (a vaga é uma espécie, e as opções são as cartas dela) e set (a vaga é uma
 * carta específica, e a opção é ela mesma).
 *
 * **Snapshot, nunca consulta ao vivo** (spec §5, Fase 6): a tela lê sempre
 * daqui. Bater no site durante a renderização transformaria cada abertura de
 * página em dezenas de requisições contra terceiro — exatamente o padrão que
 * rendeu o bloqueio de IP de agosto.
 *
 * `carta_id` nulo é caso legítimo e frequente: a LigaPokemon vende carta que a
 * TCGdex não cataloga (Collection 151 chinês, Carddass, Topsun, promos
 * coreanos). Decisão de 2026-09-02: essas aparecem na tela
 * marcadas, em vez de sumirem.
 */
export const ligaOpcao = pgTable(
  "liga_opcao",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    varreduraId: uuid("varredura_id")
      .notNull()
      .references(() => ligaVarredura.id, { onDelete: "cascade" }),
    /**
     * Chave da vaga que esta opção preencheria — número da Pokédex ou
     * `local_id` do set, conforme o tipo da coleção. É a mesma chave de
     * `vaga.chave`, e por isso é `text` dos dois lados: set tem numeração
     * não-numérica ("TG01", "SV001", "073p").
     *
     * Adicionada em 2026-09-03, quando a varredura passou a servir coleção de
     * set. As linhas anteriores foram preenchidas com o `dex` que já tinham.
     */
    chave: text("chave").notNull(),
    /**
     * Número da Pokédex da vaga. **Só coleção Pokédex** — nulo em coleção de
     * set, onde a vaga é uma carta específica e não uma espécie.
     */
    dex: integer("dex"),
    /** Espécie buscada, como foi enviada ao site. Nulo em coleção de set. */
    especie: text("especie"),

    nome: text("nome").notNull(),
    edicaoSigla: text("edicao_sigla").notNull(),
    edid: integer("edid"),
    edicaoNome: text("edicao_nome").notNull(),
    numero: text("numero").notNull(),
    total: text("total"),
    /** Menor preço com estoque, em BRL. Sem estoque não vira linha. */
    preco: numeric("preco", { precision: 10, scale: 2 }).notNull(),
    precoMedio: numeric("preco_medio", { precision: 10, scale: 2 }),
    precoMaximo: numeric("preco_maximo", { precision: 10, scale: 2 }),
    /** Caminho da carta no site deles, para abrir as ofertas reais. */
    caminho: text("caminho").notNull(),

    /** Casamento com o nosso catálogo. Nulo = carta fora do catálogo. */
    cartaId: text("carta_id"),
    idiomaCatalogo: idiomaEnum("idioma_catalogo"),

    // A marcação NÃO vive mais aqui. Ela é dele e sobrevive à rodada, então
    // mora em `escolha_compra`, presa à vaga. Ver o cabeçalho daquela tabela.

    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("liga_opcao_varredura_dex_idx").on(t.varreduraId, t.dex),
    index("liga_opcao_varredura_chave_idx").on(t.varreduraId, t.chave),
  ],
);

// --- melhoria_descartada — sugestão de troca que ele mandou calar --------

/**
 * Uma sugestão de melhoria descartada pelo usuário: "esta cópia, nesta
 * vaga, não me interessa" (spec §5, Fase 9).
 *
 * **O escopo do silêncio é o par, não a vaga** — decisão dele em
 * 2026-09-05. Descartar o Ampharos `CRI 90/86` na vaga 181 cala aquela
 * cópia ali para sempre; se amanhã entrar no inventário outro Ampharos
 * melhor, a vaga volta a sinalizar. O outro desenho (calar a vaga
 * inteira) esconderia sugestão que ele nunca viu.
 *
 * Nada aqui apaga cópia nem toca em `vaga` — o descarte é só ausência de
 * aviso. Os dois `cascade` são consequência natural: sumindo a vaga ou a
 * cópia, o par deixa de existir e a linha não tem mais o que silenciar.
 */
export const melhoriaDescartada = pgTable(
  "melhoria_descartada",
  {
    vagaId: uuid("vaga_id")
      .notNull()
      .references(() => vaga.id, { onDelete: "cascade" }),
    copiaId: uuid("copia_id")
      .notNull()
      .references(() => copia.id, { onDelete: "cascade" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.vagaId, t.copiaId] })],
);

// --- escolha_compra — a triagem dele, que sobrevive à varredura -----------

/**
 * Uma carta que o usuário decidiu comprar para uma vaga — a triagem dele.
 *
 * ## O problema que esta tabela resolve
 *
 * Até 2026-09-17 a marcação vivia em `liga_opcao.selecionada`, ou seja, **na
 * linha da varredura**. Varredura nova nascia com a seleção zerada, e a
 * justificativa era razoável ("preço mudou, a escolha se refaz") — até ele
 * marcar 126 cartas da Pokédex, uma por vaga vazia, e a próxima atualização de
 * preço ameaçar apagar as 126.
 *
 * A escolha não é sobre preço, é sobre **qual carta ele quer ter**. Preço
 * muda; a escolha não. Então ela passou a viver aqui, presa à vaga e não à
 * rodada.
 *
 * ## Por que os dados da carta ficam repetidos aqui
 *
 * Denormalização deliberada. Apontar para `liga_opcao` prenderia o durável ao
 * descartável: aquela linha some com a varredura (cascade), e a escolha
 * precisa sobreviver a **não existir varredura nenhuma** — é isso que faz o
 * bloco para colar estar pronto quando ele abre a tela, sem rodar nada.
 *
 * O vínculo entre as duas é `identidade`, calculada por
 * `lib/dominio/identidade-carta.ts` a partir de edição + número. Não é o nosso
 * `carta_id` porque ~30% das opções baratas não existem no nosso catálogo, e a
 * decisão de 2026-09-02 foi que elas podem ser compradas mesmo assim.
 *
 * ## Várias por vaga é permitido, por decisão dele (2026-09-17)
 *
 * Na Pokédex a vaga é uma espécie, e ele pode estar de olho em mais de uma
 * carta do mesmo Pokémon. A unicidade é por (coleção, vaga, carta), não por
 * (coleção, vaga).
 *
 * ## Vaga preenchida não apaga a escolha
 *
 * A lista para colar filtra pelas vagas ainda vazias — é o que faz a string
 * encolher sozinha conforme ele cadastra as cartas. Mas a linha fica: se a
 * cópia sair da vaga, a escolha volta a valer. Apagar seria perder decisão
 * dele por efeito colateral de outra ação.
 */
export const escolhaCompra = pgTable(
  "escolha_compra",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    colecaoId: uuid("colecao_id")
      .notNull()
      .references(() => colecao.id, { onDelete: "cascade" }),
    /** A vaga: número da Pokédex ou `local_id` do set. Mesma chave de `vaga.chave`. */
    chave: text("chave").notNull(),
    /** Ver `lib/dominio/identidade-carta.ts`. É a ponte com a varredura. */
    identidade: text("identidade").notNull(),

    /** Espécie da vaga de Pokédex. Nula em coleção de set. */
    especie: text("especie"),
    nome: text("nome").notNull(),
    edicaoSigla: text("edicao_sigla").notNull(),
    edid: integer("edid"),
    edicaoNome: text("edicao_nome").notNull(),
    numero: text("numero").notNull(),
    total: text("total"),
    /** Caminho da carta no site deles, para abrir as ofertas. */
    caminho: text("caminho").notNull(),

    /** Casamento com o nosso catálogo. Nulo = carta fora do catálogo. */
    cartaId: text("carta_id"),
    idiomaCatalogo: idiomaEnum("idioma_catalogo"),

    /**
     * Último preço conhecido e quando ele foi visto.
     *
     * **Preço sem data é armadilha** (mesma regra da `liga_varredura`). A
     * carta que sumiu da varredura seguinte continua na lista com o preço da
     * última vez, marcado com a data — decisão dele em 2026-09-17: sumir
     * calada tiraria da lista uma carta que ele decidiu comprar.
     */
    preco: numeric("preco", { precision: 10, scale: 2 }),
    precoEm: timestamp("preco_em", { withTimezone: true }),

    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("escolha_compra_unica").on(t.colecaoId, t.chave, t.identidade),
    index("escolha_compra_colecao_idx").on(t.colecaoId),
  ],
);
