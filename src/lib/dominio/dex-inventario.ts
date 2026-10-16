/**
 * Living Dex — inventário e oportunidades de levar ao HOME. Módulo puro.
 *
 * O banco guarda um registro por Pokémon, para cada um poder ser movido
 * sozinho. O inventário agrupa na exibição: registros iguais em tudo menos
 * o id viram uma linha com quantidade, como as cópias das cartas.
 *
 * A oportunidade é o "o que já dá para alocar" das cartas: uma vaga que
 * ainda não está no HOME, numa trilha, e que um Pokémon que o usuário já
 * tem num jogo preencheria. Uma vaga conta uma vez, por mais cópias que
 * existam; basta enviar uma.
 */
import type { TrilhaDex } from "./dex-grade";
import { jogoDex, LOCAL_HOME, ordemJogo } from "./dex-jogos";

export interface FormaParaNome {
  id: string;
  especie: string;
  forma: string | null;
  /** Ordem do catálogo: na mesma espécie, base antes das formas. */
  ordem: number;
}

/**
 * Ordem alfabética de espécie; dentro da espécie, a ordem do catálogo
 * (base, fêmea, formas). `localeCompare` sem acento: "Flabébé" fica com os F.
 */
export function compararPorNome(a: FormaParaNome, b: FormaParaNome): number {
  const porEspecie = a.especie.localeCompare(b.especie, "en", { sensitivity: "base" });
  return porEspecie !== 0 ? porEspecie : a.ordem - b.ordem;
}

export interface RegistroParaInventario {
  id: string;
  formaId: string;
  shiny: boolean;
  jogoOrigem: string;
  local: string;
  capturadoEm: string | null;
  notas: string | null;
}

export interface GrupoInventario {
  /** Chave estável do grupo na tela. */
  chave: string;
  formaId: string;
  shiny: boolean;
  jogoOrigem: string;
  local: string;
  capturadoEm: string | null;
  notas: string | null;
  /** Ids do grupo, do mais antigo para o mais novo (a ordem de entrada). */
  ids: string[];
}

/** Agrupa registros idênticos em tudo menos o id, preservando a ordem de entrada. */
export function agruparInventario(registros: readonly RegistroParaInventario[]): GrupoInventario[] {
  const grupos = new Map<string, GrupoInventario>();
  for (const r of registros) {
    const chave = JSON.stringify([r.formaId, r.shiny, r.jogoOrigem, r.local, r.capturadoEm, r.notas]);
    const grupo = grupos.get(chave);
    if (grupo) grupo.ids.push(r.id);
    else grupos.set(chave, { chave, ...r, ids: [r.id] });
  }
  return [...grupos.values()];
}

export interface Oportunidade {
  formaId: string;
  trilha: TrilhaDex;
  /** O registro sugerido para enviar. */
  registroId: string;
  local: string;
}

export interface OportunidadesDoJogo {
  jogoId: string;
  itens: Oportunidade[];
}

/**
 * Vagas que o usuário pode levar ao HOME agora, agrupadas pelo jogo onde o
 * Pokémon está, na ordem de lançamento dos jogos.
 *
 * Com cópias em mais de um jogo, a sugestão sai do jogo de ida e volta: o
 * Pokémon dali pode voltar, o de um jogo só de envio não. O usuário ainda
 * escolhe; isto é só a sugestão.
 *
 * Registro que o HOME não recebe do jogo onde está (`naoTransferiveis`,
 * `jogo:forma`) não é oportunidade: aparece no inventário, nunca aqui.
 */
export function oportunidadesHome(
  registros: readonly RegistroParaInventario[],
  naoTransferiveis: ReadonlySet<string> = new Set(),
): OportunidadesDoJogo[] {
  const noHome = new Set<string>();
  for (const r of registros) {
    if (r.local === LOCAL_HOME) noHome.add(`${r.formaId}:${r.shiny}`);
  }

  const escolhido = new Map<string, RegistroParaInventario>();
  for (const r of registros) {
    if (r.local === LOCAL_HOME || naoTransferiveis.has(`${r.local}:${r.formaId}`)) continue;
    const chave = `${r.formaId}:${r.shiny}`;
    if (noHome.has(chave)) continue;
    const atual = escolhido.get(chave);
    const preferivel =
      !atual ||
      (jogoDex(atual.local)?.conexaoHome === "so_envio" && jogoDex(r.local)?.conexaoHome === "ida_e_volta");
    if (preferivel) escolhido.set(chave, r);
  }

  const porJogo = new Map<string, Oportunidade[]>();
  for (const r of escolhido.values()) {
    const lista = porJogo.get(r.local) ?? [];
    lista.push({ formaId: r.formaId, trilha: r.shiny ? "shiny" : "normal", registroId: r.id, local: r.local });
    porJogo.set(r.local, lista);
  }
  return [...porJogo.entries()]
    .sort(([a], [b]) => ordemJogo(a) - ordemJogo(b))
    .map(([jogoId, itens]) => ({ jogoId, itens }));
}
