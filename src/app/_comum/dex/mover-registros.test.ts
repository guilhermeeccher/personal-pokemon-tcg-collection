import { describe, expect, it } from "vitest";

import { corpoDoMover, criarFluxoMover, lerRespostaMover, RECUSA_CONFIRMAR_SEM_VOLTA, type RespostaHttp } from "./mover-registros";

const ID = "8f6b2c1e-0000-4000-8000-000000000001";
const SEM_VOLTA = { recusa: { chave: RECUSA_CONFIRMAR_SEM_VOLTA, valores: { jogo: "Pokémon GO" } } };

describe("corpoDoMover", () => {
  it("sem o clique, nunca confirma", () => {
    expect(JSON.parse(corpoDoMover({ ids: [ID], local: "home" }, false))).toEqual({
      ids: [ID],
      local: "home",
      confirmarSemVolta: false,
    });
  });

  it("depois do clique, o mesmo pedido com a confirmação", () => {
    expect(JSON.parse(corpoDoMover({ ids: [ID], local: "home" }, true)).confirmarSemVolta).toBe(true);
  });
});

describe("lerRespostaMover", () => {
  it("2xx: ok, com quantos a rota moveu", () => {
    expect(lerRespostaMover(200, { ok: true, movidos: 3 }, false)).toEqual({ tipo: "ok", movidos: 3 });
    expect(lerRespostaMover(200, null, false)).toEqual({ tipo: "ok", movidos: 0 });
  });

  it("409 de saída sem volta, sem confirmação ainda: pede a confirmação", () => {
    expect(lerRespostaMover(409, SEM_VOLTA, false)).toEqual({ tipo: "confirmar", corpo: SEM_VOLTA });
  });

  it("o mesmo 409 a um pedido já confirmado é recusa, não outra pergunta", () => {
    expect(lerRespostaMover(409, SEM_VOLTA, true).tipo).toBe("recusa");
  });

  it("outro 409, 400, 404 e 5xx são recusa", () => {
    const outro = { recusa: { chave: "dexNaoTransferivel" } };
    expect(lerRespostaMover(409, outro, false).tipo).toBe("recusa");
    expect(lerRespostaMover(400, outro, false).tipo).toBe("recusa");
    expect(lerRespostaMover(404, { recusa: { chave: "dexRegistroNaoEncontrado" } }, false).tipo).toBe("recusa");
    expect(lerRespostaMover(500, null, false).tipo).toBe("recusa");
  });
});

/** Um fluxo com o POST simulado: cada chamada consome a próxima resposta da fila. */
function montar(respostas: (RespostaHttp | Error)[]) {
  const enviados: { ids: string[]; local: string; confirmarSemVolta: boolean }[] = [];
  const fluxo = criarFluxoMover({
    post: async (corpo) => {
      enviados.push(JSON.parse(corpo));
      const r = respostas.shift();
      if (!r) throw new Error("POST a mais: nenhuma resposta prevista");
      if (r instanceof Error) throw r;
      return r;
    },
    aoMudar: () => {},
  });
  return { fluxo, enviados };
}

const ID2 = "8f6b2c1e-0000-4000-8000-000000000002";

