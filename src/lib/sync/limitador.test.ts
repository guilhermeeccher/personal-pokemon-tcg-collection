import { describe, expect, it } from "vitest";

import { criarLimitador } from "./limitador";

/** Relógio falso: o tempo só anda quando alguém dorme. */
function relogioFalso() {
  let agora = 0;
  const dormidas: number[] = [];
  return {
    agora: () => agora,
    dormir: async (ms: number) => {
      dormidas.push(ms);
      agora += ms;
    },
    get instante() {
      return agora;
    },
    dormidas,
  };
}

describe("criarLimitador", () => {
  it("libera a primeira requisição sem espera", async () => {
    const relogio = relogioFalso();
    const limitador = criarLimitador({ porSegundo: 5, ...relogio });

    await limitador.aguardarVez();

    expect(relogio.dormidas).toEqual([]);
    expect(relogio.instante).toBe(0);
  });

  it("espaça requisições consecutivas pelo intervalo da taxa", async () => {
    const relogio = relogioFalso();
    const limitador = criarLimitador({ porSegundo: 5, ...relogio });

    await limitador.aguardarVez();
    await limitador.aguardarVez();
    await limitador.aguardarVez();

    // 5/s => 200 ms entre largadas.
    expect(relogio.dormidas).toEqual([200, 200]);
    expect(relogio.instante).toBe(400);
  });

  it("mantém o teto mesmo com chamadas concorrentes — o caso que importa", async () => {
    // É o cenário do incidente: N tarefas em paralelo chamando junto. Sem a
    // fila, todas passariam de uma vez e a rajada aconteceria do mesmo jeito.
    const relogio = relogioFalso();
    const limitador = criarLimitador({ porSegundo: 10, ...relogio });

    await Promise.all(
      Array.from({ length: 4 }, () => limitador.aguardarVez()),
    );

    // 10/s => 100 ms; 4 largadas ocupam 300 ms a partir do zero.
    expect(relogio.dormidas).toEqual([100, 100, 100]);
    expect(relogio.instante).toBe(300);
  });

  it("não acumula crédito de rajada quando fica ocioso", async () => {
    const relogio = relogioFalso();
    const limitador = criarLimitador({ porSegundo: 5, ...relogio });

    await limitador.aguardarVez();
    // Ociosidade longa: o relógio anda sem ninguém pedir vez.
    await relogio.dormir(10_000);
    relogio.dormidas.length = 0;

    await limitador.aguardarVez();
    await limitador.aguardarVez();

    // A primeira depois da ociosidade sai na hora (não há crédito
    // acumulado que permita duas de uma vez); a seguinte volta a esperar.
    expect(relogio.dormidas).toEqual([200]);
  });

  it("recusa taxa inválida em vez de virar divisão por zero", () => {
    expect(() => criarLimitador({ porSegundo: 0 })).toThrow(/Taxa inválida/);
    expect(() => criarLimitador({ porSegundo: -1 })).toThrow(/Taxa inválida/);
    expect(() => criarLimitador({ porSegundo: Number.NaN })).toThrow(
      /Taxa inválida/,
    );
  });
});
