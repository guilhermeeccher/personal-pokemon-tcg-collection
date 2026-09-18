/**
 * Parsing e validação dos filtros do inventário (spec §5 Fase 1: "lista
 * com busca e filtros — set, idioma, raridade, variante, condição,
 * graded, localização, alocada ou livre. Precisa combinar filtros.").
 *
 * Entra como querystring (tudo string ou ausente); sai como um objeto
 * tipado que o route handler usa para montar as condições Drizzle. A
 * montagem da query em si (que depende do schema/DB) fica no route
 * handler — este módulo só normaliza e valida a entrada, que é a parte
 * testável sem banco.
 */

import {
  type Condicao,
  type Idioma,
  type VarianteCopia,
  ehCondicao,
  ehIdioma,
  ehVarianteCopia,
} from "./enums";

export interface FiltrosInventarioBrutos {
  set?: string | null;
  idioma?: string | null;
  raridade?: string | null;
  variante?: string | null;
  condicao?: string | null;
  graded?: string | null;
  localizacao?: string | null;
  /** "alocada" | "livre" — ausente = sem filtro (mostra as duas). */
  alocacao?: string | null;
  /** "true" = só cartas sem imagem própria nem imagem de catálogo. */
  semImagem?: string | null;
  q?: string | null;
  pagina?: string | null;
  tamanhoPagina?: string | null;
}

export interface FiltrosInventario {
  setId?: string;
  idioma?: Idioma;
  raridade?: string;
  variante?: VarianteCopia;
  condicao?: Condicao;
  /** true = só graded; false = só não-graded; ausente = sem filtro. */
  graded?: boolean;
  localizacao?: string;
  /** true = só alocadas (tem vaga); false = só livres; ausente = ambas. */
  alocada?: boolean;
  /**
   * true = só as cartas cuja imagem está faltando. Ausente = sem filtro.
   *
   * "Faltando" aqui significa **sem imagem local e sem `imagem_url` no
   * catálogo** — não dá para significar outra coisa: quando as duas
   * faltam, o sistema monta uma URL de CDN determinística e só o
   * navegador descobre, no 404, se o arquivo existe. O servidor não tem
   * como saber sem sair batendo no CDN carta a carta.
   *
   * Consequência prática, e o filtro precisa ser honesto sobre ela: uma
   * carta japonesa cuja imagem existe no CDN aparece nesta lista mesmo
   * mostrando foto na tela. É o preço de não varrer o CDN — e a lista
   * ainda é útil, porque é sobre a coleção do usuário, não sobre as
   * 47 mil linhas do catálogo.
   */
  semImagem?: boolean;
  q?: string;
  pagina: number;
  tamanhoPagina: number;
}

export type ResultadoFiltrosInventario =
  | { ok: true; filtros: FiltrosInventario }
  | { ok: false; erros: string[] };

const TAMANHO_PAGINA_DEFAULT = 50;
const TAMANHO_PAGINA_MAXIMO = 200;

function naoVazio(v: string | null | undefined): string | undefined {
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export function validarFiltrosInventario(
  bruto: FiltrosInventarioBrutos,
): ResultadoFiltrosInventario {
  const erros: string[] = [];
  const filtros: FiltrosInventario = {
    pagina: 1,
    tamanhoPagina: TAMANHO_PAGINA_DEFAULT,
  };

  filtros.setId = naoVazio(bruto.set);
  filtros.raridade = naoVazio(bruto.raridade);
  filtros.localizacao = naoVazio(bruto.localizacao);
  filtros.q = naoVazio(bruto.q);

  const idioma = naoVazio(bruto.idioma);
  if (idioma !== undefined) {
    if (!ehIdioma(idioma)) erros.push(`idioma inválido: ${idioma}`);
    else filtros.idioma = idioma;
  }

  const variante = naoVazio(bruto.variante);
  if (variante !== undefined) {
    if (!ehVarianteCopia(variante)) erros.push(`variante inválida: ${variante}`);
    else filtros.variante = variante;
  }

  const condicao = naoVazio(bruto.condicao);
  if (condicao !== undefined) {
    if (!ehCondicao(condicao)) erros.push(`condicao inválida: ${condicao}`);
    else filtros.condicao = condicao;
  }

  const graded = naoVazio(bruto.graded);
  if (graded !== undefined) {
    if (graded !== "true" && graded !== "false") {
      erros.push(`graded inválido (esperado true/false): ${graded}`);
    } else {
      filtros.graded = graded === "true";
    }
  }

  const alocacao = naoVazio(bruto.alocacao);
  if (alocacao !== undefined) {
    if (alocacao !== "alocada" && alocacao !== "livre") {
      erros.push(`alocacao inválida (esperado alocada/livre): ${alocacao}`);
    } else {
      filtros.alocada = alocacao === "alocada";
    }
  }

  const semImagem = naoVazio(bruto.semImagem);
  if (semImagem !== undefined) {
    if (semImagem !== "true" && semImagem !== "false") {
      erros.push(`semImagem inválido (esperado true/false): ${semImagem}`);
    } else if (semImagem === "true") {
      // Só `true` vira filtro: "false" é o mesmo que não filtrar, e criar
      // um "só as que TÊM imagem" seria inventar um caso que ninguém pediu.
      filtros.semImagem = true;
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
