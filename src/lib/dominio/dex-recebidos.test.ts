import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  aGuardarDepoisDoMovimento,
  aGuardarNaCriacao,
  montarRecebidos,
  pendentesAGuardar,
  type RegistroParaRecebidos,
} from "./dex-recebidos";
import { resolverSecoes } from "./dex-secoes";
import { lerRegistrosCsv } from "./seed-catalogo";
import { COLUNAS_DEX_FORMA, converterLinhaDexForma } from "./seed-dex";

/* O catálogo de vagas real (`seed/dex-forma.csv`, versionado, sem dado de coleção). */
const formas = lerRegistrosCsv(
  fs.readFileSync(path.resolve(__dirname, "../../../seed/dex-forma.csv"), "utf8"),
  COLUNAS_DEX_FORMA,
).map((linha) => ({ ...converterLinhaDexForma(linha), shinyObtenivel: linha.shiny_obtenivel === "t" }));

const todas = resolverSecoes([]);

let seq = 0;
const reg = (formaId: string, extra: Partial<RegistroParaRecebidos> = {}): RegistroParaRecebidos => ({
  id: `r${++seq}`,
  formaId,
  shiny: false,
  local: "home",
  aGuardar: true,
  ...extra,
});

const resumo = (r: ReturnType<typeof montarRecebidos>) =>
  r.caixas.map((c) => `${c.trilha} ${c.caixa.numero}: ${c.itens.map((i) => `${i.posicao}=${i.registro.formaId}`).join(" ")}`);

describe("a guardar", () => {
  it("liga quando o Pokémon chega ao HOME, desliga quando sai, e mover para o mesmo lugar não mexe", () => {
    expect(aGuardarNaCriacao("home")).toBe(true);
    expect(aGuardarNaCriacao("firered")).toBe(false);
    expect(aGuardarDepoisDoMovimento("firered", "home")).toBe(true);
    expect(aGuardarDepoisDoMovimento("home", "brilliant-diamond")).toBe(false);
    expect(aGuardarDepoisDoMovimento("home", "home")).toBeNull();
  });
});

describe("montarRecebidos", () => {
  it("agrupa por caixa de destino, na ordem das caixas e das posições", () => {
    const r = montarRecebidos(formas, [reg("chikorita"), reg("pikachu"), reg("ivysaur"), reg("bulbasaur")], todas, 0);
    expect(resumo(r)).toEqual(["normal 1: 1=bulbasaur 2=ivysaur 25=pikachu", "normal 6: 2=chikorita"]);
    expect(r.semLugar).toEqual([]);
    expect(r.ids).toHaveLength(4);
  });

  it("caixas reservadas deslocam só o número: com a de Recebidos, Nacional 1 é a caixa 2", () => {
    const r = montarRecebidos(formas, [reg("bulbasaur"), reg("mew")], todas, 1);
    expect(resumo(r)).toEqual(["normal 2: 1=bulbasaur", "normal 7: 1=mew"]);
    expect(r.caixas[0].caixa).toMatchObject({ grupo: "nacional", indice: 1 });
  });

  it("o que já está guardado e o que está num jogo não entram", () => {
    const r = montarRecebidos(
      formas,
      [reg("bulbasaur", { aGuardar: false }), reg("ivysaur", { local: "firered", aGuardar: false }), reg("venusaur")],
      todas,
      0,
    );
    expect(resumo(r)).toEqual(["normal 1: 3=venusaur"]);
    expect([...r.caixas[0].jaGuardadas]).toEqual(["bulbasaur"]);
  });

  it("vaga já ocupada, ou tomada por outro da rodada, deixa o seguinte como extra", () => {
    const guardado = reg("bulbasaur", { aGuardar: false });
    const repetido = reg("bulbasaur");
    const primeiro = reg("pikachu");
    const segundo = reg("pikachu");
    const r = montarRecebidos(formas, [guardado, repetido, primeiro, segundo], todas, 0);
    expect(resumo(r)).toEqual(["normal 1: 25=pikachu"]);
    expect(r.caixas[0].itens[0].registro.id).toBe(primeiro.id);
    expect(r.semLugar.map((s) => [s.registro.id, s.motivo])).toEqual([
      [repetido.id, "extra"],
      [segundo.id, "extra"],
    ]);
    expect(r.ids).toEqual([repetido.id, primeiro.id, segundo.id]);
  });

  it("normal e shiny são vagas diferentes, cada uma na sequência da sua trilha", () => {
    const r = montarRecebidos(formas, [reg("pikachu", { shiny: true }), reg("pikachu")], todas, 0);
    expect(resumo(r)).toEqual(["normal 1: 25=pikachu", "shiny 1: 25=pikachu"]);
  });

  it("fora das caixas: seção desligada, e shiny de forma sem shiny (buraco no mapa, não lugar)", () => {
    const semGenero = resolverSecoes([{ categoria: "genero", conta: false }]);
    const r = montarRecebidos(
      formas,
      [reg("venusaur-femea"), reg("magearna-original", { shiny: true }), reg("magearna-original")],
      semGenero,
      0,
    );
    expect(r.semLugar.map((s) => [s.registro.formaId, s.motivo])).toEqual([
      ["venusaur-femea", "fora"],
      ["magearna-original", "fora"],
    ]);
    // A Magearna normal tem lugar: nas caixas das cosméticas.
    expect(r.caixas.map((c) => [c.trilha, c.caixa.grupo, c.itens[0].registro.formaId])).toEqual([
      ["normal", "cosmetica", "magearna-original"],
    ]);
  });
});

describe("pendentesAGuardar", () => {
  /* A página inicial conta por esta função; a tela Recebidos monta as caixas.
     Os dois números têm de ser o mesmo em qualquer rodada. */
  const igualAosRecebidos = (registros: RegistroParaRecebidos[], secoes = todas) => {
    const pendentes = pendentesAGuardar(registros);
    const r = montarRecebidos(formas, registros, secoes, 0);
    expect(pendentes.map((p) => p.id)).toEqual(r.ids);
    expect(pendentes).toHaveLength(r.ids.length);
    return pendentes;
  };

  it("conta as cópias extras, que não têm lugar nas caixas", () => {
    const pendentes = igualAosRecebidos([reg("bulbasaur", { aGuardar: false }), reg("bulbasaur"), reg("pikachu"), reg("pikachu")]);
    expect(pendentes.map((p) => p.formaId)).toEqual(["bulbasaur", "pikachu", "pikachu"]);
  });

  it("conta o que está fora das caixas (seção desligada, shiny de forma sem shiny)", () => {
    const semGenero = resolverSecoes([{ categoria: "genero", conta: false }]);
    const pendentes = igualAosRecebidos(
      [reg("venusaur-femea"), reg("magearna-original", { shiny: true }), reg("magearna-original")],
      semGenero,
    );
    expect(pendentes).toHaveLength(3);
  });

  it("não conta o que já foi guardado nem o que está fora do HOME", () => {
    const pendentes = igualAosRecebidos([
      reg("bulbasaur", { aGuardar: false }),
      reg("ivysaur", { local: "firered", aGuardar: false }),
      // Fora do HOME o "a guardar" não vale, mesmo que viesse ligado.
      reg("charmander", { local: "firered" }),
      reg("venusaur"),
    ]);
    expect(pendentes.map((p) => p.formaId)).toEqual(["venusaur"]);
  });

  it("rodada vazia", () => {
    expect(igualAosRecebidos([reg("bulbasaur", { aGuardar: false })])).toEqual([]);
  });
});
