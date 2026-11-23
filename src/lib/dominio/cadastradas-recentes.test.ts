import { describe, expect, it } from "vitest";

import {
  cadastradasNaJanela,
  diaNoFuso,
  inicioDoDia,
  janelaCadastradas,
  rotuloDoDia,
  somarDias,
} from "./cadastradas-recentes";

describe("diaNoFuso", () => {
  it("vira o dia às 00:00 de São Paulo, não às 00:00 UTC", () => {
    expect(diaNoFuso(new Date("2026-11-23T02:59:59Z"))).toBe("2026-11-22");
    expect(diaNoFuso(new Date("2026-11-23T03:00:00Z"))).toBe("2026-11-23");
  });
});

describe("inicioDoDia", () => {
  it("é 03:00 UTC sem horário de verão", () => {
    expect(inicioDoDia("2026-11-17").toISOString()).toBe("2026-11-17T03:00:00.000Z");
  });

  it("é 02:00 UTC num dia de horário de verão (São Paulo até 2019)", () => {
    expect(inicioDoDia("2018-12-10").toISOString()).toBe("2018-12-10T02:00:00.000Z");
  });

  it("no dia em que o relógio pulou a meia-noite, é o primeiro instante que existiu", () => {
    // 2018-11-04: 00:00 virou 01:00 (−02:00), ou seja, 03:00 UTC.
    expect(inicioDoDia("2018-11-04").toISOString()).toBe("2018-11-04T03:00:00.000Z");
  });

  it("no dia em que o horário de verão acabou, a meia-noite é a de −03:00", () => {
    // 2019-02-17: à meia-noite de −02:00 o relógio voltou para 23:00 do dia 16.
    expect(inicioDoDia("2019-02-17").toISOString()).toBe("2019-02-17T03:00:00.000Z");
  });
});

describe("somarDias", () => {
  it("atravessa mês e ano", () => {
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(somarDias("2026-01-03", -6)).toBe("2025-12-28");
  });
});

describe("janelaCadastradas", () => {
  it("são hoje e os seis dias antes, a partir de 00:00 de São Paulo", () => {
    // 2026-11-23 às 01:00 em São Paulo.
    const j = janelaCadastradas(new Date("2026-11-23T04:00:00Z"));
    expect(j).toEqual({ hoje: "2026-11-23", desde: "2026-11-17", inicio: new Date("2026-11-17T03:00:00Z") });
  });

  it("à noite em São Paulo o dia ainda é o de lá, mesmo já sendo amanhã em UTC", () => {
    // 2026-11-23T01:30Z = 22:30 do dia 22 em São Paulo.
    const j = janelaCadastradas(new Date("2026-11-23T01:30:00Z"));
    expect(j.hoje).toBe("2026-11-22");
    expect(j.desde).toBe("2026-11-16");
  });

  it("recusa um número de dias que não é inteiro positivo", () => {
    expect(() => janelaCadastradas(new Date(), 0)).toThrow();
  });
});

describe("cadastradasNaJanela", () => {
  const janela = janelaCadastradas(new Date("2026-11-23T15:00:00Z"));
  const copia = (copiaId: string, criadoEm: string) => ({ copiaId, cartaId: `c-${copiaId}`, criadoEm: new Date(criadoEm), quantidade: 1 });

  it("conta o primeiro instante da janela e descarta o último antes dela", () => {
    const r = cadastradasNaJanela(
      [copia("a", "2026-11-17T03:00:00Z"), copia("b", "2026-11-17T02:59:59Z")],
      janela,
    );
    expect(r.map((c) => c.copiaId)).toEqual(["a"]);
    expect(r[0].dia).toBe("2026-11-17");
  });

  it("ordena da mais recente para a mais antiga, com o id desempatando", () => {
    const r = cadastradasNaJanela(
      [copia("a", "2026-11-20T10:00:00Z"), copia("c", "2026-11-22T10:00:00Z"), copia("b", "2026-11-22T10:00:00Z")],
      janela,
    );
    expect(r.map((c) => c.copiaId)).toEqual(["c", "b", "a"]);
  });

  it("o dia de cada cópia é o de São Paulo", () => {
    const [c] = cadastradasNaJanela([copia("a", "2026-11-23T01:00:00Z")], janela);
    expect(c.dia).toBe("2026-11-22");
  });

  it("a parte separada de um lote antigo, que guarda a data da original, não entra", () => {
    // A alocação de hoje dividiu um lote cadastrado em março: a linha nova
    // nasce com o `criado_em` de março (`parteSeparadaDoLote`).
    expect(cadastradasNaJanela([copia("parte", "2026-03-04T15:00:00Z")], janela)).toEqual([]);
  });
});

describe("rotuloDoDia", () => {
  it("hoje, ontem e, antes disso, a data", () => {
    expect(rotuloDoDia("2026-11-23", "2026-11-23")).toEqual({ tipo: "hoje" });
    expect(rotuloDoDia("2026-11-22", "2026-11-23")).toEqual({ tipo: "ontem" });
    expect(rotuloDoDia("2026-11-21", "2026-11-23")).toEqual({ tipo: "data", dia: "2026-11-21" });
  });

  it("ontem atravessa a virada do mês", () => {
    expect(rotuloDoDia("2026-11-30", "2026-12-01")).toEqual({ tipo: "ontem" });
  });
});
