import { describe, expect, it } from "vitest";

import {
  LIMIARES_SUGESTAO,
  contarNoSet,
  contarPorTema,
  especiesCandidatas,
  lerDispensa,
  montarSugestoes,
  ordenarSugestoes,
  setsCandidatos,
  universosDosSets,
  type CartaPossuida,
  type LinhaDoSet,
  type EntradaSugestoes,
  type Sugestao,
  type UniversoDoSet,
} from "./sugestoes-colecao";

// Dados inventados: sets, ilustradores e números fictícios.
let seq = 0;
function carta(parcial: Partial<CartaPossuida> = {}): CartaPossuida {
  seq++;
  const localId = parcial.localId ?? String(seq).padStart(3, "0");
  const setId = parcial.setId ?? "fic1";
  return {
    cartaId: parcial.cartaId ?? `${setId}-${localId}`,
    idioma: "pt",
    setId,
    localId,
    dexIds: [],
    tipos: [],
    ilustrador: null,
    raridade: null,
    raridadeEn: null,
    forma: "normal",
    ...parcial,
  };
}

function universo(setId: string, n: number, parcial: Partial<UniversoDoSet> = {}): UniversoDoSet {
  return {
    setId,
    nome: `Set ${setId}`,
    sigla: "FIC",
    lancamento: "2025-01-10",
    cartas: Array.from({ length: n }, (_, i) => {
      const localId = String(i + 1).padStart(3, "0");
      return { cartaId: `${setId}-${localId}`, localId };
    }),
    qtdOficial: n,
    qtdTotal: n,
    temLinhaAtiva: true,
    ...parcial,
  };
}

function entrada(parcial: Partial<EntradaSugestoes>): EntradaSugestoes {
  return { cartas: [], sets: new Map(), colecoes: [], dispensadas: [], nomesEspecie: new Map(), ...parcial };
}

const doSet = (setId: string, n: number, extra: Partial<CartaPossuida> = {}) =>
  Array.from({ length: n }, (_, i) => carta({ setId, localId: String(i + 1).padStart(3, "0"), ...extra }));

describe("contarPorTema", () => {
  it("conta cartas físicas distintas: as linhas pt e en do mesmo carta_id contam uma vez", () => {
    const cartas = [
      carta({ cartaId: "fic1-001", idioma: "pt", dexIds: [25] }),
      carta({ cartaId: "fic1-001", idioma: "en", dexIds: [25] }),
      carta({ cartaId: "fic1-002", idioma: "en", dexIds: [25] }),
    ];
    expect(contarPorTema(cartas).get("especie:25")?.quantidade).toBe(2);
  });

  it("linha japonesa fica fora de toda contagem", () => {
    const cartas = [carta({ idioma: "jp", dexIds: [25] }), carta({ idioma: "jp", tipos: ["Fire"] })];
    expect(contarPorTema(cartas).size).toBe(0);
  });
});

describe("contarNoSet", () => {
  it("conta pelo carta_id só as cartas dentro da numeração oficial (sem secretas, regra 4)", () => {
    const u = universo("fic1", 12, { qtdOficial: 10 });
    const possuidas = new Set(["fic1-001", "fic1-010", "fic1-011", "outro-001"]);
    expect(contarNoSet(u, possuidas)).toEqual({
      quantidade: 2,
      total: 10,
      totalOficial: true,
      vagasMaterializaveis: 10,
    });
  });

  it("o total é a numeração oficial, não o que o catálogo materializa", () => {
    // 34 linhas no catálogo de um set de 48 oficiais: lê "x de 48".
    const u = universo("fic1", 34, { qtdOficial: 48, qtdTotal: 50 });
    expect(contarNoSet(u, new Set(["fic1-001"]))).toEqual({
      quantidade: 1,
      total: 48,
      totalOficial: true,
      vagasMaterializaveis: 34,
    });
  });

  it("set sem numeração oficial (promo) usa o total, como a criação, e diz que não é oficial", () => {
    const u = universo("fic1", 8, { qtdOficial: 0, qtdTotal: 8 });
    expect(contarNoSet(u, new Set(["fic1-008"]))).toMatchObject({ total: 8, totalOficial: false });
  });
});

