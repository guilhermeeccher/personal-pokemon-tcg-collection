import { describe, expect, it } from "vitest";

import {
  corteDeFrescor,
  separarPorFrescor,
  VALIDADE_CONSULTA_HORAS,
} from "./frescor-consulta";

const agora = new Date("2026-09-18T12:00:00Z");
const horasAtras = (h: number) => new Date(agora.getTime() - h * 3_600_000);

const vagas = [{ chave: "1" }, { chave: "2" }, { chave: "3" }];
const padrao = { agora, validadeHoras: VALIDADE_CONSULTA_HORAS };

describe("separarPorFrescor", () => {
  it("pula a vaga com opção fresca e mantém a que nunca foi consultada", () => {
    const { pendentes, puladas } = separarPorFrescor(
      vagas,
      new Map([["2", horasAtras(1)]]),
      padrao,
    );

    expect(pendentes.map((v) => v.chave)).toEqual(["1", "3"]);
    expect(puladas.map((v) => v.chave)).toEqual(["2"]);
  });

  it("opção velha demais NÃO é pulada — a rodada nova atualiza o preço", () => {
    // Borda do outro lado: sem isto, a validade viraria "nunca mais consulta".
    const { pendentes, puladas } = separarPorFrescor(
      vagas,
      new Map([
        ["1", horasAtras(25)],
        ["2", horasAtras(48)],
      ]),
      padrao,
    );

    expect(pendentes.map((v) => v.chave)).toEqual(["1", "2", "3"]);
    expect(puladas).toHaveLength(0);
  });

  it("na borda exata da validade, consulta de novo", () => {
    const { pendentes } = separarPorFrescor(
      vagas,
      new Map([["1", horasAtras(VALIDADE_CONSULTA_HORAS)]]),
      padrao,
    );
    expect(pendentes.map((v) => v.chave)).toContain("1");
  });

  it("uma varredura interrompida na metade só consulta o que faltava", () => {
    // O cenário que motivou a fase: 161 vagas, container reiniciado na 120ª.
    const muitas = Array.from({ length: 161 }, (_, i) => ({ chave: String(i + 1) }));
    const jaConsultadas = new Map(
      muitas.slice(0, 120).map((v) => [v.chave, horasAtras(3)] as const),
    );

    const { pendentes, puladas } = separarPorFrescor(muitas, jaConsultadas, padrao);

    expect(pendentes).toHaveLength(41);
    expect(puladas).toHaveLength(120);
    expect(pendentes[0].chave).toBe("121");
  });

  it("validade zero desliga o pulo: tudo é consultado de novo", () => {
    const { pendentes, puladas } = separarPorFrescor(
      vagas,
      new Map(vagas.map((v) => [v.chave, agora] as const)),
      { agora, validadeHoras: 0 },
    );

    expect(pendentes).toHaveLength(3);
    expect(puladas).toHaveLength(0);
  });

  it("preserva a ordem original das vagas", () => {
    const { pendentes } = separarPorFrescor(
      [{ chave: "10" }, { chave: "2" }, { chave: "33" }],
      new Map(),
      padrao,
    );
    expect(pendentes.map((v) => v.chave)).toEqual(["10", "2", "33"]);
  });
});

describe("corteDeFrescor", () => {
  it("é a validade contada para trás a partir de agora", () => {
    expect(corteDeFrescor({ agora, validadeHoras: 6 }).toISOString()).toBe(
      "2026-09-18T06:00:00.000Z",
    );
  });
});
