import { describe, expect, it } from "vitest";

import { corpoDoMover, lerRespostaMover, RECUSA_CONFIRMAR_SEM_VOLTA } from "./mover-registros";

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
