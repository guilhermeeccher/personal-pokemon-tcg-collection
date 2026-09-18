/**
 * Quais vagas a varredura ainda precisa consultar — módulo puro.
 *
 * ## O problema que isto resolve
 *
 * Obedecendo o `Crawl-delay` do site deles, uma varredura das 161 vagas de uma
 * Pokédex deixa de levar ~12 minutos e passa a levar ~16 horas. Nessa escala,
 * reinício de container é rotina e não azar: `docker compose up --build`,
 * reboot da máquina, OOM. A gravação por vaga já existia (o que foi consultado
 * sobrevive), mas a lista de vagas a varrer não tinha nenhuma noção de "esta eu
 * já consultei faz pouco" — então disparar de novo refazia tudo do zero.
 *
 * Cair na hora 15 de 16 custava 15 horas **e mandava o dobro de requisições
 * pedindo dado que já temos** — o oposto exato do motivo de estar indo para o
 * intervalo maior.
 *
 * ## O que é "fresco"
 *
 * A idade da opção já gravada para aquela vaga. Dentro da validade, a vaga é
 * pulada; fora, ela é consultada de novo — é o que faz a rodada seguinte ser
 * atualização de preço, e não um no-op eterno.
 *
 * **Isto não é retomada automática.** Não há fila, worker nem job persistente:
 * quem dispara de novo é o usuário, e a rodada nova simplesmente encontra menos
 * trabalho pela frente.
 *
 * ## O ponto cego, declarado
 *
 * Vaga consultada que **não achou nenhuma oferta** não grava linha, então ela
 * não tem idade e volta a ser consultada na rodada seguinte. Na primeira
 * varredura real foram 6 de 161. Fechar esse buraco custaria uma tabela nova
 * para registrar "consultei e não achou"; o ganho — ~4% das vagas — não paga,
 * e o erro é para o lado seguro (consulta a mais, nunca dado velho passando por
 * novo).
 */

/** Validade padrão da consulta de uma vaga, em horas.
 *
 * Vinte e quatro horas, e o número tem motivo: a própria varredura completa
 * dura ~16 h no ritmo do `robots.txt`, então qualquer validade menor que isso
 * declararia velho o dado que a mesma rodada acabou de colher. Vinte e quatro
 * cobre a rodada inteira com folga — reinício no meio continua de onde parou —
 * e ainda deixa a rodada do dia seguinte valer como atualização de preço.
 */
export const VALIDADE_CONSULTA_HORAS = 24;

/** O que este módulo precisa saber de uma vaga: a chave dela. */
export interface TemChave {
  chave: string;
}

export interface OpcoesFrescor {
  agora: Date;
  /** Horas. Zero ou negativo desliga o pulo: tudo é consultado de novo. */
  validadeHoras: number;
}

/** O instante a partir do qual uma consulta ainda conta como fresca. */
export function corteDeFrescor({ agora, validadeHoras }: OpcoesFrescor): Date {
  return new Date(agora.getTime() - Math.max(validadeHoras, 0) * 3_600_000);
}

/**
 * Separa as vagas entre as que ainda precisam de consulta e as que já têm dado
 * recente o bastante.
 *
 * `ultimaConsultaPorChave` é o instante da opção mais nova gravada para aquela
 * chave. Chave ausente do mapa nunca é pulada.
 */
export function separarPorFrescor<T extends TemChave>(
  vagas: readonly T[],
  ultimaConsultaPorChave: ReadonlyMap<string, Date>,
  opcoes: OpcoesFrescor,
): { pendentes: T[]; puladas: T[] } {
  if (opcoes.validadeHoras <= 0) return { pendentes: [...vagas], puladas: [] };

  const corte = corteDeFrescor(opcoes);
  const pendentes: T[] = [];
  const puladas: T[] = [];

  for (const vaga of vagas) {
    const consultadaEm = ultimaConsultaPorChave.get(vaga.chave);
    // Na borda exata (idade == validade) a vaga é consultada. Empate a favor
    // de perguntar de novo: dado velho passando por novo é o erro caro.
    if (consultadaEm !== undefined && consultadaEm.getTime() > corte.getTime()) {
      puladas.push(vaga);
    } else {
      pendentes.push(vaga);
    }
  }

  return { pendentes, puladas };
}
