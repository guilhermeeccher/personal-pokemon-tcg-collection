/**
 * Uma chamada às rotas de grupos e de ordem, devolvendo o corpo junto com o
 * status: quem chama traduz a recusa (`textoDaRecusa`) e decide o que
 * recarregar. Falha de rede lança — cada tela a trata com a própria frase.
 */
export interface RespostaApi {
  ok: boolean;
  status: number;
  corpo: unknown;
}

export async function chamarApi(url: string, method: string, corpo?: unknown): Promise<RespostaApi> {
  const resp = await fetch(url, {
    method,
    headers: corpo !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  return { ok: resp.ok, status: resp.status, corpo: await resp.json().catch(() => null) };
}