describe("criarFluxoMover: a confirmação de saída sem volta nunca é automática", () => {
  it("409: um POST só, sem confirmação, e o fluxo para esperando a pessoa", async () => {
    const { fluxo, enviados } = montar([{ status: 409, corpo: SEM_VOLTA }]);
    expect(await fluxo.mover([ID, ID2], "home")).toEqual({ tipo: "pendente" });
    expect(enviados).toEqual([{ ids: [ID, ID2], local: "home", confirmarSemVolta: false }]);
    expect(fluxo.estado().pendente).toMatchObject({ ids: [ID, ID2], local: "home", corpo: SEM_VOLTA });
    expect(fluxo.estado().ocupado).toBe(false);
  });

  it("cancelar descarta o pendente sem enviar nada, e confirmar depois não envia", async () => {
    const { fluxo, enviados } = montar([{ status: 409, corpo: SEM_VOLTA }]);
    await fluxo.mover([ID], "home");
    fluxo.cancelar();
    expect(await fluxo.confirmar()).toEqual({ tipo: "ignorado" });
    expect(enviados).toHaveLength(1);
    expect(fluxo.estado().pendente).toBeNull();
  });

  it("confirmar reenvia exatamente os mesmos ids e destino, agora com true", async () => {
    const { fluxo, enviados } = montar([
      { status: 409, corpo: SEM_VOLTA },
      { status: 200, corpo: { ok: true, movidos: 2 } },
    ]);
    await fluxo.mover([ID, ID2], "home");
    expect(await fluxo.confirmar()).toEqual({ tipo: "ok", movidos: 2 });
    expect(enviados).toEqual([
      { ids: [ID, ID2], local: "home", confirmarSemVolta: false },
      { ids: [ID, ID2], local: "home", confirmarSemVolta: true },
    ]);
    expect(fluxo.estado()).toMatchObject({ pendente: null, falha: null });
  });

  it("sem saída de jogo só de envio, o movimento vai direto, sem pendente", async () => {
    const { fluxo, enviados } = montar([{ status: 200, corpo: { ok: true, movidos: 1 } }]);
    expect(await fluxo.mover([ID], "home")).toEqual({ tipo: "ok", movidos: 1 });
    expect(enviados).toHaveLength(1);
  });

  it("um pedido por vez: o segundo clique com um em voo não envia nada", async () => {
    let soltar: (r: RespostaHttp) => void = () => {};
    const enviados: string[] = [];
    const fluxo = criarFluxoMover({
      post: (corpo) => {
        enviados.push(corpo);
        return new Promise((r) => (soltar = r));
      },
      aoMudar: () => {},
    });
    const primeiro = fluxo.mover([ID], "home");
    expect(await fluxo.mover([ID2], "home")).toEqual({ tipo: "ignorado" });
    expect(fluxo.estado().ocupado).toBe(true);
    soltar({ status: 200, corpo: { ok: true, movidos: 1 } });
    await primeiro;
    expect(enviados).toHaveLength(1);
    expect(fluxo.estado().ocupado).toBe(false);
  });

  it("recusa: guarda a resposta e devolve o status (a tela relê num 404)", async () => {
    const recusa = { status: 404, corpo: { recusa: { chave: "dexRegistroNaoEncontrado" } } };
    const { fluxo } = montar([recusa]);
    expect(await fluxo.mover([ID], "home")).toEqual({ tipo: "recusa", status: 404 });
    expect(fluxo.estado().falha).toEqual(recusa);
  });

  it("rede caída ao confirmar: o pendente fica, para tentar de novo ou cancelar", async () => {
    const { fluxo, enviados } = montar([{ status: 409, corpo: SEM_VOLTA }, new Error("rede"), { status: 200, corpo: { movidos: 1 } }]);
    await fluxo.mover([ID], "home");
    await fluxo.confirmar();
    expect(fluxo.estado()).toMatchObject({ falha: "rede" });
    expect(fluxo.estado().pendente).not.toBeNull();
    await fluxo.confirmar();
    expect(enviados.map((e) => e.confirmarSemVolta)).toEqual([false, true, true]);
    expect(fluxo.estado().pendente).toBeNull();
  });

  it("cada passo chega a quem ouve (o estado do React sai daqui)", async () => {
    const vistos: string[] = [];
    const fila: RespostaHttp[] = [
      { status: 409, corpo: SEM_VOLTA },
      { status: 409, corpo: SEM_VOLTA },
      { status: 200, corpo: { movidos: 1 } },
    ];
    const fluxo = criarFluxoMover({
      post: async () => fila.shift()!,
      aoMudar: (e) => vistos.push(`${e.ocupado ? "ocupado" : "livre"}/${e.pendente ? "pendente" : "-"}`),
    });
    await fluxo.mover([ID], "home");
    fluxo.cancelar();
    await fluxo.mover([ID], "home");
    await fluxo.confirmar();
    expect(vistos).toEqual([
      "ocupado/-",
      "livre/pendente",
      "livre/-",
      "ocupado/-",
      "livre/pendente",
      "ocupado/pendente",
      "livre/-",
    ]);
  });

  it("durante a confirmação, outro confirmar ou mover não envia nada", async () => {
    let soltar: (r: RespostaHttp) => void = () => {};
    const enviados: { confirmarSemVolta: boolean }[] = [];
    let primeira = true;
    const fluxo = criarFluxoMover({
      post: (corpo) => {
        enviados.push(JSON.parse(corpo));
        if (primeira) {
          primeira = false;
          return Promise.resolve({ status: 409, corpo: SEM_VOLTA });
        }
        return new Promise((r) => (soltar = r));
      },
      aoMudar: () => {},
    });
    await fluxo.mover([ID], "home");
    const confirmacao = fluxo.confirmar();
    expect(await fluxo.confirmar()).toEqual({ tipo: "ignorado" });
    expect(await fluxo.mover([ID2], "home")).toEqual({ tipo: "ignorado" });
    soltar({ status: 200, corpo: { movidos: 1 } });
    expect(await confirmacao).toEqual({ tipo: "ok", movidos: 1 });
    expect(enviados.map((e) => e.confirmarSemVolta)).toEqual([false, true]);
  });

  it("um segundo 409 de saída sem volta depois do true encerra como recusa, sem perguntar de novo", async () => {
    const { fluxo, enviados } = montar([
      { status: 409, corpo: SEM_VOLTA },
      { status: 409, corpo: SEM_VOLTA },
    ]);
    await fluxo.mover([ID], "home");
    expect(await fluxo.confirmar()).toEqual({ tipo: "recusa", status: 409 });
    expect(fluxo.estado().pendente).toBeNull();
    expect(enviados).toHaveLength(2);
  });
});
