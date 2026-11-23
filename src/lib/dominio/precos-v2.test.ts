import { describe, expect, it } from "vitest";

import {
  CARTAS_POR_PAGINA,
  batidaDeveReler,
  PERIODO_MAXIMO_MS,
  PERIODO_MINIMO_MS,
  criterioForaDaTendencia,
  dataCivil,
  diaDoCambioDaLinha,
  escalaY,
  fonteDaResposta,
  idsParaPedir,
  indiceEmFoco,
  lerIdsPedidos,
  moverFoco,
  paginar,
  periodoDeAtualizacaoMs,
  pontoMaisProximo,
  posicoesX,
  textoDaCotacao,
  type RespostaPrecosDTO,
} from "./precos-v2";

describe("periodoDeAtualizacaoMs", () => {
  it("é o intervalo × 250 ms: 360 s dão 60 s, o teto", () => {
    expect(periodoDeAtualizacaoMs({ intervaloSegundos: 360 })).toBe(PERIODO_MAXIMO_MS);
  });

  it("acompanha o intervalo entre o piso e o teto, e não é um número fixo", () => {
    expect(periodoDeAtualizacaoMs({ intervaloSegundos: 100 })).toBe(25_000);
    expect(periodoDeAtualizacaoMs({ intervaloSegundos: 200 })).toBe(50_000);
    expect(periodoDeAtualizacaoMs({ intervaloSegundos: 100 })).not.toBe(periodoDeAtualizacaoMs({ intervaloSegundos: 200 }));
  });

  it("intervalo curto cai no piso de 5 s", () => {
    expect(periodoDeAtualizacaoMs({ intervaloSegundos: 3 })).toBe(PERIODO_MINIMO_MS);
    expect(periodoDeAtualizacaoMs({ intervaloSegundos: 0 })).toBe(PERIODO_MINIMO_MS);
  });

  it("sem ritmo (Cardmarket) vale o piso, e um valor sem sentido também", () => {
    expect(periodoDeAtualizacaoMs(null)).toBe(PERIODO_MINIMO_MS);
    expect(periodoDeAtualizacaoMs({ intervaloSegundos: Number.NaN })).toBe(PERIODO_MINIMO_MS);
  });

  it("nunca sai do intervalo [5 s, 60 s]", () => {
    for (const s of [-10, 0, 1, 19, 20, 21, 239, 240, 241, 1000, 86_400]) {
      const p = periodoDeAtualizacaoMs({ intervaloSegundos: s });
      expect(p).toBeGreaterThanOrEqual(PERIODO_MINIMO_MS);
      expect(p).toBeLessThanOrEqual(PERIODO_MAXIMO_MS);
    }
  });
});

describe("batidaDeveReler", () => {
  it("não cancela uma leitura em curso: respostas lentas ainda terminam", () => {
    expect(batidaDeveReler({ leituraEmCurso: true, abaVisivel: true })).toBe(false);
  });

  it("lê quando não há leitura em curso e a aba está à vista", () => {
    expect(batidaDeveReler({ leituraEmCurso: false, abaVisivel: true })).toBe(true);
    expect(batidaDeveReler({ leituraEmCurso: false, abaVisivel: false })).toBe(false);
  });
});

describe("paginar", () => {
  const cem = Array.from({ length: 120 }, (_, i) => i);

  it("corta em páginas de 50", () => {
    const p = paginar(cem, 2);
    expect(p.itens).toHaveLength(CARTAS_POR_PAGINA);
    expect(p.itens[0]).toBe(50);
    expect(p.totalPaginas).toBe(3);
  });

  it("a última página leva o resto", () => {
    expect(paginar(cem, 3).itens).toHaveLength(20);
  });

  it("a página fica presa ao total quando a lista encolhe", () => {
    const p = paginar(cem.slice(0, 40), 3);
    expect(p.pagina).toBe(1);
    expect(p.itens).toHaveLength(40);
  });

  it("lista vazia tem uma página vazia, e página inválida vira a primeira", () => {
    expect(paginar([], 5)).toEqual({ itens: [], pagina: 1, totalPaginas: 1 });
    expect(paginar(cem, 0).pagina).toBe(1);
    expect(paginar(cem, Number.NaN).pagina).toBe(1);
  });
});

describe("criterioForaDaTendencia", () => {
  it("a tendência é o caso comum e não leva etiqueta", () => {
    expect(criterioForaDaTendencia("tendencia")).toBeNull();
    expect(criterioForaDaTendencia(null)).toBeNull();
  });

  it("a trava da média de 30 dias e a falta de tendência levam etiqueta", () => {
    expect(criterioForaDaTendencia("media30")).toEqual({ tipo: "media30", tom: "aviso" });
    expect(criterioForaDaTendencia("media")).toEqual({ tipo: "media", tom: "neutro" });
  });
});

describe("diaDoCambioDaLinha", () => {
  const tela = { valor: 6.1706, data: "2026-11-11" };

  it("a linha com o mesmo câmbio da tela não repete o dia", () => {
    expect(diaDoCambioDaLinha({ cotacao: 6.1706, cotacaoData: "2026-11-11" }, tela)).toBeNull();
  });

  it("outro dia, ou o mesmo dia com outro valor, é escrito na linha", () => {
    expect(diaDoCambioDaLinha({ cotacao: 6.1, cotacaoData: "2026-11-09" }, tela)).toBe("2026-11-09");
    expect(diaDoCambioDaLinha({ cotacao: 6.2, cotacaoData: "2026-11-11" }, tela)).toBe("2026-11-11");
  });

  it("sem cotação na tela a linha diz a dela; sem dia, nada", () => {
    expect(diaDoCambioDaLinha({ cotacao: 6.1, cotacaoData: "2026-11-09" }, null)).toBe("2026-11-09");
    expect(diaDoCambioDaLinha({ cotacao: null, cotacaoData: null }, tela)).toBeNull();
  });
});

