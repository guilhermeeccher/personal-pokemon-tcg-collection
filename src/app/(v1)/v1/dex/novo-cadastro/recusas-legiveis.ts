/**
 * As recusas do envio que citam uma vaga trazem o que o servidor sabe sem
 * saber o idioma: o id da forma ("raichu-alola") e a trilha em código
 * ("shiny"). A tela troca esses dois pelos nomes que ela mesma mostra antes
 * de montar a frase (`textosDasRecusas`), para a recusa falar da vaga com o
 * nome que o usuário vê na grade e no lote.
 *
 * Só as chaves que levam a forma no `valores.forma`; as outras passam como
 * vieram (`dexNaoTransferivel` e companhia já trazem o nome do jogo pronto).
 * Corpo que não tem a forma de uma recusa também passa intacto: quem decide
 * a mensagem genérica é `textosDasRecusas`, não este ajuste.
 */
import type { TrilhaDex } from "@/lib/dominio/dex-grade";

const CHAVES_COM_FORMA: ReadonlySet<string> = new Set(["dexFormaDesconhecida", "dexSemShiny", "dexVagaJaNoHome"]);

export interface NomesDaTela {
  /** Nome com a forma; o id de volta quando a forma não está na lista (é o caso de `dexFormaDesconhecida`). */
  forma: (id: string) => string;
  trilha: (trilha: TrilhaDex) => string;
}

function recusaLegivel(bruta: unknown, nomes: NomesDaTela): unknown {
  if (typeof bruta !== "object" || bruta === null) return bruta;
  const { chave, valores } = bruta as { chave?: unknown; valores?: unknown };
  if (typeof chave !== "string" || !CHAVES_COM_FORMA.has(chave)) return bruta;
  if (typeof valores !== "object" || valores === null || Array.isArray(valores)) return bruta;
  const legiveis: Record<string, unknown> = { ...valores };
  if (typeof legiveis.forma === "string") legiveis.forma = nomes.forma(legiveis.forma);
  if (legiveis.trilha === "normal" || legiveis.trilha === "shiny") legiveis.trilha = nomes.trilha(legiveis.trilha);
  return { ...bruta, valores: legiveis };
}

/** O mesmo corpo, com `forma` e `trilha` trocados pelos nomes da tela em `recusa` e em `recusas`. */
export function recusasLegiveis(corpo: unknown, nomes: NomesDaTela): unknown {
  if (typeof corpo !== "object" || corpo === null) return corpo;
  const c = corpo as { recusa?: unknown; recusas?: unknown };
  return {
    ...corpo,
    ...(c.recusa !== undefined ? { recusa: recusaLegivel(c.recusa, nomes) } : {}),
    ...(Array.isArray(c.recusas) ? { recusas: c.recusas.map((r) => recusaLegivel(r, nomes)) } : {}),
  };
}
