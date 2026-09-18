import { describe, expect, it } from "vitest";

import {
  agruparSetsPorSerie,
  formatarDataLancamento,
  formatarRotuloSet,
  type SetAgrupavel,
} from "./agrupamento-sets";

function set(over: Partial<SetAgrupavel> & { setId: string }): SetAgrupavel {
  return {
    setNome: over.setId,
    setSerie: "Série",
    setSerieId: "serie",
    idiomaCatalogo: "pt",
    setLancamento: null,
    ...over,
  };
}

describe("agruparSetsPorSerie", () => {
  it("agrupa por setSerieId e ordena séries pela data do set mais recente de cada uma", () => {
    const sets = [
      set({ setId: "sv08", setSerie: "Escarlate e Violeta", setSerieId: "sv", setLancamento: "2024-11-08" }),
      set({ setId: "me01", setSerie: "Megaevolução", setSerieId: "me", setLancamento: "2025-09-25" }),
      set({ setId: "sv01", setSerie: "Escarlate e Violeta", setSerieId: "sv", setLancamento: "2023-03-31" }),
      set({ setId: "swsh01", setSerie: "Espada e Escudo", setSerieId: "swsh", setLancamento: "2020-02-07" }),
    ];

    const grupos = agruparSetsPorSerie(sets);

    expect(grupos.map((g) => g.serie)).toEqual([
      "Megaevolução",
      "Escarlate e Violeta",
      "Espada e Escudo",
    ]);
  });

  it("dentro da série, ordena os sets do mais recente pro mais antigo", () => {
    const sets = [
      set({ setId: "sv01", setSerie: "Escarlate e Violeta", setSerieId: "sv", setLancamento: "2023-03-31" }),
      set({ setId: "sv08", setSerie: "Escarlate e Violeta", setSerieId: "sv", setLancamento: "2024-11-08" }),
      set({ setId: "sv04", setSerie: "Escarlate e Violeta", setSerieId: "sv", setLancamento: "2023-11-03" }),
    ];

    const [grupo] = agruparSetsPorSerie(sets);

    expect(grupo.sets.map((s) => s.setId)).toEqual(["sv08", "sv04", "sv01"]);
  });

  it("série com um único set forma um grupo normalmente", () => {
    const sets = [set({ setId: "mep", setSerie: "Megaevolução", setSerieId: "me", setLancamento: "2025-09-26" })];

    const grupos = agruparSetsPorSerie(sets);

    expect(grupos).toEqual([
      { serieId: "id:me", serie: "Megaevolução", sets: [sets[0]] },
    ]);
  });

  it("set sem data vai pro fim do grupo, mas não some", () => {
    const sets = [
      set({ setId: "com-data", setSerie: "X", setSerieId: "x", setLancamento: "2024-01-01" }),
      set({ setId: "sem-data", setSerie: "X", setSerieId: "x", setLancamento: null }),
    ];

    const [grupo] = agruparSetsPorSerie(sets);

    expect(grupo.sets.map((s) => s.setId)).toEqual(["com-data", "sem-data"]);
  });

  it("série em que nenhum set tem data cai pro fim da ordem de séries", () => {
    const sets = [
      set({ setId: "recente", setSerie: "Com data", setSerieId: "a", setLancamento: "2024-01-01" }),
      set({ setId: "antigo", setSerie: "Sem data", setSerieId: "b", setLancamento: null }),
    ];

    const grupos = agruparSetsPorSerie(sets);

    expect(grupos.map((g) => g.serie)).toEqual(["Com data", "Sem data"]);
  });

  it("não depende da lista de entrada vir pré-ordenada", () => {
    const sets = [
      set({ setId: "antigo", setSerie: "A", setSerieId: "a", setLancamento: "2020-01-01" }),
      set({ setId: "novo", setSerie: "B", setSerieId: "b", setLancamento: "2025-01-01" }),
    ];

    const grupos = agruparSetsPorSerie(sets);

    expect(grupos.map((g) => g.serie)).toEqual(["B", "A"]);
  });

  it("regra nova: sets com o mesmo setSerieId caem num grupo só, mesmo com setSerie (nome) em idiomas diferentes — o bug das séries duplicadas", () => {
    const sets = [
      // 24 sets pt (nome traduzido) + 2 sets en (upstream não tem pt
      // pra eles) do mesmo set_serie_id "swsh". Antes da correção,
      // agrupava por nome e virava dois grupos: "Espada e Escudo" (pt) e
      // "Sword & Shield" (en).
      set({
        setId: "swsh01",
        setSerie: "Espada e Escudo",
        setSerieId: "swsh",
        idiomaCatalogo: "pt",
        setLancamento: "2020-02-07",
      }),
      set({
        setId: "swsh02",
        setSerie: "Espada e Escudo",
        setSerieId: "swsh",
        idiomaCatalogo: "pt",
        setLancamento: "2020-06-05",
      }),
      set({
        setId: "swsh-promo",
        setSerie: "Sword & Shield",
        setSerieId: "swsh",
        idiomaCatalogo: "en",
        setLancamento: "2020-02-07",
      }),
    ];

    const grupos = agruparSetsPorSerie(sets);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].serie).toBe("Espada e Escudo");
    expect(grupos[0].sets.map((s) => s.setId)).toEqual(["swsh02", "swsh-promo", "swsh01"]);
  });

  it("regra nova: rótulo do grupo segue pt > en > jp mesmo quando nenhum set do grupo tem pt", () => {
    const sets = [
      set({ setId: "sm-en", setSerie: "Sun & Moon", setSerieId: "sm-jp-only", idiomaCatalogo: "en" }),
      set({ setId: "sm-jp", setSerie: "サン＆ムーン", setSerieId: "sm-jp-only", idiomaCatalogo: "jp" }),
    ];

    const [grupo] = agruparSetsPorSerie(sets);

    expect(grupo.serie).toBe("Sun & Moon");
  });

  it("regra nova: id sensível a caixa — 'sv' (ocidental) e 'SV' (japonês) NUNCA se fundem", () => {
    const sets = [
      set({ setId: "sv01", setSerie: "Scarlet & Violet", setSerieId: "sv", idiomaCatalogo: "en" }),
      set({ setId: "svj01", setSerie: "スカーレット&バイオレット", setSerieId: "SV", idiomaCatalogo: "jp" }),
    ];

    const grupos = agruparSetsPorSerie(sets);

    expect(grupos).toHaveLength(2);
    expect(grupos.map((g) => g.serie).sort()).toEqual(
      ["Scarlet & Violet", "スカーレット&バイオレット"].sort(),
    );
  });

  it("regra nova: setSerieId nulo não derruba nem some — cada set vira grupo próprio, chaveado por nome", () => {
    const sets = [
      set({ setId: "orfao-1", setSerie: "Órfão", setSerieId: null, setLancamento: "2024-01-01" }),
      set({ setId: "orfao-2", setSerie: "Outro Órfão", setSerieId: null, setLancamento: "2023-01-01" }),
    ];

    const grupos = agruparSetsPorSerie(sets);

    expect(grupos).toHaveLength(2);
    expect(grupos.every((g) => g.sets.length === 1)).toBe(true);
    expect(grupos.map((g) => g.serieId).sort()).toEqual(["nome:Outro Órfão", "nome:Órfão"].sort());
  });

  it("regra nova: setSerieId nulo com mesmo nome ainda agrupa junto (fallback por nome, não desaparece)", () => {
    const sets = [
      set({ setId: "orfao-1", setSerie: "Órfão", setSerieId: null, setLancamento: "2024-01-01" }),
      set({ setId: "orfao-2", setSerie: "Órfão", setSerieId: null, setLancamento: "2023-01-01" }),
    ];

    const grupos = agruparSetsPorSerie(sets);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].sets.map((s) => s.setId)).toEqual(["orfao-1", "orfao-2"]);
  });
});

