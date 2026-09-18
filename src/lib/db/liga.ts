/**
 * Consultas da Fase 6 — preço BR pela LigaPokemon.
 *
 * O porquê da fonte, do ritmo e do formato está em `lib/liga/cliente.ts` e
 * `lib/dominio/liga-busca.ts`; aqui só se lê e escreve.
 */

import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

import type { Database } from "./client";
import {
  cartaCatalogo,
  colecao,
  ligaEdicao,
  ligaOpcao,
  ligaVarredura,
  vaga,
} from "./schema";
import {
  imagemDaCarta,
  obterNomesEspeciePorNumero,
  origemDaImagem,
} from "./consultas";
import type { LinhaBuscaLiga } from "@/lib/dominio/liga-busca";
import type { Filtros, OpcaoCompra } from "@/lib/dominio/liga-opcoes";
import {
  linhaCasaComVagaSet,
  normalizarNumeroCarta,
  type AlvoVagaSet,
} from "@/lib/dominio/liga-set";
import { compararLocalId } from "@/lib/dominio/ordenacao";
import type { ParametroSet } from "@/lib/dominio/parametro-colecao";
import type { OrigemImagem } from "@/lib/dominio/origem-imagem";

export interface VagaVaziaPokedex {
  /** A chave da vaga (`vaga.chave`) — na Pokédex, o número como texto. */
  chave: string;
  dex: number;
  especie: string;
}

/**
 * As vagas vazias de uma coleção Pokédex, já com o nome da espécie — que é o
 * termo que vai para a busca no site deles.
 *
 * Vaga cujo número não resolve nome (nenhuma carta elegível no catálogo local)
 * fica de fora: sem nome não há o que buscar, e mandar o número puro traria
 * qualquer carta com aquele número impresso.
 */
export async function listarVagasVaziasPokedex(
  db: Database,
  colecaoId: string,
): Promise<VagaVaziaPokedex[]> {
  const vagas = await db
    .select({ chave: vaga.chave })
    .from(vaga)
    .innerJoin(colecao, eq(colecao.id, vaga.colecaoId))
    .where(
      and(
        eq(vaga.colecaoId, colecaoId),
        eq(colecao.tipo, "pokedex"),
        isNull(vaga.copiaId),
      ),
    )
    .orderBy(asc(sql`${vaga.chave}::integer`));

  const numeros = vagas
    .map((v) => Number(v.chave))
    .filter((n) => Number.isInteger(n));
  const nomes = await obterNomesEspeciePorNumero(db, numeros);

  return numeros
    .map((dex) => ({ chave: String(dex), dex, especie: nomes.get(dex) ?? null }))
    .filter((v): v is VagaVaziaPokedex => v.especie !== null);
}

/**
 * As vagas vazias de uma coleção de **set**, cada uma já com a carta que a
 * preenche — porque no set a vaga *é* uma carta específica, e não uma espécie
 * com várias cartas possíveis.
 *
 * ## Por que o termo de busca é o nome em inglês
 *
 * A LigaPokemon escreve o nome das cartas em inglês na lista de resultado
 * (`Wondrous Patch`), enquanto a coleção de set local é renderizada em
 * português (`Fragmento Encantado`) — a divergência é total nas cartas de
 * Treinador, e nula nos Pokémon. Buscar pelo nome em português devolveria zero
 * resultado justamente nas cartas de Treinador, e zero resultado é
 * indistinguível de "não tem à venda". Então o termo sai da linha `en` do mesmo
 * set e número; o nome exibido segue sendo o do idioma da coleção.
 *
 * `nomeAlternativo` guarda o outro nome, para uma segunda tentativa quando a
 * primeira não achar a carta — custa uma requisição extra só nos casos em que
 * a busca falhou de qualquer jeito.
 */
export interface VagaVaziaSet {
  /** `vaga.chave` — o `local_id` da carta no set. */
  chave: string;
  /** Nome exibido, no idioma de catálogo da coleção. */
  nome: string;
  /** Termo que vai para a busca deles — o nome em inglês, quando existe. */
  nomeBusca: string;
  /** O outro nome, para a segunda tentativa. Nulo quando os dois são iguais. */
  nomeAlternativo: string | null;
  setId: string;
  setSigla: string | null;
  setNome: string;
  cartaId: string;
  idiomaCatalogo: "pt" | "en" | "jp";
  raridade: string | null;
}

