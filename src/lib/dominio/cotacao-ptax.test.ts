import { describe, expect, it } from "vitest";

import { dataOlinda, escolherPtaxDeFechamento, urlPtaxPeriodo } from "./cotacao-ptax";

describe("urlPtaxPeriodo", () => {
  it("monta a consulta de período da Olinda com as datas MM-DD-YYYY", () => {
    const url = urlPtaxPeriodo(
      "EUR",
      new Date("2026-03-01T15:00:00Z"),
      new Date("2026-03-11T15:00:00Z"),
    );
    expect(url).toBe(
      "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/" +
        "CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)" +
        "?@moeda='EUR'&@dataInicial='03-01-2026'&@dataFinalCotacao='03-11-2026'" +
        "&$format=json&$select=cotacaoVenda,dataHoraCotacao,tipoBoletim",
    );
  });

  it("recusa o que não é código de moeda", () => {
    for (const moeda of ["eur", "EURO", "E'R", ""]) {
      expect(() => urlPtaxPeriodo(moeda, new Date(), new Date())).toThrow();
    }
  });
});

describe("dataOlinda", () => {
  it("usa o dia de São Paulo, não o de UTC", () => {
    // 01h UTC do dia 12 ainda é a noite do dia 11 em São Paulo (UTC−3).
    expect(dataOlinda(new Date("2026-03-12T01:00:00Z"))).toBe("03-11-2026");
    expect(dataOlinda(new Date("2026-03-12T04:00:00Z"))).toBe("03-12-2026");
  });
});

describe("escolherPtaxDeFechamento", () => {
  it("fica com o fechamento mais recente, ignorando abertura e intermediários", () => {
    const r = escolherPtaxDeFechamento({
      value: [
        { cotacaoVenda: 6.01, dataHoraCotacao: "2026-03-09 13:05:11.120", tipoBoletim: "Fechamento" },
        { cotacaoVenda: 6.03, dataHoraCotacao: "2026-03-10 13:07:30.415", tipoBoletim: "Fechamento" },
        { cotacaoVenda: 6.5, dataHoraCotacao: "2026-03-11 10:04:12.300", tipoBoletim: "Abertura" },
        { cotacaoVenda: 6.6, dataHoraCotacao: "2026-03-11 11:06:40.900", tipoBoletim: "Intermediário" },
        { cotacaoVenda: 6.02, dataHoraCotacao: "2026-03-06 13:02:00.000", tipoBoletim: "Fechamento" },
      ],
    });
    expect(r).toEqual({ cotacao: 6.03, data: "2026-03-10" });
  });

  it("descarta cotação zero, negativa, não numérica ou com data fora do formato", () => {
    const r = escolherPtaxDeFechamento({
      value: [
        { cotacaoVenda: 6.01, dataHoraCotacao: "2026-03-09 13:05:11.120", tipoBoletim: "Fechamento" },
        { cotacaoVenda: 0, dataHoraCotacao: "2026-03-10 13:00:00.000", tipoBoletim: "Fechamento" },
        { cotacaoVenda: -1, dataHoraCotacao: "2026-03-11 13:00:00.000", tipoBoletim: "Fechamento" },
        { cotacaoVenda: "6.9", dataHoraCotacao: "2026-03-12 13:00:00.000", tipoBoletim: "Fechamento" },
        { cotacaoVenda: 6.9, dataHoraCotacao: "13/03/2026", tipoBoletim: "Fechamento" },
        { cotacaoVenda: 6.9, tipoBoletim: "Fechamento" },
        null,
        "lixo",
      ],
    });
    expect(r).toEqual({ cotacao: 6.01, data: "2026-03-09" });
  });

  it("sem fechamento válido, ou resposta fora do formato, devolve null", () => {
    expect(
      escolherPtaxDeFechamento({
        value: [{ cotacaoVenda: 6.5, dataHoraCotacao: "2026-03-11 10:04:12.300", tipoBoletim: "Abertura" }],
      }),
    ).toBeNull();
    for (const r of [null, undefined, 1, "x", {}, { value: {} }, { value: [] }]) {
      expect(escolherPtaxDeFechamento(r)).toBeNull();
    }
  });
});
