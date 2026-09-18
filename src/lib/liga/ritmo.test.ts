import { describe, expect, it, vi } from "vitest";

import {
  criarRitmoLiga,
  ErroRotaProibidaLiga,
  INTERVALO_CONSERVADOR_SEGUNDOS,
  URL_ROBOTS_LIGA,
  VALIDADE_CACHE_MS,
} from "./ritmo";

const ROBOTS = `
User-agent: *
Crawl-delay: 360
Allow: /?view=cards/search
Allow: /?view=cards/card
Disallow: /?view=cards/pricehistory
Disallow: /bzr/
Disallow: /colecao/
Disallow: /ecom/
`;

const URL_BUSCA =
  "https://www.ligapokemon.com.br/?view=cards/search&card=Bulbasaur&tipo=1&orderBy=7&page=1";

/**
 * Relógio e rede falsos: nenhum teste desta suíte toca no site deles, e
 * nenhum espera tempo real passar.
 */
function ambiente(respostas: Array<Response | Error>, intervaloEnv?: string) {
  const chamadas: string[] = [];
  let instante = 1_000_000;

  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    chamadas.push(String(url));
    const proxima = respostas.shift();
    if (proxima instanceof Error) throw proxima;
    if (!proxima) throw new Error("resposta não configurada");
    return proxima;
  }) as unknown as typeof fetch;

  const avisos: string[] = [];
  const ritmo = criarRitmoLiga({
    fetchImpl,
    agora: () => instante,
    lerIntervaloConfigurado: () => intervaloEnv,
    avisar: (m) => avisos.push(m),
  });

  return { ritmo, chamadas, avisos, avancar: (ms: number) => (instante += ms) };
}

const ok = (corpo: string) => new Response(corpo, { status: 200 });

describe("criarRitmoLiga — o intervalo sai do robots.txt deles", () => {
  it("lê o arquivo ao vivo e usa o Crawl-delay declarado", async () => {
    const { ritmo, chamadas } = ambiente([ok(ROBOTS)]);
    const estado = await ritmo.atualizar();

    expect(chamadas).toEqual([URL_ROBOTS_LIGA]);
    expect(estado.intervaloSegundos).toBe(360);
    expect(estado.origem).toBe("robots");
  });

  it("se eles afrouxarem, todo mundo se beneficia", async () => {
    // O motivo de não fixar 360 no código.
    const { ritmo } = ambiente([ok("User-agent: *\nCrawl-delay: 20\n")]);
    expect((await ritmo.atualizar()).intervaloSegundos).toBe(20);
  });

  it("se eles apertarem, todo mundo obedece", async () => {
    const { ritmo } = ambiente([ok("User-agent: *\nCrawl-delay: 900\n")]);
    expect((await ritmo.atualizar()).intervaloSegundos).toBe(900);
  });

  it("Crawl-delay zero não vira requisição sem intervalo", async () => {
    const { ritmo } = ambiente([ok("User-agent: *\nCrawl-delay: 0\n")]);
    expect((await ritmo.atualizar()).intervaloSegundos).toBe(1);
  });

  it("antes da primeira leitura, o estado já é o conservador", () => {
    const { ritmo } = ambiente([ok(ROBOTS)]);
    const estado = ritmo.atual();
    expect(estado.intervaloSegundos).toBe(INTERVALO_CONSERVADOR_SEGUNDOS);
    expect(estado.origem).toBe("conservador");
  });
});

describe("criarRitmoLiga — cache curto", () => {
  it("não relê o arquivo dentro da validade", async () => {
    const { ritmo, chamadas, avancar } = ambiente([ok(ROBOTS)]);
    await ritmo.atualizar();
    avancar(VALIDADE_CACHE_MS - 1);
    await ritmo.atualizar();
    expect(chamadas).toHaveLength(1);
  });

  it("relê quando a validade vence, e um aperto no meio da varredura vale", async () => {
    const { ritmo, chamadas, avancar } = ambiente([
      ok("User-agent: *\nCrawl-delay: 60\n"),
      ok("User-agent: *\nCrawl-delay: 600\n"),
    ]);
    expect((await ritmo.atualizar()).intervaloSegundos).toBe(60);

    avancar(VALIDADE_CACHE_MS + 1);
    expect((await ritmo.atualizar()).intervaloSegundos).toBe(600);
    expect(chamadas).toHaveLength(2);
  });

  it("chamadas simultâneas fazem uma leitura só", async () => {
    const { ritmo, chamadas } = ambiente([ok(ROBOTS), ok(ROBOTS)]);
    await Promise.all([ritmo.atualizar(), ritmo.atualizar(), ritmo.atualizar()]);
    expect(chamadas).toHaveLength(1);
  });
});