export async function listarVagasVaziasSet(
  db: Database,
  colecaoId: string,
): Promise<VagaVaziaSet[]> {
  const [dono] = await db
    .select({ tipo: colecao.tipo, parametro: colecao.parametro })
    .from(colecao)
    .where(eq(colecao.id, colecaoId))
    .limit(1);
  if (!dono || dono.tipo !== "set") return [];

  const parametro = dono.parametro as ParametroSet | null;
  if (!parametro?.setId) return [];

  const vazias = await db
    .select({ chave: vaga.chave })
    .from(vaga)
    .where(and(eq(vaga.colecaoId, colecaoId), isNull(vaga.copiaId)));
  if (vazias.length === 0) return [];

  // As duas linhas de catálogo do set: a do idioma da coleção (exibição) e a
  // inglesa (termo de busca). Uma consulta só — o set inteiro cabe folgado.
  const cartas = await db
    .select({
      id: cartaCatalogo.id,
      idioma: cartaCatalogo.idioma,
      localId: cartaCatalogo.localId,
      nome: cartaCatalogo.nome,
      raridade: cartaCatalogo.raridade,
      setNome: cartaCatalogo.setNome,
      setSigla: cartaCatalogo.setSigla,
    })
    .from(cartaCatalogo)
    .where(
      and(
        eq(cartaCatalogo.setId, parametro.setId),
        eq(cartaCatalogo.ativa, true),
        inArray(cartaCatalogo.idioma, [parametro.idiomaCatalogo, "en"]),
      ),
    );

  const porIdiomaENumero = new Map<string, (typeof cartas)[number]>();
  for (const carta of cartas) {
    porIdiomaENumero.set(`${carta.idioma}:${normalizarNumeroCarta(carta.localId)}`, carta);
  }

  const chaves = vazias.map((v) => v.chave).sort(compararLocalId);

  return chaves.flatMap((chave) => {
    const numero = normalizarNumeroCarta(chave);
    const daColecao = porIdiomaENumero.get(`${parametro.idiomaCatalogo}:${numero}`);
    const emIngles = porIdiomaENumero.get(`en:${numero}`);
    const principal = daColecao ?? emIngles;
    // Vaga cujo número não resolve carta no catálogo fica de fora: sem nome não
    // há o que buscar, e mandar o número puro traria qualquer carta com aquele
    // número impresso. Acontece em set que o upstream não tem carta a carta.
    if (!principal) return [];

    const nomeBusca = emIngles?.nome ?? principal.nome;
    const nomeAlternativo =
      daColecao && daColecao.nome !== nomeBusca ? daColecao.nome : null;

    return [
      {
        chave,
        nome: principal.nome,
        nomeBusca,
        nomeAlternativo,
        setId: parametro.setId,
        setSigla: principal.setSigla,
        setNome: principal.setNome,
        cartaId: principal.id,
        idiomaCatalogo: principal.idioma,
        raridade: principal.raridade,
      },
    ];
  });
}

/**
 * As edições da LigaPokemon já confirmadas como sendo este set — o vínculo
 * `edid` → nosso `set_id` da `liga_edicao`. Buscado uma vez por rodada, e não
 * por carta: a rodada inteira olha para o mesmo set.
 *
 * Continua sem palpite: só entra o que alguém confirmou. Hoje a tabela tem 637
 * edições colhidas e nenhuma vinculada, então na prática o casamento se apoia
 * na sigla — e este mapa é a porta para quando isso mudar.
 */
export async function vinculosDoSet(
  db: Database,
  setId: string,
): Promise<Map<number, string>> {
  const linhas = await db
    .select({ edid: ligaEdicao.edid, setId: ligaEdicao.setId })
    .from(ligaEdicao)
    .where(eq(ligaEdicao.setId, setId));
  return new Map(linhas.map((l) => [l.edid, l.setId as string]));
}

/**
 * Filtra o resultado da busca até sobrar a carta desta vaga de set.
 *
 * Não há cruzamento com o catálogo a fazer: a vaga já *é* uma carta do nosso
 * catálogo, com raridade, set e foto conhecidos. O trabalho é só descartar as
 * reimpressões do mesmo nome em outras edições — que não preenchem esta vaga.
 */
