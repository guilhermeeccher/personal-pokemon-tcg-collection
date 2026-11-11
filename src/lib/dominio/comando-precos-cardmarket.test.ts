import { describe, expect, it } from "vitest";

import {
  codigoDeSaidaPrecosCardmarket,
  duracaoEmSegundos,
  fotoAnteriorNoGrafico,
  lerArgumentosPrecosCardmarket,
  recusaPrevista,
  resumoLegivelPrecosCardmarket,
  resumoLegivelSimulacao,
  SAIDA_ERRO,
  SAIDA_OK,
  saidaJsonPrecosCardmarket,
  saidaJsonSimulacao,
  type DesfechoPrecosCardmarket,
} from "./comando-precos-cardmarket";
import { VALIDADE_CONSULTA_HORAS } from "./frescor-consulta";
import type { PontoDaSerie } from "./historico-precos";
import { recusa } from "./recusa";

/** Pontos inventados, só para a forma. */
const ponto = (tiradoEm: string, somaMedios: number, cartasComPreco: number): PontoDaSerie => ({
  tiradoEm,
  somaMedios,
  cartasComPreco,
  precoMedioPorCarta: Math.round((somaMedios / cartasComPreco) * 100) / 100,
});

const resumoOk = { cartasConsultadas: 4, cartasComFalha: 0, achadas: 3, naoAchadas: 1, requisicoes: 5 };

const rodadaOk: Extract<DesfechoPrecosCardmarket, { tipo: "rodada" }> = {
  tipo: "rodada",
  rodadaId: "r-nova",
  resumo: resumoOk,
  cotacao: { cotacao: 6.1234, data: "2026-01-09" },
  foto: ponto("2026-01-09T10:00:00.000Z", 123.45, 3),
  anterior: ponto("2026-01-02T10:00:00.000Z", 100, 2),
};

describe("lerArgumentosPrecosCardmarket", () => {
  it("sem argumento: sem JSON, sem simular, validade padrão", () => {
    expect(lerArgumentosPrecosCardmarket([])).toEqual({
      ok: true,
      args: { json: false, simular: false, ajuda: false, validadeHoras: VALIDADE_CONSULTA_HORAS },
    });
  });

  it("lê --json, --simular e a validade nas duas formas, e ignora um -- solto", () => {
    expect(lerArgumentosPrecosCardmarket(["--", "--json", "--validade-horas", "12"])).toEqual({
      ok: true,
      args: { json: true, simular: false, ajuda: false, validadeHoras: 12 },
    });
    expect(lerArgumentosPrecosCardmarket(["--simular", "--validade-horas=0.5"])).toMatchObject({
      ok: true,
      args: { simular: true, validadeHoras: 0.5 },
    });
    expect(lerArgumentosPrecosCardmarket(["--validade-horas", "0"])).toMatchObject({
      args: { validadeHoras: 0 },
    });
    expect(lerArgumentosPrecosCardmarket(["-h"])).toMatchObject({ args: { ajuda: true } });
  });

  it("validade ausente, vazia, negativa ou fora do formato é uso errado", () => {
    for (const argv of [
      ["--validade-horas"],
      ["--validade-horas="],
      ["--validade-horas", "-1"],
      ["--validade-horas", "1e3"],
      ["--validade-horas", "doze"],
      ["--validade-horas", "Infinity"],
    ]) {
      expect(lerArgumentosPrecosCardmarket(argv).ok).toBe(false);
    }
  });

  it("argumento desconhecido ou validade repetida é uso errado, não o padrão", () => {
    expect(lerArgumentosPrecosCardmarket(["--jsno"])).toMatchObject({ ok: false });
    expect(lerArgumentosPrecosCardmarket(["--validade-horas", "1", "--validade-horas=2"])).toMatchObject({
      ok: false,
    });
  });
});

