/**
 * A tela de repetidas da v2 (`/inventario/repetidas`): o que a URL diz, o link
 * de cada página e quantas há. Módulo puro. A consulta é a da v1
 * (`listarCartasRepetidas`, a mesma de `GET /api/inventario/repetidas`); aqui
 * só o que a v1 guardava em `useState` e a v2 põe na URL, para o filtro e a
 * página sobreviverem a recarregar e a voltar.
 *
 * Os valores seguem os da API: `soLivres=true` e `pagina=N`. Um valor que não
 * se entende vira o padrão em vez de erro — uma tela não devolve 400 a quem
 * colou um link velho.
 */

import { type FiltrosRepetidas, validarFiltrosRepetidas } from "./filtros-repetidas";

/** Cartas por página: múltiplo de 2, 3 e 4, as colunas que a grade tem. */
export const TAMANHO_PAGINA_REPETIDAS = 48;

type ValorDaUrl = string | string[] | undefined;

function primeiro(v: ValorDaUrl): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function filtrosDaUrl(busca: Record<string, ValorDaUrl>): FiltrosRepetidas {
  const bruto = { soLivres: primeiro(busca.soLivres), pagina: primeiro(busca.pagina) };
  const tentativa = validarFiltrosRepetidas({ ...bruto, tamanhoPagina: String(TAMANHO_PAGINA_REPETIDAS) });
  if (tentativa.ok) return tentativa.filtros;
  // Cada campo que não se entende cai no padrão, sem arrastar o outro junto.
  const soLivres = validarFiltrosRepetidas({ soLivres: bruto.soLivres });
  const pagina = validarFiltrosRepetidas({ pagina: bruto.pagina });
  return {
    soLivres: soLivres.ok ? soLivres.filtros.soLivres : false,
    pagina: pagina.ok ? pagina.filtros.pagina : 1,
    tamanhoPagina: TAMANHO_PAGINA_REPETIDAS,
  };
}

export function totalDePaginas(total: number, tamanhoPagina: number): number {
  return Math.max(1, Math.ceil(total / tamanhoPagina));
}

/** O link de uma página do filtro; os padrões (todas, página 1) não aparecem na URL. */
export function hrefRepetidas(estado: { soLivres: boolean; pagina: number }): string {
  const partes: string[] = [];
  if (estado.soLivres) partes.push("soLivres=true");
  if (estado.pagina > 1) partes.push(`pagina=${estado.pagina}`);
  return partes.length > 0 ? `/inventario/repetidas?${partes.join("&")}` : "/inventario/repetidas";
}
