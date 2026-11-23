/**
 * Uma chamada às rotas de organizar, de sugestões e de coleção temática, com
 * o status e o corpo juntos: quem chama traduz a recusa (`textoDaRecusa`) e
 * decide o estado seguinte (`reacaoDaPrevia`). Falha de rede vira
 * `status: null` em vez de exceção — o servidor pode ter gravado tudo ou
 * nada, e cada tela trata esse caso com a própria frase.
 *
 * `cache: "no-store"` nas leituras: uma prévia em lote é sempre do estado de
 * agora, nunca de uma resposta guardada.
 */
export interface RespostaApi {
  ok: boolean;
  /** `null`: sem resposta (rede). */
  status: number | null;
  corpo: unknown;
}

export async function pedirApi(url: string, method = "GET", corpo?: unknown, sinal?: AbortSignal): Promise<RespostaApi> {
  try {
    const resp = await fetch(url, {
      method,
      cache: "no-store",
      signal: sinal,
      headers: corpo !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    return { ok: resp.ok, status: resp.status, corpo: await resp.json().catch(() => null) };
  } catch (erro) {
    // Uma leitura abortada (a janela fechou, outra leitura a superou) não é falha de rede.
    if (sinal?.aborted) throw erro;
    return { ok: false, status: null, corpo: null };
  }
}
