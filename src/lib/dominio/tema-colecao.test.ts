import { describe, expect, it } from "vitest";

import {
  colecaoDoMesmoTema,
  ehRaridadeTematica,
  linhaCasaComTema,
  raridadeCanonica,
  temaDaColecao,
  temasDaLinha,
  validarParametroCustomizada,
  validarValorTema,
  type LinhaTematica,
} from "./tema-colecao";

const linha = (parcial: Partial<LinhaTematica> = {}): LinhaTematica => ({
  dexIds: [26],
  tipos: ["Lightning"],
  ilustrador: "Ilustrador Inventado",
  raridade: "Rare",
  raridadeEn: null,
  forma: "normal",
  ...parcial,
});

describe("temasDaLinha", () => {
  it("uma carta de espécie única cabe na espécie, no tipo, no ilustrador e na raridade", () => {
    expect(temasDaLinha(linha())).toEqual([
      { tipo: "especie", valor: "26" },
      { tipo: "tipo", valor: "Lightning" },
      { tipo: "ilustrador", valor: "Ilustrador Inventado" },
      { tipo: "raridade", valor: "Rare" },
    ]);
  });

  it("a forma conta para a espécie e também como tema de forma (regra 3)", () => {
    const temas = temasDaLinha(linha({ forma: "alola" }));
    expect(temas).toContainEqual({ tipo: "especie", valor: "26" });
    expect(temas).toContainEqual({ tipo: "forma", valor: "alola" });
  });

  it("carta de vários Pokémon não cabe em espécie nenhuma (regra 2)", () => {
    const temas = temasDaLinha(linha({ dexIds: [25, 26] }));
    expect(temas.some((t) => t.tipo === "especie")).toBe(false);
  });

  it("carta de dois tipos conta nos dois; sem tipo, em nenhum", () => {
    expect(temasDaLinha(linha({ tipos: ["Water", "Psychic"] })).filter((t) => t.tipo === "tipo")).toEqual([
      { tipo: "tipo", valor: "Water" },
      { tipo: "tipo", valor: "Psychic" },
    ]);
    expect(temasDaLinha(linha({ tipos: [] })).some((t) => t.tipo === "tipo")).toBe(false);
  });

  it("ilustrador vazio ou nulo não faz tema; grafias diferentes são temas diferentes", () => {
    expect(temasDaLinha(linha({ ilustrador: null })).some((t) => t.tipo === "ilustrador")).toBe(false);
    expect(temasDaLinha(linha({ ilustrador: "  " })).some((t) => t.tipo === "ilustrador")).toBe(false);
    expect(linhaCasaComTema(linha({ ilustrador: "Fulano" }), { tipo: "ilustrador", valor: "fulano" })).toBe(false);
  });
});

describe("ehRaridadeTematica", () => {
  it("deixa de fora comum, incomum, Promo e a ausência de raridade", () => {
    for (const r of ["Comum", "Common", "Incomum", "Uncommon", "Promo", "None", "Sem raridade", "", null]) {
      expect(ehRaridadeTematica(r)).toBe(false);
    }
  });

  it("o valor canônico é a raridade da linha en; sem ela, a gravada", () => {
    expect(raridadeCanonica({ raridade: "Rara Dupla", raridadeEn: "Double rare" })).toBe("Double rare");
    expect(raridadeCanonica({ raridade: "Rara", raridadeEn: null })).toBe("Rara");
    expect(raridadeCanonica({ raridade: "Rara", raridadeEn: " " })).toBe("Rara");
    const pt = linha({ raridade: "Rara Dupla", raridadeEn: "Double rare" });
    expect(linhaCasaComTema(pt, { tipo: "raridade", valor: "Double rare" })).toBe(true);
    expect(linhaCasaComTema(pt, { tipo: "raridade", valor: "Rara Dupla" })).toBe(false);
    expect(temasDaLinha(linha({ raridade: "Comum", raridadeEn: "Common" })).some((t) => t.tipo === "raridade")).toBe(false);
  });

  it("aceita o resto pelo texto exato", () => {
    expect(ehRaridadeTematica("Rara Dupla")).toBe(true);
    expect(ehRaridadeTematica("Rare")).toBe(true);
    expect(linhaCasaComTema(linha({ raridade: "Rara" }), { tipo: "raridade", valor: "Rare" })).toBe(false);
  });
});

describe("linhaCasaComTema", () => {
  it("casa pela mesma regra de temasDaLinha, tema a tema", () => {
    const l = linha({ forma: "galar", tipos: ["Fire", "Metal"] });
    for (const tema of temasDaLinha(l)) expect(linhaCasaComTema(l, tema)).toBe(true);
    expect(linhaCasaComTema(l, { tipo: "especie", valor: "25" })).toBe(false);
    expect(linhaCasaComTema(l, { tipo: "forma", valor: "alola" })).toBe(false);
    expect(linhaCasaComTema(linha(), { tipo: "forma", valor: "normal" })).toBe(false);
  });
});

