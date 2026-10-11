/**
 * Quanto tempo a varredura vai levar, e como dizer isso a um humano — módulo
 * puro, usado pela API e pela tela.
 *
 * ## Por que virou módulo
 *
 * A estimativa nasceu como uma conta de uma linha na rota, com o intervalo de
 * 3 segundos embutido. Obedecendo o `robots.txt` deles o intervalo passa a ser
 * lido ao vivo e pode ser qualquer coisa — 360 s hoje, outro valor amanhã —, e
 * a mesma conta precisa responder duas perguntas em dois lugares: "quanto vai
 * levar" no disparo e "quanto falta" enquanto roda.
 *
 * ## O fator por vaga
 *
 * Na Pokédex é uma requisição por vaga: a busca por nome da espécie já devolve
 * as opções ordenadas por preço. No set a busca pode precisar de várias
 * páginas até a carta aparecer (até `MAX_PAGINAS_VAGA_SET`), e as cartas de
 * Treinador ainda gastam uma segunda tentativa com o nome no idioma da
 * coleção — 1,6 é estimativa declarada como estimativa. A rodada real da 30C
 * em 2026-10-11 deu 1,4 (130 requisições, 92 vagas, ainda com teto de 3); a
 * maioria das vagas acha a carta na primeira página, e só a de nome comum
 * pagina fundo.
 */

import { MAX_PAGINAS_VAGA_SET } from "./liga-set";

export type TipoVarredura = "pokedex" | "set";

/** Requisições médias por vaga, por tipo de coleção. */
export const REQUISICOES_POR_VAGA: Record<TipoVarredura, number> = {
  pokedex: 1,
  set: 1.6,
};

/** Jitter médio somado a cada intervalo (o cliente sorteia de 0 a 1,5 s). */
export const JITTER_MEDIO_SEGUNDOS = 0.75;

export function segundosDeVarredura({
  tipo,
  vagas,
  intervaloSegundos,
  jitterMedioSegundos = JITTER_MEDIO_SEGUNDOS,
}: {
  tipo: TipoVarredura;
  vagas: number;
  intervaloSegundos: number;
  jitterMedioSegundos?: number;
}): number {
  if (vagas <= 0) return 0;
  return Math.round(
    vagas * REQUISICOES_POR_VAGA[tipo] * (intervaloSegundos + jitterMedioSegundos),
  );
}

export function previsaoDeTermino(agora: Date, segundos: number): Date {
  return new Date(agora.getTime() + segundos * 1000);
}

/**
 * Duração em texto curto e legível **em escala de horas**.
 *
 * O texto anterior falava em minutos porque a rodada levava 12; a mesma rodada
 * obedecendo o `Crawl-delay` leva 16 horas, e "960 minuto(s)" não é informação
 * que alguém consiga usar.
 */
export function formatarDuracao(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos <= 0) return "menos de 1 min";
  if (segundos < 60) return "menos de 1 min";

  const minutosTotais = Math.round(segundos / 60);
  if (minutosTotais < 60) return `${minutosTotais} min`;

  const horasTotais = Math.floor(minutosTotais / 60);
  const minutos = minutosTotais % 60;

  if (horasTotais < 24) {
    return minutos === 0 ? `${horasTotais} h` : `${horasTotais} h ${minutos} min`;
  }

  const dias = Math.floor(horasTotais / 24);
  const horas = horasTotais % 24;
  return horas === 0 ? `${dias} d` : `${dias} d ${horas} h`;
}

/**
 * Requisições que uma vaga pode gastar no pior caso.
 *
 * - **Pokédex:** três páginas (o `MAX_PAGINAS` do cliente) de uma busca só;
 *   fica nas seis de antes, que já cobriam com folga.
 * - **Set:** `MAX_PAGINAS_VAGA_SET` páginas, vezes as duas tentativas de nome.
 *   Quando o teto da vaga de set subiu de 3 para 20 (2026-10-11), esta conta
 *   tinha de subir junto: com a janela antiga de seis, uma vaga viva paginando
 *   fundo seria dada como morta e liberaria uma segunda rodada em paralelo.
 */
export function requisicoesNoPiorCasoPorVaga(tipo: TipoVarredura): number {
  return tipo === "set" ? 2 * MAX_PAGINAS_VAGA_SET : 6;
}

/** Piso da janela sem batimento — o valor que valia quando o ritmo era 3 s. */
export const JANELA_SEM_BATIMENTO_MINIMA_SEGUNDOS = 120;

/**
 * Quanto tempo sem batimento até uma rodada ser dada como morta.
 *
 * **Precisa acompanhar o intervalo, e por um motivo caro.** O batimento é
 * tocado ao fim de cada vaga; com 360 s entre requisições, uma vaga sozinha
 * leva mais do que os 120 s que antes bastavam. Uma janela fixa declararia
 * morta toda rodada viva — e o estrago não é só a tela dizer "interrompida":
 * é liberar uma segunda rodada em paralelo, que **dobra o ritmo contra o site
 * deles**. Foi o acidente de 2026-09-02, por outro caminho.
 *
 * A folga é o pior caso de uma vaga (`requisicoesNoPiorCasoPorVaga`) mais
 * margem, com o piso antigo preservado para quem roda em intervalo curto.
 */
export function janelaSemBatimentoSegundos(
  intervaloSegundos: number,
  requisicoesNoPiorCaso: number = requisicoesNoPiorCasoPorVaga("set"),
): number {
  // A janela segue o pior caso de quem a usa — a vaga de cada tipo de coleção,
  // ou a carta da rodada de preços —, senão uma rodada viva seria declarada
  // morta e liberaria uma segunda em paralelo. O padrão é o maior pior caso
  // de vaga: quem esquecer de passar erra para o lado seguro (demora mais a
  // dar como morta), nunca para o que dobra o ritmo.
  const piorCaso = intervaloSegundos * requisicoesNoPiorCaso * 1.5;
  return Math.max(JANELA_SEM_BATIMENTO_MINIMA_SEGUNDOS, Math.round(piorCaso));
}
