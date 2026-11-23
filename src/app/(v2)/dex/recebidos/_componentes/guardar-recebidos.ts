/**
 * O pedido de "Guardei" de Recebidos (`POST /api/dex/registros/guardar`,
 * `{ ids }`), com o `fetch` injetado para o teste seguir a sequência sem rede.
 * Módulo puro, sem React.
 *
 * O servidor só mexe no que está no HOME e ainda a guardar, e **ignora o
 * resto sem erro**: uma lista velha (outra aba já guardou) volta 200 com
 * `guardados` menor que o pedido. Por isso a resposta distingue "guardou" de
 * "nada mudou", e em nenhum dos dois casos a tela confia na lista que tem:
 * ela lê de novo (`router.refresh`).
 */

export type ResultadoGuardar =
  | { tipo: "guardou"; guardados: number }
  /** 200, mas nenhum estava a guardar: a lista estava velha. */
  | { tipo: "nadaMudou" }
  /** A recusa do servidor, com o corpo para `textoDaRecusa`. */
  | { tipo: "recusa"; status: number; corpo: unknown }
  | { tipo: "falhaDeRede" };

export type Requisitar = (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "status" | "json">>;

/** O teto de ids de um pedido (`MAX_IDS` da rota): uma rodada cheia, com folga. */
export const MAX_IDS_GUARDAR = 2000;

/**
 * Uma rodada de primeira carga pode passar do teto (as duas trilhas inteiras
 * são mais de 2.400 vagas), e a rota recusa o pedido todo acima dele. Vai em
 * lotes, um depois do outro: uma recusa no meio interrompe, e o que já foi
 * guardado fica guardado (a tela lê de novo e mostra o que sobrou).
 */
export function emLotes<T>(itens: readonly T[], tamanho = MAX_IDS_GUARDAR): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

export async function guardarRecebidos(ids: readonly string[], requisitar: Requisitar): Promise<ResultadoGuardar> {
  let guardados = 0;
  for (const lote of emLotes(ids)) {
    let resposta;
    try {
      resposta = await requisitar("/api/dex/registros/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: lote }),
      });
    } catch {
      return { tipo: "falhaDeRede" };
    }
    const corpo: unknown = await resposta.json().catch(() => null);
    if (!resposta.ok) return { tipo: "recusa", status: resposta.status, corpo };
    const n = (corpo as { guardados?: unknown } | null)?.guardados;
    if (typeof n === "number") guardados += n;
  }
  return guardados > 0 ? { tipo: "guardou", guardados } : { tipo: "nadaMudou" };
}