describe("criarRitmoLiga — falha cai no conservador, nunca no agressivo", () => {
  it("rede fora", async () => {
    const { ritmo, avisos } = ambiente([new Error("fetch failed")]);
    const estado = await ritmo.atualizar();
    expect(estado.intervaloSegundos).toBe(INTERVALO_CONSERVADOR_SEGUNDOS);
    expect(estado.origem).toBe("conservador");
    expect(avisos[0]).toContain("robots.txt");
  });

  it("5xx", async () => {
    const { ritmo } = ambiente([new Response("", { status: 503 })]);
    expect((await ritmo.atualizar()).origem).toBe("conservador");
  });

  it("arquivo malformado (HTML de erro no lugar do robots.txt)", async () => {
    const { ritmo, avisos } = ambiente([ok("<!DOCTYPE html><html>404</html>")]);
    const estado = await ritmo.atualizar();
    expect(estado.intervaloSegundos).toBe(INTERVALO_CONSERVADOR_SEGUNDOS);
    expect(avisos[0]).toContain("Crawl-delay");
  });

  it("arquivo sem Crawl-delay para o nosso agente", async () => {
    const { ritmo } = ambiente([ok("User-agent: Googlebot\nCrawl-delay: 5\n")]);
    expect((await ritmo.atualizar()).intervaloSegundos).toBe(INTERVALO_CONSERVADOR_SEGUNDOS);
  });

  it("leitura boa que venceu e não pôde ser renovada volta ao conservador", async () => {
    // O valor antigo pode ter mudado — repetir um número vencido é o caminho
    // para continuar rápido quando eles já pediram devagar.
    const { ritmo, avancar } = ambiente([
      ok("User-agent: *\nCrawl-delay: 20\n"),
      new Error("fetch failed"),
    ]);
    expect((await ritmo.atualizar()).intervaloSegundos).toBe(20);

    avancar(VALIDADE_CACHE_MS + 1);
    expect((await ritmo.atualizar()).intervaloSegundos).toBe(INTERVALO_CONSERVADOR_SEGUNDOS);
  });

  it("falha seguida não vira uma leitura por requisição", async () => {
    const { ritmo, chamadas, avancar } = ambiente([
      new Error("fetch failed"),
      new Error("fetch failed"),
    ]);
    await ritmo.atualizar();
    avancar(1_000);
    await ritmo.atualizar();
    expect(chamadas).toHaveLength(1);
  });
});

describe("criarRitmoLiga — LIGA_INTERVALO_SEGUNDOS", () => {
  it("presente, sobrepõe o robots.txt: é escolha explícita de quem instalou", async () => {
    const { ritmo } = ambiente([ok(ROBOTS)], "3");
    const estado = await ritmo.atualizar();
    expect(estado.intervaloSegundos).toBe(3);
    expect(estado.origem).toBe("env");
  });

  it("aceita valor fracionário", async () => {
    const { ritmo } = ambiente([ok(ROBOTS)], "2,5");
    expect((await ritmo.atualizar()).intervaloSegundos).toBe(2.5);
  });

  it("ausente, vale o robots.txt", async () => {
    const { ritmo } = ambiente([ok(ROBOTS)], undefined);
    expect((await ritmo.atualizar()).origem).toBe("robots");
  });

  it("valor inválido é ignorado em vez de virar ritmo sem freio", async () => {
    for (const bruto of ["", "   ", "zero", "0", "-5"]) {
      const { ritmo } = ambiente([ok(ROBOTS)], bruto);
      expect((await ritmo.atualizar()).intervaloSegundos).toBe(360);
    }
  });
});

describe("criarRitmoLiga — rotas", () => {
  it("deixa passar as duas rotas que a varredura usa", async () => {
    const { ritmo } = ambiente([ok(ROBOTS)]);
    await ritmo.atualizar();
    expect(() => ritmo.exigirRotaPermitida(URL_BUSCA)).not.toThrow();
    expect(() =>
      ritmo.exigirRotaPermitida("https://www.ligapokemon.com.br/?view=cards/card&card=1"),
    ).not.toThrow();
  });

  it("barra as proibidas mesmo sem nunca ter lido o arquivo", () => {
    // A garantia não pode depender de leitura: arquivo fora do ar diria
    // "pode tudo" se a lista fixa não existisse.
    const { ritmo } = ambiente([]);
    for (const url of [
      "https://www.ligapokemon.com.br/?view=cards/pricehistory&card=1",
      "https://www.ligapokemon.com.br/bzr/loja",
      "https://www.ligapokemon.com.br/colecao/minha",
      "https://www.ligapokemon.com.br/ecom/carrinho",
    ]) {
      expect(() => ritmo.exigirRotaPermitida(url)).toThrow(ErroRotaProibidaLiga);
    }
  });

  it("proibição nova deles passa a valer sem release nosso", async () => {
    const { ritmo } = ambiente([ok("User-agent: *\nCrawl-delay: 360\nDisallow: /?view=cards/\n")]);
    await ritmo.atualizar();
    expect(() => ritmo.exigirRotaPermitida(URL_BUSCA)).toThrow(ErroRotaProibidaLiga);
  });

  it("arquivo liberando tudo não destrava a lista fixa", async () => {
    // O arquivo pode acrescentar proibição; nunca remover a que está cravada.
    const { ritmo } = ambiente([ok("User-agent: *\nAllow: /\nCrawl-delay: 1\n")]);
    await ritmo.atualizar();
    expect(() =>
      ritmo.exigirRotaPermitida("https://www.ligapokemon.com.br/?view=cards/pricehistory&card=1"),
    ).toThrow(ErroRotaProibidaLiga);
  });
});
