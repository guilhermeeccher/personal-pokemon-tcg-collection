import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { criarClienteLiga, ErroBloqueioLiga } from "./cliente";
import { criarRitmoFixo, ErroRotaProibidaLiga } from "./ritmo";

const paginaReal = readFileSync(
  new URL("../dominio/fixtures/liga-busca-bulbasaur.html", import.meta.url),
  "utf-8",
);

/** Página cheia (40 linhas) montada a partir de um bloco real, com preço fixo. */
function paginaCheia(preco: string): string {
  const bloco = paginaReal.slice(paginaReal.indexOf('<div class="mtg-single">'));
  const um = bloco.slice(0, bloco.indexOf('<div class="mtg-single">', 1) || undefined);
  return Array.from({ length: 40 }, () =>
    um.replace(/class="price-min">R\$\s*[\d.,]+/, `class="price-min">R$ ${preco}`),
  ).join("");
}

function clienteFake(respostas: Array<Response | Error>) {
  const chamadas: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    chamadas.push(String(url));
    const proxima = respostas.shift();
    if (proxima instanceof Error) throw proxima;
    if (!proxima) throw new Error("resposta não configurada");
    return proxima;
  }) as unknown as typeof fetch;

  const cliente = criarClienteLiga({
    fetchImpl,
    // Sem relógio real: o teste mede comportamento, não paciência.
    dormir: async () => {},
    aleatorio: () => 0.5,
    // Ritmo fixo: quem testa a leitura do robots.txt é `ritmo.test.ts`, e
    // aqui nenhuma requisição pode sair para o arquivo deles.
    ritmo: criarRitmoFixo(3),
  });
  return { cliente, chamadas };
}

const ok = (corpo: string) => new Response(corpo, { status: 200 });

