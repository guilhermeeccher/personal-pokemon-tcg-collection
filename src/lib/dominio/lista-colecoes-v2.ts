/**
 * A lista de coleções da v2 (`/colecoes`, modo "ver"): o que a tela precisa de
 * cada coleção, as seções por grupo e o progresso. Módulo puro — a leitura do
 * banco é de `lib/db/lista-colecoes-v2.ts`, o desenho é da tela.
 *
 * - **A ordem vem pronta de `listarColecoes`** (grupos por `grupo_colecao.ordem`,
 *   coleções por `colecao.ordem`, "sem grupo" por último). Nada aqui ordena:
 *   as seções saem na ordem em que os itens e os grupos chegam
 *   (`secoesDaLista`). Ordenar de novo exigiria inventar o `criadoEm` que o
 *   grupo não traz, e duas ordens divergiriam em silêncio.
 * - **O progresso nunca arredonda para cima até fechar.** 99,6% é 99%: "100%"
 *   com "faltam 1" no mesmo cartão seria mentira (`progressoDaColecao`).
 * - **A coleção customizada não tem denominador** — o tamanho dela é o que o
 *   usuário alocou —, então não ganha anel nem "faltam": só a contagem.
 */

import type { Idioma } from "./enums";
import type { TipoColecao } from "./parametro-colecao";
import { rotuloChaveVaga } from "./chave-vaga-set";
import { temaDaColecao, type TipoTema } from "./tema-colecao";

/** Uma vaga vazia mostrada como silhueta ou miniatura, só como ilustração. */
export interface MiniaturaVagaV2 {
  /** Já resolvida no servidor (sprite na Pokédex, carta esperada no set); `null` sem imagem. */
  url: string | null;
  /** O número da vaga, escrito no lugar da imagem. */
  rotulo: string;
  /** `true` na Pokédex: o sprite é silhueta (a carta não é conhecida, regra 3). */
  silhueta: boolean;
}

export interface ColecaoListaV2DTO {
  id: string;
  nome: string;
  tipo: TipoColecao;
  /** Só coleção temática: o tema como gravado; o rótulo é da tela. */
  tema: { tipo: TipoTema; valor: string; rotulo?: string } | null;
  idiomaExigido: Idioma | null;
  totalVagas: number;
  vagasPreenchidas: number;
  avisoCatalogoIncompleto: boolean;
  avisoSemNumeracaoOficial: boolean;
  /** A carta mais vistosa já alocada; `null` sem nenhuma com foto. */
  capa: { nome: string; url: string } | null;
  /** Logos do primeiro set da receita, em ordem de preferência (a tela tenta o seguinte se falhar). */
  logos: string[];
  /** As primeiras vagas vazias da divisão mais perto de fechar; vazia sem dado barato. */
  miniaturas: MiniaturaVagaV2[];
}

export interface GrupoListaV2DTO {
  id: string;
  nome: string;
  /** O nome da série ligada, como o seletor de expansão o escreve; `null` sem série. */
  serieRotulo: string | null;
}

export interface SecaoListaV2<C = ColecaoListaV2DTO> {
  /** `null` é "sem grupo". */
  grupo: GrupoListaV2DTO | null;
  colecoes: C[];
}

export interface ListaColecoesV2DTO {
  secoes: SecaoListaV2[];
  totalColecoes: number;
}

/**
 * As seções na ordem em que a API devolve: os grupos como vieram, as coleções
 * de cada um como vieram, "sem grupo" por último e só quando tem coleção.
 * Um grupo sem coleção continua na lista (o usuário o criou). Coleção com um
 * `grupoId` que a lista de grupos não traz (o grupo foi excluído entre as duas
 * leituras) cai em "sem grupo" em vez de sumir.
 */
export function secoesDaLista<C extends { grupoId: string | null }, G extends { id: string }>(
  itens: readonly C[],
  grupos: readonly G[],
): { grupo: G | null; colecoes: C[] }[] {
  const conhecidos = new Set(grupos.map((g) => g.id));
  const porGrupo = new Map<string | null, C[]>();
  for (const c of itens) {
    const chave = c.grupoId !== null && conhecidos.has(c.grupoId) ? c.grupoId : null;
    const lista = porGrupo.get(chave);
    if (lista) lista.push(c);
    else porGrupo.set(chave, [c]);
  }
  const secoes: { grupo: G | null; colecoes: C[] }[] = grupos.map((g) => ({
    grupo: g,
    colecoes: porGrupo.get(g.id) ?? [],
  }));
  const semGrupo = porGrupo.get(null) ?? [];
  return semGrupo.length > 0 ? [...secoes, { grupo: null, colecoes: semGrupo }] : secoes;
}

export type ProgressoColecao =
  /** Customizada: sem denominador, só o que o usuário alocou. */
  | { tipo: "contagem"; quantas: number }
  /** Pokédex ou set sem nenhuma vaga (escopo vazio, set sem carta no catálogo). */
  | { tipo: "semVagas" }
  /** `percentual` de 0 a 100 e só 100 quando nada falta. */
  | { tipo: "anel"; percentual: number; faltam: number; completa: boolean };

