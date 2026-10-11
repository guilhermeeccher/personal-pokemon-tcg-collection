/**
 * A foto da tabela de preços no fim de uma rodada — o ponto do gráfico de
 * valor total. Função pura: o SQL só lê as linhas de `preco_carta_liga`, e a
 * agregação mora aqui para ser testada sem banco.
 *
 * Regra do valor de uma carta = a da tela (`valorDaCarta`): o preço médio e,
 * sem ele, o mínimo. Carta não achada, ou sem nenhum preço, não entra.
 *
 * Atenção ao ler a série: o total também sobe quando **entram cartas** na
 * tabela (a rodada passou a precificar mais cartas), não só quando os preços
 * valorizam. Por isso a foto guarda a quantidade, e o preço médio por carta
 * é o que se compara entre pontos de tamanhos diferentes.
 */

import { valorDaCarta, type PrecoDeCarta } from "./precos-cartas-especiais";

export interface FotoDePrecos {
  somaMedios: number;
  cartasComPreco: number;
  /** somaMedios / cartasComPreco; 0 sem cartas. */
  precoMedioPorCarta: number;
  /** Soma dos preços mínimos das cartas contadas (as sem mínimo não somam). */
  somaMinimos: number;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

export function fotografarPrecos(precos: readonly PrecoDeCarta[]): FotoDePrecos {
  let soma = 0;
  let minimos = 0;
  let quantidade = 0;
  for (const p of precos) {
    const v = p.encontrada ? valorDaCarta(p) : null;
    if (v === null) continue;
    quantidade++;
    soma += v;
    minimos += p.preco ?? 0;
  }
  return {
    somaMedios: centavos(soma),
    cartasComPreco: quantidade,
    precoMedioPorCarta: quantidade === 0 ? 0 : centavos(soma / quantidade),
    somaMinimos: centavos(minimos),
  };
}

export interface PontoDaSerie {
  tiradoEm: string;
  somaMedios: number;
  cartasComPreco: number;
  precoMedioPorCarta: number;
}

/** Variação do total entre dois pontos, separando o que veio de cartas novas. */
export function variacaoEntrePontos(
  de: Pick<PontoDaSerie, "somaMedios" | "cartasComPreco" | "precoMedioPorCarta">,
  para: Pick<PontoDaSerie, "somaMedios" | "cartasComPreco" | "precoMedioPorCarta">,
): { total: number; cartas: number; precoMedioPorCarta: number } {
  return {
    total: centavos(para.somaMedios - de.somaMedios),
    cartas: para.cartasComPreco - de.cartasComPreco,
    precoMedioPorCarta: centavos(para.precoMedioPorCarta - de.precoMedioPorCarta),
  };
}

/**
 * A foto entra no gráfico?
 *
 * **Foto de rodada interrompida fica de fora** (pedido dele, 2026-10-11).
 * Ela não é falsa — fotografa a tabela inteira, e o que a rodada já tinha
 * precificado continua valendo —, mas cai no meio de uma atualização: parte
 * das cartas com o preço novo, parte com o de antes. Duas quedas de rede no
 * mesmo dia viravam dois pontos a mais, colados, e o gráfico passava a contar
 * a história das falhas em vez da do valor.
 *
 * Foto sem rodada (a do backfill da migração `0022`) entra: ela é o primeiro
 * ponto da série e não tem rodada que a desqualifique.
 */
export function fotoEntraNoGrafico(foto: {
  rodadaId: string | null;
  erroDaRodada: string | null;
}): boolean {
  return foto.rodadaId === null || foto.erroDaRodada === null;
}

/**
 * A rodada pode ser excluída da lista?
 *
 * Só a encerrada. Rodada viva está gravando preço e batimento; apagar o
 * registro dela no meio faria a tela perder a rodada que ainda roda — e a
 * trava contra duas rodadas simultâneas (que dobrariam o ritmo contra o site
 * deles) é justamente esse registro.
 */
export function rodadaPodeSerExcluida(rodada: { concluidaEm: Date | string | null }): boolean {
  return rodada.concluidaEm !== null;
}