export function casarComVagaSet(
  vagaSet: VagaVaziaSet,
  linhas: ReadonlyArray<LinhaBuscaLiga>,
  setPorEdid: ReadonlyMap<number, string>,
): OpcaoCompra[] {
  if (linhas.length === 0) return [];

  const alvo: AlvoVagaSet = {
    numero: vagaSet.chave,
    setId: vagaSet.setId,
    setSigla: vagaSet.setSigla,
  };

  return linhas
    .filter((linha) => linhaCasaComVagaSet(linha, alvo, setPorEdid))
    .map((linha) => ({
      ...linha,
      chave: vagaSet.chave,
      dex: null,
      especie: null,
      cartaId: vagaSet.cartaId,
      idiomaCatalogo: vagaSet.idiomaCatalogo,
      raridade: vagaSet.raridade,
      setNome: vagaSet.setNome,
    }));
}

/**
 * Cruza as linhas da busca com o nosso catálogo.
 *
 * **Duas chaves, não uma.** A sigla da edição (`MEG`, `SW`) resolve o
 * ocidental; o catálogo japonês não tem sigla — lá o identificador impresso é
 * o próprio `set_id` (`sv2a`), e é ele que a Liga usa como sigla. Medido em
 * 2026-09-02: só com a sigla o casamento fica em 33,6%; com as duas chaves
 * sobe para 68,7% nas linhas com estoque. O resto é carta que a TCGdex não
 * cataloga (Collection 151 chinês, Carddass, Topsun, promos coreanos) ou
 * edição cuja sigla deles difere da nossa — esta última recuperável pela
 * tabela `liga_edicao`, que a varredura vai preenchendo.
 *
 * Zero à esquerda é normalizado dos dois lados: a Liga escreve `77` onde o
 * nosso catálogo escreve `077`, e vice-versa.
 */
export async function casarComCatalogo(
  db: Database,
  linhas: ReadonlyArray<LinhaBuscaLiga & { chave: string; dex: number; especie: string }>,
): Promise<OpcaoCompra[]> {
  if (linhas.length === 0) return [];

  const siglas = [...new Set(linhas.map((l) => l.edicaoSigla.toUpperCase()))];
  const edids = [
    ...new Set(
      linhas.map((l) => l.edicaoId).filter((e): e is number => e !== null),
    ),
  ];

  // Mapeamento confirmado (edid → nosso set_id) tem precedência sobre o
  // palpite pela sigla: ele existe justamente para os casos em que a sigla
  // deles não é a nossa.
  const vinculos =
    edids.length > 0
      ? await db
          .select({ edid: ligaEdicao.edid, setId: ligaEdicao.setId })
          .from(ligaEdicao)
          .where(
            and(inArray(ligaEdicao.edid, edids), isNotNull(ligaEdicao.setId)),
          )
      : [];
  const setPorEdid = new Map(vinculos.map((v) => [v.edid, v.setId as string]));

  const setIds = [...new Set(setPorEdid.values())];
  const candidatas = await db
    .select({
      id: cartaCatalogo.id,
      idioma: cartaCatalogo.idioma,
      setId: cartaCatalogo.setId,
      setSigla: cartaCatalogo.setSigla,
      setNome: cartaCatalogo.setNome,
      localId: cartaCatalogo.localId,
      raridade: cartaCatalogo.raridade,
      dexIds: cartaCatalogo.dexIds,
    })
    .from(cartaCatalogo)
    .where(
      and(
        eq(cartaCatalogo.ativa, true),
        // `inArray` e não `any(...)` em SQL cru: o array JS entra como um
        // parâmetro só, e o Postgres recusa `= any($1)` sem o tipo do array.
        // Foi esse o erro que fez a primeira varredura real consultar sete
        // páginas e gravar zero opções.
        or(
          inArray(sql`upper(${cartaCatalogo.setSigla})`, siglas),
          inArray(sql`upper(${cartaCatalogo.setId})`, siglas),
          ...(setIds.length > 0 ? [inArray(cartaCatalogo.setId, setIds)] : []),
        ),
      ),
    );

  // pt antes de en antes de jp: a linha em português é a que o usuário lê.
  const peso: Record<string, number> = { pt: 0, en: 1, jp: 2 };
  const porChave = new Map<string, (typeof candidatas)[number]>();
  const registrar = (chave: string, carta: (typeof candidatas)[number]) => {
    const atual = porChave.get(chave);
    if (!atual || peso[carta.idioma] < peso[atual.idioma])
      porChave.set(chave, carta);
  };
  for (const carta of candidatas) {
    const numero = normalizarNumeroCarta(carta.localId);
    if (carta.setSigla)
      registrar(`sigla:${carta.setSigla.toUpperCase()}:${numero}`, carta);
    registrar(`set:${carta.setId.toUpperCase()}:${numero}`, carta);
  }

  return linhas.map((linha) => {
    const numero = normalizarNumeroCarta(linha.numero);
    const sigla = linha.edicaoSigla.toUpperCase();
    const setVinculado =
      linha.edicaoId !== null ? setPorEdid.get(linha.edicaoId) : undefined;

    const carta =
      (setVinculado
        ? porChave.get(`set:${setVinculado.toUpperCase()}:${numero}`)
        : undefined) ??
      porChave.get(`sigla:${sigla}:${numero}`) ??
      porChave.get(`set:${sigla}:${numero}`);

    // Regra 2: só carta com exatamente um dexId ocupa vaga de Pokédex. Uma
    // linha que case com tag team não pode entrar como se preenchesse a vaga.
    const elegivel =
      carta !== undefined &&
      carta.dexIds.length === 1 &&
      carta.dexIds[0] === linha.dex;

    return {
      ...linha,
      cartaId: elegivel ? carta.id : null,
      idiomaCatalogo: elegivel ? carta.idioma : null,
      raridade: elegivel ? carta.raridade : null,
      setNome: elegivel ? carta.setNome : null,
    };
  });
}

