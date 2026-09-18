import { describe, expect, it } from "vitest";

import { calcularProgressoPorRegiao, type VagaParaProgresso } from "./progresso-regiao";

function vaga(chave: number, preenchida: boolean): VagaParaProgresso {
  return { chave: String(chave), preenchida };
}

describe("calcularProgressoPorRegiao", () => {
  it("só lista regiões presentes no escopo — Kanto sozinho não lista Johto", () => {
    const vagas = [vaga(1, true), vaga(2, false), vaga(151, true)];
    const progresso = calcularProgressoPorRegiao(vagas);
    expect(progresso).toEqual([{ regiao: "kanto", total: 3, preenchidas: 2 }]);
  });

  it("agrupa duas regiões, na ordem Kanto → Johto mesmo com vagas fora de ordem", () => {
    const vagas = [vaga(200, true), vaga(1, true), vaga(2, false), vaga(160, false)];
    const progresso = calcularProgressoPorRegiao(vagas);
    expect(progresso).toEqual([
      { regiao: "kanto", total: 2, preenchidas: 1 },
      { regiao: "johto", total: 2, preenchidas: 1 },
    ]);
  });

  it("escopo nacional completo lista as 9 regiões com os totais corretos", () => {
    const vagas: VagaParaProgresso[] = [];
    for (let n = 1; n <= 1025; n++) vagas.push(vaga(n, n <= 151));
    const progresso = calcularProgressoPorRegiao(vagas);
    expect(progresso).toHaveLength(9);
    expect(progresso[0]).toEqual({ regiao: "kanto", total: 151, preenchidas: 151 });
    expect(progresso[1]).toEqual({ regiao: "johto", total: 100, preenchidas: 0 });
    expect(progresso[8]).toEqual({ regiao: "paldea", total: 120, preenchidas: 0 });
  });

  it("lista vazia devolve array vazio", () => {
    expect(calcularProgressoPorRegiao([])).toEqual([]);
  });
});