describe("validarValorTema", () => {
  it("espécie só na forma canônica e dentro da Pokédex nacional", () => {
    expect(validarValorTema("especie", "25").ok).toBe(true);
    expect(validarValorTema("especie", "025").ok).toBe(false);
    expect(validarValorTema("especie", "0").ok).toBe(false);
    expect(validarValorTema("especie", "99999").ok).toBe(false);
  });

  it("forma só as não normais; raridade só as que fazem tema", () => {
    expect(validarValorTema("forma", "mega").ok).toBe(true);
    expect(validarValorTema("forma", "normal").ok).toBe(false);
    expect(validarValorTema("raridade", "Common").ok).toBe(false);
  });

  it("tipo desconhecido é aceito como está; vazio, não", () => {
    expect(validarValorTema("tipo", "Tipo Inventado")).toEqual({
      ok: true,
      tema: { tipo: "tipo", valor: "Tipo Inventado" },
    });
    expect(validarValorTema("tipo", " ").ok).toBe(false);
    expect(validarValorTema("ilustrador", 3).ok).toBe(false);
  });
});

describe("validarParametroCustomizada", () => {
  it("nulo, ausente e objeto vazio são a customizada simples", () => {
    expect(validarParametroCustomizada(null)).toEqual({ ok: true, parametro: null });
    expect(validarParametroCustomizada(undefined)).toEqual({ ok: true, parametro: null });
    expect(validarParametroCustomizada({})).toEqual({ ok: true, parametro: null });
  });

  it("aceita exatamente { tema: { tipo, valor } }", () => {
    expect(validarParametroCustomizada({ tema: { tipo: "especie", valor: "25" } })).toEqual({
      ok: true,
      parametro: { tema: { tipo: "especie", valor: "25" } },
    });
  });

  it("recusa qualquer outra forma", () => {
    expect(validarParametroCustomizada({ escopo: "nacional" }).ok).toBe(false);
    expect(validarParametroCustomizada({ tema: { tipo: "especie", valor: "25", x: 1 } }).ok).toBe(false);
    expect(validarParametroCustomizada({ tema: { tipo: "especie", valor: "25" }, outro: true }).ok).toBe(false);
    expect(validarParametroCustomizada({ tema: "especie:25" }).ok).toBe(false);
    expect(validarParametroCustomizada([]).ok).toBe(false);
    expect(validarParametroCustomizada("tema").ok).toBe(false);
  });

  it("um tipo que não vira texto não faz a validação lançar", () => {
    const r = validarParametroCustomizada({ tema: { tipo: { toString: 1 }, valor: "x" } });
    expect(r).toEqual({ ok: false, erros: [expect.stringMatching(/^tipo de tema inválido/)] });
    expect(validarParametroCustomizada({ tema: { tipo: Object.create(null), valor: "x" } }).ok).toBe(false);
  });
});

describe("temaDaColecao", () => {
  it("só customizada com tema válido tem tema", () => {
    const tema = { tipo: "tipo", valor: "Psychic" };
    expect(temaDaColecao({ tipo: "customizada", parametro: { tema } })).toEqual(tema);
    expect(temaDaColecao({ tipo: "customizada", parametro: null })).toBeNull();
    expect(temaDaColecao({ tipo: "set", parametro: { tema } })).toBeNull();
    expect(temaDaColecao({ tipo: "customizada", parametro: { tema: { tipo: "x", valor: "y" } } })).toBeNull();
  });
});

describe("colecaoDoMesmoTema", () => {
  const colecao = (id: string, tipo: string, parametro: unknown) => ({ id, nome: `Coleção ${id}`, tipo, parametro });
  const colecoes = [
    colecao("a", "customizada", null),
    colecao("b", "customizada", { tema: { tipo: "raridade", valor: "Double rare" } }),
    colecao("c", "set", { sets: ["fic1"], idiomaCatalogo: "pt", incluirSecretas: false }),
    colecao("d", "customizada", { tema: { tipo: "especie", valor: "25" } }),
  ];

  it("acha a coleção com o mesmo tipo e o mesmo valor", () => {
    expect(colecaoDoMesmoTema(colecoes, { tipo: "especie", valor: "25" })).toEqual({ id: "d", nome: "Coleção d" });
    expect(colecaoDoMesmoTema(colecoes, { tipo: "raridade", valor: "Double rare" })).toEqual({ id: "b", nome: "Coleção b" });
  });

  it("outro valor, outro tipo ou só customizadas simples: nenhuma", () => {
    expect(colecaoDoMesmoTema(colecoes, { tipo: "especie", valor: "26" })).toBeNull();
    expect(colecaoDoMesmoTema(colecoes, { tipo: "tipo", valor: "25" })).toBeNull();
    expect(colecaoDoMesmoTema(colecoes, { tipo: "raridade", valor: "Rara Dupla" })).toBeNull();
    expect(colecaoDoMesmoTema([colecao("a", "customizada", null)], { tipo: "especie", valor: "25" })).toBeNull();
  });
});
