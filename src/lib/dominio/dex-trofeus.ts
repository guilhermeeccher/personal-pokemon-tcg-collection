/**
 * Living Dex — troféus de cada jogo, à maneira do PlayStation: uma lista
 * fixa por jogo, bronze, prata e ouro, e a platina quando se conquista o
 * resto. Módulo puro.
 *
 * ## Dois tipos
 *
 *  - **checkpoint**: um ponto do jogo que destrava acesso a Pokémon (Ilhas
 *    Sevii, Pokédex Nacional, Ramanas Park…). Carrega a lista de espécies
 *    que libera. Enquanto não é conquistado, essas espécies estão
 *    **trancadas** naquele jogo: existem no catálogo do jogo
 *    (`dex-disponibilidade.ts`), mas o save ainda não chega nelas.
 *  - **marco**: um avanço ou algo que vale fazer (um líder de ginásio, um
 *    lendário, a Trainer Tower). Não mexe na dex.
 *
 *  - **calculado**: só nos troféus do HOME (`jogo: "home"`), que ninguém
 *    marca: valem quando os registros cumprem a regra declarada no arquivo
 *    (`regra`: uma quantidade de vagas no HOME, uma região completa, uma
 *    vista completa). Ver `dex-trofeus-home.ts`.
 *
 * Uma espécie listada por mais de um checkpoint só destrava quando **todos**
 * estão conquistados: o Lugia do FireRed pede o ticket (Hall da Fama) e o
 * barco até a Navel Rock (Rainbow Pass).
 *
 * ## De onde vem
 *
 * Do arquivo `seed/dex-trofeus.json`, versionado, carregado a cada boot como
 * o catálogo de formas. Troféu novo é uma entrada a mais no arquivo, sem
 * código; troféu que sai é inativado, nunca apagado. Como a disponibilidade,
 * **o que um checkpoint libera é dado conferido, nunca preenchido de
 * memória**: todo checkpoint diz a fonte, e o teste confere cada espécie
 * contra o catálogo do jogo.
 *
 * A platina não está no arquivo: é derivada, como o estado da vaga.
 */
import { lerFaixas } from "./dex-disponibilidade";
import type { TrilhaDex, VistaDex } from "./dex-grade";
import { ehJogoDex } from "./dex-jogos";
import { REGIOES, type Regiao } from "./escopo-pokedex";

export const TIPOS_TROFEU = ["checkpoint", "marco", "calculado"] as const;
export type TipoTrofeu = (typeof TIPOS_TROFEU)[number];

export const NIVEIS_TROFEU = ["bronze", "prata", "ouro"] as const;
export type NivelTrofeu = (typeof NIVEIS_TROFEU)[number];

/** Os idiomas da interface (`src/i18n/config.ts`); todo troféu tem os dois. */
export const IDIOMAS_TROFEU = ["pt-BR", "en"] as const;
export type IdiomaTrofeu = (typeof IDIOMAS_TROFEU)[number];

/** O "jogo" dos troféus do HOME: não é um jogo, é a living dex inteira. */
export const JOGO_HOME = "home";

/**
 * O que um troféu do HOME pede, declarado no arquivo (nunca código por
 * troféu). Conta só o que conta na trilha (`contaNaTrilha`), como a Pokédex.
 */
export type RegraTrofeuHome =
  /** Pelo menos N vagas no HOME na trilha, somando as duas vistas. */
  | { tipo: "quantidade"; quantidade: number; trilha: TrilhaDex }
  /** Toda vaga da vista principal da região no HOME. */
  | { tipo: "regiao"; regiao: Regiao; trilha: TrilhaDex }
  /** Toda vaga da vista no HOME: a principal inteira é a living dex. */
  | { tipo: "vista"; vista: VistaDex; trilha: TrilhaDex };

const TRILHAS: readonly TrilhaDex[] = ["normal", "shiny"];
const VISTAS: readonly VistaDex[] = ["principal", "cosmeticas"];

