import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { mapearEstadosDex } from "./dex-estado";
import { resolverSecoes } from "./dex-secoes";
import { lerSeedTrofeus } from "./dex-trofeus";
import { progressoDoJogo, progressoPorRegiao } from "./dex-visao-geral";
import { lerRegistrosCsv } from "./seed-catalogo";
import { COLUNAS_DEX_FORMA, converterLinhaDexForma } from "./seed-dex";

const raiz = path.resolve(__dirname, "../../..");
const formas = lerRegistrosCsv(fs.readFileSync(path.join(raiz, "seed/dex-forma.csv"), "utf8"), COLUNAS_DEX_FORMA).map(
  (linha) => ({
    ...converterLinhaDexForma(linha),
    forma: linha.forma ?? null,
    mitico: linha.mitico === "t",
    shinyObtenivel: linha.shiny_obtenivel === "t",
  }),
);
const trofeus = lerSeedTrofeus(JSON.parse(fs.readFileSync(path.join(raiz, "seed/dex-trofeus.json"), "utf8")));
const todas = resolverSecoes([]);

describe("visão geral da Living Dex", () => {
  const registros = [
    { formaId: "bulbasaur", shiny: false, jogoOrigem: "firered", local: "home" },
    { formaId: "charmander", shiny: false, jogoOrigem: "firered", local: "firered" },
    { formaId: "squirtle", shiny: true, jogoOrigem: "firered", local: "firered" },
    { formaId: "pidgey", shiny: false, jogoOrigem: "go", local: "home" },
  ];
  const mapa = mapearEstadosDex(registros);

  it("a dex do jogo conta o que nasceu nele, e quantos desses estão no HOME", () => {
    const p = progressoDoJogo("firered", formas, registros, mapa, todas, trofeus, new Set())!;
    expect(p.pegas).toBe(2); // o shiny e o Pidgey do GO não contam
    expect(p.noHome).toBe(1);
    expect(p.faltamAgora).toBeLessThan(p.total - p.pegas); // parte do resto está trancada
    expect(p.trancadas[0].trofeuId).toBe("firered-pokedex-nacional");
    const tudo = new Set(trofeus.filter((t) => t.jogoId === "firered").map((t) => t.id));
    const semTranca = progressoDoJogo("firered", formas, registros, mapa, todas, trofeus, tudo)!;
    expect(semTranca.trancadas).toEqual([]);
    expect(semTranca.faltamAgora).toBe(semTranca.total - semTranca.pegas);
  });

  it("jogo sem catálogo não tem dex", () => {
    expect(progressoDoJogo("legends-za", formas, registros, mapa, todas, trofeus, new Set())).toBeNull();
  });

  it("o progresso por região soma o da vista principal", () => {
    const regioes = progressoPorRegiao(formas, mapa, todas);
    expect(regioes).toHaveLength(9);
    expect(regioes[0].progresso.normal.noHome).toBe(2);
    const contam = regioes.reduce((s, r) => s + r.progresso.normal.contam, 0);
    expect(contam).toBe(formas.filter((f) => f.categoria !== "cosmetica").length);
  });
});