describe("formatarDataLancamento", () => {
  it("converte YYYY-MM-DD para dd/mm/aaaa", () => {
    expect(formatarDataLancamento("2023-06-19")).toBe("19/06/2023");
  });

  it("retorna null para data ausente — nunca inventa data", () => {
    expect(formatarDataLancamento(null)).toBeNull();
  });
});

describe("formatarRotuloSet", () => {
  it("mantém o formato atual (sigla — nome — qtd cartas), com data e idiomas no fim", () => {
    const rotulo = formatarRotuloSet({
      setSigla: "MEW", setId: "set-teste",
      setNome: "Pokémon 151",
      idiomasDisponiveis: ["pt", "en"],
      qtdOficial: 165,
      qtdTotal: 207,
      qtdCartasNoCatalogo: 207,
      setLancamento: "2023-06-16",
    });

    expect(rotulo).toBe("MEW — Pokémon 151 — 165 cartas — 16/06/2023 — PT/EN");
  });

  it("set sem sigla usa o id no lugar dela", () => {
    // Este teste exigia o contrário até 2026-08-26. Mudou por causa do
    // catálogo japonês: lá a sigla é SEMPRE nula (o repositório não traz
    // `abbreviation`) e o nome está em japonês, então o set aparecia no
    // seletor sem nada que o usuário pudesse reconhecer. O id é
    // justamente o que está impresso na carta — "sv2a 002/165".
    const rotulo = formatarRotuloSet({
      setSigla: null, setId: "base1",
      setNome: "Base Set",
      idiomasDisponiveis: ["pt", "en"],
      qtdOficial: 102,
      qtdTotal: 102,
      qtdCartasNoCatalogo: 102,
      setLancamento: "1999-01-09",
    });

    expect(rotulo).toBe("base1 — Base Set — 102 cartas — 09/01/1999 — PT/EN");
  });

  it("set sem data não mostra o trecho de data (nunca escreve 'sem data'), mas mostra idioma", () => {
    const rotulo = formatarRotuloSet({
      setSigla: "XYZ", setId: "set-teste",
      setNome: "Set Fictício",
      idiomasDisponiveis: ["pt", "en"],
      qtdOficial: 50,
      qtdTotal: 50,
      qtdCartasNoCatalogo: 50,
      setLancamento: null,
    });

    expect(rotulo).toBe("XYZ — Set Fictício — 50 cartas — PT/EN");
    expect(rotulo).not.toContain("sem data");
  });

  it("marca uniforme: set só em EN mostra 'EN' no fim, não mais um aviso de ausência", () => {
    const rotulo = formatarRotuloSet({
      setSigla: "BS", setId: "set-teste",
      setNome: "Base Set",
      idiomasDisponiveis: ["en"],
      qtdOficial: 102,
      qtdTotal: 102,
      qtdCartasNoCatalogo: 102,
      setLancamento: "1999-01-09",
    });

    expect(rotulo).toBe("BS — Base Set — 102 cartas — 09/01/1999 — EN");
    expect(rotulo).not.toContain("catálogo EN");
  });

  it("idiomas aparecem sempre na ordem canônica pt/en/jp, independente da ordem de entrada", () => {
    const rotulo = formatarRotuloSet({
      setSigla: "MFB", setId: "set-teste",
      setNome: "My First Battle",
      idiomasDisponiveis: ["en", "pt"],
      qtdOficial: 17,
      qtdTotal: 17,
      qtdCartasNoCatalogo: 17,
      setLancamento: "2024-12-04",
    });

    expect(rotulo).toBe("MFB — My First Battle — 17 cartas — 04/12/2024 — PT/EN");
  });

  it("terceiro idioma (jp) aparece sozinho quando existir, sem mudar o formato", () => {
    const rotulo = formatarRotuloSet({
      setSigla: null, setId: "SV2a",
      setNome: "Set Japonês",
      idiomasDisponiveis: ["jp"],
      qtdOficial: 60,
      qtdTotal: 60,
      qtdCartasNoCatalogo: 60,
      setLancamento: null,
    });

    expect(rotulo).toBe("SV2a — Set Japonês — 60 cartas — JP");
  });

  it("achado do coordenador: set sem numeração oficial (mep) mostra a contagem que de fato vale, não '0 cartas'", () => {
    const rotulo = formatarRotuloSet({
      setSigla: "MEP", setId: "set-teste",
      setNome: "MEP Black Star Promos",
      idiomasDisponiveis: ["pt", "en"],
      qtdOficial: 0,
      qtdTotal: 88,
      qtdCartasNoCatalogo: 88,
      setLancamento: null,
    });

    expect(rotulo).toBe("MEP — MEP Black Star Promos — 88 cartas — PT/EN");
    expect(rotulo).not.toContain("0 cartas");
  });

  it("set com numeração oficial válida continua mostrando a oficial, mesmo se o catálogo local tiver menos linhas (catálogo incompleto é aviso à parte)", () => {
    const rotulo = formatarRotuloSet({
      setSigla: null, setId: "set-teste",
      setNome: "Set Incompleto",
      idiomasDisponiveis: ["en"],
      qtdOficial: 48,
      qtdTotal: 48,
      qtdCartasNoCatalogo: 34, // menos que o oficial — não é o caso mep
      setLancamento: null,
    });

    expect(rotulo).toBe("set-teste — Set Incompleto — 48 cartas — EN");
  });
});