/**
 * Grava os pares edição-que-vimos, para a tabela de mapeamento crescer com o
 * uso (decisão de 2026-09-02, em vez de varrer as ~250 edições
 * deles de propósito).
 *
 * O `set_id` **não** é preenchido por palpite aqui: fica nulo até alguém
 * confirmar. Uma edição vinculada errado apontaria preço de um set para carta
 * de outro, que é pior do que não ter vínculo nenhum.
 */
export async function registrarEdicoesVistas(
  db: Database,
  linhas: ReadonlyArray<LinhaBuscaLiga>,
): Promise<void> {
  const porEdid = new Map<number, { sigla: string; nome: string }>();
  for (const linha of linhas) {
    if (linha.edicaoId === null) continue;
    porEdid.set(linha.edicaoId, {
      sigla: linha.edicaoSigla,
      nome: linha.edicaoNome,
    });
  }
  if (porEdid.size === 0) return;

  await db
    .insert(ligaEdicao)
    .values(
      [...porEdid].map(([edid, { sigla, nome }]) => ({ edid, sigla, nome })),
    )
    .onConflictDoUpdate({
      target: ligaEdicao.edid,
      set: {
        sigla: sql`excluded.sigla`,
        nome: sql`excluded.nome`,
        atualizadoEm: sql`now()`,
      },
    });
}

export async function criarVarredura(
  db: Database,
  colecaoId: string,
  filtros: Filtros,
): Promise<string> {
  const [linha] = await db
    .insert(ligaVarredura)
    .values({ colecaoId, filtros })
    .returning({ id: ligaVarredura.id });
  return linha.id;
}

export async function gravarOpcoes(
  db: Database,
  varreduraId: string,
  opcoes: ReadonlyArray<OpcaoCompra>,
): Promise<void> {
  const compraveis = opcoes.filter((o) => o.preco !== null);
  if (compraveis.length === 0) return;

  await db.insert(ligaOpcao).values(
    compraveis.map((o) => ({
      varreduraId,
      chave: o.chave,
      dex: o.dex,
      especie: o.especie,
      nome: o.nome,
      edicaoSigla: o.edicaoSigla,
      edid: o.edicaoId,
      edicaoNome: o.edicaoNome,
      numero: o.numero,
      total: o.total,
      preco: String(o.preco),
      precoMedio: o.precoMedio === null ? null : String(o.precoMedio),
      precoMaximo: o.precoMaximo === null ? null : String(o.precoMaximo),
      caminho: o.caminho,
      cartaId: o.cartaId,
      idiomaCatalogo: o.idiomaCatalogo as "pt" | "en" | "jp" | null,
    })),
  );
}

/**
 * Janela sem batimento a partir da qual uma rodada é dada como morta.
 *
 * Uma espécie leva ~3,75 s (uma requisição a cada 3 s mais jitter), e no pior
 * caso três páginas: ~11 s. Dois minutos é folgado o bastante para não matar
 * rodada viva num soluço de rede, e curto o bastante para o usuário não
 * ficar olhando "em andamento" de uma rodada que morreu.
 */
