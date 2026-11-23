import { describe, expect, it } from "vitest";

import { validarFiltrosInventario } from "@/lib/dominio/filtros-inventario";
import type { FlagsVariantesCatalogo } from "@/lib/dominio/variantes-catalogo";

import {
  CHAVES_FILTRO,
  FILTROS_VAZIOS,
  alternarTodos,
  consultaDaLista,
  corpoEdicaoMassa,
  enderecoDaTela,
  filtrosDaUrl,
  filtrosNoPainel,
  paginaAlemDoFim,
  paginaDaUrl,
  podarSelecao,
  totalDePaginas,
  variantesEmComum,
} from "./estado-inventario";

/** A `paraQueryString` da v1 (`(v1)/v1/inventario/pagina-cliente.tsx`), copiada para comparar. */
function consultaDaV1(filtros: Record<string, string>, pagina: number): string {
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor) params.set(chave, valor);
  }
  params.set("pagina", String(pagina));
  params.set("tamanhoPagina", "50");
  return params.toString();
}

/** O que a v1 lê da URL ao montar: `params.get(chave)` de cada chave de `FILTROS_VAZIOS`. */
function filtrosLidosPelaV1(query: string): Record<string, string> {
  const params = new URLSearchParams(query);
  const v1 = { set: "", idioma: "", raridade: "", variante: "", condicao: "", graded: "", localizacao: "", alocacao: "", semImagem: "", q: "" };
  for (const chave of Object.keys(v1) as (keyof typeof v1)[]) v1[chave] = params.get(chave) ?? "";
  return v1;
}

/** `searchParams` do Next a partir de uma query: decodificado, repetida vira lista. */
function buscaDoNext(query: string): Record<string, string | string[]> {
  const busca: Record<string, string | string[]> = {};
  for (const [k, v] of new URLSearchParams(query)) {
    const atual = busca[k];
    busca[k] = atual === undefined ? v : Array.isArray(atual) ? [...atual, v] : [atual, v];
  }
  return busca;
}

const SEM_FLAGS: FlagsVariantesCatalogo = {
  varianteNormalDisponivel: false,
  varianteReverseDisponivel: false,
  varianteHoloDisponivel: false,
  variantePrimeiraEdicaoDisponivel: false,
  variantePromoDisponivel: false,
};

describe("chaves de filtro da URL", () => {
  it("são as dez da v1, na ordem dela", () => {
    expect(CHAVES_FILTRO).toEqual(Object.keys(filtrosLidosPelaV1("")));
  });

  it.each([
    "set=sv3pt5&alocacao=livre",
    "idioma=jp&raridade=Rara%20Dupla",
    "variante=reverse&condicao=LP&graded=true",
    "localizacao=Fich%C3%A1rio%201&semImagem=true&q=pikachu",
    "q=a%2Bb%25c&set=mep&set=sv1",
    "alocacao=alocada&desconhecida=1&pagina=3",
  ])("a mesma URL abre o mesmo recorte e pede a mesma consulta que a v1: %s", (query) => {
    const daV1 = filtrosLidosPelaV1(query);
    const daV2 = filtrosDaUrl(buscaDoNext(query));
    expect(daV2).toEqual(daV1);
    expect(consultaDaLista(daV2, 1)).toBe(consultaDaV1(daV1, 1));
  });

  it("valor que a API recusa vai cru, como na v1 (a recusa aparece como erro na tela)", () => {
    const f = filtrosDaUrl({ idioma: "xx" });
    expect(f.idioma).toBe("xx");
    const params = new URLSearchParams(consultaDaLista(f, 1));
    const r = validarFiltrosInventario(Object.fromEntries(params));
    expect(r.ok).toBe(false);
  });

  it("a consulta é a que a rota aceita, com 50 por página", () => {
    const f = { ...FILTROS_VAZIOS, set: "sv1", alocacao: "livre", graded: "false" };
    const params = new URLSearchParams(consultaDaLista(f, 4));
    const r = validarFiltrosInventario(Object.fromEntries(params));
    expect(r).toEqual({
      ok: true,
      filtros: { setId: "sv1", alocada: false, graded: false, pagina: 4, tamanhoPagina: 50 },
    });
  });
});

describe("página da URL", () => {
  it("lê inteiro de 1 para cima; o resto é a primeira", () => {
    expect(paginaDaUrl({ pagina: "3" })).toBe(3);
    expect(paginaDaUrl({ pagina: ["2", "9"] })).toBe(2);
    for (const ruim of ["0", "-1", "1.5", "abc", "", "01", "9999999"]) expect(paginaDaUrl({ pagina: ruim })).toBe(1);
    expect(paginaDaUrl({})).toBe(1);
  });
});

