/**
 * Regras puras da tela de preços da v2 (`/inventario/precos`, pacote 2d): o
 * que a tela decide sozinha, sem banco e sem React, para ficar testável.
 *
 * A tela lê **sempre o snapshot** de `GET /api/inventario/precos`; quem fala
 * com o site da Liga ou com a TCGdex é a rodada que o botão dispara. Nada aqui
 * aumenta o ritmo contra nenhum dos dois: o período de leitura é derivado do
 * intervalo (`periodoDeAtualizacaoMs`), e a tela só pergunta ao nosso banco.
 *
 * Os tipos `…DTO` descrevem a resposta do GET como a tela a lê. São os da v1,
 * reescritos aqui porque a v2 não importa nada de `src/app/(v1)/`; a rota é a
 * mesma e não muda.
 */

import type { FontePreco } from "./fonte-preco";
import type { PontoDaSerie } from "./historico-precos";
import type { OrigemImagem } from "./origem-imagem";
import type { CriterioValorCardmarket } from "./preco-cardmarket";

// --- A resposta do GET ------------------------------------------------------

export interface RitmoDTO {
  intervaloSegundos: number;
  origem: "env" | "robots" | "conservador";
}

export interface RodadaVivaDTO {
  id: string;
  totalCartas: number;
  cartasConsultadas: number;
  cartasComFalha: number;
  requisicoes: number;
  concluidaEm: string | null;
  erro: string | null;
  criadoEm: string;
  emAndamento: boolean;
  segundosRestantes: number | null;
  previsaoTermino: string | null;
}

export interface RodadaListadaDTO {
  id: string;
  criadoEm: string;
  concluidaEm: string | null;
  totalCartas: number;
  cartasConsultadas: number;
  cartasComFalha: number;
  requisicoes: number;
  erro: string | null;
  somaMedios: number | null;
  noGrafico: boolean;
}

export interface ItemPrecoLigaDTO {
  cartaId: string;
  nome: string;
  setNome: string;
  localId: string;
  raridade: string | null;
  encontrada: boolean;
  preco: number | null;
  precoMedio: number | null;
  precoMaximo: number | null;
  consultadoEm: string;
}

/** PTAX de fechamento (venda) do euro: reais por € 1, e o dia do boletim. */
export interface CotacaoDTO {
  valor: number;
  /** `YYYY-MM-DD`, dia do calendário, sem hora. */
  data: string;
}

/**
 * Uma carta na fonte Cardmarket. Os valores sem sufixo estão em reais, já
 * convertidos pela `cotacao` da própria linha; os `…Eur` são os originais.
 * `valor` é o valor guardado da carta e `criterioValor` diz de onde ele veio.
 */
export interface ItemPrecoCardmarketDTO {
  cartaId: string;
  nome: string;
  setNome: string;
  localId: string;
  raridade: string | null;
  encontrada: boolean;
  minimo: number | null;
  tendencia: number | null;
  media: number | null;
  tendenciaEur: number | null;
  valor: number | null;
  valorEur: number | null;
  criterioValor: CriterioValorCardmarket | null;
  media30Eur: number | null;
  foil: boolean;
  cotacao: number | null;
  cotacaoData: string | null;
  consultadoEm: string;
}

interface RespostaComumDTO {
  cartasEspeciais: number;
  ultimaAtualizacao: string | null;
  varredura: RodadaVivaDTO | null;
  resumo: { cartasComPreco: number; naoEncontradas: number; somaMedios: number };
  serie: PontoDaSerie[];
  rodadas: RodadaListadaDTO[];
}

export interface RespostaLigaDTO extends RespostaComumDTO {
  /* Opcional de propósito: uma resposta sem a fonte é a da Liga, a de antes de
     existir a escolha. */
  fonte?: "liga";
  ritmo: RitmoDTO;
  itens: ItemPrecoLigaDTO[];
}

export interface RespostaCardmarketDTO extends RespostaComumDTO {
  fonte: "cardmarket";
  /** Sem ritmo de `robots.txt` a mostrar: a rodada é uma carta por vez na TCGdex. */
  ritmo: null;
  cotacao: CotacaoDTO | null;
  itens: ItemPrecoCardmarketDTO[];
}

export type RespostaPrecosDTO = RespostaLigaDTO | RespostaCardmarketDTO;

/** A fonte que a resposta diz ter; sem o campo, é a Liga. */
export function fonteDaResposta(r: RespostaPrecosDTO): FontePreco {
  return r.fonte === "cardmarket" ? "cardmarket" : "liga";
}

// --- O período de leitura ---------------------------------------------------

const MS_POR_SEGUNDO_DE_INTERVALO = 250;
export const PERIODO_MINIMO_MS = 5_000;
export const PERIODO_MAXIMO_MS = 60_000;