export const SEGUNDOS_SEM_BATIMENTO_PARA_MORTA = 120;

/** Batimento por espécie: progresso visível e prova de que a rodada vive. */
export async function tocarProgresso(
  db: Database,
  varreduraId: string,
  dados: { vagasConsultadas: number; requisicoes: number },
): Promise<void> {
  await db
    .update(ligaVarredura)
    .set({ ...dados, atualizadoEm: sql`now()` })
    .where(eq(ligaVarredura.id, varreduraId));
}

/**
 * A varredura desta coleção que ainda está viva, se houver.
 *
 * Existe para impedir duas rodadas simultâneas — que foi o que aconteceu em
 * 2026-09-02: dois cliques no botão renderam duas varreduras em paralelo,
 * **dobrando o ritmo contra o site deles**. O limitador de taxa é por
 * processo de rodada; ele não sabe de outra rodada existindo ao lado.
 */
export async function varreduraViva(
  db: Database,
  colecaoId: string,
): Promise<VarreduraSalva | null> {
  const [linha] = await db
    .select()
    .from(ligaVarredura)
    .where(
      and(
        eq(ligaVarredura.colecaoId, colecaoId),
        isNull(ligaVarredura.concluidaEm),
        sql`${ligaVarredura.atualizadoEm} > now() - make_interval(secs => ${SEGUNDOS_SEM_BATIMENTO_PARA_MORTA})`,
      ),
    )
    .limit(1);
  return linha ? { ...linha, filtros: linha.filtros as Filtros } : null;
}

/**
 * Fecha as rodadas que morreram sem se despedir — container reiniciado,
 * processo derrubado. Sem isso elas ficam "em andamento" para sempre.
 */
export async function encerrarVarredurasMortas(db: Database, colecaoId: string): Promise<number> {
  const fechadas = await db
    .update(ligaVarredura)
    .set({
      concluidaEm: sql`now()`,
      erro: "Interrompida antes do fim (o processo foi reiniciado). O que já havia sido consultado está preservado.",
    })
    .where(
      and(
        eq(ligaVarredura.colecaoId, colecaoId),
        isNull(ligaVarredura.concluidaEm),
        sql`${ligaVarredura.atualizadoEm} <= now() - make_interval(secs => ${SEGUNDOS_SEM_BATIMENTO_PARA_MORTA})`,
      ),
    )
    .returning({ id: ligaVarredura.id });
  return fechadas.length;
}

export async function concluirVarredura(
  db: Database,
  varreduraId: string,
  dados: { vagasConsultadas: number; requisicoes: number; erro?: string },
): Promise<void> {
  await db
    .update(ligaVarredura)
    .set({
      vagasConsultadas: dados.vagasConsultadas,
      requisicoes: dados.requisicoes,
      erro: dados.erro ?? null,
      concluidaEm: sql`now()`,
      atualizadoEm: sql`now()`,
    })
    .where(eq(ligaVarredura.id, varreduraId));
}

export interface VarreduraSalva {
  id: string;
  filtros: Filtros;
  vagasConsultadas: number;
  requisicoes: number;
  concluidaEm: Date | null;
  atualizadoEm: Date;
  erro: string | null;
  criadoEm: Date;
}

/** A varredura mais recente da coleção — a tela lê sempre daqui, nunca do site. */
export async function obterUltimaVarredura(
  db: Database,
  colecaoId: string,
): Promise<VarreduraSalva | null> {
  const [linha] = await db
    .select()
    .from(ligaVarredura)
    .where(eq(ligaVarredura.colecaoId, colecaoId))
    .orderBy(sql`${ligaVarredura.criadoEm} desc`)
    .limit(1);

  if (!linha) return null;
  return { ...linha, filtros: linha.filtros as Filtros };
}

export interface OpcaoSalva extends Omit<
  OpcaoCompra,
  "preco" | "precoMedio" | "precoMaximo"
> {
  id: string;
  preco: number;
  precoMedio: number | null;
  precoMaximo: number | null;
  /**
   * Foto da carta, pela mesma cadeia do resto do sistema (própria >
   * catálogo > mypcards > outro idioma ocidental > CDN). `null` para carta
   * fora do nosso catálogo: a LigaPokemon publica a imagem dela no CDN
   * próprio, mas o projeto decidiu em 2026-08-29 **não fazer hotlink** de
   * terceiro — então aqui fica sem foto em vez de puxar a deles.
   */
  imagemUrl: string | null;
  imagemOrigem: OrigemImagem | null;
}

