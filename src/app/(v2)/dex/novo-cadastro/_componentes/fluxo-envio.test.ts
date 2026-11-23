import { describe, expect, it } from "vitest";

import { RECUSA_CONFIRMAR_SEM_VOLTA, type RespostaHttp } from "@/app/_comum/dex/mover-registros";

import { corpoDoEnvio, criarFluxoEnvio, lerRespostaEnvio, type PedidoEnvio } from "./fluxo-envio";

const SEM_VOLTA = { recusa: { chave: RECUSA_CONFIRMAR_SEM_VOLTA, valores: { jogo: "Pokémon GO" } } };
const PEDIDO: PedidoEnvio = {
  jogoOrigem: "go",
  itens: [
    { formaId: "rattata", shiny: false },
    { formaId: "pikachu", shiny: true },
  ],
};

describe("corpoDoEnvio", () => {
  it("sem o clique, nunca confirma; só os três campos da rota", () => {
    expect(JSON.parse(corpoDoEnvio(PEDIDO, false))).toEqual({
      jogoOrigem: "go",
      itens: [
        { formaId: "rattata", shiny: false },
        { formaId: "pikachu", shiny: true },
      ],
      confirmarSemVolta: false,
    });
  });

  it("depois do clique, o mesmo pedido com a confirmação", () => {
    expect(JSON.parse(corpoDoEnvio(PEDIDO, true)).confirmarSemVolta).toBe(true);
  });
});

describe("lerRespostaEnvio", () => {
  it("201: quantos criados e quantos movidos", () => {
    expect(lerRespostaEnvio(201, { ok: true, criados: 1, movidos: 2 }, false, 3)).toEqual({ tipo: "ok", criados: 1, movidos: 2 });
  });

  it("2xx sem a contagem: o lote inteiro como criado", () => {
    expect(lerRespostaEnvio(201, null, false, 3)).toEqual({ tipo: "ok", criados: 3, movidos: 0 });
  });

  it("409 de saída sem volta, sem confirmação ainda: pede a confirmação", () => {
    expect(lerRespostaEnvio(409, SEM_VOLTA, false, 2)).toEqual({ tipo: "confirmar", corpo: SEM_VOLTA });
  });

  it("o mesmo 409 a um pedido já confirmado é recusa, não outra pergunta", () => {
    expect(lerRespostaEnvio(409, SEM_VOLTA, true, 2).tipo).toBe("recusa");
  });

  it("400 com a lista de recusas, outro 409 e 5xx são recusa", () => {
    const lista = { recusas: [{ chave: "dexVagaJaNoHome", valores: { forma: "rattata", trilha: "normal" } }] };
    expect(lerRespostaEnvio(400, lista, false, 2)).toEqual({ tipo: "recusa", corpo: lista });
    expect(lerRespostaEnvio(409, { recusa: { chave: "outra" } }, false, 2).tipo).toBe("recusa");
    expect(lerRespostaEnvio(500, null, false, 2).tipo).toBe("recusa");
  });
});