describe("criarClienteLiga", () => {
  it("busca a espécie e devolve as linhas parseadas", async () => {
    const { cliente, chamadas } = clienteFake([ok(paginaReal)]);
    const { linhas, requisicoes } = await cliente.buscarEspecie("Bulbasaur", 20);

    expect(linhas).toHaveLength(5);
    expect(requisicoes).toBe(1);
    expect(chamadas[0]).toContain("card=Bulbasaur%20searchprod%3D0");
    expect(chamadas[0]).toContain("orderBy=7");
  });

  it("para na primeira página quando ela veio incompleta", async () => {
    const { cliente, chamadas } = clienteFake([ok(paginaReal)]);
    await cliente.buscarEspecie("Bulbasaur", null);
    expect(chamadas).toHaveLength(1);
  });

  it("pagina enquanto a página cheia ainda está abaixo do teto", async () => {
    const { cliente, chamadas } = clienteFake([
      ok(paginaCheia("1,00")),
      ok(paginaCheia("2,00")),
      ok(paginaReal),
    ]);
    const { requisicoes } = await cliente.buscarEspecie("Pikachu", 50);
    expect(chamadas).toHaveLength(3);
    expect(requisicoes).toBe(3);
    expect(chamadas[1]).toContain("page=2");
  });

  it("respeita o teto de páginas mesmo com teto de preço alto", async () => {
    // Sem esse limite, teto alto viraria varredura da espécie inteira —
    // custo que ninguém pediu contra o site de terceiro.
    const { cliente, chamadas } = clienteFake([
      ok(paginaCheia("1,00")),
      ok(paginaCheia("1,00")),
      ok(paginaCheia("1,00")),
      ok(paginaCheia("1,00")),
    ]);
    await cliente.buscarEspecie("Pikachu", 999999);
    expect(chamadas).toHaveLength(3);
  });

  it("aborta na hora quando o site responde 403", async () => {
    const { cliente, chamadas } = clienteFake([
      new Response("", { status: 403 }),
      ok(paginaReal),
    ]);
    await expect(cliente.buscarEspecie("Bulbasaur", 20)).rejects.toBeInstanceOf(ErroBloqueioLiga);
    // A segunda requisição não pode ter saído: insistir renova o bloqueio.
    expect(chamadas).toHaveLength(1);
  });

  it("trata 429 como bloqueio, não como erro comum", async () => {
    const { cliente } = clienteFake([new Response("", { status: 429 })]);
    await expect(cliente.buscarEspecie("Bulbasaur", 20)).rejects.toBeInstanceOf(ErroBloqueioLiga);
  });

  it("trata connection refused como bloqueio", async () => {
    const recusa = Object.assign(new Error("fetch failed"), {
      cause: { code: "ECONNREFUSED" },
    });
    const { cliente } = clienteFake([recusa]);
    await expect(cliente.buscarEspecie("Bulbasaur", 20)).rejects.toBeInstanceOf(ErroBloqueioLiga);
  });

  it("500 não é bloqueio — é oscilação do servidor deles", async () => {
    const { cliente } = clienteFake([new Response("", { status: 500 })]);
    await expect(cliente.buscarEspecie("Bulbasaur", 20)).rejects.not.toBeInstanceOf(
      ErroBloqueioLiga,
    );
  });

  it("espera entre requisições — o intervalo é o que nos mantém educados", async () => {
    const esperas: number[] = [];
    const fetchImpl = vi.fn(async () => ok(paginaCheia("1,00"))) as unknown as typeof fetch;
    const cliente = criarClienteLiga({
      fetchImpl,
      dormir: async (ms) => {
        esperas.push(ms);
      },
      aleatorio: () => 1,
      ritmo: criarRitmoFixo(3),
    });

    await cliente.buscarEspecie("Pikachu", 999999);

    // Três páginas: a primeira sai na hora, as outras duas esperam o
    // limitador. Como o `dormir` do teste não consome tempo real, as
    // largadas do limitador se acumulam (3s, depois 6s) — o que importa
    // é que nenhuma das duas saiu antes dos 3 segundos combinados.
    const esperasDoLimitador = esperas.filter((ms) => ms !== 1_500);
    expect(esperasDoLimitador).toHaveLength(2);
    // A margem de 100 ms é o relógio real andando entre as chamadas: o
    // limitador desconta o tempo já decorrido da espera que pede.
    expect(esperasDoLimitador.every((ms) => ms >= 2_900)).toBe(true);

    // Jitter em toda requisição, inclusive na primeira.
    expect(esperas.filter((ms) => ms === 1_500)).toHaveLength(3);
  });

  it("busca a carta do set e para na página em que ela aparece", async () => {
    const { cliente, chamadas } = clienteFake([
      ok(paginaCheia("1,00")),
      ok(paginaCheia("2,00")),
      ok(paginaCheia("3,00")),
    ]);
    // "Achou" só na segunda página: a terceira não pode nem sair.
    let paginas = 0;
    const { requisicoes } = await cliente.buscarCarta("Lokix", () => ++paginas >= 2);

    expect(chamadas).toHaveLength(2);
    expect(requisicoes).toBe(2);
    expect(chamadas[0]).toContain("card=Lokix%20searchprod%3D0");
  });

  it("na busca por carta, o teto de páginas continua valendo quando ela não aparece", async () => {
    // Diferente da espécie, aqui o teto de PREÇO não encerra a paginação: a
    // carta do set pode ser a mais cara do nome. O que encerra é achar — ou
    // o teto de páginas.
    const { cliente, chamadas } = clienteFake([
      ok(paginaCheia("1,00")),
      ok(paginaCheia("2,00")),
      ok(paginaCheia("3,00")),
      ok(paginaCheia("4,00")),
    ]);
    await cliente.buscarCarta("Oddish", () => false);
    expect(chamadas).toHaveLength(3);
  });

  it("identifica o cliente no User-Agent", async () => {
    const fetchImpl = vi.fn(async () => ok(paginaReal)) as unknown as typeof fetch;
    const cliente = criarClienteLiga({
      fetchImpl,
      dormir: async () => {},
      aleatorio: () => 0,
      ritmo: criarRitmoFixo(3),
    });
    await cliente.buscarEspecie("Bulbasaur", 20);

    const [, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("colecao-pokemon");
  });
  it("pede o intervalo ao ritmo, em vez de carregar um número próprio", async () => {
    // O ponto da fase: o valor vem do robots.txt deles, não daqui.
    const esperas: number[] = [];
    const fetchImpl = vi.fn(async () => ok(paginaCheia("1,00"))) as unknown as typeof fetch;
    const cliente = criarClienteLiga({
      fetchImpl,
      dormir: async (ms) => {
        esperas.push(ms);
      },
      aleatorio: () => 0,
      ritmo: criarRitmoFixo(10),
    });

    await cliente.buscarEspecie("Pikachu", 999999);

    const esperasDoLimitador = esperas.filter((ms) => ms > 0);
    expect(esperasDoLimitador).toHaveLength(2);
    expect(esperasDoLimitador.every((ms) => ms >= 9_900)).toBe(true);
  });

  it("checa a rota ANTES de a requisição sair", async () => {
    // Barrar depois de esperar o intervalo seria a mesma recusa, só que tarde
    // — e com a requisição já na porta deles.
    const fetchImpl = vi.fn(async () => ok(paginaReal)) as unknown as typeof fetch;
    const vistas: string[] = [];
    const base = criarRitmoFixo(3);
    const cliente = criarClienteLiga({
      fetchImpl,
      dormir: async () => {},
      aleatorio: () => 0,
      ritmo: {
        ...base,
        exigirRotaPermitida(url: string) {
          vistas.push(url);
          throw new ErroRotaProibidaLiga(url, "teste");
        },
      },
    });

    await expect(cliente.buscarEspecie("Bulbasaur", 20)).rejects.toBeInstanceOf(
      ErroRotaProibidaLiga,
    );
    expect(vistas).toHaveLength(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
