import { describe, expect, it, vi } from "vitest";

import { emLotes, guardarRecebidos, MAX_IDS_GUARDAR, type Requisitar } from "./guardar-recebidos";

const resposta = (status: number, corpo: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => corpo,
});

describe("guardarRecebidos", () => {
  it("manda os ids, e só eles, por POST em JSON", async () => {
    const requisitar = vi.fn<Requisitar>(async () => resposta(200, { ok: true, guardados: 2 }));
    expect(await guardarRecebidos(["a", "b"], requisitar)).toEqual({ tipo: "guardou", guardados: 2 });
    expect(requisitar).toHaveBeenCalledTimes(1);
    const [url, init] = requisitar.mock.calls[0];
    expect(url).toBe("/api/dex/registros/guardar");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ ids: ["a", "b"] });
  });

  it("200 sem nenhum guardado é lista velha, não sucesso", async () => {
    expect(await guardarRecebidos(["a"], async () => resposta(200, { ok: true, guardados: 0 }))).toEqual({
      tipo: "nadaMudou",
    });
  });

  it("um corpo de 200 sem o número também não conta como guardado", async () => {
    expect(await guardarRecebidos(["a"], async () => resposta(200, { ok: true }))).toEqual({ tipo: "nadaMudou" });
  });

  it("uma recusa volta com o status e o corpo", async () => {
    const corpo = { erro: "ids ausente ou inválido." };
    expect(await guardarRecebidos(["a"], async () => resposta(400, corpo))).toEqual({
      tipo: "recusa",
      status: 400,
      corpo,
    });
  });

  it("uma recusa sem corpo legível ainda é recusa", async () => {
    const semCorpo = { ok: false, status: 503, json: async () => Promise.reject(new Error("vazio")) };
    expect(await guardarRecebidos(["a"], async () => semCorpo)).toEqual({ tipo: "recusa", status: 503, corpo: null });
  });

  it("falha de rede vira resultado, não exceção", async () => {
    expect(await guardarRecebidos(["a"], async () => Promise.reject(new Error("rede")))).toEqual({ tipo: "falhaDeRede" });
  });

  it("uma rodada acima do teto da rota vai em lotes, na ordem, e soma o que foi guardado", async () => {
    const ids = Array.from({ length: MAX_IDS_GUARDAR * 2 + 5 }, (_, i) => `id-${i}`);
    const requisitar = vi.fn<Requisitar>(async (_url, init) => {
      const { ids: lote } = JSON.parse(init.body as string) as { ids: string[] };
      return resposta(200, { ok: true, guardados: lote.length });
    });
    expect(await guardarRecebidos(ids, requisitar)).toEqual({ tipo: "guardou", guardados: ids.length });
    const tamanhos = requisitar.mock.calls.map(([, init]) => (JSON.parse(init.body as string) as { ids: string[] }).ids.length);
    expect(tamanhos).toEqual([MAX_IDS_GUARDAR, MAX_IDS_GUARDAR, 5]);
  });

  it("uma recusa no meio interrompe: os lotes seguintes não saem", async () => {
    const ids = Array.from({ length: MAX_IDS_GUARDAR + 1 }, (_, i) => `id-${i}`);
    const requisitar = vi.fn<Requisitar>(async () => resposta(500, { erro: "x" }));
    const r = await guardarRecebidos(ids, requisitar);
    expect(r.tipo).toBe("recusa");
    expect(requisitar).toHaveBeenCalledTimes(1);
  });

  it("primeiro lote guardado, segundo recusado, terceiro não sai", async () => {
    const ids = Array.from({ length: MAX_IDS_GUARDAR * 2 + 1 }, (_, i) => `id-${i}`);
    let chamada = 0;
    const requisitar = vi.fn<Requisitar>(async () =>
      ++chamada === 1 ? resposta(200, { ok: true, guardados: MAX_IDS_GUARDAR }) : resposta(503, { erro: "fora" }),
    );
    expect(await guardarRecebidos(ids, requisitar)).toEqual({ tipo: "recusa", status: 503, corpo: { erro: "fora" } });
    expect(requisitar).toHaveBeenCalledTimes(2);
  });

  it("falha de rede depois de um lote guardado interrompe e avisa a falha", async () => {
    const ids = Array.from({ length: MAX_IDS_GUARDAR + 1 }, (_, i) => `id-${i}`);
    let chamada = 0;
    const requisitar = vi.fn<Requisitar>(async () => {
      if (++chamada === 1) return resposta(200, { ok: true, guardados: MAX_IDS_GUARDAR });
      throw new Error("rede");
    });
    expect(await guardarRecebidos(ids, requisitar)).toEqual({ tipo: "falhaDeRede" });
    expect(requisitar).toHaveBeenCalledTimes(2);
  });

  it("emLotes não cria lote vazio", () => {
    expect(emLotes([], 3)).toEqual([]);
    expect(emLotes([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });
});