describe("universosDosSets", () => {
  const l = (parcial: Partial<LinhaDoSet>): LinhaDoSet => ({
    cartaId: `fic1-${parcial.localId ?? "001"}`,
    ativa: true,
    setId: "fic1",
    idioma: "en",
    localId: "001",
    qtdOficial: 3,
    qtdTotal: 4,
    setNome: "Fictional Set",
    setSigla: null,
    setLancamento: "2025-01-10",
    ...parcial,
  });

  it("une os números de pt e en carta a carta, com nome e sigla da linha pt", () => {
    const u = universosDosSets([
      l({ localId: "001" }),
      l({ localId: "002" }),
      l({ localId: "001", idioma: "pt", setNome: "Set Fictício", setSigla: "FIC", qtdTotal: 3 }),
      l({ localId: "004", qtdTotal: 4 }),
    ]).get("fic1");
    expect(u).toMatchObject({ nome: "Set Fictício", sigla: "FIC", lancamento: "2025-01-10", qtdOficial: 3, qtdTotal: 4 });
    expect([...(u?.cartas ?? [])].map((c) => c.cartaId).sort()).toEqual(["fic1-001", "fic1-002", "fic1-004"]);
  });

  it("marca se o set tem alguma linha ativa; o universo usa todas as linhas, como a criação", () => {
    const u = universosDosSets([
      l({ localId: "001", ativa: false }),
      l({ localId: "002", ativa: false, idioma: "pt" }),
    ]).get("fic1");
    expect(u?.temLinhaAtiva).toBe(false);
    expect(u?.cartas).toHaveLength(2);
    expect(universosDosSets([l({ ativa: false }), l({ localId: "002" })]).get("fic1")?.temLinhaAtiva).toBe(true);
  });
});

describe("candidatos para a leitura", () => {
  it("setsCandidatos pede ao catálogo só os sets que chegam ao limiar", () => {
    const cartas = [...doSet("fic1", LIMIARES_SUGESTAO.set), ...doSet("fic2", LIMIARES_SUGESTAO.set - 1)];
    expect(setsCandidatos(cartas)).toEqual(["fic1"]);
  });

  it("especiesCandidatas só as espécies que chegam ao limiar", () => {
    const cartas = [...doSet("fic1", 5, { dexIds: [7] }), ...doSet("fic2", 4, { dexIds: [8] })];
    expect(especiesCandidatas(cartas)).toEqual([7]);
  });
});

