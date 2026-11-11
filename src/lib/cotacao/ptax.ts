/**
 * Busca a PTAX do euro no Banco Central (API Olinda). Server-only. A URL e a
 * escolha do boletim são puras e testadas em `lib/dominio/cotacao-ptax.ts`;
 * aqui fica só a requisição.
 *
 * Uma consulta por rodada de preços do Cardmarket, **antes** de criar a
 * rodada: sem cotação a rodada não começa (a rota responde 503
 * `cotacaoIndisponivel`), em vez de gravar preço em euro sem conversão ou
 * convertido por uma taxa inventada.
 */

import { escolherPtaxDeFechamento, urlPtaxPeriodo, type CotacaoPtax } from "@/lib/dominio/cotacao-ptax";

/**
 * Dias para trás na consulta. O fechamento sai uma vez por dia útil (por
 * volta das 13h de Brasília); antes disso, num fim de semana ou num feriado,
 * o boletim mais recente é de um dia anterior. Dez dias cobrem o Carnaval
 * emendado num fim de semana com folga, e a resposta continua pequena.
 */
export const DIAS_DE_CONSULTA_PTAX = 10;

/** Teto de cada tentativa: a Olinda costuma responder em menos de 1 s. */
export const TIMEOUT_PTAX_MS = 20_000;

/** Tentativas no total: uma repetição só, em erro transitório (rede, 5xx, timeout). */
const TENTATIVAS_PTAX = 2;
const ESPERA_ANTES_DE_REPETIR_MS = 1_000;

const USER_AGENT_PTAX = "colecao-pokemon/1.0 (uso pessoal; cotacao PTAX)";

export class ErroCotacaoIndisponivel extends Error {
  constructor(motivo: string) {
    super(`Cotação PTAX do euro indisponível: ${motivo}`);
    this.name = "ErroCotacaoIndisponivel";
  }
}

export interface DependenciasPtax {
  fetchImpl?: typeof fetch;
  dormir?: (ms: number) => Promise<void>;
}

/**
 * A PTAX de fechamento (venda) do euro mais recente. Lança
 * `ErroCotacaoIndisponivel` quando não consegue: falha de rede depois da
 * repetição, resposta HTTP de erro, ou nenhum boletim de fechamento válido
 * no período.
 */
export async function obterPtaxEuro(
  agora: Date = new Date(),
  { fetchImpl = fetch, dormir = (ms) => new Promise((r) => setTimeout(r, ms)) }: DependenciasPtax = {},
): Promise<CotacaoPtax> {
  const inicio = new Date(agora.getTime() - DIAS_DE_CONSULTA_PTAX * 86_400_000);
  const url = urlPtaxPeriodo("EUR", inicio, agora);

  let ultimoErro = "falha desconhecida";
  for (let tentativa = 1; tentativa <= TENTATIVAS_PTAX; tentativa++) {
    try {
      const resposta = await fetchImpl(url, {
        headers: { "User-Agent": USER_AGENT_PTAX, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_PTAX_MS),
      });
      if (resposta.ok) {
        const cotacao = escolherPtaxDeFechamento(await resposta.json());
        if (cotacao === null) {
          // Resposta que chegou inteira e não tem fechamento: repetir não muda.
          throw new ErroCotacaoIndisponivel("nenhum boletim de fechamento no período");
        }
        return cotacao;
      }
      if (resposta.status < 500) {
        // 4xx é resposta definitiva (URL recusada, limite deles): repetir não ajuda.
        throw new ErroCotacaoIndisponivel(`HTTP ${resposta.status}`);
      }
      ultimoErro = `HTTP ${resposta.status}`;
    } catch (err) {
      if (err instanceof ErroCotacaoIndisponivel) throw err;
      // Rede, timeout ou corpo que não é JSON: transitório, vale uma repetição.
      ultimoErro = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }
    if (tentativa < TENTATIVAS_PTAX) await dormir(ESPERA_ANTES_DE_REPETIR_MS);
  }
  throw new ErroCotacaoIndisponivel(ultimoErro);
}