export async function listarOpcoesDaVarredura(
  db: Database,
  varreduraId: string,
): Promise<OpcaoSalva[]> {
  const linhas = await db
    .select()
    .from(ligaOpcao)
    .where(eq(ligaOpcao.varreduraId, varreduraId))
    // Por chave, e não por `dex`: em coleção de set o `dex` é nulo em toda
    // linha, e ordenar por ele deixaria a lista na ordem de inserção.
    .orderBy(asc(ligaOpcao.chave));

  const cartaIds = [
    ...new Set(
      linhas.map((l) => l.cartaId).filter((c): c is string => c !== null),
    ),
  ];
  // Chaveado por id **e idioma**: a chave de `carta_catalogo` é o par, e
  // buscar só pelo id traria a linha de outro idioma — foto e raridade da
  // carta certa, na versão errada.
  const dadosDaCarta =
    cartaIds.length > 0
      ? await db
          .select({
            id: cartaCatalogo.id,
            idioma: cartaCatalogo.idioma,
            setNome: cartaCatalogo.setNome,
            raridade: cartaCatalogo.raridade,
            imagemUrl: imagemDaCarta(cartaCatalogo),
            imagemOrigem: origemDaImagem(cartaCatalogo),
          })
          .from(cartaCatalogo)
          .where(inArray(cartaCatalogo.id, cartaIds))
      : [];
  const porCarta = new Map(dadosDaCarta.map((c) => [`${c.id}:${c.idioma}`, c]));

  return linhas.map((l) => {
    const carta =
      l.cartaId && l.idiomaCatalogo
        ? porCarta.get(`${l.cartaId}:${l.idiomaCatalogo}`)
        : undefined;
    return {
      id: l.id,
      chave: l.chave,
      dex: l.dex,
      especie: l.especie,
      nome: l.nome,
      edicaoSigla: l.edicaoSigla,
      edicaoId: l.edid,
      edicaoNome: l.edicaoNome,
      numero: l.numero,
      total: l.total,
      preco: Number(l.preco),
      precoMedio: l.precoMedio === null ? null : Number(l.precoMedio),
      precoMaximo: l.precoMaximo === null ? null : Number(l.precoMaximo),
      caminho: l.caminho,
      cartaId: l.cartaId,
      idiomaCatalogo: l.idiomaCatalogo,
      raridade: carta?.raridade ?? null,
      setNome: carta?.setNome ?? null,
      imagemUrl: carta?.imagemUrl ?? null,
      imagemOrigem: (carta?.imagemOrigem as OrigemImagem | null) ?? null,
    };
  });
}

/**
 * Opções pontuais de uma varredura, pelos ids que a tela mandou.
 *
 * Existe para a rota de marcar: carregar as 4.830 opções de uma Pokédex a cada
 * clique de checkbox seria absurdo, e é o que `listarOpcoesDaVarredura` faria.
 */
export async function opcoesPorId(
  db: Database,
  varreduraId: string,
  ids: readonly string[],
): Promise<
  Array<{
    chave: string;
    especie: string | null;
    nome: string;
    edicaoSigla: string;
    edid: number | null;
    edicaoNome: string;
    numero: string;
    total: string | null;
    caminho: string;
    cartaId: string | null;
    idiomaCatalogo: "pt" | "en" | "jp" | null;
    preco: number;
  }>
> {
  if (ids.length === 0) return [];
  const linhas = await db
    .select({
      chave: ligaOpcao.chave,
      especie: ligaOpcao.especie,
      nome: ligaOpcao.nome,
      edicaoSigla: ligaOpcao.edicaoSigla,
      edid: ligaOpcao.edid,
      edicaoNome: ligaOpcao.edicaoNome,
      numero: ligaOpcao.numero,
      total: ligaOpcao.total,
      caminho: ligaOpcao.caminho,
      cartaId: ligaOpcao.cartaId,
      idiomaCatalogo: ligaOpcao.idiomaCatalogo,
      preco: ligaOpcao.preco,
    })
    .from(ligaOpcao)
    .where(and(eq(ligaOpcao.varreduraId, varreduraId), inArray(ligaOpcao.id, [...ids])));

  return linhas.map((l) => ({ ...l, preco: Number(l.preco) }));
}

