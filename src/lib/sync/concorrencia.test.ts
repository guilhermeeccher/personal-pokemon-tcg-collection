import { describe, expect, it } from "vitest";

import { mapComConcorrencia } from "./concorrencia";

describe("mapComConcorrencia", () => {
  it("preserva a ordem do resultado", async () => {
    const resultado = await mapComConcorrencia([1, 2, 3, 4], 2, async (n) => n * 10);
    expect(resultado).toEqual([10, 20, 30, 40]);
  });

  it("respeita o limite de tarefas em voo", async () => {
    let emVoo = 0;
    let pico = 0;
    await mapComConcorrencia(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      emVoo++;
      pico = Math.max(pico, emVoo);
      await new Promise((r) => setTimeout(r, 1));
      emVoo--;
    });
    expect(pico).toBeLessThanOrEqual(3);
  });

  it("para de consumir a fila quando uma tarefa falha", async () => {
    // O comportamento que faltava no incidente de 2026-08-25: com bloqueio de
    // IP, os demais trabalhadores seguiam disparando requisições até a fila
    // acabar, renovando o bloqueio.
    const processados: number[] = [];
    const itens = Array.from({ length: 100 }, (_, i) => i);

    await expect(
      mapComConcorrencia(itens, 2, async (n) => {
        if (n === 4) throw new Error("bloqueado");
        processados.push(n);
        await new Promise((r) => setTimeout(r, 1));
        return n;
      }),
    ).rejects.toThrow("bloqueado");

    // Muito menos que os 100 itens: a fila foi abandonada, não drenada.
    expect(processados.length).toBeLessThan(20);
  });

  it("aguarda as tarefas em voo antes de rejeitar — nada fica órfão", async () => {
    let concluidas = 0;
    let emVoo = 0;

    await expect(
      mapComConcorrencia([1, 2, 3, 4], 4, async (n) => {
        emVoo++;
        if (n === 1) {
          emVoo--;
          throw new Error("falhou primeiro");
        }
        await new Promise((r) => setTimeout(r, 5));
        concluidas++;
        emVoo--;
        return n;
      }),
    ).rejects.toThrow("falhou primeiro");

    expect(emVoo).toBe(0);
    expect(concluidas).toBe(3);
  });

  it("lida com lista vazia", async () => {
    expect(await mapComConcorrencia([], 4, async (n) => n)).toEqual([]);
  });
});
