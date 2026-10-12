import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { catalogoDoJogo, DISPONIBILIDADE, lerFaixas, naoTransferiveis } from "./dex-disponibilidade";
import { lerRegistrosCsv } from "./seed-catalogo";
import { COLUNAS_DEX_FORMA, converterLinhaDexForma } from "./seed-dex";

/*
 * O catálogo de vagas real (`seed/dex-forma.csv`, versionado, sem dado de
 * coleção): estes testes conferem a disponibilidade contra as vagas que
 * existem de fato, que é onde um erro de digitação numa faixa apareceria.
 */
const formas = lerRegistrosCsv(
  fs.readFileSync(path.resolve(__dirname, "../../../seed/dex-forma.csv"), "utf8"),
  COLUNAS_DEX_FORMA,
).map((linha) => ({ ...converterLinhaDexForma(linha), mitico: linha.mitico === "t" }));

const ids = (jogo: string) => catalogoDoJogo(jogo, formas)!;

describe("lerFaixas", () => {
  it("expande faixas e números soltos", () => {
    expect(lerFaixas("1-3,7,9-10")).toEqual([1, 2, 3, 7, 9, 10]);
    expect(lerFaixas("")).toEqual([]);
  });
});

describe("listas de cada jogo", () => {
  it.each(Object.keys(DISPONIBILIDADE))("%s: nenhuma espécie em duas listas", (jogo) => {
    const d = DISPONIBILIDADE[jogo];
    const todas = [d.livre, d.troca, d.evento].flatMap(lerFaixas);
    expect(new Set(todas).size).toBe(todas.length);
  });

  it("jogo sem dado conferido não tem catálogo", () => {
    expect(catalogoDoJogo("scarlet", formas)).toBeNull();
  });
});

describe("FireRed", () => {
  const fr = ids("firered");

  it("tem os 28 Unown, a fêmea das espécies com diferença e nada da Geração 4 em diante", () => {
    expect([...fr.keys()].filter((id) => id.startsWith("unown")).length).toBe(28);
    expect(fr.get("pikachu-femea")?.como).toBe("livre");
    expect([...fr.keys()].every((id) => formas.find((f) => f.id === id)!.numero <= 386)).toBe(true);
  });

  it("Espeon e Umbreon não saem (sem relógio); Wynaut sai por ovo; Azurill só por troca", () => {
    expect(fr.has("espeon")).toBe(false);
    expect(fr.has("umbreon")).toBe(false);
    expect(fr.get("wynaut")?.como).toBe("livre");
    expect(fr.get("azurill")?.como).toBe("troca");
  });

  it("exclusivos do LeafGreen e evoluções por troca são troca; Lugia e Deoxys, evento", () => {
    expect(fr.get("vulpix")?.como).toBe("troca");
    expect(fr.get("alakazam")?.como).toBe("troca");
    expect(fr.get("lugia")?.como).toBe("evento");
    expect(fr.get("deoxys")?.como).toBe("evento");
    expect(fr.has("celebi")).toBe(false);
  });

  it("nenhuma forma regional", () => {
    expect(fr.has("raichu-alola")).toBe(false);
  });
});

describe("Brilliant Diamond", () => {
  const bd = ids("brilliant-diamond");

  it("Rotom de eletrodoméstico e Shellos do leste existem; míticos por evento", () => {
    expect(bd.has("rotom-wash")).toBe(true);
    expect(bd.has("gastrodon-east")).toBe(true);
    expect(bd.get("darkrai")?.como).toBe("evento");
  });

  it("exclusivos do Shining Pearl são troca, os do BD são livres", () => {
    expect(bd.get("palkia")?.como).toBe("troca");
    expect(bd.get("dialga")?.como).toBe("livre");
  });

  it("Spinda existe, mas o HOME não recebe do BDSP", () => {
    expect(bd.get("spinda")).toEqual({ como: "livre", transferivel: false });
  });
});

describe("GO", () => {
  const go = ids("go");

  it("formas regionais e cosméticas lançadas entram; não lançadas e bonés, não", () => {
    expect(go.has("raichu-alola")).toBe(true);
    expect(go.has("vivillon-polar")).toBe(true);
    expect(go.has("vivillon-fancy")).toBe(false);
    expect(go.has("pikachu-original-cap")).toBe(false);
    expect(go.has("alcremie")).toBe(false);
  });

  it("Gimmighoul só na forma Roaming", () => {
    expect(go.has("gimmighoul")).toBe(false);
    expect(go.has("gimmighoul-roaming")).toBe(true);
  });

  it("míticos por evento; Zygarde e Spinda não passam pelo GO Transporter", () => {
    expect(go.get("mew")?.como).toBe("evento");
    expect(go.get("zygarde")?.transferivel).toBe(false);
    expect(go.get("spinda")?.transferivel).toBe(false);
    expect(naoTransferiveis().has("go:spinda")).toBe(true);
  });
});
