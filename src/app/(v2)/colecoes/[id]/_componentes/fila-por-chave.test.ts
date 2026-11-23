import { describe, expect, it } from "vitest";

import { criarFilaPorChave } from "./fila-por-chave";

function adiado() {
  let resolver!: () => void;
  let rejeitar!: (e: Error) => void;
  const promessa = new Promise<void>((r, j) => {
    resolver = r;
    rejeitar = j;
  });
  return { promessa, resolver, rejeitar };
}

describe("fila por chave", () => {
  it("a segunda tarefa da mesma chave só começa quando a primeira termina, mesmo que a primeira seja lenta", async () => {
    const fila = criarFilaPorChave();
    const ordem: string[] = [];
    const lenta = adiado();
    const a = fila("colecao", async () => {
      ordem.push("aba: pôr começou");
      await lenta.promessa;
      ordem.push("aba: pôr terminou");
    });
    const b = fila("colecao", async () => {
      ordem.push("detalhe: tirar começou");
    });
    await Promise.resolve();
    expect(ordem).toEqual(["aba: pôr começou"]);
    lenta.resolver();
    await Promise.all([a, b]);
    expect(ordem).toEqual(["aba: pôr começou", "aba: pôr terminou", "detalhe: tirar começou"]);
  });

  it("uma tarefa que falha não trava a fila, e quem a chamou vê a falha", async () => {
    const fila = criarFilaPorChave();
    const falha = adiado();
    const a = fila("colecao", () => falha.promessa);
    const b = fila("colecao", async () => "seguiu");
    falha.rejeitar(new Error("rede"));
    await expect(a).rejects.toThrow("rede");
    await expect(b).resolves.toBe("seguiu");
  });

  it("chaves diferentes não se esperam", async () => {
    const fila = criarFilaPorChave();
    const lenta = adiado();
    const ordem: string[] = [];
    void fila("a", async () => {
      await lenta.promessa;
      ordem.push("a");
    });
    await fila("b", async () => {
      ordem.push("b");
    });
    expect(ordem).toEqual(["b"]);
    lenta.resolver();
  });
});