describe("codigoDeSaidaPrecosCardmarket", () => {
  it("rodada sem erro sai 0; rodada concluída com erro sai 1", () => {
    expect(codigoDeSaidaPrecosCardmarket(rodadaOk)).toBe(SAIDA_OK);
    expect(codigoDeSaidaPrecosCardmarket({ ...rodadaOk, resumo: { ...resumoOk, erro: "bloqueado" } })).toBe(
      SAIDA_ERRO,
    );
  });

  it("já consultado, em andamento e nada a consultar não são falha", () => {
    for (const chave of ["precosJaConsultados", "precosEmAndamento", "semCartasEspeciais"]) {
      expect(codigoDeSaidaPrecosCardmarket({ tipo: "recusada", recusa: recusa(chave) })).toBe(SAIDA_OK);
    }
  });

  it("cotação indisponível, recusa desconhecida e exceção são erro", () => {
    expect(codigoDeSaidaPrecosCardmarket({ tipo: "recusada", recusa: recusa("cotacaoIndisponivel") })).toBe(
      SAIDA_ERRO,
    );
    expect(codigoDeSaidaPrecosCardmarket({ tipo: "recusada", recusa: recusa("outraQualquer") })).toBe(SAIDA_ERRO);
    expect(codigoDeSaidaPrecosCardmarket({ tipo: "erro", erro: "conexão caiu" })).toBe(SAIDA_ERRO);
  });
});

describe("fotoAnteriorNoGrafico", () => {
  const serie = [
    ponto("2026-01-01T00:00:00.000Z", 10, 1),
    ponto("2026-01-05T00:00:00.000Z", 20, 2),
    ponto("2026-01-09T10:00:00.000Z", 30, 3),
  ];

  it("é a mais recente estritamente antes — a desta rodada fica de fora", () => {
    expect(fotoAnteriorNoGrafico(serie, new Date("2026-01-09T10:00:00.000Z"))).toEqual(serie[1]);
  });

  it("sem foto antes, null", () => {
    expect(fotoAnteriorNoGrafico(serie, new Date("2026-01-01T00:00:00.000Z"))).toBeNull();
    expect(fotoAnteriorNoGrafico([], new Date())).toBeNull();
  });

  it("não depende da ordem da série", () => {
    expect(fotoAnteriorNoGrafico([...serie].reverse(), new Date("2026-02-01T00:00:00.000Z"))).toEqual(serie[2]);
  });
});

describe("saidaJsonPrecosCardmarket", () => {
  it("rodada ok: contadores, cotação, a soma desta foto e a anterior", () => {
    expect(saidaJsonPrecosCardmarket(rodadaOk, 3.2)).toEqual({
      status: "ok",
      rodadaId: "r-nova",
      cartasConsultadas: 4,
      cartasComFalha: 0,
      encontradas: 3,
      naoEncontradas: 1,
      requisicoes: 5,
      cotacao: { valor: 6.1234, data: "2026-01-09" },
      soma: 123.45,
      cartasComPreco: 3,
      somaAnterior: 100,
      cartasComPrecoAnterior: 2,
      anteriorEm: "2026-01-02T10:00:00.000Z",
      duracaoSegundos: 3.2,
    });
  });

  it("primeira foto da fonte: a anterior é null, não ausente; sem foto, sem soma", () => {
    const primeira = saidaJsonPrecosCardmarket({ ...rodadaOk, anterior: null }, 1);
    expect(primeira).toMatchObject({ somaAnterior: null, cartasComPrecoAnterior: null, anteriorEm: null });
    const semFoto = saidaJsonPrecosCardmarket({ ...rodadaOk, foto: null }, 1);
    expect(semFoto).not.toHaveProperty("soma");
    expect(semFoto).not.toHaveProperty("cartasComPreco");
  });

  it("rodada concluída com erro: status erro, com o texto e os números que ela chegou a fazer", () => {
    const d: DesfechoPrecosCardmarket = {
      ...rodadaOk,
      resumo: { cartasConsultadas: 2, cartasComFalha: 0, achadas: 2, naoAchadas: 0, requisicoes: 3, erro: "bloqueio" },
    };
    expect(saidaJsonPrecosCardmarket(d, 1)).toMatchObject({
      status: "erro",
      erro: "bloqueio",
      cartasConsultadas: 2,
      soma: 123.45,
    });
  });

  it("recusa: a chave, contadores zerados, e o motivo técnico só quando há", () => {
    expect(
      saidaJsonPrecosCardmarket(
        { tipo: "recusada", recusa: recusa("precosJaConsultados", { total: "7", horas: "24" }) },
        0.4,
      ),
    ).toEqual({
      status: "recusada",
      recusa: "precosJaConsultados",
      cartasConsultadas: 0,
      cartasComFalha: 0,
      encontradas: 0,
      naoEncontradas: 0,
      requisicoes: 0,
      duracaoSegundos: 0.4,
    });
    expect(
      saidaJsonPrecosCardmarket({ tipo: "recusada", recusa: recusa("precosEmAndamento"), rodadaId: "r-viva" }, 0),
    ).toMatchObject({ recusa: "precosEmAndamento", rodadaId: "r-viva" });
    expect(
      saidaJsonPrecosCardmarket(
        { tipo: "recusada", recusa: recusa("cotacaoIndisponivel"), detalhe: "HTTP 503" },
        0,
      ),
    ).toMatchObject({ status: "recusada", recusa: "cotacaoIndisponivel", erro: "HTTP 503" });
  });

  it("exceção: status erro com o texto", () => {
    expect(saidaJsonPrecosCardmarket({ tipo: "erro", erro: "conexão caiu" }, 0)).toMatchObject({
      status: "erro",
      erro: "conexão caiu",
      cartasConsultadas: 0,
    });
  });

  it("vira uma linha só de JSON", () => {
    const linha = JSON.stringify(saidaJsonPrecosCardmarket(rodadaOk, 1));
    expect(linha).not.toContain("\n");
    expect(JSON.parse(linha)).toMatchObject({ status: "ok" });
  });
});