/**
 * De quanto em quanto tempo a tela relê o snapshot enquanto há rodada viva:
 * `clamp(intervalo × 250 ms, 5 s, 60 s)`, o mesmo da tela de opções de compra
 * (AGENTS.md, "LigaPokemon price collector"). **Nunca um número fixo**: com o
 * intervalo da Liga em minutos, perguntar de 5 em 5 s seria consulta ao banco
 * sem novidade. É consulta ao nosso banco, nunca ao site deles, mas o período
 * acompanha o ritmo da rodada do mesmo jeito.
 *
 * O Cardmarket não tem intervalo de `robots.txt` (`ritmo` é nulo): a rodada
 * consulta uma carta por vez na TCGdex e dura minutos, então vale o piso da
 * regra — o mesmo 5 s que a v1 usa nele.
 */
export function periodoDeAtualizacaoMs(ritmo: Pick<RitmoDTO, "intervaloSegundos"> | null): number {
  const intervalo = ritmo?.intervaloSegundos ?? 0;
  const bruto = Number.isFinite(intervalo) ? intervalo * MS_POR_SEGUNDO_DE_INTERVALO : 0;
  return Math.min(PERIODO_MAXIMO_MS, Math.max(PERIODO_MINIMO_MS, bruto));
}

/**
 * Uma batida do relógio de leitura só pede uma leitura nova se não há outra em
 * curso e a aba está à vista. Sem a primeira condição, com respostas mais
 * lentas do que o período (5 s no Cardmarket) cada batida cancelaria a leitura
 * anterior antes de ela terminar, e o andamento nunca chegaria à tela. Uma
 * recarga explícita (depois de uma ação, "tentar de novo") continua cancelando
 * a leitura em curso: aí o que está voando já nasceu velho.
 */
export function batidaDeveReler({ leituraEmCurso, abaVisivel }: { leituraEmCurso: boolean; abaVisivel: boolean }): boolean {
  return !leituraEmCurso && abaVisivel;
}

// --- A tabela ---------------------------------------------------------------

/** Cartas por página na tabela de preços — pedido do usuário, 2026-10-11. */
export const CARTAS_POR_PAGINA = 50;

export interface PaginaDeItens<T> {
  itens: T[];
  /** Presa ao total: a lista pode encolher entre uma leitura e outra. */
  pagina: number;
  totalPaginas: number;
}

export function paginar<T>(itens: readonly T[], pagina: number, porPagina = CARTAS_POR_PAGINA): PaginaDeItens<T> {
  const totalPaginas = Math.max(1, Math.ceil(itens.length / porPagina));
  const atual = Math.min(Math.max(1, Math.trunc(pagina) || 1), totalPaginas);
  return { itens: itens.slice((atual - 1) * porPagina, atual * porPagina), pagina: atual, totalPaginas };
}

/**
 * O porquê de o valor de uma carta do Cardmarket não ser a tendência — ou
 * `null` quando é (o caso quase sempre). A tela mostra a etiqueta à vista e a
 * explicação por toque e por teclado (AGENTS.md, "The trend cap").
 */
export function criterioForaDaTendencia(
  criterio: CriterioValorCardmarket | null,
): { tipo: "media30" | "media"; tom: "aviso" | "neutro" } | null {
  if (criterio === "media30") return { tipo: "media30", tom: "aviso" };
  if (criterio === "media") return { tipo: "media", tom: "neutro" };
  return null;
}

/**
 * O dia do câmbio a escrever na linha, ou `null`. A cotação de cada linha é a
 * do dia em que ela foi consultada; quase sempre é a que a tela anuncia. Quando
 * não é (a carta foi pulada pelo frescor, ou a última consulta não achou e o
 * preço guardado é de antes), a linha diz de que dia é o câmbio dela, para o
 * "cotação usada" não valer para uma conta que não foi feita com ela.
 */
export function diaDoCambioDaLinha(
  linha: Pick<ItemPrecoCardmarketDTO, "cotacao" | "cotacaoData">,
  cotacaoDaTela: CotacaoDTO | null,
): string | null {
  if (linha.cotacaoData === null) return null;
  if (cotacaoDaTela === null) return linha.cotacaoData;
  return linha.cotacaoData !== cotacaoDaTela.data || linha.cotacao !== cotacaoDaTela.valor ? linha.cotacaoData : null;
}

/**
 * A data da PTAX é um dia do calendário (`2026-11-11`), sem hora. `new Date` a
 * lê como meia-noite UTC, que em São Paulo ainda é o dia anterior: formatar em
 * UTC devolve o mesmo dia que veio escrito.
 */
export function dataCivil(iso: string, locale: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC" });
}

/** "€ 1 = R$ 6,1706": o euro sem casas, o real com as quatro da PTAX. */
export function textoDaCotacao(cotacao: CotacaoDTO, locale: string): { euro: string; real: string; data: string } {
  return {
    euro: (1).toLocaleString(locale, {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }),
    real: cotacao.valor.toLocaleString(locale, {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }),
    data: dataCivil(cotacao.data, locale),
  };
}

