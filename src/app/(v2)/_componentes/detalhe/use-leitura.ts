"use client";

import { useCallback, useEffect, useState } from "react";

/** Uma resposta que não foi `ok`: o status (0 = rede) e o corpo, para a recusa virar frase. */
export interface FalhaLeitura {
  status: number;
  corpo: unknown;
}

interface Resultado<T> {
  url: string;
  versao: number;
  dados: T | null;
  falha: FalhaLeitura | null;
}

/**
 * `useLeitura(url, versao)` — um `GET` do detalhe, relido quando `versao`
 * muda (depois de uma escrita) ou a URL muda (outra cópia em foco).
 *
 * - **Enquanto relê, mostra o que já tinha da mesma URL**: depois de salvar,
 *   o detalhe não pisca vazio; `relendo` diz que há leitura em curso.
 * - **A resposta velha nunca vence a nova**: a leitura anterior é abortada, e
 *   o resultado só é aceito se ainda é o da URL e da versão pedidas.
 * - **`url` nula** não lê nada (a vaga vazia de Pokédex não tem carta).
 * - Sem cache do navegador: o detalhe mostra o que está no banco agora.
 */
export function useLeitura<T>(url: string | null, versao: number) {
  const [resultado, setResultado] = useState<Resultado<T> | null>(null);

  useEffect(() => {
    if (url === null) return;
    const controle = new AbortController();
    fetch(url, { signal: controle.signal, cache: "no-store" })
      .then(async (r) => {
        const corpo: unknown = await r.json().catch(() => null);
        if (controle.signal.aborted) return;
        setResultado(
          r.ok
            ? { url, versao, dados: corpo as T, falha: null }
            : { url, versao, dados: null, falha: { status: r.status, corpo } },
        );
      })
      .catch(() => {
        if (!controle.signal.aborted) setResultado({ url, versao, dados: null, falha: { status: 0, corpo: null } });
      });
    return () => controle.abort();
  }, [url, versao]);

  const daMesmaUrl = url !== null && resultado?.url === url ? resultado : null;
  return {
    dados: daMesmaUrl?.dados ?? null,
    falha: daMesmaUrl?.falha ?? null,
    carregando: url !== null && daMesmaUrl === null,
    relendo: url !== null && daMesmaUrl !== null && daMesmaUrl.versao !== versao,
  };
}

/** O contador que relê todas as leituras do detalhe de uma vez. */
export function useVersao(): [number, () => void] {
  const [versao, setVersao] = useState(0);
  const reler = useCallback(() => setVersao((v) => v + 1), []);
  return [versao, reler];
}
