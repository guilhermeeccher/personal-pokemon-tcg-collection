/**
 * O que o detalhe de carta mostra e faz, decidido sem React e sem rede.
 * Módulo puro: a camada (`detalhe-carta.tsx`) lê daqui e só desenha.
 *
 * ## Os dois modos
 *
 * - **Vaga**: aberto de uma vaga de coleção. O estado vem da grade
 *   (`GET /api/colecoes/:id/grade`), que quem abriu mantém atual — depois de
 *   cada escrita o detalhe avisa (`onMudou`) e a tela relê a grade. Vaga
 *   preenchida: a cópia que está nela, desalocar e, se a grade sinaliza
 *   upgrade, trocar por melhor (regra 8: só com o clique). Vaga vazia: as
 *   cópias livres que servem, escolher e alocar (regra 5: nunca sozinho).
 * - **Cópia**: aberto de uma cópia do inventário. O estado é o do próprio
 *   detalhe (`GET /api/cartas/:cartaId/detalhe?copia=`): editar, alocar a
 *   um destino, desalocar, a foto própria.
 *
 * ## A vaga vazia de Pokédex não tem carta
 *
 * A vaga é uma espécie (regra 3: as formas concorrem pela mesma vaga), e
 * não há "a carta" que ela espera. O detalhe mostra a espécie e as cópias
 * livres de qualquer carta dela; não pede a leitura do detalhe de carta,
 * que precisa de um `cartaId`.
 */

import type { Condicao, Idioma, VarianteCopia } from "@/lib/dominio/enums";
import type { EixoMelhoria } from "@/lib/dominio/melhoria-vaga";
import type { TipoColecao } from "@/lib/dominio/parametro-colecao";
import type {
  CandidataMelhoriaDTO,
  CopiaAlocadaNaVagaDTO,
  CopiaDoDetalheV2DTO,
  DetalheCartaV2DTO,
  VagaGradeV2DTO,
} from "@/lib/dominio/tipos-cliente";
import { variantesDisponiveis } from "@/lib/dominio/variantes-catalogo";

/* ---------- Abertura ---------- */

/** A coleção da vaga, no que o detalhe precisa dela. */
export interface ColecaoDaVaga {
  id: string;
  nome: string;
  tipo: TipoColecao;
  idiomaExigido: Idioma | null;
}

/** O que a carta da grade ou da lista já sabe, para o palco aparecer antes da leitura. */
export interface PreviaDaCarta {
  nome: string;
  imagemUrl: string | null;
  imagemOrigem?: DetalheCartaV2DTO["carta"]["imagemOrigem"];
  raridade?: string | null;
  variante?: VarianteCopia | null;
}

export type AberturaDetalhe =
  | { modo: "vaga"; colecao: ColecaoDaVaga; vaga: VagaGradeV2DTO }
  | { modo: "copia"; cartaId: string; copiaId: string; previa?: PreviaDaCarta };

/**
 * A leitura do detalhe de carta que a abertura pede, ou `null` quando não há
 * carta para ler (vaga vazia de Pokédex). A ficha pedida é a da vaga (a
 * mesma da foto e do nome da grade) ou a da cópia.
 */
export function urlDoDetalhe(abertura: AberturaDetalhe, copiaFoco: string | null): string | null {
  if (abertura.modo === "copia") {
    const copia = copiaFoco ?? abertura.copiaId;
    return `/api/cartas/${encodeURIComponent(abertura.cartaId)}/detalhe?copia=${encodeURIComponent(copia)}`;
  }
  const { vaga } = abertura;
  if (!vaga.carta) return null;
  const busca = new URLSearchParams({ idioma: vaga.carta.idiomaCatalogo, vaga: vaga.id });
  return `/api/cartas/${encodeURIComponent(vaga.carta.cartaId)}/detalhe?${busca.toString()}`;
}

/* ---------- Estado da vaga ---------- */

export type EstadoDaVaga =
  | { tipo: "preenchida"; copiaId: string; upgrade: EixoMelhoria | null }
  | {
      tipo: "vazia";
      /** `carta` numa vaga de set (a carta esperada); `especie` numa de Pokédex (regra 3). */
      alvo: "carta" | "especie";
      /** Cópias livres que servem, pela grade; o detalhe confirma lendo os candidatos. */
      livres: number;
    };

export function estadoDaVaga(vaga: VagaGradeV2DTO): EstadoDaVaga {
  if (vaga.copia) return { tipo: "preenchida", copiaId: vaga.copia.id, upgrade: vaga.upgrade ?? null };
  return { tipo: "vazia", alvo: vaga.carta ? "carta" : "especie", livres: vaga.livres ?? 0 };
}

/**
 * A grade que abriu o detalhe ficou para trás? A leitura do detalhe diz qual
 * cópia está na vaga **agora**; se não é a que a grade mostrou, outra aba
 * mexeu na vaga, e a tela de origem precisa reler antes de oferecer ação.
 */
export function vagaMudouDesdeAGrade(vaga: VagaGradeV2DTO, detalhe: DetalheCartaV2DTO | null): boolean {
  const agora = detalhe?.contexto.vaga;
  if (!agora || agora.id !== vaga.id) return false;
  return agora.copiaId !== (vaga.copia?.id ?? null);
}

/**
 * Depois de desalocar, a vaga fica (vazia) ou some? Numa coleção
 * customizada a vaga nasce ao alocar e é apagada ao desalocar
 * (`desalocarVaga`): não há vaga vazia para continuar mostrando, e o
 * detalhe fecha.
 */
export function vagaSomeAoDesalocar(tipo: TipoColecao): boolean {
  return tipo === "customizada";
}

/* ---------- Recusas ---------- */