describe("dataCivil e textoDaCotacao", () => {
  it("o dia do boletim sai igual ao escrito, sem escorregar para o dia anterior", () => {
    expect(dataCivil("2026-11-11", "pt-BR")).toBe("11/11/2026");
    expect(dataCivil("2026-01-01", "en-US")).toBe("1/1/2026");
  });

  it("o euro sai sem casas e o real com as quatro da PTAX", () => {
    const t = textoDaCotacao({ valor: 6.1706, data: "2026-11-11" }, "pt-BR");
    expect(t.real).toContain("6,1706");
    expect(t.euro).not.toContain(",");
    expect(t.data).toBe("11/11/2026");
  });
});

describe("fonteDaResposta", () => {
  it("uma resposta sem a fonte é a da Liga", () => {
    const sem = { ritmo: { intervaloSegundos: 360, origem: "robots" }, itens: [] } as unknown as RespostaPrecosDTO;
    expect(fonteDaResposta(sem)).toBe("liga");
    expect(fonteDaResposta({ ...sem, fonte: "cardmarket" } as unknown as RespostaPrecosDTO)).toBe("cardmarket");
  });
});

describe("idsParaPedir", () => {
  it("tira repetidos e vazios, e respeita o teto", () => {
    expect(idsParaPedir(["a", "b", "a", ""])).toEqual(["a", "b"]);
    expect(idsParaPedir(Array.from({ length: 300 }, (_, i) => `c${i}`))).toHaveLength(100);
  });
});

describe("lerIdsPedidos", () => {
  it("aceita uma página, sem repetição", () => {
    expect(lerIdsPedidos(["a", "b", "a"])).toEqual(["a", "b"]);
    expect(lerIdsPedidos(Array.from({ length: 100 }, (_, i) => `c${i}`))).toHaveLength(100);
  });

  it("recusa nenhum id, mais do que o teto, id vazio e id enorme", () => {
    expect(lerIdsPedidos([])).toBeNull();
    expect(lerIdsPedidos(Array.from({ length: 101 }, (_, i) => `c${i}`))).toBeNull();
    expect(lerIdsPedidos(["a", ""])).toBeNull();
    expect(lerIdsPedidos(["x".repeat(101)])).toBeNull();
  });
});

describe("o gráfico", () => {
  it("escalaY parte de zero, em passos redondos, e cobre o máximo", () => {
    for (const m of [0, 1, 7, 99, 1234.5, 98_000]) {
      const { topo, ticks } = escalaY(m);
      expect(ticks[0]).toBe(0);
      expect(topo).toBeGreaterThanOrEqual(m);
      expect(ticks[ticks.length - 1]).toBe(topo);
    }
    expect(escalaY(1000).ticks).toEqual([0, 250, 500, 750, 1000]);
  });

  it("com tudo zerado o topo continua positivo e nenhuma coordenada vira NaN", () => {
    const { topo, ticks } = escalaY(0);
    expect(topo).toBeGreaterThan(0);
    expect(ticks.length).toBeGreaterThan(1);
    expect(0 / topo).toBe(0);
  });

  it("os pontos ficam pelo tempo, não pelo índice", () => {
    const dia = 86_400_000;
    const xs = posicoesX([0, dia, 10 * dia], 600);
    expect(xs[1] - xs[0]).toBeLessThan(xs[2] - xs[1]);
    expect(xs[0]).toBeGreaterThan(64);
    expect(xs[2]).toBeLessThan(600 - 20);
  });

  it("um ponto só fica no meio da área, e dois no mesmo instante não dividem por zero", () => {
    expect(posicoesX([5], 584)[0]).toBe(64 + (584 - 64 - 20) / 2);
    const xs = posicoesX([7, 7], 600);
    expect(xs.every((x) => Number.isFinite(x))).toBe(true);
    expect(posicoesX([], 600)).toEqual([]);
  });

  it("pontoMaisProximo escolhe o de menor distância, o primeiro no empate", () => {
    expect(pontoMaisProximo([10, 50, 90], 52)).toBe(1);
    expect(pontoMaisProximo([10, 50, 90], 30)).toBe(0);
    expect(pontoMaisProximo([], 30)).toBe(-1);
  });

  it("sem escolha a leitura mostra o último ponto", () => {
    expect(indiceEmFoco(null, 4)).toBe(3);
    expect(indiceEmFoco(1, 4)).toBe(1);
    expect(indiceEmFoco(9, 4)).toBe(3);
    expect(indiceEmFoco(null, 0)).toBe(-1);
  });

  it("as setas movem o foco e param nas pontas", () => {
    expect(moverFoco(2, 5, "ArrowLeft")).toBe(1);
    expect(moverFoco(0, 5, "ArrowLeft")).toBe(0);
    expect(moverFoco(4, 5, "ArrowRight")).toBe(4);
    expect(moverFoco(2, 5, "Home")).toBe(0);
    expect(moverFoco(2, 5, "End")).toBe(4);
    expect(moverFoco(2, 5, "a")).toBeNull();
    expect(moverFoco(0, 0, "ArrowRight")).toBeNull();
  });
});