// --- A foto da carta e a cópia que abre o detalhe ---------------------------

/** O que `GET /api/inventario/precos/cartas` devolve por carta da página. */
export interface CartaDaTabelaDTO {
  cartaId: string;
  /** A cópia pela qual o detalhe abre (`escolherRepresentantes`); `null` sem cópia. */
  copiaId: string | null;
  imagemUrl: string | null;
  imagemOrigem: OrigemImagem | null;
}

/** O teto de cartas por pedido: uma página da tabela. */
export const MAXIMO_CARTAS_POR_PEDIDO = 100;

/** Os ids pedidos, sem repetição e sem vazio, no teto do pedido. */
export function idsParaPedir(cartaIds: readonly string[]): string[] {
  return [...new Set(cartaIds.filter((id) => id.length > 0 && id.length <= 100))].slice(0, MAXIMO_CARTAS_POR_PEDIDO);
}

/**
 * Os `id=` de `GET /api/inventario/precos/cartas`, ou `null` quando o pedido
 * não é uma página da tabela: nenhum id, mais do que o teto, um id enorme ou
 * vazio. Recusar, e não cortar em silêncio, para um pedido errado aparecer.
 */
export function lerIdsPedidos(pedidos: readonly string[]): string[] | null {
  if (pedidos.length === 0 || pedidos.length > MAXIMO_CARTAS_POR_PEDIDO) return null;
  if (pedidos.some((id) => id.length === 0 || id.length > 100)) return null;
  return idsParaPedir(pedidos);
}

// --- O gráfico --------------------------------------------------------------

export const ALTURA_GRAFICO = 220;
export const MARGEM_GRAFICO = { topo: 26, direita: 20, base: 28, esquerda: 64 };
/** Respiro nas pontas: o primeiro e o último ponto não encostam no eixo. */
const FOLGA_X = 24;
const HORA_MS = 3_600_000;

/** Limite do eixo y e os ticks: a partir de zero, em passos "redondos". */
export function escalaY(maximo: number): { topo: number; ticks: number[] } {
  const alvo = Math.max(maximo, 1) / 4;
  const pot = 10 ** Math.floor(Math.log10(alvo));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= alvo) ?? alvo;
  // Ao menos um passo: com tudo zerado (uma rodada em que nada achou preço) o
  // topo seria 0, e `valor / topo` viraria NaN em toda coordenada do desenho.
  const n = Math.max(1, Math.ceil(maximo / passo));
  return { topo: n * passo, ticks: Array.from({ length: n + 1 }, (_, i) => i * passo) };
}

/**
 * A posição x de cada ponto, pelo **tempo** (e não pelo índice): duas rodadas
 * seguidas ficam coladas, e uma de semanas depois, longe. Um ponto só fica no
 * meio; a janela tem no mínimo uma hora, para dois pontos quase simultâneos não
 * dividirem por zero.
 */
export function posicoesX(temposMs: readonly number[], larguraTotal: number, margem = MARGEM_GRAFICO): number[] {
  const areaW = Math.max(larguraTotal - margem.esquerda - margem.direita, 1);
  if (temposMs.length === 0) return [];
  if (temposMs.length === 1) return [margem.esquerda + areaW / 2];
  const t0 = Math.min(...temposMs);
  const t1 = Math.max(...temposMs, t0 + HORA_MS);
  return temposMs.map((t) => margem.esquerda + FOLGA_X + ((t - t0) / (t1 - t0)) * (areaW - 2 * FOLGA_X));
}

/** O índice do ponto mais perto de `px`; empate fica com o primeiro. -1 sem pontos. */
export function pontoMaisProximo(xs: readonly number[], px: number): number {
  let melhor = -1;
  xs.forEach((x, i) => {
    if (melhor === -1 || Math.abs(x - px) < Math.abs(xs[melhor] - px)) melhor = i;
  });
  return melhor;
}

/** O ponto que a leitura mostra: o escolhido, senão o último (o de hoje). */
export function indiceEmFoco(ativo: number | null, tamanho: number): number {
  if (tamanho === 0) return -1;
  if (ativo === null || ativo < 0 || ativo >= tamanho) return tamanho - 1;
  return ativo;
}

/** A seta move o ponto em foco e para nas pontas, sem dar a volta. */
export function moverFoco(atual: number, tamanho: number, tecla: string): number | null {
  if (tamanho === 0) return null;
  if (tecla === "ArrowLeft" || tecla === "ArrowDown") return Math.max(0, atual - 1);
  if (tecla === "ArrowRight" || tecla === "ArrowUp") return Math.min(tamanho - 1, atual + 1);
  if (tecla === "Home") return 0;
  if (tecla === "End") return tamanho - 1;
  return null;
}
