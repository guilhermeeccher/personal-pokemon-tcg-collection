/**
 * Parsing e validação dos filtros da tela de repetidas (item 2 da tarefa
 * "visão geral + repetidas"): "o que sobra para troca". Mesmo padrão de
 * `filtros-inventario.ts` — entra como querystring (tudo string ou
 * ausente), sai tipado. A consulta em si fica em `lib/db/consultas.ts`.
 */

export interface FiltrosRepetidasBrutos {
  /** "true" = só cartas com ao menos 1 unidade livre; ausente = todas as repetidas. */
  soLivres?: string | null;
  pagina?: string | null;
  tamanhoPagina?: string | null;
}

export interface FiltrosRepetidas {
  soLivres: boolean;
  pagina: number;
  tamanhoPagina: number;
}

export type ResultadoFiltrosRepetidas =
  | { ok: true; filtros: FiltrosRepetidas }
  | { ok: false; erros: string[] };

const TAMANHO_PAGINA_DEFAULT = 50;
const TAMANHO_PAGINA_MAXIMO = 200;

function naoVazio(v: string | null | undefined): string | undefined {
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export function validarFiltrosRepetidas(
  bruto: FiltrosRepetidasBrutos,
): ResultadoFiltrosRepetidas {
  const erros: string[] = [];
  const filtros: FiltrosRepetidas = {
    soLivres: false,
    pagina: 1,
    tamanhoPagina: TAMANHO_PAGINA_DEFAULT,
  };

  const soLivres = naoVazio(bruto.soLivres);
  if (soLivres !== undefined) {
    if (soLivres !== "true" && soLivres !== "false") {
      erros.push(`soLivres inválido (esperado true/false): ${soLivres}`);
    } else {
      filtros.soLivres = soLivres === "true";
    }
  }

  const pagina = naoVazio(bruto.pagina);
  if (pagina !== undefined) {
    const n = Number(pagina);
    if (!Number.isInteger(n) || n < 1) {
      erros.push(`pagina inválida: ${pagina}`);
    } else {
      filtros.pagina = n;
    }
  }

  const tamanhoPagina = naoVazio(bruto.tamanhoPagina);
  if (tamanhoPagina !== undefined) {
    const n = Number(tamanhoPagina);
    if (!Number.isInteger(n) || n < 1 || n > TAMANHO_PAGINA_MAXIMO) {
      erros.push(
        `tamanhoPagina inválido (1-${TAMANHO_PAGINA_MAXIMO}): ${tamanhoPagina}`,
      );
    } else {
      filtros.tamanhoPagina = n;
    }
  }

  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, filtros };
}
