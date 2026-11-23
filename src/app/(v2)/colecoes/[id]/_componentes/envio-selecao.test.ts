import { afterEach, describe, expect, it, vi } from "vitest";

import { enviarSelecao, enviosConcluidos, escreverNaFila } from "./envio-selecao";

/* O estado da fila é do módulo, por coleção: cada teste usa uma coleção sua. */

function adiado<T>() {
  let resolver!: (v: T) => void;
  let rejeitar!: (e: Error) => void;
  const promessa = new Promise<T>((r, j) => {
    resolver = r;
    rejeitar = j;
  });
  return { promessa, resolver, rejeitar };
}

const tique = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("escreverNaFila", () => {
  it("entra na fila da coleção: a marcação que chega depois espera ela terminar", async () => {
    const ordem: string[] = [];
    const confirmacao = adiado<string>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        ordem.push("patch");
        return { status: 200, json: async () => ({ alteradas: 1 }) };
      }),
    );
    const escrita = escreverNaFila("c-ordem", async () => {
      ordem.push("confirmacao:inicio");
      const r = await confirmacao.promessa;
      ordem.push("confirmacao:fim");
      return r;
    });
    const marcacao = enviarSelecao("c-ordem", [{ ids: ["x"], selecionada: true }]);
    await tique();
    expect(ordem).toEqual(["confirmacao:inicio"]);
    confirmacao.resolver("ok");
    await expect(escrita).resolves.toBe("ok");
    await expect(marcacao).resolves.toEqual({ tipo: "ok" });
    expect(ordem).toEqual(["confirmacao:inicio", "confirmacao:fim", "patch"]);
  });

  it("conta em voo enquanto espera e roda, e em concluídos ao terminar, certo ou não", async () => {
    const a = adiado<void>();
    const antes = enviosConcluidos("c-conta");
    const certo = escreverNaFila("c-conta", () => a.promessa);
    const errado = escreverNaFila("c-conta", async () => {
      throw new Error("falhou");
    });
    await tique();
    expect(enviosConcluidos("c-conta")).toBe(antes);
    a.resolver();
    await certo;
    await expect(errado).rejects.toThrow("falhou");
    expect(enviosConcluidos("c-conta")).toBe(antes + 2);
  });

  it("uma exceção não trava a fila, e não descarta a marcação que entrou atrás (a geração não muda)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200, json: async () => ({ alteradas: 1 }) })));
    const falha = escreverNaFila("c-excecao", async () => {
      throw new Error("rede");
    });
    const marcacao = enviarSelecao("c-excecao", [{ ids: ["y"], selecionada: false }]);
    await expect(falha).rejects.toThrow("rede");
    // Se a geração tivesse subido, a marcação voltaria `null`, sem sair.
    await expect(marcacao).resolves.toEqual({ tipo: "ok" });
  });
});
