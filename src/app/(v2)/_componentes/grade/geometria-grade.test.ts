import { describe, expect, it } from "vitest";

import {
  alturaDaGrade,
  ancoraDaRolagem,
  deveVirtualizar,
  faixaVisivel,
  geometriaDaGrade,
  indiceNoPonto,
  posicaoDoItem,
  proximoIndice,
  rolagemDaAncora,
  rolagemParaMostrar,
} from "./geometria-grade";

// 4 colunas de 100 px com vão de 10: 4 × 100 + 3 × 10 = 430.
const g = geometriaDaGrade({ largura: 430, minCelula: 100, vaoX: 10, vaoY: 20, proporcao: 1.5, alturaExtra: 0 });

describe("geometriaDaGrade", () => {
  it("cabem tantas colunas quanto a menor célula permite, e a sobra vira largura", () => {
    expect(g.colunas).toBe(4);
    expect(g.larguraCelula).toBe(100);
    expect(g.alturaCelula).toBe(150);
    expect(g.passoLinha).toBe(170);
    const mais = geometriaDaGrade({ largura: 470, minCelula: 100, vaoX: 10, vaoY: 20, proporcao: 1.5 });
    expect(mais.colunas).toBe(4);
    expect(mais.larguraCelula).toBe(110);
  });

  it("nunca menos de uma coluna, nem largura negativa", () => {
    const estreita = geometriaDaGrade({ largura: 40, minCelula: 100, vaoX: 10, vaoY: 10 });
    expect(estreita.colunas).toBe(1);
    expect(geometriaDaGrade({ largura: -5, minCelula: 100, vaoX: 10, vaoY: 10 }).larguraCelula).toBe(0);
  });

  it("soma a legenda à altura da célula", () => {
    expect(geometriaDaGrade({ largura: 100, minCelula: 100, vaoX: 0, vaoY: 0, proporcao: 1, alturaExtra: 30 }).alturaCelula).toBe(130);
  });
});

describe("alturaDaGrade e posicaoDoItem", () => {
  it("sem o vão depois da última linha", () => {
    expect(alturaDaGrade(0, g)).toBe(0);
    expect(alturaDaGrade(4, g)).toBe(150);
    expect(alturaDaGrade(5, g)).toBe(320);
  });

  it("a posição é aritmética", () => {
    expect(posicaoDoItem(0, g)).toEqual({ linha: 0, coluna: 0, x: 0, y: 0 });
    expect(posicaoDoItem(6, g)).toEqual({ linha: 1, coluna: 2, x: 220, y: 170 });
  });
});

describe("faixaVisivel", () => {
  it("sem virtualizar, monta tudo", () => {
    expect(faixaVisivel({ total: 1025, g, topo: -5000, alturaJanela: 800, virtualizar: false })).toEqual({ inicio: 0, fim: 1025 });
  });

  it("no topo: as linhas visíveis e a sobra de baixo", () => {
    // 800 / 170 → 5 linhas visíveis (arredonda para cima) + 3 de sobra.
    expect(faixaVisivel({ total: 1025, g, topo: 0, alturaJanela: 800, virtualizar: true })).toEqual({ inicio: 0, fim: 32 });
  });

  it("no meio: começa em linhas inteiras, com sobra dos dois lados", () => {
    // topo -1700 → a linha 10 está no topo da janela; começa na 7.
    const f = faixaVisivel({ total: 1025, g, topo: -1700, alturaJanela: 800, virtualizar: true });
    expect(f.inicio).toBe(28);
    expect(f.inicio % g.colunas).toBe(0);
    expect(f.fim).toBe(4 * (Math.ceil((800 + 1700) / 170) + 3));
  });

  it("no fim: não passa do total", () => {
    const f = faixaVisivel({ total: 1025, g, topo: -1e6, alturaJanela: 800, virtualizar: true });
    expect(f.fim).toBe(1025);
    expect(f.inicio).toBeLessThan(1025);
  });

  it("grade abaixo da janela ainda monta a primeira linha", () => {
    expect(faixaVisivel({ total: 1025, g, topo: 5000, alturaJanela: 800, virtualizar: true })).toEqual({ inicio: 0, fim: 4 });
  });

  it("lista vazia", () => {
    expect(faixaVisivel({ total: 0, g, topo: 0, alturaJanela: 800, virtualizar: true })).toEqual({ inicio: 0, fim: 0 });
  });
});