/** Um fluxo com o POST simulado: cada chamada consome a próxima resposta da fila. */
function montar(respostas: (RespostaHttp | Error)[]) {
  const enviados: { jogoOrigem: string; itens: { formaId: string; shiny: boolean }[]; confirmarSemVolta: boolean }[] = [];
  const fluxo = criarFluxoEnvio({
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

describe("criarFluxoEnvio", () => {
  it("um jogo que vai e volta: um POST, sem confirmação", async () => {
    const { fluxo, enviados } = montar([{ status: 201, corpo: { ok: true, criados: 1, movidos: 1 } }]);
    const r = await fluxo.enviar({ ...PEDIDO, jogoOrigem: "scarlet" });
    expect(r).toMatchObject({ tipo: "ok", criados: 1, movidos: 1 });
    expect(enviados).toHaveLength(1);
    expect(enviados[0].confirmarSemVolta).toBe(false);
    expect(fluxo.estado().pendente).toBeNull();
  });

  it("só envio: o 409 para e espera, sem um segundo POST", async () => {
    const { fluxo, enviados } = montar([{ status: 409, corpo: SEM_VOLTA }]);
    expect(await fluxo.enviar(PEDIDO)).toEqual({ tipo: "pendente" });
    expect(enviados).toHaveLength(1);
    expect(enviados[0].confirmarSemVolta).toBe(false);
    expect(fluxo.estado().pendente).toMatchObject({ jogoOrigem: "go", corpo: SEM_VOLTA });
  });

  it("cancelar não envia nada e descarta o pendente", async () => {
    const { fluxo, enviados } = montar([{ status: 409, corpo: SEM_VOLTA }]);
    await fluxo.enviar(PEDIDO);
    fluxo.cancelar();
    expect(fluxo.estado().pendente).toBeNull();
    expect(await fluxo.confirmar()).toEqual({ tipo: "ignorado" });
    expect(enviados).toHaveLength(1);
  });

  it("confirmar reenvia o mesmo jogo e os mesmos itens, agora com `true`", async () => {
    const { fluxo, enviados } = montar([
      { status: 409, corpo: SEM_VOLTA },
      { status: 201, corpo: { ok: true, criados: 2, movidos: 0 } },
    ]);
    const itens = [...PEDIDO.itens];
    await fluxo.enviar({ jogoOrigem: "go", itens });
    // A tela mexer no array dela depois do 409 não muda o que vai confirmado.
    itens.pop();
    const r = await fluxo.confirmar();
    expect(r).toMatchObject({ tipo: "ok", criados: 2, movidos: 0 });
    expect(enviados).toHaveLength(2);
    expect(enviados[1]).toEqual({ ...JSON.parse(corpoDoEnvio(PEDIDO, false)), confirmarSemVolta: true });
    expect(fluxo.estado().pendente).toBeNull();
  });

  it("um 409 de saída sem volta ao pedido já confirmado é recusa: o diálogo fecha, nada de outra pergunta", async () => {
    const { fluxo, enviados } = montar([
      { status: 409, corpo: SEM_VOLTA },
      { status: 409, corpo: SEM_VOLTA },
    ]);
    await fluxo.enviar(PEDIDO);
    expect(await fluxo.confirmar()).toEqual({ tipo: "recusa", status: 409 });
    expect(fluxo.estado().pendente).toBeNull();
    expect(fluxo.estado().falha).toEqual({ status: 409, corpo: SEM_VOLTA });
    expect(enviados).toHaveLength(2);
  });

  it("a recusa ao confirmar (outra aba levou a vaga) fecha o pendente e fica em `falha`", async () => {
    const lista = { recusas: [{ chave: "dexVagaJaNoHome", valores: { forma: "rattata", trilha: "normal" } }] };
    const { fluxo } = montar([
      { status: 409, corpo: SEM_VOLTA },
      { status: 400, corpo: lista },
    ]);
    await fluxo.enviar(PEDIDO);
    expect(await fluxo.confirmar()).toEqual({ tipo: "recusa", status: 400 });
    expect(fluxo.estado()).toMatchObject({ pendente: null, falha: { status: 400, corpo: lista } });
  });

  it("rede caída ao confirmar mantém o pendente, para tentar de novo ou cancelar", async () => {
    const { fluxo, enviados } = montar([
      { status: 409, corpo: SEM_VOLTA },
      new Error("rede"),
      { status: 201, corpo: { ok: true, criados: 2, movidos: 0 } },
    ]);
    await fluxo.enviar(PEDIDO);
    expect(await fluxo.confirmar()).toEqual({ tipo: "rede" });
    expect(fluxo.estado()).toMatchObject({ falha: "rede", pendente: { jogoOrigem: "go" } });
    expect(await fluxo.confirmar()).toMatchObject({ tipo: "ok" });
    expect(enviados.map((e) => e.confirmarSemVolta)).toEqual([false, true, true]);
  });

  it("um pedido por vez: o segundo clique com um em voo não sai", async () => {
    let soltar: (r: RespostaHttp) => void = () => {};
    const enviados: string[] = [];
    const fluxo = criarFluxoEnvio({
      post: (corpo) => {
        enviados.push(corpo);
        return new Promise<RespostaHttp>((resolve) => {
          soltar = resolve;
        });
      },
      aoMudar: () => {},
    });
    const primeiro = fluxo.enviar(PEDIDO);
    expect(await fluxo.enviar(PEDIDO)).toEqual({ tipo: "ignorado" });
    expect(await fluxo.confirmar()).toEqual({ tipo: "ignorado" });
    soltar({ status: 201, corpo: { ok: true, criados: 2, movidos: 0 } });
    expect(await primeiro).toMatchObject({ tipo: "ok" });
    expect(enviados).toHaveLength(1);
  });
});
