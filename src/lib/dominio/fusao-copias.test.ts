import { describe, expect, it } from "vitest";

import {
  chaveFusaoCopia,
  fundirCopias,
  podeFundir,
  type DadosAquisicaoCopia,
} from "./fusao-copias";

const AMBIPOM = {
  cartaId: "me02-079",
  idiomaCatalogo: "pt",
  idioma: "pt",
  variante: "reverse",
  condicao: "NM",
  localizacao: null,
};

const LIMPA: DadosAquisicaoCopia & { quantidade: number } = {
  quantidade: 1,
  gradedEmpresa: null,
  aquisicaoData: null,
  aquisicaoOrigem: null,
  aquisicaoPreco: null,
  notas: null,
};

describe("chaveFusaoCopia", () => {
  it("as duas linhas do Ambipom reverse dele têm a mesma chave", () => {
    expect(chaveFusaoCopia(AMBIPOM)).toBe(chaveFusaoCopia({ ...AMBIPOM }));
  });

  it("variante diferente é cópia diferente", () => {
    // O caso real das energias dele: mee-002 normal e mee-002 reverse são
    // duas cartas, e somá-las seria erro.
    expect(chaveFusaoCopia({ ...AMBIPOM, variante: "normal" })).not.toBe(
      chaveFusaoCopia(AMBIPOM),
    );
  });

  it("condição, idioma físico e idioma de catálogo separam", () => {
    expect(chaveFusaoCopia({ ...AMBIPOM, condicao: "LP" })).not.toBe(chaveFusaoCopia(AMBIPOM));
    expect(chaveFusaoCopia({ ...AMBIPOM, idioma: "en" })).not.toBe(chaveFusaoCopia(AMBIPOM));
    expect(chaveFusaoCopia({ ...AMBIPOM, idiomaCatalogo: "en" })).not.toBe(
      chaveFusaoCopia(AMBIPOM),
    );
  });

  it("localização separa — é onde ele vai procurar a carta", () => {
    expect(chaveFusaoCopia({ ...AMBIPOM, localizacao: "Fichário 2" })).not.toBe(
      chaveFusaoCopia(AMBIPOM),
    );
  });

  it("nulo, vazio e só-espaço são a mesma ausência de localização", () => {
    // Tratá-los como chaves distintas criaria a duplicata invisível que
    // esta função existe para evitar.
    const base = chaveFusaoCopia({ ...AMBIPOM, localizacao: null });
    expect(chaveFusaoCopia({ ...AMBIPOM, localizacao: "" })).toBe(base);
    expect(chaveFusaoCopia({ ...AMBIPOM, localizacao: "   " })).toBe(base);
  });

  it("ignora espaço em volta da localização", () => {
    expect(chaveFusaoCopia({ ...AMBIPOM, localizacao: " Fichário 2 " })).toBe(
      chaveFusaoCopia({ ...AMBIPOM, localizacao: "Fichário 2" }),
    );
  });
});

describe("podeFundir", () => {
  it("carta graded nunca funde — cada uma tem certificado próprio", () => {
    expect(podeFundir({ gradedEmpresa: "PSA" })).toBe(false);
    expect(podeFundir({ gradedEmpresa: null })).toBe(true);
  });
});

describe("fundirCopias", () => {
  it("soma as quantidades — o caso do Ambipom, tudo nulo dos dois lados", () => {
    const r = fundirCopias(LIMPA, LIMPA, "2026-08-29");
    expect(r.quantidade).toBe(2);
    expect(r.notas).toBeNull();
    expect(r.divergencias).toEqual([]);
  });

  it("soma lotes, não só unidades", () => {
    expect(
      fundirCopias({ ...LIMPA, quantidade: 3 }, { ...LIMPA, quantidade: 2 }, "2026-08-29")
        .quantidade,
    ).toBe(5);
  });

  it("preenche campo vazio com o valor da cópia nova — ganho puro", () => {
    const r = fundirCopias(
      LIMPA,
      { ...LIMPA, aquisicaoData: "2026-08-01", aquisicaoPreco: "12.00" },
      "2026-08-29",
    );
    expect(r.aquisicaoData).toBe("2026-08-01");
    expect(r.aquisicaoPreco).toBe("12.00");
    // Nada foi descartado, então não há rastro a registrar.
    expect(r.divergencias).toEqual([]);
    expect(r.notas).toBeNull();
  });

  it("em divergência mantém o da linha mais antiga e deixa rastro em notas", () => {
    const r = fundirCopias(
      { ...LIMPA, aquisicaoPreco: "10.00" },
      { ...LIMPA, aquisicaoPreco: "18.50" },
      "2026-08-29",
    );
    expect(r.aquisicaoPreco).toBe("10.00");
    expect(r.divergencias).toEqual(["aquisicaoPreco"]);
    expect(r.notas).toContain("preço=18.50");
    expect(r.notas).toContain("[fusão 2026-08-29]");
    expect(r.notas).toContain("+1 un.");
  });

  it("registra várias divergências numa linha só", () => {
    const r = fundirCopias(
      { ...LIMPA, aquisicaoData: "2026-01-01", aquisicaoOrigem: "Loja A" },
      { ...LIMPA, aquisicaoData: "2026-06-01", aquisicaoOrigem: "Loja B" },
      "2026-08-29",
    );
    expect(r.divergencias).toEqual(["aquisicaoData", "aquisicaoOrigem"]);
    expect((r.notas ?? "").split("\n")).toHaveLength(1);
    expect(r.notas).toContain("data=2026-06-01");
    expect(r.notas).toContain("origem=Loja B");
  });

  it("herda a nota quando a linha que sobrevive não tem", () => {
    const r = fundirCopias(LIMPA, { ...LIMPA, notas: "canto amassado" }, "2026-08-29");
    expect(r.notas).toBe("canto amassado");
    expect(r.divergencias).toEqual([]);
  });

  it("nota divergente vira rastro, nunca sobrescreve a existente", () => {
    const r = fundirCopias(
      { ...LIMPA, notas: "primeira" },
      { ...LIMPA, notas: "segunda" },
      "2026-08-29",
    );
    expect(r.notas).toContain("primeira");
    expect(r.notas).toContain('notas="segunda"');
    expect(r.divergencias).toContain("notas");
  });

  it("nota igual dos dois lados não vira divergência", () => {
    const r = fundirCopias(
      { ...LIMPA, notas: "mesma" },
      { ...LIMPA, notas: "mesma" },
      "2026-08-29",
    );
    expect(r.notas).toBe("mesma");
    expect(r.divergencias).toEqual([]);
  });

  it("preserva a nota preexistente ao acrescentar o rastro, em linha nova", () => {
    const r = fundirCopias(
      { ...LIMPA, notas: "carta do meu irmão", aquisicaoPreco: "10.00" },
      { ...LIMPA, aquisicaoPreco: "18.50" },
      "2026-08-29",
    );
    const linhas = (r.notas ?? "").split("\n");
    expect(linhas[0]).toBe("carta do meu irmão");
    expect(linhas[1]).toContain("preço=18.50");
  });
});