describe("montarSugestoes", () => {
  it("sugere o set a partir de 5 cartas, com o porquê e o nome da criação", () => {
    const sugestoes = montarSugestoes(
      entrada({ cartas: doSet("fic1", 5), sets: new Map([["fic1", universo("fic1", 20)]]) }),
    );
    expect(sugestoes).toEqual([
      {
        chave: "set:fic1",
        tipo: "set",
        valor: "fic1",
        rotulo: "Set fic1",
        quantidade: 5,
        total: 20,
        totalOficial: true,
        nomeSugerido: "2025 - FIC - Set fic1",
        setId: "fic1",
      },
    ]);
  });

  it("aplica cada limiar exatamente no valor", () => {
    const abaixo = montarSugestoes(
      entrada({
        cartas: [
          ...doSet("fic1", 4, { dexIds: [1] }),
          ...doSet("fic2", 19, { tipos: ["Grass"] }),
          ...doSet("fic3", 7, { ilustrador: "Artista Fictício" }),
          ...doSet("fic4", 9, { raridade: "Rara Fictícia" }),
          ...doSet("fic5", 4, { forma: "hisui" }),
        ],
      }),
    );
    expect(abaixo).toEqual([]);

    const noLimiar = montarSugestoes(
      entrada({
        cartas: [
          ...doSet("fic1", 5, { dexIds: [1] }),
          ...doSet("fic2", 20, { tipos: ["Grass"] }),
          ...doSet("fic3", 8, { ilustrador: "Artista Fictício" }),
          ...doSet("fic4", 10, { raridade: "Rara Fictícia" }),
          ...doSet("fic5", 5, { forma: "hisui" }),
        ],
      }),
    );
    expect(noLimiar.map((s) => s.chave).sort()).toEqual(
      ["especie:1", "forma:hisui", "ilustrador:Artista Fictício", "raridade:Rara Fictícia", "tipo:Grass"].sort(),
    );
  });

  it("comum, incomum e Promo nunca viram sugestão de raridade", () => {
    const cartas = [
      ...doSet("fic1", 30, { raridade: "Common" }),
      ...doSet("fic2", 30, { raridade: "Incomum" }),
      ...doSet("fic3", 30, { raridade: "Promo" }),
    ];
    expect(montarSugestoes(entrada({ cartas }))).toEqual([]);
  });

  it("o set que já tem coleção ocidental some; a receita japonesa não cobre", () => {
    const base = { cartas: doSet("fic1", 6), sets: new Map([["fic1", universo("fic1", 20)]]) };
    const ocidental = {
      id: "c1",
      nome: "Coleção",
      tipo: "set" as const,
      parametro: { sets: ["fic1"], idiomaCatalogo: "en", incluirSecretas: false },
    };
    const japonesa = { ...ocidental, parametro: { ...ocidental.parametro, idiomaCatalogo: "jp" } };
    expect(montarSugestoes(entrada({ ...base, colecoes: [ocidental] }))).toEqual([]);
    expect(montarSugestoes(entrada({ ...base, colecoes: [japonesa] }))).toHaveLength(1);
  });

  it("o tema que já tem coleção temática igual some; outro valor do mesmo tipo não", () => {
    const cartas = doSet("fic1", 5, { dexIds: [25] });
    const tematica = (valor: string) => ({
      id: "c1",
      nome: "Tema",
      tipo: "customizada" as const,
      parametro: { tema: { tipo: "especie", valor } },
    });
    expect(montarSugestoes(entrada({ cartas, colecoes: [tematica("25")] }))).toEqual([]);
    expect(montarSugestoes(entrada({ cartas, colecoes: [tematica("26")] }))).toHaveLength(1);
  });

  it("a dispensada some, de qualquer tipo", () => {
    const cartas = [...doSet("fic1", 5, { forma: "mega" })];
    const sets = new Map([["fic1", universo("fic1", 10)]]);
    const todas = montarSugestoes(entrada({ cartas, sets }));
    expect(todas.map((s) => s.chave).sort()).toEqual(["forma:mega", "set:fic1"]);
    const restantes = montarSugestoes(
      entrada({ cartas, sets, dispensadas: [{ tipo: "set", valor: "fic1" }, { tipo: "forma", valor: "mega" }] }),
    );
    expect(restantes).toEqual([]);
  });

  it("set com catálogo incompleto: total oficial e vagas materializáveis", () => {
    const [sugestao] = montarSugestoes(
      entrada({ cartas: doSet("fic1", 6), sets: new Map([["fic1", universo("fic1", 34, { qtdOficial: 48 })]]) }),
    );
    expect(sugestao).toMatchObject({ quantidade: 6, total: 48, vagasMaterializaveis: 34 });
  });

  it("set sem nenhuma linha pt/en ativa não é sugerido (o mesmo filtro de /api/sets)", () => {
    const cartas = doSet("fic1", 6);
    const inativo = new Map([["fic1", universo("fic1", 20, { temLinhaAtiva: false })]]);
    expect(montarSugestoes(entrada({ cartas, sets: inativo }))).toEqual([]);
  });

  it("set promo sem numeração oficial é sugerido com totalOficial: false", () => {
    const sets = new Map([["fic1", universo("fic1", 8, { qtdOficial: 0, qtdTotal: 8 })]]);
    const [sugestao] = montarSugestoes(entrada({ cartas: doSet("fic1", 5), sets }));
    expect(sugestao).toMatchObject({ tipo: "set", quantidade: 5, total: 8, totalOficial: false });
  });

  it("o limiar do set vale para as cartas do próprio set, e secreta não conta", () => {
    const cartas = [...doSet("fic1", 4), carta({ setId: "fic1", cartaId: "fic1-011", localId: "011" })];
    const sets = new Map([["fic1", universo("fic1", 12, { qtdOficial: 10 })]]);
    expect(montarSugestoes(entrada({ cartas, sets }))).toEqual([]);
  });

  it("raridade pelo valor canônico: pt e en da mesma raridade são um tema só", () => {
    const pt = doSet("fic1", 6, { idioma: "pt", raridade: "Rara Fictícia", raridadeEn: "Fictional rare" });
    const en = doSet("fic2", 4, { idioma: "en", raridade: "Fictional rare", raridadeEn: "Fictional rare" });
    const sugestoes = montarSugestoes(entrada({ cartas: [...pt, ...en] }));
    expect(sugestoes).toEqual([{ chave: "raridade:Fictional rare", tipo: "raridade", valor: "Fictional rare", quantidade: 10 }]);
  });

  it("o rótulo da espécie é o nome do catálogo; sem nome, fica ausente", () => {
    const cartas = [...doSet("fic1", 5, { dexIds: [25] }), ...doSet("fic2", 5, { dexIds: [26] })];
    const sugestoes = montarSugestoes(entrada({ cartas, nomesEspecie: new Map([[25, "Pikachu"]]) }));
    expect(sugestoes.find((s) => s.valor === "25")?.rotulo).toBe("Pikachu");
    expect(sugestoes.find((s) => s.valor === "26")).not.toHaveProperty("rotulo");
  });
});