function lerRegra(bruto: unknown): RegraTrofeuHome | string {
  const r = (bruto ?? {}) as Record<string, unknown>;
  if (!TRILHAS.includes(r.trilha as TrilhaDex)) return "regra.trilha must be normal or shiny";
  const trilha = r.trilha as TrilhaDex;
  switch (r.tipo) {
    case "quantidade":
      return Number.isInteger(r.quantidade) && (r.quantidade as number) > 0
        ? { tipo: "quantidade", quantidade: r.quantidade as number, trilha }
        : "regra.quantidade must be a positive integer";
    case "regiao":
      return (REGIOES as readonly string[]).includes(r.regiao as string)
        ? { tipo: "regiao", regiao: r.regiao as Regiao, trilha }
        : `regra.regiao must be one of ${REGIOES.join(", ")}`;
    case "vista":
      return VISTAS.includes(r.vista as VistaDex)
        ? { tipo: "vista", vista: r.vista as VistaDex, trilha }
        : "regra.vista must be principal or cosmeticas";
    default:
      return "regra.tipo must be quantidade, regiao or vista";
  }
}

export interface TextoTrofeu {
  titulo: string;
  /** Como conquistar, em uma ou duas frases. */
  descricao: string;
}

export interface TrofeuDex {
  /** `<jogo>-<nome>`: `firered-campeao`. */
  id: string;
  jogoId: string;
  tipo: TipoTrofeu;
  nivel: NivelTrofeu;
  /** Posição no arquivo, que é a ordem de exibição (a da história). */
  ordem: number;
  textos: Record<IdiomaTrofeu, TextoTrofeu>;
  /** Troféus que vêm antes (informativo; marcar fora de ordem é permitido). */
  requer: string[];
  /** Números nacionais que o checkpoint destrava; vazio no marco. */
  libera: number[];
  /** De onde veio o que o checkpoint libera. Obrigatório no checkpoint. */
  fonte: string | null;
  /** O que o troféu calculado (do HOME) pede; nulo nos outros. */
  regra: RegraTrofeuHome | null;
}

