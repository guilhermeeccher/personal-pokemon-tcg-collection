import { describe, expect, it, vi } from "vitest";

import { ErroCotacaoIndisponivel, obterPtaxEuro } from "./ptax";

/** Nenhuma requisição sai daqui: o fetch é falso e as respostas são inventadas. */
function fetchFalso(respostas: Array<Response | Error>) {
  const chamadas: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init });
    const proxima = respostas.shift();
    if (proxima instanceof Error) throw proxima;
    if (!proxima) throw new Error("resposta não configurada");
    return proxima;
  }) as unknown as typeof fetch;
  return { fetchImpl, chamadas };
}

const dormir = async () => {};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
const boletins = {
  value: [
    { cotacaoVenda: 6.11, dataHoraCotacao: "2026-03-10 13:04:00.000", tipoBoletim: "Fechamento" },
    { cotacaoVenda: 6.2, dataHoraCotacao: "2026-03-11 10:04:00.000", tipoBoletim: "Abertura" },
  ],
};
const agora = new Date("2026-03-11T15:00:00Z");

describe("obterPtaxEuro", () => {
  it("consulta o euro nos últimos dias, identificado, e devolve o fechamento", async () => {
    const { fetchImpl, chamadas } = fetchFalso([json(boletins)]);
    await expect(obterPtaxEuro(agora, { fetchImpl, dormir })).resolves.toEqual({
      cotacao: 6.11,
      data: "2026-03-10",
    });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url).toContain("@moeda='EUR'");
    expect(chamadas[0].url).toContain("@dataInicial='03-01-2026'");
    expect(chamadas[0].url).toContain("@dataFinalCotacao='03-11-2026'");
    const headers = chamadas[0].init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("colecao-pokemon");
    expect(chamadas[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("repete uma vez em erro transitório", async () => {
    const { fetchImpl, chamadas } = fetchFalso([json({}, 503), json(boletins)]);
    await expect(obterPtaxEuro(agora, { fetchImpl, dormir })).resolves.toMatchObject({ cotacao: 6.11 });
    expect(chamadas).toHaveLength(2);
  });

  it("depois da repetição, desiste com ErroCotacaoIndisponivel", async () => {
    const { fetchImpl, chamadas } = fetchFalso([
      new Error("socket hang up"),
      new DOMException("tempo esgotado", "TimeoutError"),
    ]);
    await expect(obterPtaxEuro(agora, { fetchImpl, dormir })).rejects.toBeInstanceOf(
      ErroCotacaoIndisponivel,
    );
    expect(chamadas).toHaveLength(2);
  });

  it("4xx e resposta sem fechamento não são repetidos", async () => {
    const quatro = fetchFalso([json({}, 404)]);
    await expect(obterPtaxEuro(agora, { fetchImpl: quatro.fetchImpl, dormir })).rejects.toBeInstanceOf(
      ErroCotacaoIndisponivel,
    );
    expect(quatro.chamadas).toHaveLength(1);

    const semFechamento = fetchFalso([json({ value: [boletins.value[1]] })]);
    await expect(
      obterPtaxEuro(agora, { fetchImpl: semFechamento.fetchImpl, dormir }),
    ).rejects.toBeInstanceOf(ErroCotacaoIndisponivel);
    expect(semFechamento.chamadas).toHaveLength(1);
  });
});
