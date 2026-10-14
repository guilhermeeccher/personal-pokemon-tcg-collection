import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { mapearEstadosDex } from "./dex-estado";
import { resolverSecoes } from "./dex-secoes";
import { lerSeedTrofeus } from "./dex-trofeus";
import { CAPA_DO_JOGO } from "./dex-capas";
import { JOGOS_DEX } from "./dex-jogos";
import {
  estanteDeTrofeus,
  pegueAgora,
  progressoDoJogo,
  progressoPorRegiao,
  ultimasConquistas,
  ultimosNoHome,
} from "./dex-visao-geral";
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

  it("a dex do jogo conta o que está na Pokédex, venha de onde vier, e quantos estão no HOME", () => {
    const p = progressoDoJogo("firered", formas, mapa, todas, trofeus, new Set())!;
    expect(p.pegas).toBe(3); // o Pidgey do GO conta; o shiny não
    expect(p.noHome).toBe(2);
    expect(p.faltamAgora).toBeLessThan(p.total - p.pegas); // parte do resto está trancada
    expect(p.trancadas[0].trofeuId).toBe("firered-pokedex-nacional");
    const tudo = new Set(trofeus.filter((t) => t.jogoId === "firered").map((t) => t.id));
    const semTranca = progressoDoJogo("firered", formas, mapa, todas, trofeus, tudo)!;
    expect(semTranca.trancadas).toEqual([]);
    expect(semTranca.faltamAgora).toBe(semTranca.total - semTranca.pegas);
  });

  it("conta o que está em outro jogo sem ter subido ao HOME, mas não outra forma da espécie", () => {
    const outros = mapearEstadosDex([
      { formaId: "pikachu", shiny: false, local: "brilliant-diamond" },
      { formaId: "vulpix-alola", shiny: false, local: "home" },
    ]);
    const p = progressoDoJogo("firered", formas, outros, todas, trofeus, new Set())!;
    expect(p.pegas).toBe(1); // o Pikachu do BD; o Vulpix de Alola não preenche o Vulpix do FireRed
    expect(p.noHome).toBe(0);
  });

  it("jogo sem catálogo não tem dex", () => {
    expect(progressoDoJogo("legends-za", formas, mapa, todas, trofeus, new Set())).toBeNull();
  });

  it("o progresso por região soma o da vista principal", () => {
    const regioes = progressoPorRegiao(formas, mapa, todas);
    expect(regioes).toHaveLength(9);
    expect(regioes[0].progresso.normal.noHome).toBe(2);
    const contam = regioes.reduce((s, r) => s + r.progresso.normal.contam, 0);
    expect(contam).toBe(formas.filter((f) => f.categoria !== "cosmetica").length);
  });

  it("últimos no HOME: mais recente primeiro, sem repetir vaga e trilha", () => {
    const r = ultimosNoHome(
      [
        { formaId: "bulbasaur", shiny: false, local: "home", atualizadoEm: "2026-10-12T10:00:00Z" },
        { formaId: "pidgey", shiny: false, local: "home", atualizadoEm: "2026-10-12T12:00:00Z" },
        { formaId: "bulbasaur", shiny: false, local: "home", atualizadoEm: "2026-10-12T11:00:00Z" },
        { formaId: "bulbasaur", shiny: true, local: "home", atualizadoEm: "2026-10-12T09:00:00Z" },
        { formaId: "charmander", shiny: false, local: "firered", atualizadoEm: "2026-10-12T13:00:00Z" },
      ],
      3,
    );
    expect(r).toEqual([
      { formaId: "pidgey", shiny: false },
      { formaId: "bulbasaur", shiny: false },
      { formaId: "bulbasaur", shiny: true },
    ]);
  });

  it("pegue agora: o que falta e o jogo alcança sem troca, evento nem checkpoint pendente", () => {
    const r = pegueAgora(["firered"], formas, mapa, todas, trofeus, new Set(), 3);
    expect(r.map((x) => x.formaId)).toEqual(["ivysaur", "venusaur", "venusaur-femea"]);
    expect(r.every((x) => x.jogoId === "firered")).toBe(true);
    // Lugia no FireRed é livre, mas trancado: só aparece com os checkpoints.
    const todos = pegueAgora(["firered"], formas, mapa, todas, trofeus, new Set(), 2000).map((x) => x.formaId);
    expect(todos).not.toContain("lugia");
    expect(todos).not.toContain("bulbasaur");
  });

  it("estante e últimas conquistas", () => {
    const x = (id: string, jogoId: string, nivel: "bronze" | "prata" | "ouro", em: string | null | undefined, ordem = 1) => ({
      id,
      jogoId,
      nivel,
      ordem,
      obtido: em === undefined ? null : { em },
    });
    const lista = [
      x("a1", "a", "ouro", "2026-10-10"),
      x("a2", "a", "bronze", "2026-10-12"),
      x("b1", "b", "prata", undefined),
      x("h1", "home", "bronze", null),
    ];
    expect(estanteDeTrofeus(lista)).toEqual({ platina: 2, ouro: 1, prata: 0, bronze: 2 });
    expect(ultimasConquistas(lista, 5).map((t) => t.id)).toEqual(["a2", "a1"]);
  });

  it("todo jogo do catálogo tem Pokémon de capa", () => {
    for (const j of JOGOS_DEX) expect(CAPA_DO_JOGO[j.id], j.id).toBeGreaterThan(0);
  });
});
