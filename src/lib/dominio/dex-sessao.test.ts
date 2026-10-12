import { describe, expect, it } from "vitest";

import { planejarLote, type ContextoSessao } from "./dex-sessao";

const ctx = (extra: Partial<ContextoSessao> = {}): ContextoSessao => ({
  trofeus: new Map([
    ["firered-campeao", "firered"],
    ["firered-tanoby", "firered"],
  ]),
  obtidos: new Set(),
  refs: new Map(),
  planos: new Set(["11111111-1111-1111-1111-111111111111"]),
  tarefas: new Set(["22222222-2222-2222-2222-222222222222"]),
  registro: {
    formasAtivas: new Set(["unown", "pikachu"]),
    jogosAtivos: new Set(["firered"]),
    naoTransferiveis: new Set(),
  },
  formasDoJogo: (jogo) => (jogo === "firered" ? new Set(["unown", "pikachu"]) : null),
  ...extra,
});

const HOJE = "2026-10-12";

describe("planejarLote", () => {
  it("lote completo vira passos na ordem: troféus, planos e tarefas, status, registros", () => {
    const r = planejarLote(
      {
        ref: "s1",
        trofeus: [{ ref: "s1/t", trofeuId: "firered-campeao" }],
        planos: [
          {
            ref: "s1/p",
            titulo: "Semana 1",
            inicio: "2026-10-12",
            fim: "2026-10-18",
            trofeuIds: ["firered-tanoby"],
            tarefas: [{ ref: "s1/p/1", titulo: "Resolver o Tanoby Key", tipo: "progresso", jogoId: "firered", trofeuId: "firered-tanoby" }],
          },
        ],
        status: [{ tarefaRef: "s1/p/1", status: "feita" }],
        registros: [{ ref: "s1/r", jogoId: "firered", itens: [{ formaId: "unown", normal: 2 }] }],
      },
      ctx(),
      HOJE,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.passos.map((p) => p.tipo)).toEqual(["trofeu", "plano", "tarefa", "status-tarefa", "registros"]);
    expect(r.passos[0]).toMatchObject({ obtidoEm: HOJE });
    expect(r.passos[2]).toMatchObject({ plano: { ref: "s1/p" } });
    const registros = r.passos[4];
    expect(registros.tipo === "registros" && registros.registros.length).toBe(2);
  });

  it("troféu do HOME não se marca por lote: vale pelos registros", () => {
    const r = planejarLote(
      { ref: "s1", trofeus: [{ ref: "s1/t", trofeuId: "home-100" }] },
      ctx({ trofeus: new Map([["home-100", "home"]]) }),
      HOJE,
    );
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).toMatch(/HOME trophy/);
  });

  it("lote já aplicado não faz nada; item com ref já aplicada é pulado", () => {
    expect(planejarLote({ ref: "s1" }, ctx({ refs: new Map([["s1", "lote"]]) }), HOJE)).toEqual({
      ok: true,
      loteJaAplicado: true,
      passos: [],
      pulados: [],
    });
    const r = planejarLote(
      { ref: "s2", trofeus: [{ ref: "s1/t", trofeuId: "firered-campeao" }] },
      ctx({ refs: new Map([["s1/t", "trofeu"]]) }),
      HOJE,
    );
    expect(r).toMatchObject({ ok: true, passos: [], pulados: ["s1/t (already applied)"] });
  });

  it("troféu já conquistado é pulado, não duplicado", () => {
    const r = planejarLote(
      { ref: "s2", trofeus: [{ ref: "s2/t", trofeuId: "firered-campeao" }] },
      ctx({ obtidos: new Set(["firered-campeao"]) }),
      HOJE,
    );
    expect(r).toMatchObject({ ok: true, passos: [] });
  });

  it("tarefa nova aponta para plano de lote anterior pela ref, ou para plano da tela pelo id", () => {
    const r = planejarLote(
      {
        ref: "s2",
        tarefas: [
          { ref: "s2/a", planoRef: "s1/p", titulo: "A", tipo: "outro" },
          { ref: "s2/b", planoId: "11111111-1111-1111-1111-111111111111", titulo: "B", tipo: "outro" },
        ],
      },
      ctx({ refs: new Map([["s1/p", "plano"]]) }),
      HOJE,
    );
    expect(r.ok && r.passos.map((p) => p.tipo === "tarefa" && p.plano)).toEqual([
      { ref: "s1/p" },
      { id: "11111111-1111-1111-1111-111111111111" },
    ]);
  });

  it("um item inválido recusa o lote inteiro, com todos os erros juntos", () => {
    const r = planejarLote(
      {
        ref: "s3",
        trofeus: [{ ref: "s3/t", trofeuId: "nao-existe" }],
        planos: [{ ref: "s3/p", titulo: "", inicio: "12/10/2026" }],
        tarefas: [{ ref: "s3/x", planoRef: "s9/p", titulo: "X", tipo: "voar" }],
        registros: [{ ref: "s3/r", jogoId: "brilliant-diamond", itens: [{ formaId: "pikachu", normal: 1 }] }],
      },
      ctx(),
      HOJE,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros.join("\n")).toMatch(/unknown trophy "nao-existe"/);
    expect(r.erros.join("\n")).toMatch(/inicio must be/);
    expect(r.erros.join("\n")).toMatch(/planoRef "s9\/p" is not a plano/);
    expect(r.erros.join("\n")).toMatch(/tipo must be one of/);
    expect(r.erros.join("\n")).toMatch(/registros\[0\]: dexLocalNaoPossuido/);
  });

  it("registro com forma fora do catálogo do jogo é recusado", () => {
    const r = planejarLote(
      { ref: "s5", registros: [{ ref: "s5/r", jogoId: "firered", itens: [{ formaId: "turtwig", normal: 1 }] }] },
      ctx({ registro: { formasAtivas: new Set(["turtwig"]), jogosAtivos: new Set(["firered"]), naoTransferiveis: new Set() } }),
      HOJE,
    );
    expect(r).toMatchObject({ ok: false, erros: [expect.stringMatching(/not in firered's catalog: turtwig/)] });
  });

  it("ref repetida no mesmo lote é erro", () => {
    const r = planejarLote(
      {
        ref: "s4",
        trofeus: [
          { ref: "s4/t", trofeuId: "firered-campeao" },
          { ref: "s4/t", trofeuId: "firered-tanoby" },
        ],
      },
      ctx(),
      HOJE,
    );
    expect(r).toMatchObject({ ok: false, erros: [expect.stringMatching(/repeated/)] });
  });
});
