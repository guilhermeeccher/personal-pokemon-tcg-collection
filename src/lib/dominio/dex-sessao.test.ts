import { describe, expect, it } from "vitest";

import { planejarLote, type ContextoSessao } from "./dex-sessao";

const ctx = (extra: Partial<ContextoSessao> = {}): ContextoSessao => ({
  trofeus: new Map([
    ["firered-campeao", "firered"],
    ["firered-tanoby", "firered"],
  ]),
  obtidos: new Set(),
  refs: new Map(),
  entidades: new Map(),
  planos: new Set(["11111111-1111-1111-1111-111111111111"]),
  planosAtivos: new Set(["11111111-1111-1111-1111-111111111111"]),
  tarefas: new Map([["22222222-2222-2222-2222-222222222222", { editavel: true, etapas: 0 }]]),
  etapas: new Map(),
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

  it("registro nascido no HOME (presente) entra já no HOME, com qualquer forma ativa", () => {
    const r = planejarLote(
      { ref: "s6", registros: [{ ref: "s6/r", jogoId: "home", itens: [{ formaId: "pikachu", shiny: 1 }] }] },
      ctx(),
      HOJE,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.passos).toMatchObject([
      { tipo: "registros", jogoId: "home", registros: [{ formaId: "pikachu", shiny: true, jogoOrigem: "home", local: "home" }] },
    ]);
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

describe("planejarLote — etapas", () => {
  const PLANO = "11111111-1111-1111-1111-111111111111";
  const TAREFA = "22222222-2222-2222-2222-222222222222";
  const FECHADA = "33333333-3333-3333-3333-333333333333";
  const ETAPA = "44444444-4444-4444-4444-444444444444";
  const ETAPA_FECHADA = "55555555-5555-5555-5555-555555555555";
  const etapas = (n: number) => Array.from({ length: n }, (_, i) => ({ texto: `Etapa ${i + 1}` }));

  it("tarefa nasce com as etapas, na ordem, aparadas", () => {
    const r = planejarLote(
      {
        ref: "s1",
        planos: [
          {
            ref: "s1/p",
            titulo: "Semana",
            inicio: HOJE,
            tarefas: [
              {
                ref: "s1/p/1",
                titulo: "Missão",
                tipo: "progresso",
                etapas: [{ texto: " Ir ao porto " }, { texto: "Falar com alguém", detalhe: "linha 1\nlinha 2" }],
              },
            ],
          },
        ],
        tarefas: [{ ref: "s1/x", planoId: PLANO, titulo: "Sem etapa", tipo: "outro" }],
      },
      ctx(),
      HOJE,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.passos[1]).toMatchObject({
      tipo: "tarefa",
      etapas: [
        { texto: "Ir ao porto", detalhe: null },
        { texto: "Falar com alguém", detalhe: "linha 1\nlinha 2" },
      ],
    });
    expect(r.passos[2]).toMatchObject({ tipo: "tarefa", etapas: [] });
  });

  it("etapa inválida ou mais de 50 na tarefa recusa o lote", () => {
    const r = planejarLote(
      {
        ref: "s1",
        tarefas: [
          { ref: "s1/a", planoId: PLANO, titulo: "A", tipo: "outro", etapas: [{ texto: "" }] },
          { ref: "s1/b", planoId: PLANO, titulo: "B", tipo: "outro", etapas: etapas(51) },
          { ref: "s1/c", planoId: PLANO, titulo: "C", tipo: "outro", etapas: "ir" },
        ],
      },
      ctx(),
      HOJE,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros).toEqual([
      "tarefas[0]: etapas[0]: missing texto",
      "tarefas[1]: a task takes at most 50 steps",
      "tarefas[2]: etapas must be a list",
    ]);
  });

  it("acrescenta etapas no fim de tarefa da tela (id), de lote anterior (ref) e deste lote (ref)", () => {
    const r = planejarLote(
      {
        ref: "s2",
        tarefas: [{ ref: "s2/t", planoId: PLANO, titulo: "Nova", tipo: "outro", etapas: etapas(2) }],
        etapas: [
          { tipo: "etapas", ref: "s2/e1", tarefaId: TAREFA, etapas: [{ texto: "Da tela" }] },
          { tipo: "etapas", ref: "s2/e2", tarefaRef: "s1/t", etapas: [{ texto: "De antes", detalhe: "" }] },
          { tipo: "etapas", ref: "s2/e3", tarefaRef: "s2/t", etapas: [{ texto: "Deste lote" }] },
        ],
      },
      ctx({ refs: new Map([["s1/t", "tarefa"]]), entidades: new Map([["s1/t", TAREFA]]) }),
      HOJE,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.passos.map((p) => p.tipo)).toEqual(["tarefa", "etapas", "etapas", "etapas"]);
    expect(r.passos.slice(1)).toMatchObject([
      { tarefa: { id: TAREFA }, etapas: [{ texto: "Da tela" }] },
      { tarefa: { ref: "s1/t" }, etapas: [{ texto: "De antes", detalhe: null }] },
      { tarefa: { ref: "s2/t" }, etapas: [{ texto: "Deste lote" }] },
    ]);
  });

  it("acrescentar é idempotente pela ref, mesmo que a tarefa tenha fechado depois", () => {
    const r = planejarLote(
      { ref: "s3", etapas: [{ ref: "s2/e1", tarefaId: FECHADA, etapas: [{ texto: "x" }] }] },
      ctx({
        refs: new Map([["s2/e1", "etapas"]]),
        tarefas: new Map([[FECHADA, { editavel: false, etapas: 1 }]]),
      }),
      HOJE,
    );
    expect(r).toMatchObject({ ok: true, passos: [], pulados: ["s2/e1 (already applied)"] });
  });

  it("acrescentar recusa tarefa fechada, lista vazia, alvo inexistente e o 51º", () => {
    const r = planejarLote(
      {
        ref: "s3",
        etapas: [
          { ref: "s3/a", tarefaId: FECHADA, etapas: [{ texto: "x" }] },
          { ref: "s3/b", tarefaId: TAREFA, etapas: [] },
          { ref: "s3/c", tarefaRef: "s9/t", etapas: [{ texto: "x" }] },
          { ref: "s3/d", tarefaId: TAREFA, etapas: etapas(2) },
          { ref: "s3/e", tarefaId: TAREFA, etapas: etapas(1) },
        ],
      },
      ctx({
        tarefas: new Map([
          [TAREFA, { editavel: true, etapas: 48 }],
          [FECHADA, { editavel: false, etapas: 0 }],
        ]),
      }),
      HOJE,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros).toEqual([
      "etapas[0]: the task is not open in an active plan",
      "etapas[1]: etapas must not be empty",
      'etapas[2]: tarefaRef "s9/t" is not a tarefa created by a session',
      // 48 + 2 cabem; a terceira soma o que o próprio lote já acrescentou.
      "etapas[4]: a task takes at most 50 steps (it has 50)",
    ]);
  });

  it("tarefa nova em plano fechado não recebe etapas por item à parte", () => {
    const FECHADO = "66666666-6666-6666-6666-666666666666";
    const r = planejarLote(
      {
        ref: "s4",
        tarefas: [{ ref: "s4/t", planoId: FECHADO, titulo: "T", tipo: "outro" }],
        etapas: [{ ref: "s4/e", tarefaRef: "s4/t", etapas: [{ texto: "x" }] }],
      },
      ctx({ planos: new Set([PLANO, FECHADO]) }),
      HOJE,
    );
    expect(r).toMatchObject({ ok: false, erros: ["etapas[0]: the task is not open in an active plan"] });
  });

  it("marca e desmarca etapa pelo id, só em tarefa aberta de plano ativo", () => {
    const contexto = ctx({
      tarefas: new Map([
        [TAREFA, { editavel: true, etapas: 1 }],
        [FECHADA, { editavel: false, etapas: 1 }],
      ]),
      etapas: new Map([
        [ETAPA, TAREFA],
        [ETAPA_FECHADA, FECHADA],
      ]),
    });
    const ok = planejarLote(
      {
        ref: "s5",
        status: [
          { tipo: "status-etapa", etapaId: ETAPA, feita: true },
          { tipo: "status-etapa", etapaId: ETAPA, feita: false },
        ],
      },
      contexto,
      HOJE,
    );
    expect(ok).toMatchObject({
      ok: true,
      passos: [
        { tipo: "status-etapa", etapaId: ETAPA, feita: true },
        { tipo: "status-etapa", etapaId: ETAPA, feita: false },
      ],
    });
    const recusado = planejarLote(
      {
        ref: "s6",
        status: [
          { etapaId: ETAPA_FECHADA, feita: true },
          { etapaId: "77777777-7777-7777-7777-777777777777", feita: true },
          { etapaId: ETAPA, feita: "sim" },
        ],
      },
      contexto,
      HOJE,
    );
    expect(recusado).toMatchObject({
      ok: false,
      erros: [
        "status[0]: the step's task is not open in an active plan",
        'status[1]: etapaId "77777777-7777-7777-7777-777777777777" does not exist',
        "status[2]: feita must be true or false",
      ],
    });
  });

  it("etapas e status-etapa entram na ordem das listas: tarefas, etapas, status", () => {
    const r = planejarLote(
      {
        ref: "s7",
        status: [{ etapaId: ETAPA, feita: true }],
        etapas: [{ ref: "s7/e", tarefaId: TAREFA, etapas: [{ texto: "x" }] }],
        tarefas: [{ ref: "s7/t", planoId: PLANO, titulo: "T", tipo: "outro" }],
      },
      ctx({ etapas: new Map([[ETAPA, TAREFA]]) }),
      HOJE,
    );
    expect(r.ok && r.passos.map((p) => p.tipo)).toEqual(["tarefa", "etapas", "status-etapa"]);
  });
});
