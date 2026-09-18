import { describe, expect, it } from "vitest";

import { identidadeDaCarta, normalizarNumero } from "./identidade-carta";

describe("normalizarNumero", () => {
  it("tira o zero à esquerda — a busca devolve 003 e a oferta às vezes 3", () => {
    expect(normalizarNumero("003")).toBe("3");
    expect(normalizarNumero("3")).toBe("3");
  });

  it("não mexe em numeração que não é só dígito", () => {
    expect(normalizarNumero("TG01")).toBe("TG01");
    expect(normalizarNumero("SV001")).toBe("SV001");
    expect(normalizarNumero("073p")).toBe("73p");
  });

  it("não come o zero de uma carta que é só zero", () => {
    expect(normalizarNumero("000")).toBe("0");
  });
});

describe("identidadeDaCarta", () => {
  const base = { edid: 730, edicaoSigla: "MEG", numero: "131" };

  it("reconhece a mesma carta entre varreduras, com ou sem zero à esquerda", () => {
    expect(identidadeDaCarta({ ...base, numero: "003" })).toBe(
      identidadeDaCarta({ ...base, numero: "3" }),
    );
  });

  it("separa cartas de edições diferentes com o mesmo número", () => {
    expect(identidadeDaCarta(base)).not.toBe(
      identidadeDaCarta({ ...base, edid: 738 }),
    );
  });

  it("cai na sigla quando a linha não trouxe o edid", () => {
    expect(identidadeDaCarta({ ...base, edid: null })).toBe("sigla:MEG/131");
  });

  it("não confunde um edid com uma sigla de mesmo texto", () => {
    // Sem o prefixo, o edid 738 e uma edição de sigla "738" seriam a mesma
    // linha — e a escolha de uma apareceria marcada na outra.
    expect(identidadeDaCarta({ edid: 738, edicaoSigla: "X", numero: "1" })).not.toBe(
      identidadeDaCarta({ edid: null, edicaoSigla: "738", numero: "1" }),
    );
  });

  it("ignora caixa e espaço da sigla", () => {
    expect(identidadeDaCarta({ edid: null, edicaoSigla: " meg ", numero: "131" })).toBe(
      identidadeDaCarta({ edid: null, edicaoSigla: "MEG", numero: "131" }),
    );
  });
});
