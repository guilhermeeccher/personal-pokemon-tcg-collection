/**
 * Coleção temática (decisão de 2026-11-22): uma coleção `customizada` cujo
 * `parametro` guarda um tema — `{ tema: { tipo, valor } }` — e as regras que
 * dizem se uma carta cabe nele. É também o vocabulário das sugestões de
 * coleção (`sugestoes-colecao.ts`): uma sugestão de tema é exatamente o tema
 * que a coleção criada vai guardar.
 *
 * ## Os cinco tipos de tema, e o que cada um lê da linha de catálogo
 *
 *  - `especie`: o número nacional, como texto ("25"). Só carta com
 *    **exatamente um** `dexId` (regra 2: tag team e carta de vários Pokémon
 *    ficam de fora); a forma não separa (regra 3: Raichu de Alola conta para
 *    o 26).
 *  - `tipo`: cada tipo de `carta_catalogo.tipos`, como o upstream escreve, em
 *    inglês ("Psychic", "Darkness"). Carta de dois tipos conta nos dois; lista
 *    vazia (Treinador, Energia, carta que o importador não visitou) não conta
 *    em nenhum. Tipo desconhecido é aceito como está: a tela o mostra como
 *    gravado, nunca adivinha uma tradução.
 *  - `ilustrador`: o texto exato, sem juntar grafias — "5ban Graphics" e
 *    "5ban graphics" são dois temas.
 *  - `raridade`: o valor **canônico** (decisão de 2026-11-22): a raridade da
 *    linha **en** do mesmo `carta_id` quando ela existe e tem raridade, senão
 *    a raridade gravada na linha da cópia (`raridadeCanonica`). As linhas pt e
 *    en da mesma carta escrevem a raridade em línguas diferentes ("Rara
 *    Dupla" e "Double rare"); comparar a string da linha da cópia partiria um
 *    tema em dois e deixaria de casar cartas. Não há outra normalização:
 *    `classificarRaridade` reduz a cinco classes visuais, o que juntaria
 *    raridades diferentes. A carta que só existe em pt fica com a string pt.
 *    A tela traduz pelo valor canônico (`raridadesCarta` em `messages/`),
 *    e o que não tem entrada ela mostra como está.
 *    Ficam de fora as que não fazem tema: comum e incomum
 *    (`ehComumOuIncomum`, as quatro grafias), "Promo", e o texto literal
 *    "None"/"Sem raridade", que não é raridade nenhuma — é o upstream
 *    escrevendo por extenso que a carta não tem raridade (o mesmo par que
 *    `classificarRaridade` trata como ausência).
 *  - `forma`: `carta_catalogo.forma` diferente de `normal` (alola, galar,
 *    hisui, paldea, mega, gigantamax).
 *
 * A carta é lida pela linha de catálogo da cópia (`idioma_catalogo`); só a
 * raridade olha também para a linha en do mesmo `carta_id` (`raridadeEn`).
 * Linha japonesa não entra em tema nenhum neste primeiro corte: quem filtra é
 * quem chama (`ehLinhaOcidental`).
 *
 * Módulo puro, sem I/O — testável sem banco.
 */

import type { Forma } from "./forma";
import { POKEDEX_NACIONAL_FIM, POKEDEX_NACIONAL_INICIO } from "./escopo-pokedex";
import { ehComumOuIncomum } from "./precos-cartas-especiais";

export const TIPOS_TEMA = ["especie", "tipo", "ilustrador", "raridade", "forma"] as const;
export type TipoTema = (typeof TIPOS_TEMA)[number];

export function ehTipoTema(v: unknown): v is TipoTema {
  return typeof v === "string" && (TIPOS_TEMA as readonly string[]).includes(v);
}

export interface TemaColecao {
  tipo: TipoTema;
  valor: string;
}

/** O parâmetro de uma coleção customizada temática. A customizada simples continua com `null`. */
export interface ParametroCustomizadaTema {
  tema: TemaColecao;
}

/** Teto do texto de um tema — folgado para nome de ilustrador, e um freio contra corpo absurdo. */
export const TAMANHO_MAXIMO_VALOR_TEMA = 200;

/** As formas que fazem tema: todas menos `normal`. */
export const FORMAS_TEMATICAS: readonly Exclude<Forma, "normal">[] = [
  "alola",
  "galar",
  "hisui",
  "paldea",
  "mega",
  "gigantamax",
];

/** Raridades escritas por extenso que querem dizer "sem raridade" — não fazem tema. */
const SEM_RARIDADE = new Set(["none", "sem raridade"]);

