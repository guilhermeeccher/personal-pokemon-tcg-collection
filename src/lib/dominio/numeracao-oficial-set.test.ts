import { describe, expect, it } from "vitest";

import { resolverUniversoVagasSet } from "./numeracao-oficial-set";

describe("resolverUniversoVagasSet", () => {
  it("caso normal (sv03.5, 165/207): não é afetado, sem incluir secretas", () => {
    const universo = resolverUniversoVagasSet({
      qtdOficial: 165,
      qtdTotal: 207,
      incluirSecretas: false,
      qtdCartasNoCatalogo: 207,
    });
    expect(universo.vagasEsperadas).toBe(165);
    expect(universo.avisoSemNumeracaoOficial).toBeNull();
  });

  it("caso normal (sv03.5, 165/207): incluindo secretas, sem aviso", () => {
    const universo = resolverUniversoVagasSet({
      qtdOficial: 165,
      qtdTotal: 207,
      incluirSecretas: true,
      qtdCartasNoCatalogo: 207,
    });
    expect(universo.vagasEsperadas).toBe(207);
    expect(universo.avisoSemNumeracaoOficial).toBeNull();
  });

  it("caso mep (qtdOficial=0, qtdTotal=88, 88 cartas no catálogo): usa total como universo e avisa", () => {
    const universo = resolverUniversoVagasSet({
      qtdOficial: 0,
      qtdTotal: 88,
      incluirSecretas: false,
      qtdCartasNoCatalogo: 88,
    });
    expect(universo.vagasEsperadas).toBe(88);
    expect(universo.avisoSemNumeracaoOficial).toEqual({ qtdTotal: 88 });
  });

  it("caso mep: incluirSecretas não muda nada — não há separação oficial/secreta pra alternar", () => {
    const semSecretas = resolverUniversoVagasSet({
      qtdOficial: 0,
      qtdTotal: 88,
      incluirSecretas: false,
      qtdCartasNoCatalogo: 88,
    });
    const comSecretas = resolverUniversoVagasSet({
      qtdOficial: 0,
      qtdTotal: 88,
      incluirSecretas: true,
      qtdCartasNoCatalogo: 88,
    });
    expect(semSecretas.vagasEsperadas).toBe(comSecretas.vagasEsperadas);
    expect(semSecretas.avisoSemNumeracaoOficial).toEqual(comSecretas.avisoSemNumeracaoOficial);
  });

  it("qtdOficial=0 e catálogo local sem nenhuma carta desse set: não finge universo, devolve 0 sem aviso", () => {
    // Defensivo: na prática `obterInfoSetParaVagas` já devolve null (e a
    // rota recusa a criação) antes de chegar aqui quando não há carta
    // nenhuma — mas esta função não deve inventar um universo em cima
    // de zero cartas conhecidas.
    const universo = resolverUniversoVagasSet({
      qtdOficial: 0,
      qtdTotal: 0,
      incluirSecretas: false,
      qtdCartasNoCatalogo: 0,
    });
    expect(universo.vagasEsperadas).toBe(0);
    expect(universo.avisoSemNumeracaoOficial).toBeNull();
  });

  it("qtdOficial > 0 nunca dispara o aviso, mesmo com catálogo local vazio (caso de catálogo incompleto, tratado à parte)", () => {
    const universo = resolverUniversoVagasSet({
      qtdOficial: 48,
      qtdTotal: 48,
      incluirSecretas: false,
      qtdCartasNoCatalogo: 0,
    });
    expect(universo.avisoSemNumeracaoOficial).toBeNull();
    expect(universo.vagasEsperadas).toBe(48);
  });
});
