import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { criarVerificadorSaude } from "./saude";

describe("criarVerificadorSaude", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("banco respondendo é true; falha é false", async () => {
    expect(await criarVerificadorSaude({ consultar: async () => [{ "?column?": 1 }] })()).toBe(true);
    expect(
      await criarVerificadorSaude({
        consultar: async () => {
          throw new Error("conexão recusada");
        },
      })(),
    ).toBe(false);
  });

  it("uma exceção síncrona da consulta também é false", async () => {
    const verificar = criarVerificadorSaude({
      consultar: () => {
        throw new Error("sem DATABASE_URL");
      },
    });
    expect(await verificar()).toBe(false);
  });

  it("passa do prazo de 2 s → false, sem esperar a consulta", async () => {
    const verificar = criarVerificadorSaude({ consultar: () => new Promise(() => {}) });
    const resultado = verificar();
    await vi.advanceTimersByTimeAsync(1999);
    let resolvido = false;
    void resultado.then(() => (resolvido = true));
    await Promise.resolve();
    expect(resolvido).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await resultado).toBe(false);
  });

  it("simultâneas compartilham uma consulta", async () => {
    const consultar = vi.fn(() => new Promise((resolve) => setTimeout(resolve, 100)));
    const verificar = criarVerificadorSaude({ consultar });
    const todas = Promise.all([verificar(), verificar(), verificar()]);
    await vi.advanceTimersByTimeAsync(100);
    expect(await todas).toEqual([true, true, true]);
    expect(consultar).toHaveBeenCalledTimes(1);
  });

  it("o resultado vale 5 s, depois consulta de novo", async () => {
    let ok = true;
    const consultar = vi.fn(async () => {
      if (!ok) throw new Error("fora");
    });
    const verificar = criarVerificadorSaude({ consultar });
    expect(await verificar()).toBe(true);
    ok = false;
    await vi.advanceTimersByTimeAsync(4999);
    expect(await verificar()).toBe(true);
    expect(consultar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await verificar()).toBe(false);
    expect(consultar).toHaveBeenCalledTimes(2);
  });

  it("consulta pendurada: atravessa várias janelas de cache e nunca abre uma segunda", async () => {
    const consultar = vi.fn(() => new Promise(() => {}));
    const verificar = criarVerificadorSaude({ consultar });
    for (let rodada = 0; rodada < 5; rodada++) {
      const resultado = verificar();
      await vi.advanceTimersByTimeAsync(2000);
      expect(await resultado).toBe(false); // a resposta sai no prazo
      await vi.advanceTimersByTimeAsync(5000); // passa a janela do cache
    }
    expect(consultar).toHaveBeenCalledTimes(1);
  });

  it("quando a consulta pendurada enfim termina, a seguinte começa uma nova", async () => {
    let terminar: () => void = () => {};
    const consultar = vi
      .fn<() => Promise<unknown>>()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (terminar = resolve)))
      .mockImplementation(async () => undefined);
    const verificar = criarVerificadorSaude({ consultar });

    const primeira = verificar();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await primeira).toBe(false);

    terminar();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await verificar()).toBe(true);
    expect(consultar).toHaveBeenCalledTimes(2);
  });

  it("depois do primeiro estouro, nenhuma espera nova sobre a consulta pendurada", async () => {
    /* Uma promessa que nunca termina e conta quem se registra nela. */
    let registros = 0;
    const pendurada: PromiseLike<unknown> = {
      then() {
        registros++;
        return pendurada as never;
      },
    };
    const corridas = vi.spyOn(Promise, "race");
    const consultar = vi.fn(() => pendurada as Promise<unknown>);
    const verificar = criarVerificadorSaude({ consultar });

    const primeira = verificar();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await primeira).toBe(false);
    const registrosDepoisDoPrimeiroPrazo = registros;
    const corridasDepoisDoPrimeiroPrazo = corridas.mock.calls.length;

    for (let rodada = 0; rodada < 10; rodada++) {
      await vi.advanceTimersByTimeAsync(5000); // passa a janela do cache
      const resultado = verificar();
      expect(await resultado).toBe(false); // na hora, sem esperar o prazo
    }

    expect(consultar).toHaveBeenCalledTimes(1);
    expect(registros).toBe(registrosDepoisDoPrimeiroPrazo);
    expect(corridas.mock.calls.length).toBe(corridasDepoisDoPrimeiroPrazo);
    corridas.mockRestore();
  });
});