describe("ordenarSugestoes", () => {
  const s = (tipo: Sugestao["tipo"], valor: string, quantidade: number, total = 0): Sugestao =>
    tipo === "set"
      ? { chave: `set:${valor}`, tipo, valor, setId: valor, rotulo: valor, quantidade, total, totalOficial: true, nomeSugerido: valor }
      : { chave: `${tipo}:${valor}`, tipo, valor, quantidade };

  it("set pela porcentagem, depois pela quantidade", () => {
    const ordem = ordenarSugestoes([s("set", "a", 10, 100), s("set", "b", 9, 10), s("set", "c", 20, 200), s("set", "d", 20, 100)]);
    expect(ordem.map((x) => x.valor)).toEqual(["b", "d", "c", "a"]);
  });

  it("tema pela quantidade, empate pelo valor", () => {
    const ordem = ordenarSugestoes([s("tipo", "Water", 30), s("tipo", "Fire", 40), s("tipo", "Grass", 30)]);
    expect(ordem.map((x) => x.valor)).toEqual(["Fire", "Grass", "Water"]);
  });

  it("seis de um tipo não tiram os outros tipos das seis primeiras", () => {
    const ilustradores = Array.from({ length: 8 }, (_, i) => s("ilustrador", `Artista ${i}`, 100 - i));
    const ordem = ordenarSugestoes([...ilustradores, s("set", "fic1", 5, 300), s("especie", "1", 5)]);
    const seis = ordem.slice(0, 6).map((x) => x.tipo);
    expect(seis).toContain("set");
    expect(seis).toContain("especie");
  });

  it("dentro de uma rodada, a força relativa ao limiar decide; empate pela ordem dos tipos", () => {
    // tipo: 60/20 = 3; espécie: 10/5 = 2; set: 10/5 = 2 → set antes da espécie no empate.
    const ordem = ordenarSugestoes([s("especie", "1", 10), s("tipo", "Fire", 60), s("set", "fic1", 10, 20)]);
    expect(ordem.map((x) => x.tipo)).toEqual(["tipo", "set", "especie"]);
  });
});

describe("lerDispensa", () => {
  it("aceita os tipos conhecidos com valor válido", () => {
    expect(lerDispensa({ tipo: "set", valor: "fic1" })).toEqual({ ok: true, tipo: "set", valor: "fic1" });
    expect(lerDispensa({ tipo: "especie", valor: "25" })).toEqual({ ok: true, tipo: "especie", valor: "25" });
  });

  it("recusa tipo desconhecido e valor inválido para o tipo", () => {
    for (const corpo of [
      { tipo: "cor", valor: "azul" },
      { tipo: "set", valor: "" },
      { tipo: "especie", valor: "025" },
      { tipo: "raridade", valor: "Common" },
      null,
    ]) {
      expect(lerDispensa(corpo)).toEqual({ ok: false, recusa: { chave: "sugestaoInvalida" } });
    }
  });
});