describe("deveVirtualizar", () => {
  it("só acima do limiar", () => {
    expect(deveVirtualizar(300, 300)).toBe(false);
    expect(deveVirtualizar(301, 300)).toBe(true);
  });
});

describe("indiceNoPonto", () => {
  it("acha a célula, e o vão não é de ninguém", () => {
    expect(indiceNoPonto(5, 5, 10, g)).toBe(0);
    expect(indiceNoPonto(115, 5, 10, g)).toBe(1);
    expect(indiceNoPonto(105, 5, 10, g)).toBeNull();
    expect(indiceNoPonto(5, 160, 10, g)).toBeNull();
    expect(indiceNoPonto(5, 175, 10, g)).toBe(4);
  });

  it("fora da grade ou além do último item é nulo", () => {
    expect(indiceNoPonto(-1, 5, 10, g)).toBeNull();
    expect(indiceNoPonto(500, 5, 10, g)).toBeNull();
    expect(indiceNoPonto(5, 520, 10, g)).toBeNull();
  });
});

describe("proximoIndice", () => {
  const p = { total: 10, colunas: 4, linhasPorPagina: 2 };

  it("setas andam uma célula ou uma linha", () => {
    expect(proximoIndice(5, "ArrowRight", p)).toBe(6);
    expect(proximoIndice(5, "ArrowLeft", p)).toBe(4);
    expect(proximoIndice(5, "ArrowDown", p)).toBe(9);
    expect(proximoIndice(5, "ArrowUp", p)).toBe(1);
  });

  it("na borda fica onde está, sem dar a volta", () => {
    expect(proximoIndice(0, "ArrowLeft", p)).toBe(0);
    expect(proximoIndice(9, "ArrowRight", p)).toBe(9);
    expect(proximoIndice(2, "ArrowUp", p)).toBe(2);
    expect(proximoIndice(9, "ArrowDown", p)).toBe(9);
  });

  it("para baixo numa linha cheia sobre uma incompleta vai ao último", () => {
    expect(proximoIndice(7, "ArrowDown", p)).toBe(9);
  });

  it("Home, End e as páginas", () => {
    expect(proximoIndice(5, "Home", p)).toBe(0);
    expect(proximoIndice(5, "End", p)).toBe(9);
    expect(proximoIndice(1, "PageDown", p)).toBe(9);
    expect(proximoIndice(9, "PageUp", p)).toBe(1);
    expect(proximoIndice(3, "PageUp", p)).toBe(0);
  });
});

describe("âncora de troca de colunas", () => {
  it("antes de rolar para dentro da grade não há âncora", () => {
    expect(ancoraDaRolagem({ total: 100, g, topo: 30 })).toBeNull();
  });

  it("guarda o primeiro item da primeira linha à vista e o devolve ao mesmo lugar", () => {
    const ancora = ancoraDaRolagem({ total: 100, g, topo: -400 })!;
    // -400 → a linha 3 (y 510) é a primeira que começa à vista, a 110 px do topo.
    expect(ancora).toEqual({ indice: 12, deslocamento: 110 });
    const duas = geometriaDaGrade({ largura: 210, minCelula: 100, vaoX: 10, vaoY: 20, proporcao: 1.5 });
    // Duas colunas: o item 12 está na linha 6 (y 1020). A grade começa em 300 no documento.
    expect(rolagemDaAncora({ ...ancora, g: duas, topoNoDocumento: 300 })).toBe(300 + 1020 - 110);
  });
});

describe("rolagemParaMostrar", () => {
  const base = { g, topoNoDocumento: 100, alturaJanela: 600 };

  it("já à vista: não rola", () => {
    expect(rolagemParaMostrar({ ...base, indice: 4, rolagemAtual: 0 })).toBe(0);
  });

  it("abaixo: alinha a base, descontando a barra de baixo", () => {
    // Item 40: linha 10, topo 100 + 1700, base 1950.
    expect(rolagemParaMostrar({ ...base, indice: 40, rolagemAtual: 0, margemBase: 80 })).toBe(1950 - 600 + 80);
  });

  it("acima: alinha o topo, descontando a barra de cima", () => {
    expect(rolagemParaMostrar({ ...base, indice: 0, rolagemAtual: 3000, margemTopo: 20 })).toBe(80);
  });
});