export function progressoDaColecao(c: {
  tipo: TipoColecao;
  totalVagas: number;
  vagasPreenchidas: number;
}): ProgressoColecao {
  if (c.tipo === "customizada") return { tipo: "contagem", quantas: c.vagasPreenchidas };
  if (c.totalVagas <= 0) return { tipo: "semVagas" };
  const preenchidas = Math.min(Math.max(c.vagasPreenchidas, 0), c.totalVagas);
  const faltam = c.totalVagas - preenchidas;
  // `floor`: 99,6% é 99, e só `faltam === 0` chega a 100.
  const percentual = faltam === 0 ? 100 : Math.floor((preenchidas / c.totalVagas) * 100);
  return { tipo: "anel", percentual, faltam, completa: faltam === 0 };
}

/** Pedaço do que `listarQuaseLa` devolve que a lista usa para as miniaturas. */
export interface QuaseLaParaLista {
  colecaoId: string;
  tipo: TipoColecao;
  faltantes: readonly { chave: string; imagemUrl: string | null }[];
}

/** As funções de URL entram por parâmetro: este módulo não conhece o CDN. */
export interface ResolvedoresDeImagem {
  imagemDaCarta: (imagemUrl: string | null) => string | null;
  spriteDaEspecie: (numero: string) => string | null;
}

/**
 * As miniaturas de cada coleção, a partir do "Quase lá" já lido. Uma coleção
 * pode aparecer em mais de uma divisão; vale a primeira, que é a mais perto de
 * fechar (`selecionarQuaseLa` já ordena). Na Pokédex a vaga não tem "carta
 * esperada" (regra 3): é o sprite da espécie, desenhado como silhueta.
 */
export function miniaturasPorColecao(
  quaseLa: readonly QuaseLaParaLista[],
  resolver: ResolvedoresDeImagem,
  porColecao: number,
): Map<string, MiniaturaVagaV2[]> {
  const mapa = new Map<string, MiniaturaVagaV2[]>();
  for (const q of quaseLa) {
    if (mapa.has(q.colecaoId)) continue;
    const silhueta = q.tipo === "pokedex";
    mapa.set(
      q.colecaoId,
      q.faltantes.slice(0, porColecao).map((f) => ({
        url: silhueta ? resolver.spriteDaEspecie(f.chave) : resolver.imagemDaCarta(f.imagemUrl),
        rotulo: rotuloChaveVaga(f.chave),
        silhueta,
      })),
    );
  }
  return mapa;
}

/** O que `listarColecoesNaVitrine` entrega, no que a lista usa dele. */
export interface ColecaoDaVitrine {
  id: string;
  nome: string;
  tipo: TipoColecao;
  parametro: unknown;
  idiomaExigido: Idioma | null;
  totalVagas: number;
  vagasPreenchidas: number;
  grupoId: string | null;
  avisoCatalogoIncompleto?: unknown;
  avisoSemNumeracaoOficial?: unknown;
  temaRotulo?: string;
  capa: { nome: string; imagemUrl: string } | null;
  logos: string[];
}

export function montarListaV2(
  vitrine: readonly ColecaoDaVitrine[],
  grupos: readonly { id: string; nome: string; serieRotulo: string | null }[],
  miniaturas: ReadonlyMap<string, MiniaturaVagaV2[]>,
  resolver: Pick<ResolvedoresDeImagem, "imagemDaCarta">,
): ListaColecoesV2DTO {
  const itens = vitrine.map((c) => {
    const tema = temaDaColecao(c);
    const capaUrl = c.capa ? resolver.imagemDaCarta(c.capa.imagemUrl) : null;
    return {
      grupoId: c.grupoId,
      colecao: {
        id: c.id,
        nome: c.nome,
        tipo: c.tipo,
        tema: tema ? { tipo: tema.tipo, valor: tema.valor, rotulo: c.temaRotulo } : null,
        idiomaExigido: c.idiomaExigido,
        totalVagas: c.totalVagas,
        vagasPreenchidas: c.vagasPreenchidas,
        avisoCatalogoIncompleto: c.avisoCatalogoIncompleto !== undefined,
        avisoSemNumeracaoOficial: c.avisoSemNumeracaoOficial !== undefined,
        capa: c.capa && capaUrl ? { nome: c.capa.nome, url: capaUrl } : null,
        logos: c.logos,
        miniaturas: miniaturas.get(c.id) ?? [],
      } satisfies ColecaoListaV2DTO,
    };
  });
  const secoes = secoesDaLista(itens, grupos).map((s) => ({
    grupo: s.grupo ? { id: s.grupo.id, nome: s.grupo.nome, serieRotulo: s.grupo.serieRotulo } : null,
    colecoes: s.colecoes.map((i) => i.colecao),
  }));
  return { secoes, totalColecoes: vitrine.length };
}

/**
 * A série do grupo só vale uma linha à parte quando diz algo que o nome do
 * grupo não diz: um grupo chamado "Escarlate e Violeta" ligado à série de
 * mesmo nome não precisa repetir.
 */
export function serieDistintaDoNome(grupo: GrupoListaV2DTO): string | null {
  const serie = grupo.serieRotulo?.trim();
  if (!serie) return null;
  return serie.toLowerCase() === grupo.nome.trim().toLowerCase() ? null : serie;
}