describe("desambiguação de rótulo repetido", () => {
  const set = (
    setId: string,
    setSerieId: string,
    setSerie: string,
    idiomaCatalogo: "pt" | "en" | "jp",
  ) => ({ setId, setNome: setId, setSerie, setSerieId, idiomaCatalogo, setLancamento: "2020-01-01" });

  it("marca o idioma quando dois grupos exibiriam o mesmo nome", () => {
    // Caso real: a série ocidental `xy` e a japonesa `XY` se chamam "XY"
    // as duas. Sem isso o seletor mostra dois grupos "XY" idênticos.
    const grupos = agruparSetsPorSerie([
      set("xy1", "xy", "XY", "pt"),
      set("XY1a", "XY", "XY", "jp"),
    ]);
    const rotulos = grupos.map((g) => g.serie).sort();
    expect(rotulos).toEqual(["XY (JP)", "XY (PT)"]);
  });

  it("não polui o rótulo quando não há colisão", () => {
    const grupos = agruparSetsPorSerie([
      set("swsh1", "swsh", "Espada e Escudo", "pt"),
      set("S1H", "S", "剣と盾", "jp"),
    ]);
    expect(grupos.map((g) => g.serie).sort()).toEqual([
      "Espada e Escudo",
      "剣と盾",
    ]);
  });
});