describe("endereço na barra", () => {
  it("só os filtros preenchidos, com as chaves da v1, e a página a partir da segunda", () => {
    expect(enderecoDaTela(FILTROS_VAZIOS, 1)).toBe("/inventario");
    expect(enderecoDaTela({ ...FILTROS_VAZIOS, alocacao: "livre", set: "sv1" }, 1)).toBe("/inventario?set=sv1&alocacao=livre");
    expect(enderecoDaTela({ ...FILTROS_VAZIOS, q: "mr. mime" }, 2)).toBe("/inventario?q=mr.+mime&pagina=2");
  });

  it("o endereço escrito volta ao mesmo estado quando lido", () => {
    const f = { ...FILTROS_VAZIOS, q: "a+b%c é", localizacao: "Caixa 2", idioma: "pt" };
    const url = enderecoDaTela(f, 5);
    const busca = buscaDoNext(url.split("?")[1]);
    expect(filtrosDaUrl(busca)).toEqual(f);
    expect(paginaDaUrl(busca)).toBe(5);
  });
});

describe("contagens", () => {
  it("filtros do painel não contam a busca por nome", () => {
    expect(filtrosNoPainel({ ...FILTROS_VAZIOS, q: "x" })).toBe(0);
    expect(filtrosNoPainel({ ...FILTROS_VAZIOS, q: "x", set: "a", semImagem: "true" })).toBe(2);
  });

  it("páginas", () => {
    expect(totalDePaginas(0)).toBe(1);
    expect(totalDePaginas(50)).toBe(1);
    expect(totalDePaginas(51)).toBe(2);
  });

  it("página que ficou além do fim volta para a última que existe", () => {
    expect(paginaAlemDoFim(3, 100, 0)).toBe(2);
    expect(paginaAlemDoFim(3, 0, 0)).toBe(1);
    expect(paginaAlemDoFim(2, 100, 0)).toBeNull(); // vazia por outro motivo: fica
    expect(paginaAlemDoFim(3, 120, 20)).toBeNull();
    expect(paginaAlemDoFim(1, 0, 0)).toBeNull();
  });
});

describe("seleção", () => {
  const itens = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("depois de reler, só fica o que ainda está na página", () => {
    expect([...podarSelecao(new Set(["a", "x", "c"]), itens)]).toEqual(["a", "c"]);
    expect(podarSelecao(new Set(["x"]), [])).toEqual(new Set());
  });

  it("todos da página, ou nenhum quando todos já estão", () => {
    expect(alternarTodos(new Set(["a"]), itens)).toEqual(new Set(["a", "b", "c"]));
    expect(alternarTodos(new Set(["a", "b", "c"]), itens)).toEqual(new Set());
    expect(alternarTodos(new Set(), [])).toEqual(new Set());
  });
});

describe("edição em massa", () => {
  it("variantes em comum: só as que todas as cartas têm no catálogo", () => {
    const holoReverse = { ...SEM_FLAGS, varianteHoloDisponivel: true, varianteReverseDisponivel: true };
    const normalReverse = { ...SEM_FLAGS, varianteNormalDisponivel: true, varianteReverseDisponivel: true };
    const soPromo = { ...SEM_FLAGS, variantePromoDisponivel: true };
    expect(variantesEmComum([holoReverse, normalReverse])).toEqual(["reverse"]);
    expect(variantesEmComum([holoReverse, soPromo])).toEqual([]);
    expect(variantesEmComum([])).toEqual([]);
    // Carta sem nenhuma marcada no upstream libera as cinco (variantesDisponiveis).
    expect(variantesEmComum([SEM_FLAGS, soPromo])).toEqual(["promo"]);
  });

  const nada = { condicao: null, localizacao: null, idioma: null, variante: null };

  it("só os campos marcados vão no patch, com o corpo da v1", () => {
    expect(corpoEdicaoMassa(["a", "b"], { ...nada, condicao: "LP", idioma: "jp" })).toEqual({
      copiaIds: ["a", "b"],
      patch: { condicao: "LP", idioma: "jp" },
    });
    expect(corpoEdicaoMassa(["a"], { ...nada, variante: "holo", localizacao: "  Caixa 1 " })).toEqual({
      copiaIds: ["a"],
      patch: { localizacao: "Caixa 1", variante: "holo" },
    });
  });

  it("localização em branco apaga (null), como a v1 manda", () => {
    expect(corpoEdicaoMassa(["a"], { ...nada, localizacao: "  " })?.patch).toEqual({ localizacao: null });
  });

  it("nada marcado, ou nenhuma cópia: não há o que enviar", () => {
    expect(corpoEdicaoMassa(["a"], nada)).toBeNull();
    expect(corpoEdicaoMassa([], { ...nada, condicao: "NM" })).toBeNull();
  });
});