describe("simulação", () => {
  const base = {
    cartasParaConsultar: 3,
    cartasPuladas: 2,
    cartasEspeciais: 5,
    rodadaEmAndamento: null,
    validadeHoras: 24,
  };

  it("prevê a recusa na ordem da rodada de verdade", () => {
    expect(recusaPrevista(base)).toBeNull();
    expect(recusaPrevista({ ...base, rodadaEmAndamento: "r-1", cartasParaConsultar: 0 })).toBe("precosEmAndamento");
    expect(recusaPrevista({ ...base, cartasEspeciais: 0, cartasParaConsultar: 0, cartasPuladas: 0 })).toBe(
      "semCartasEspeciais",
    );
    expect(recusaPrevista({ ...base, cartasParaConsultar: 0, cartasPuladas: 5 })).toBe("precosJaConsultados");
  });

  it("a linha de JSON diz quantas consultaria e quantas pularia", () => {
    expect(saidaJsonSimulacao(base, 0.1)).toEqual({
      status: "simulacao",
      cartasParaConsultar: 3,
      cartasPuladas: 2,
      validadeHoras: 24,
      rodadaEmAndamento: null,
      recusaPrevista: null,
      duracaoSegundos: 0.1,
    });
    expect(resumoLegivelSimulacao(base).join("\n")).toContain("would look up 3 card(s) and skip 2");
  });
});

describe("resumo legível", () => {
  it("diz a rodada, os números, a cotação, o total e o anterior", () => {
    const texto = resumoLegivelPrecosCardmarket(rodadaOk, 3.2).join("\n");
    expect(texto).toContain("round r-nova finished.");
    expect(texto).toContain("found 3");
    expect(texto).toContain("EUR 1 = BRL 6.1234 (PTAX of 2026-01-09)");
    expect(texto).toContain("R$123.45 over 3 cards");
    expect(texto).toContain("previous: R$100.00 over 2 cards");
  });

  it("explica a recusa em inglês", () => {
    expect(
      resumoLegivelPrecosCardmarket(
        { tipo: "recusada", recusa: recusa("precosJaConsultados", { total: "7", horas: "24" }) },
        0,
      )[0],
    ).toContain("all 7 special cards were looked up in the last 24 h");
  });
});

describe("duracaoEmSegundos", () => {
  it("arredonda a um décimo de segundo", () => {
    expect(duracaoEmSegundos(31_249)).toBe(31.2);
    expect(duracaoEmSegundos(0)).toBe(0);
  });
});