const ID_TROFEU = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function textoNaoVazio(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

/**
 * Lê o conteúdo de `seed/dex-trofeus.json`. Junta todos os problemas e
 * lança um erro só com a lista: um arquivo com três erros não deve pedir
 * três rodadas para ser consertado.
 */
export function lerSeedTrofeus(json: unknown): TrofeuDex[] {
  const problemas: string[] = [];
  const lista = (json as { trofeus?: unknown } | null)?.trofeus;
  if (!Array.isArray(lista)) throw new Error("dex-trofeus.json: expected { \"trofeus\": [...] }.");

  const trofeus: TrofeuDex[] = [];
  const vistos = new Map<string, string>();
  lista.forEach((bruto, i) => {
    const t = (bruto ?? {}) as Record<string, unknown>;
    const onde = typeof t.id === "string" ? t.id : `#${i}`;
    const erro = (msg: string) => problemas.push(`${onde}: ${msg}`);

    if (typeof t.id !== "string" || !ID_TROFEU.test(t.id)) erro("id must be lowercase words joined by hyphens");
    if (typeof t.jogo !== "string" || !(ehJogoDex(t.jogo) || t.jogo === JOGO_HOME)) erro(`unknown game "${String(t.jogo)}"`);
    else if (typeof t.id === "string" && !t.id.startsWith(`${t.jogo}-`)) erro(`id must start with "${t.jogo}-"`);
    if (!TIPOS_TROFEU.includes(t.tipo as TipoTrofeu)) erro(`tipo must be one of ${TIPOS_TROFEU.join(", ")}`);
    if (!NIVEIS_TROFEU.includes(t.nivel as NivelTrofeu)) erro(`nivel must be one of ${NIVEIS_TROFEU.join(", ")}`);
    if (typeof t.id === "string" && vistos.has(t.id)) erro("duplicate id");

    const textos = {} as Record<IdiomaTrofeu, TextoTrofeu>;
    for (const idioma of IDIOMAS_TROFEU) {
      const x = t[idioma] as { titulo?: unknown; descricao?: unknown } | undefined;
      if (!x || !textoNaoVazio(x.titulo) || !textoNaoVazio(x.descricao)) {
        erro(`missing ${idioma} titulo/descricao`);
        continue;
      }
      textos[idioma] = { titulo: x.titulo.trim(), descricao: x.descricao.trim() };
    }

    const requer = t.requer === undefined ? [] : t.requer;
    if (!Array.isArray(requer) || !requer.every((r) => typeof r === "string")) {
      erro("requer must be a list of trophy ids");
    } else {
      for (const r of requer) {
        // Só para trás no arquivo: assim não há ciclo, e a ordem do arquivo
        // continua sendo a da história.
        if (!vistos.has(r)) erro(`requer "${r}" is not an earlier trophy`);
        else if (vistos.get(r) !== t.jogo) erro(`requer "${r}" is from another game`);
      }
    }

    let libera: number[] = [];
    if (t.libera !== undefined) {
      if (typeof t.libera !== "string") erro("libera must be a range string like \"1-3,7\"");
      else {
        try {
          libera = lerFaixas(t.libera);
        } catch (e) {
          erro((e as Error).message);
        }
      }
    }
    if (libera.some((n) => n < 1 || n > 1025)) erro("libera has a number outside 1–1025");
    if (new Set(libera).size !== libera.length) erro("libera repeats a species");
    if (t.tipo === "checkpoint" && libera.length === 0) erro("a checkpoint must list what it unlocks (libera)");
    if (t.tipo === "marco" && libera.length > 0) erro("a marco does not unlock species; make it a checkpoint");
    if (t.tipo === "checkpoint" && !textoNaoVazio(t.fonte)) erro("a checkpoint must say where its data came from (fonte)");
    if ((t.jogo === JOGO_HOME) !== (t.tipo === "calculado")) erro("HOME trophies, and only they, are calculado");
    let regra: RegraTrofeuHome | null = null;
    if (t.tipo === "calculado") {
      const r = lerRegra(t.regra);
      if (typeof r === "string") erro(r);
      else regra = r;
    } else if (t.regra !== undefined) erro("only a calculado trophy has a regra");

    if (typeof t.id === "string") vistos.set(t.id, String(t.jogo));
    trofeus.push({
      id: String(t.id),
      jogoId: String(t.jogo),
      tipo: t.tipo as TipoTrofeu,
      nivel: t.nivel as NivelTrofeu,
      ordem: i + 1,
      textos,
      requer: Array.isArray(requer) ? (requer as string[]) : [],
      libera,
      fonte: textoNaoVazio(t.fonte) ? t.fonte.trim() : null,
      regra,
    });
  });

  if (problemas.length > 0) {
    throw new Error(`dex-trofeus.json has ${problemas.length} problem(s):\n  ${problemas.join("\n  ")}`);
  }
  return trofeus;
}

/** O mínimo de um troféu que as contas abaixo precisam. */
export type TrofeuParaConta = Pick<TrofeuDex, "id" | "jogoId" | "tipo" | "nivel" | "libera">;

/**
 * Espécies trancadas num jogo: as que algum checkpoint ainda não
 * conquistado libera. Número nacional → ids dos checkpoints que faltam.
 */
export function especiesTrancadas(
  trofeus: readonly TrofeuParaConta[],
  jogoId: string,
  obtidos: ReadonlySet<string>,
): Map<number, string[]> {
  const trancadas = new Map<number, string[]>();
  for (const t of trofeus) {
    if (t.jogoId !== jogoId || t.tipo !== "checkpoint" || obtidos.has(t.id)) continue;
    for (const n of t.libera) trancadas.set(n, [...(trancadas.get(n) ?? []), t.id]);
  }
  return trancadas;
}

export interface ProgressoTrofeus {
  total: number;
  obtidos: number;
  porNivel: Record<NivelTrofeu, { total: number; obtidos: number }>;
  /** Todos os troféus do jogo conquistados. Jogo sem troféu não tem platina. */
  platina: boolean;
}

export function progressoTrofeus(
  trofeus: readonly TrofeuParaConta[],
  jogoId: string,
  obtidos: ReadonlySet<string>,
): ProgressoTrofeus {
  const porNivel = {
    bronze: { total: 0, obtidos: 0 },
    prata: { total: 0, obtidos: 0 },
    ouro: { total: 0, obtidos: 0 },
  };
  let total = 0;
  let feitos = 0;
  for (const t of trofeus) {
    if (t.jogoId !== jogoId) continue;
    total++;
    porNivel[t.nivel].total++;
    if (obtidos.has(t.id)) {
      feitos++;
      porNivel[t.nivel].obtidos++;
    }
  }
  return { total, obtidos: feitos, porNivel, platina: total > 0 && feitos === total };
}