/**
 * A raridade faz tema? Fora: vazio, comum/incomum, "Promo" e "sem raridade".
 * A comparação de exclusão ignora caixa e espaço nas pontas; o tema em si
 * guarda o texto exato.
 */
export function ehRaridadeTematica(raridade: string | null): raridade is string {
  if (raridade === null || raridade.trim() === "") return false;
  if (ehComumOuIncomum(raridade)) return false;
  const normal = raridade.trim().toLowerCase();
  return normal !== "promo" && !SEM_RARIDADE.has(normal);
}

/** A chave de um tema ou de uma sugestão: `tipo:valor`. O tipo nunca tem `:`; o valor pode ter. */
export function chaveTema(tipo: string, valor: string): string {
  return `${tipo}:${valor}`;
}

// --- Casamento carta × tema --------------------------------------------------

/** O que o casamento lê de uma linha de `carta_catalogo`. */
export interface LinhaTematica {
  dexIds: readonly number[];
  tipos: readonly string[];
  ilustrador: string | null;
  raridade: string | null;
  /**
   * A raridade da linha `en` do mesmo `carta_id` — `null` sem linha en ou sem
   * raridade nela. É a base do valor canônico (`raridadeCanonica`).
   */
  raridadeEn: string | null;
  forma: Forma;
}

/** A raridade canônica: a da linha en do mesmo `carta_id`, quando houver; senão a gravada. */
export function raridadeCanonica(l: Pick<LinhaTematica, "raridade" | "raridadeEn">): string | null {
  return l.raridadeEn !== null && l.raridadeEn.trim() !== "" ? l.raridadeEn : l.raridade;
}

/** Linha pt ou en. A japonesa fica fora de toda contagem e de todo tema neste corte. */
export function ehLinhaOcidental(idioma: string): boolean {
  return idioma === "pt" || idioma === "en";
}

/** Todos os temas em que a linha cabe, sem repetição. */
export function temasDaLinha(l: LinhaTematica): TemaColecao[] {
  const temas: TemaColecao[] = [];
  if (l.dexIds.length === 1) temas.push({ tipo: "especie", valor: String(l.dexIds[0]) });
  for (const tipo of new Set(l.tipos)) {
    if (tipo.trim() !== "") temas.push({ tipo: "tipo", valor: tipo });
  }
  if (l.ilustrador !== null && l.ilustrador.trim() !== "") {
    temas.push({ tipo: "ilustrador", valor: l.ilustrador });
  }
  const raridade = raridadeCanonica(l);
  if (ehRaridadeTematica(raridade)) temas.push({ tipo: "raridade", valor: raridade });
  if (l.forma !== "normal") temas.push({ tipo: "forma", valor: l.forma });
  return temas;
}

/** A linha cabe no tema? Mesma regra de `temasDaLinha`, sem montar a lista. */
export function linhaCasaComTema(l: LinhaTematica, tema: TemaColecao): boolean {
  switch (tema.tipo) {
    case "especie":
      return l.dexIds.length === 1 && String(l.dexIds[0]) === tema.valor;
    case "tipo":
      return tema.valor.trim() !== "" && l.tipos.includes(tema.valor);
    case "ilustrador":
      return l.ilustrador !== null && l.ilustrador.trim() !== "" && l.ilustrador === tema.valor;
    case "raridade": {
      const raridade = raridadeCanonica(l);
      return ehRaridadeTematica(raridade) && raridade === tema.valor;
    }
    case "forma":
      return l.forma !== "normal" && l.forma === tema.valor;
  }
}

// --- Validação do parâmetro -------------------------------------------------

export type ResultadoTema = { ok: true; tema: TemaColecao } | { ok: false; erros: string[] };

/**
 * Valida o valor de um tema contra o tipo. Usada pelo parâmetro da coleção e
 * pelo corpo de "Não tenho interesse" — o que não poderia virar coleção não
 * vira dispensa.
 */
