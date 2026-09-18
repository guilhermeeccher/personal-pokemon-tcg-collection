import { describe, expect, it } from "vitest";

import {
  formatarDuracao,
  janelaSemBatimentoSegundos,
  JANELA_SEM_BATIMENTO_MINIMA_SEGUNDOS,
  previsaoDeTermino,
  segundosDeVarredura,
} from "./estimativa-varredura";

describe("segundosDeVarredura", () => {
  it("as 161 vagas da Pokédex no ritmo do robots.txt dão ~16 horas", () => {
    const segundos = segundosDeVarredura({
      tipo: "pokedex",
      vagas: 161,
      intervaloSegundos: 360,
    });
    expect(formatarDuracao(segundos)).toBe("16 h 8 min");
  });

  it("as mesmas 161 vagas a 3 segundos dão ~10 minutos", () => {
    const segundos = segundosDeVarredura({
      tipo: "pokedex",
      vagas: 161,
      intervaloSegundos: 3,
    });
    expect(formatarDuracao(segundos)).toBe("10 min");
  });

  it("o set custa mais por vaga: a carta pode estar na terceira página", () => {
    const pokedex = segundosDeVarredura({ tipo: "pokedex", vagas: 50, intervaloSegundos: 360 });
    const set = segundosDeVarredura({ tipo: "set", vagas: 50, intervaloSegundos: 360 });
    expect(set).toBeGreaterThan(pokedex);
    expect(set / pokedex).toBeCloseTo(1.6, 3);
  });

  it("zero vaga é zero tempo", () => {
    expect(segundosDeVarredura({ tipo: "set", vagas: 0, intervaloSegundos: 360 })).toBe(0);
  });
});

describe("formatarDuracao", () => {
  it("fala em minutos, horas e dias conforme a escala", () => {
    expect(formatarDuracao(30)).toBe("menos de 1 min");
    expect(formatarDuracao(90)).toBe("2 min");
    expect(formatarDuracao(3_600)).toBe("1 h");
    expect(formatarDuracao(3_600 * 16 + 60 * 8)).toBe("16 h 8 min");
    expect(formatarDuracao(3_600 * 24)).toBe("1 d");
    expect(formatarDuracao(3_600 * 30)).toBe("1 d 6 h");
  });

  it("não estoura com valor inválido", () => {
    expect(formatarDuracao(Number.NaN)).toBe("menos de 1 min");
    expect(formatarDuracao(-5)).toBe("menos de 1 min");
  });
});

describe("previsaoDeTermino", () => {
  it("soma a duração ao instante atual", () => {
    const agora = new Date("2026-09-18T08:00:00Z");
    expect(previsaoDeTermino(agora, 3_600 * 16).toISOString()).toBe("2026-09-19T00:00:00.000Z");
  });
});

describe("janelaSemBatimentoSegundos", () => {
  it("acompanha o intervalo: a 360 s uma vaga sozinha passa dos 2 minutos", () => {
    // Janela fixa declararia morta toda rodada viva — e rodada "morta" libera
    // uma segunda em paralelo, que dobra o ritmo contra o site deles.
    const janela = janelaSemBatimentoSegundos(360);
    expect(janela).toBeGreaterThan(360 * 3);
  });

  it("nunca desce abaixo do piso antigo, para quem roda em intervalo curto", () => {
    expect(janelaSemBatimentoSegundos(3)).toBe(JANELA_SEM_BATIMENTO_MINIMA_SEGUNDOS);
    expect(janelaSemBatimentoSegundos(0.5)).toBe(JANELA_SEM_BATIMENTO_MINIMA_SEGUNDOS);
  });

  it("é sempre maior que o intervalo, senão a rodada morre esperando a vez", () => {
    for (const intervalo of [1, 3, 30, 120, 360, 900]) {
      expect(janelaSemBatimentoSegundos(intervalo)).toBeGreaterThan(intervalo);
    }
  });
});
