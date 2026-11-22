/**
 * O mapa de navegação da v2: o trilho (768 px e acima), a barra de abas e a
 * folha "Mais" (abaixo) leem daqui, para os três nunca divergirem sobre o que
 * existe e onde se está.
 *
 * É um mapa próprio, e não o `nav-estrutura.ts` da v1, por dois motivos: a
 * v1 aponta para `/v1/...` (ela nunca linka para a raiz) e a v2 aponta para a
 * raiz; e a v2 não importa nada de `src/app/_componentes/`
 * (`telas-v1.test.ts`). Um item cuja tela ainda não existe na v2 aponta assim
 * mesmo para a raiz: lá mora a ponte, que manda para a mesma tela em `/v1`, e
 * o link já está certo quando a tela chegar.
 *
 * Os rótulos são chaves do namespace `nav` (os mesmos textos da v1, que o
 * usuário já conhece); os ícones são nomes, resolvidos em `icones.tsx`.
 */

export type NomeIconeNav =
  | "inicio"
  | "busca"
  | "colecoes"
  | "inventario"
  | "visao-geral"
  | "repetidas"
  | "precos"
  | "por-set"
  | "dex"
  | "pokedex"
  | "caixas"
  | "recebidos"
  | "cadastrar"
  | "novo-cadastro"
  | "inventario-dex"
  | "jogos"
  | "trofeus"
  | "planos"
  | "mais";

export interface ItemNavV2 {
  href: string;
  /** Chave no namespace `nav` dos catálogos. */
  chave: string;
  icone: NomeIconeNav;
}

export interface GrupoNavV2 {
  /** Chave do título no namespace `nav`; nulo para o grupo de topo. */
  chaveTitulo: string | null;
  itens: readonly ItemNavV2[];
}

export const ITEM_INICIO: ItemNavV2 = { href: "/", chave: "inicio", icone: "inicio" };
export const ITEM_BUSCA: ItemNavV2 = { href: "/cadastro/busca", chave: "itens.porBusca", icone: "busca" };

const GRUPO_TOPO: GrupoNavV2 = { chaveTitulo: null, itens: [ITEM_INICIO, ITEM_BUSCA] };

const GRUPO_TCG: GrupoNavV2 = {
  chaveTitulo: "modulos.tcg",
  itens: [
    { href: "/colecoes", chave: "itens.colecoes", icone: "colecoes" },
    { href: "/inventario", chave: "itens.inventario", icone: "inventario" },
    { href: "/inventario/visao-geral", chave: "itens.visaoGeral", icone: "visao-geral" },
    { href: "/inventario/repetidas", chave: "itens.repetidas", icone: "repetidas" },
    { href: "/inventario/precos", chave: "itens.precos", icone: "precos" },
    { href: "/cadastro/set", chave: "itens.porSet", icone: "por-set" },
  ],
};

/** Só com `MODULO_LIVING_DEX=1`; quem decide é o layout, no servidor. */
const GRUPO_DEX: GrupoNavV2 = {
  chaveTitulo: "modulos.virtualGame",
  itens: [
    { href: "/dex", chave: "itens.visaoGeralDex", icone: "dex" },
    { href: "/dex/pokedex", chave: "itens.pokedex", icone: "pokedex" },
    { href: "/dex/caixas", chave: "itens.caixas", icone: "caixas" },
    { href: "/dex/recebidos", chave: "itens.recebidos", icone: "recebidos" },
    { href: "/dex/cadastrar", chave: "itens.cadastrarDex", icone: "cadastrar" },
    { href: "/dex/novo-cadastro", chave: "itens.novoCadastroDex", icone: "novo-cadastro" },
    { href: "/dex/inventario", chave: "itens.inventarioDex", icone: "inventario-dex" },
    { href: "/dex/jogos", chave: "itens.meusJogos", icone: "jogos" },
    { href: "/dex/trofeus", chave: "itens.trofeus", icone: "trofeus" },
    { href: "/dex/planos", chave: "itens.planos", icone: "planos" },
  ],
};

/** Os grupos do trilho e da folha "Mais", conforme os módulos ligados. */
export function gruposDaNav(livingDex: boolean): readonly GrupoNavV2[] {
  return livingDex ? [GRUPO_TOPO, GRUPO_TCG, GRUPO_DEX] : [GRUPO_TOPO, GRUPO_TCG];
}

/*
 * A barra de abas tem quatro posições, decisão de 2026-11-22: Início,
 * Coleções, Inventário e "Mais" (a folha com o mapa inteiro, o idioma e o
 * "Sair"), mais o botão redondo de busca ao lado. Cinco abas — a Dex como
 * quinta, como no protótipo — não cabem a 320 px com 44 px por alvo: sobram
 * ~42 px por aba depois do respiro e do botão de busca. Com a Dex ligada ela
 * fica na folha "Mais", a um toque a mais.
 */
export type AbaV2 = "inicio" | "colecoes" | "inventario" | "mais";

export const ABAS: readonly { aba: Exclude<AbaV2, "mais">; item: ItemNavV2 }[] = [
  { aba: "inicio", item: ITEM_INICIO },
  { aba: "colecoes", item: GRUPO_TCG.itens[0] },
  { aba: "inventario", item: GRUPO_TCG.itens[1] },
];

function casa(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Item ativo = o `href` mais longo que é o caminho ou um prefixo dele por
 * segmento. `/colecoes/<id>` acende "Coleções"; `/inventario/precos` acende
 * "Preços", nunca "Inventário" junto. A raiz só casa com ela mesma — senão
 * acenderia em toda tela. Procura em todos os grupos, a Dex inclusive: com o
 * módulo desligado as rotas dela dão 404 e nunca chegam a acender nada.
 */
export function itemAtivo(pathname: string): ItemNavV2 | null {
  let melhor: ItemNavV2 | null = null;
  for (const grupo of gruposDaNav(true)) {
    for (const item of grupo.itens) {
      if (casa(pathname, item.href) && (melhor === null || item.href.length > melhor.href.length)) {
        melhor = item;
      }
    }
  }
  return melhor;
}

/**
 * A aba acesa na barra de abas. Diferente do item ativo: uma aba representa
 * uma área inteira — "Inventário" acende em `/inventario/precos` também, e
 * tudo o que não tem aba própria (cadastro, Dex) acende "Mais". Um caminho
 * fora do mapa (o laboratório, um 404) não acende nenhuma, e a busca também
 * não: quem acende nela é o próprio botão redondo.
 */
export function abaAtiva(pathname: string): AbaV2 | null {
  for (const { aba, item } of ABAS) {
    if (casa(pathname, item.href)) return aba;
  }
  const ativo = itemAtivo(pathname);
  return ativo === null || ativo === ITEM_BUSCA ? null : "mais";
}