export function validarValorTema(tipo: TipoTema, valor: unknown): ResultadoTema {
  if (typeof valor !== "string" || valor.trim() === "") {
    return { ok: false, erros: [`valor do tema ${tipo} ausente ou vazio`] };
  }
  if (valor.length > TAMANHO_MAXIMO_VALOR_TEMA) {
    return { ok: false, erros: [`valor do tema acima de ${TAMANHO_MAXIMO_VALOR_TEMA} caracteres`] };
  }
  switch (tipo) {
    case "especie": {
      // Forma canônica: "25", nunca "025" nem "25.0" — o valor é comparado
      // como texto com `String(dexIds[0])`.
      const n = Number(valor);
      const canonico =
        /^[1-9]\d*$/.test(valor) && n >= POKEDEX_NACIONAL_INICIO && n <= POKEDEX_NACIONAL_FIM;
      if (!canonico) {
        return {
          ok: false,
          erros: [`espécie inválida: ${valor} (número de ${POKEDEX_NACIONAL_INICIO} a ${POKEDEX_NACIONAL_FIM})`],
        };
      }
      break;
    }
    case "raridade":
      if (!ehRaridadeTematica(valor)) {
        return { ok: false, erros: [`raridade sem tema: ${valor} (comum, incomum, Promo e sem raridade ficam de fora)`] };
      }
      break;
    case "forma":
      if (!(FORMAS_TEMATICAS as readonly string[]).includes(valor)) {
        return { ok: false, erros: [`forma inválida: ${valor} (esperado ${FORMAS_TEMATICAS.join(", ")})`] };
      }
      break;
    case "tipo":
    case "ilustrador":
      // Texto exato, como o catálogo guarda: nada a normalizar.
      break;
  }
  return { ok: true, tema: { tipo, valor } };
}

/**
 * O parâmetro de uma customizada: `null` (ou ausente, ou `{}`) é a customizada
 * simples, como sempre foi; `{ tema: { tipo, valor } }` é a temática. Qualquer
 * outra forma — chave a mais em qualquer dos dois níveis incluída — é recusada,
 * nunca normalizada no silêncio.
 */
export function validarParametroCustomizada(
  bruto: unknown,
): { ok: true; parametro: ParametroCustomizadaTema | null } | { ok: false; erros: string[] } {
  if (bruto === undefined || bruto === null) return { ok: true, parametro: null };
  if (typeof bruto !== "object" || Array.isArray(bruto)) {
    return { ok: false, erros: ["coleção customizada só aceita parâmetro nulo ou { tema }"] };
  }
  const obj = bruto as Record<string, unknown>;
  const chaves = Object.keys(obj);
  if (chaves.length === 0) return { ok: true, parametro: null };
  if (chaves.length !== 1 || chaves[0] !== "tema") {
    return { ok: false, erros: ["coleção customizada só aceita parâmetro nulo ou { tema }"] };
  }
  const tema = obj.tema;
  if (typeof tema !== "object" || tema === null || Array.isArray(tema)) {
    return { ok: false, erros: ["tema precisa ser um objeto { tipo, valor }"] };
  }
  const t = tema as Record<string, unknown>;
  if (Object.keys(t).some((k) => k !== "tipo" && k !== "valor")) {
    return { ok: false, erros: ["tema só aceita { tipo, valor }"] };
  }
  // Mensagem fixa, sem interpolar o valor: `String()` de um objeto vindo do
  // JSON (`{ "toString": 1 }`) lança, e a validação não pode lançar.
  if (!ehTipoTema(t.tipo)) {
    return { ok: false, erros: [`tipo de tema inválido (esperado ${TIPOS_TEMA.join(", ")})`] };
  }
  const r = validarValorTema(t.tipo, t.valor);
  if (!r.ok) return r;
  return { ok: true, parametro: { tema: r.tema } };
}

/**
 * O tema de uma coleção já gravada, ou `null` se ela não é temática. Lê o
 * `jsonb` com a mesma validação da criação: um parâmetro que não passaria
 * nela não é tratado como tema.
 */
export function temaDaColecao(c: { tipo: string; parametro: unknown }): TemaColecao | null {
  if (c.tipo !== "customizada") return null;
  const r = validarParametroCustomizada(c.parametro);
  return r.ok && r.parametro !== null ? r.parametro.tema : null;
}

/**
 * Uma coleção temática por tema (decisão de 2026-11-22): a coleção que já tem
 * o mesmo tema — mesmo tipo e mesmo valor —, ou `null`. A criação recusa a
 * segunda com 409 (`temaJaTemColecao`): uma resposta perdida, com o usuário
 * clicando de novo, ou uma segunda aba nunca podem deixar duas coleções do
 * mesmo tema. O valor é comparado como gravado; a raridade já chega canônica
 * (a da linha en), porque é a sugestão que a fornece. A customizada simples
 * (sem tema) não tem tema e não entra na comparação.
 */
export function colecaoDoMesmoTema<T extends { id: string; nome: string; tipo: string; parametro: unknown }>(
  colecoes: readonly T[],
  tema: TemaColecao,
): { id: string; nome: string } | null {
  const achada = colecoes.find((c) => {
    const outro = temaDaColecao(c);
    return outro !== null && outro.tipo === tema.tipo && outro.valor === tema.valor;
  });
  return achada ? { id: achada.id, nome: achada.nome } : null;
}