/**
 * O estado de tela que segue uma recusa do servidor:
 *
 * - `manter` — validação (400): o pedido estava errado, nada mudou do lado
 *   do servidor. O formulário e a lista ficam como estão, com a frase.
 * - `reler` — sumiu (404) ou mudou por baixo (409): a vaga, a cópia ou a
 *   candidata não são mais o que a tela mostrou. O detalhe relê o que tem e
 *   avisa quem abriu, para a grade reler também; se a própria coisa aberta
 *   sumiu, a releitura cai no estado "não existe mais", que só oferece
 *   fechar.
 *
 * Uma candidata tomada por outra aba volta como 400 `copiaJaAlocada` nas
 * rotas de alocar e trocar, e uma vaga preenchida por outra aba como 400
 * `vagaJaPreenchida`: aí também se relê, porque a lista de candidatas ou a
 * vaga mudou. `CHAVES_QUE_RELEEM` lista esses casos.
 */
export function seguimentoDaRecusa(status: number, chave: string | null): "manter" | "reler" {
  if (status === 404 || status === 409) return "reler";
  if (chave !== null && CHAVES_QUE_RELEEM.has(chave)) return "reler";
  return "manter";
}

const CHAVES_QUE_RELEEM = new Set([
  "copiaJaAlocada",
  "copiaJaNestaVaga",
  "copiaNaoEncontrada",
  "vagaNaoEncontrada",
  "vagaJaPreenchida",
  "vagaVaziaUseAlocacao",
  "colecaoDaVagaNaoEncontrada",
  "conflitoAoGerarProximaVaga",
]);

/** A chave de recusa de um corpo de resposta, se houver uma. */
export function chaveDaRecusa(corpo: unknown): string | null {
  if (typeof corpo !== "object" || corpo === null) return null;
  const recusa = (corpo as { recusa?: { chave?: unknown } }).recusa;
  return typeof recusa?.chave === "string" ? recusa.chave : null;
}

/* ---------- Cópias ---------- */

/**
 * A ordem das cópias na lista do detalhe: a que está em foco (a da vaga, ou
 * a cópia que abriu) primeiro; depois as alocadas, por coleção e número; por
 * fim as livres, da mais antiga para a mais nova. Estável e sem depender do
 * idioma da interface.
 */
export function ordenarCopias(
  copias: readonly CopiaDoDetalheV2DTO[],
  foco: string | null,
): CopiaDoDetalheV2DTO[] {
  const peso = (c: CopiaDoDetalheV2DTO) => (c.id === foco ? 0 : c.alocacao ? 1 : 2);
  return [...copias].sort((a, b) => {
    const p = peso(a) - peso(b);
    if (p !== 0) return p;
    if (a.alocacao && b.alocacao) {
      const porColecao = a.alocacao.colecaoNome.localeCompare(b.alocacao.colecaoNome, "pt-BR");
      if (porColecao !== 0) return porColecao;
      return a.alocacao.numero.localeCompare(b.alocacao.numero, "pt-BR", { numeric: true });
    }
    return a.criadoEm.localeCompare(b.criadoEm) || a.id.localeCompare(b.id);
  });
}

/**
 * As variantes que a edição oferece: as que a carta tem no catálogo (a mesma
 * regra do cadastro, que a rota confere de novo) e, sempre, a que a cópia
 * já tem — mesmo que o catálogo não a liste mais —, para a seleção nunca
 * mostrar outra coisa que não o valor guardado.
 */
export function opcoesDeVariante(
  carta: DetalheCartaV2DTO["carta"],
  atual: VarianteCopia,
): VarianteCopia[] {
  const disponiveis = variantesDisponiveis({
    varianteNormalDisponivel: carta.varianteNormalDisponivel,
    varianteReverseDisponivel: carta.varianteReverseDisponivel,
    varianteHoloDisponivel: carta.varianteHoloDisponivel,
    variantePrimeiraEdicaoDisponivel: carta.variantePrimeiraEdicaoDisponivel,
    variantePromoDisponivel: carta.variantePromoDisponivel,
  });
  return disponiveis.includes(atual) ? disponiveis : [atual, ...disponiveis];
}

/* ---------- Melhoria ---------- */

/**
 * Os dois valores que fizeram a candidata ganhar no eixo — o "de → para"
 * que o detalhe escreve ao lado de cada sugestão. Raridade crua do catálogo,
 * não a classe visual: "Ilustração Rara Especial" é o dado que a pessoa quer
 * ver. A escada que decide quem ganha fica em `melhoria-vaga.ts`; aqui só se
 * lê o eixo que ela já escolheu.
 */
export function valoresDoEixo(
  eixo: EixoMelhoria,
  atual: Pick<CopiaAlocadaNaVagaDTO, "raridade" | "idioma" | "variante">,
  candidata: Pick<CandidataMelhoriaDTO, "raridade" | "idioma" | "variante">,
): { de: string | null; para: string | null } {
  if (eixo === "raridade") return { de: atual.raridade, para: candidata.raridade };
  if (eixo === "idioma") return { de: atual.idioma, para: candidata.idioma };
  return { de: atual.variante, para: candidata.variante };
}

/* ---------- O que mostrar de uma cópia ---------- */

/** Um resumo da cópia física para uma linha: idioma (regra 7), variante, condição. */
export interface ResumoDaCopia {
  idioma: Idioma;
  variante: VarianteCopia;
  condicao: Condicao;
  quantidade: number;
}

export function resumoDaCopia(c: CopiaDoDetalheV2DTO): ResumoDaCopia {
  return { idioma: c.idioma, variante: c.variante, condicao: c.condicao, quantidade: c.quantidade };
}
