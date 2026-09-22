import { describe, expect, it } from "vitest";

import {
  ehOrigemPropria,
  idiomaDoEmprestimo,
  seloOrigemImagem,
  type OrigemImagem,
} from "./origem-imagem";

describe("ehOrigemPropria", () => {
  it("só é verdadeira para a foto que o usuário forneceu", () => {
    expect(ehOrigemPropria("propria")).toBe(true);
    expect(ehOrigemPropria("catalogo")).toBe(false);
    expect(ehOrigemPropria("cdn")).toBe(false);
    expect(ehOrigemPropria(null)).toBe(false);
    expect(ehOrigemPropria(undefined)).toBe(false);
  });

  it("não confunde mypcards com foto própria", () => {
    // As duas são servidas por /api/imagens-locais/, então a URL não as
    // distingue — é exatamente por isso que a origem existe. A do
    // mypcards não é do usuário para trocar ou remover pela tela.
    expect(ehOrigemPropria("mypcards")).toBe(false);
  });
});

describe("seloOrigemImagem", () => {
  it("marca a foto emprestada de outro idioma, dizendo qual", () => {
    expect(seloOrigemImagem("catalogo-en")?.texto).toBe("EN");
    expect(seloOrigemImagem("catalogo-en")?.titulo).toContain("inglês");
    expect(seloOrigemImagem("catalogo-pt")?.texto).toBe("PT");
    expect(seloOrigemImagem("catalogo-pt")?.titulo).toContain("português");
  });

  it("marca o scan de terceiro", () => {
    expect(seloOrigemImagem("mypcards")?.texto).toBe("MYP");
  });

  it("não marca o caso normal — seria ruído em quase toda carta", () => {
    expect(seloOrigemImagem("propria")).toBeNull();
    expect(seloOrigemImagem("catalogo")).toBeNull();
    expect(seloOrigemImagem("cdn")).toBeNull();
    expect(seloOrigemImagem(null)).toBeNull();
    expect(seloOrigemImagem(undefined)).toBeNull();
  });

  it("cobre toda origem declarada — origem nova sem decisão de selo quebra aqui", () => {
    const todas: OrigemImagem[] = [
      "propria",
      "catalogo",
      "mypcards",
      "catalogo-pt",
      "catalogo-en",
      "cdn",
    ];
    for (const origem of todas) {
      expect(() => seloOrigemImagem(origem)).not.toThrow();
    }
  });
});

describe("idiomaDoEmprestimo", () => {
  it("pt e en se emprestam entre si", () => {
    expect(idiomaDoEmprestimo("pt")).toBe("en");
    expect(idiomaDoEmprestimo("en")).toBe("pt");
  });

  it("japonês nunca empresta nem toma emprestado", () => {
    // Set japonês não é o mesmo set: numeração, arte e recorte diferentes.
    // Emprestar por número de Pokédex mostraria OUTRA carta da mesma
    // espécie — foto que parece certa e está errada.
    expect(idiomaDoEmprestimo("jp")).toBeNull();
  });
});
