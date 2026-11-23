/**
 * As regras de tela do modo "Organizar", das sugestões e da coleção temática
 * em `/colecoes` (pacote 4b), puras e testadas. A concorrência mora nas rotas
 * (`AGENTS.md`, "Collection groups and order" e "Collection suggestions"): o
 * lock de organização, o 409 da lista velha, o que cada lote confere da
 * prévia. A tela só precisa mandar o que a prévia mostrou, mostrar cada
 * recusa e decidir o estado que vem depois dela — é isso que este módulo diz.
 *
 * Nada aqui ordena a lista de coleções: a ordem é a de `listarColecoes`, e a
 * tela só a desenha.
 */

import { type TradutorDeRecusa, textoDaRecusa } from "@/app/_comum/recusa";
import { TAMANHO_MAXIMO_NOME_GRUPO } from "@/lib/dominio/grupos-colecao";
import type { SugestaoDTO } from "@/lib/dominio/tipos-cliente";

/** A chave de uma recusa (`{ recusa: { chave } }`), ou `null` quando o corpo não traz uma. */
export function chaveDaRecusa(corpo: unknown): string | null {
  const recusa = (corpo as { recusa?: { chave?: unknown } } | null)?.recusa;
  return typeof recusa?.chave === "string" ? recusa.chave : null;
}

/**
 * O motivo de uma recusa, em frase. O 409 de lista velha
 * (`ordemDeColecoesDesatualizada`) ganha a frase da v2 (`listaVelha`): a do
 * catálogo de recusas manda recarregar a página, e aqui a tela já relê
 * sozinha depois de toda recusa. O resto vai por `textoDaRecusa`, e um corpo
 * sem recusa reconhecível dá texto vazio (a tela mostra só o que aconteceu).
 */
export function motivoDaRecusa(
  corpo: unknown,
  tRecusas: TradutorDeRecusa,
  listaVelha: string,
): string {
  if (chaveDaRecusa(corpo) === "ordemDeColecoesDesatualizada") return listaVelha;
  return textoDaRecusa(tRecusas, corpo, "");
}

/**
 * O que a janela de uma prévia em lote ("Criar as que faltam", "Trazer as
 * existentes") faz depois de uma leitura ou confirmação que não deu certo:
 *
 * - **`fechar`** quando o grupo sumiu (404 `grupoColecaoNaoEncontrado`, outra
 *   aba o excluiu) ou perdeu a série (`grupoSemSerie`, outra aba a
 *   desligou): não há mais prévia para mostrar, e reler só repetiria a
 *   recusa. A página fecha a janela dizendo por quê e relê a lista, em que o
 *   grupo some ou perde as ações em lote.
 * - **`reler`** em todo o resto: o 409 de lista velha (série trocada, coleção
 *   movida, set que ganhou coleção), uma validação que a prévia não previu e
 *   a falta de resposta — em que o servidor pode ter gravado tudo ou nada.
 *   A prévia volta do servidor antes de o botão religar.
 *
 * `status` nulo é falha de rede.
 */
export type ReacaoPrevia = "fechar" | "reler";

export function reacaoDaPrevia(status: number | null, corpo: unknown): ReacaoPrevia {
  if (status === null) return "reler";
  const chave = chaveDaRecusa(corpo);
  if (chave === "grupoColecaoNaoEncontrado" || chave === "grupoSemSerie") return "fechar";
  return "reler";
}

/* ------------------------------------------------ Criar as que faltam */

/** O que a releitura de "Criar as que faltam" precisa de cada set. */
export interface SetDaPrevia {
  setId: string;
  nomeSugerido: string;
  marcadoPorPadrao: boolean;
  colecoesExistentes: readonly unknown[];
}

/**
 * As marcas depois de uma leitura da prévia de "Criar as que faltam".
 *
 * - **Primeira leitura, ou a série mudou** (outra aba ligou o grupo a outra
 *   série e a confirmação voltou 409): as marcas padrão do servidor
 *   (`marcadoPorPadrao` — promo e energia vêm desmarcados). As marcas antigas
 *   eram de outra série e não dizem nada sobre esta.
 * - **Releitura da mesma série:** ficam as marcas do usuário nos sets que
 *   seguem na prévia e continuam selecionáveis; um set que ganhou coleção em
 *   outra aba perde a marca (o servidor recusaria o lote de novo).
 */
export function marcasDeFaltantes(
  sets: readonly SetDaPrevia[],
  anteriores: { serieId: string; marcados: ReadonlySet<string> } | null,
  serieId: string,
): Set<string> {
  if (anteriores === null || anteriores.serieId !== serieId) {
    return new Set(sets.filter((s) => s.marcadoPorPadrao && s.colecoesExistentes.length === 0).map((s) => s.setId));
  }
  return new Set(
    sets.filter((s) => s.colecoesExistentes.length === 0 && anteriores.marcados.has(s.setId)).map((s) => s.setId),
  );
}

/** Os nomes depois de uma leitura: o que o usuário digitou fica; set novo na prévia vem com o sugerido. */
export function nomesDeFaltantes(
  sets: readonly SetDaPrevia[],
  atuais: Readonly<Record<string, string>>,
): Record<string, string> {
  const nomes: Record<string, string> = {};
  for (const s of sets) nomes[s.setId] = atuais[s.setId] ?? s.nomeSugerido;
  return nomes;
}

/* ---------------------------------------------- Trazer as existentes */

/** O que a releitura de "Trazer as existentes" precisa de cada coleção. */
export interface ColecaoDaPrevia {
  id: string;
  grupoAtual: { id: string } | null;
  marcadoPorPadrao: boolean;
}

/** De que grupo cada coleção da prévia sai — o que volta no POST como `grupoOrigemId`. */
export function origensDaPrevia(colecoes: readonly ColecaoDaPrevia[]): Map<string, string | null> {
  return new Map(colecoes.map((c) => [c.id, c.grupoAtual?.id ?? null] as const));
}

/**
 * As marcas depois de uma leitura da prévia de "Trazer as existentes". A
 * marca do usuário fica só onde a coleção segue na lista **e sai do mesmo
 * grupo** que a leitura anterior mostrou: uma coleção que outra aba moveu
 * para um grupo é outra decisão (tirá-la de lá é escolha do usuário), e volta
 * ao padrão — que só marca as que estão em grupo nenhum.
 */
export function marcasDeExistentes(
  colecoes: readonly ColecaoDaPrevia[],
  origensAntes: ReadonlyMap<string, string | null> | null,
  marcadas: ReadonlySet<string>,
): Set<string> {
  return new Set(
    colecoes
      .filter((c) => {
        const antes = origensAntes?.get(c.id);
        if (antes === undefined) return c.marcadoPorPadrao;
        return antes === (c.grupoAtual?.id ?? null) ? marcadas.has(c.id) : c.marcadoPorPadrao;
      })
      .map((c) => c.id),
  );
}

/* ------------------------------------------------------------- Grupo */

/**
 * O corpo de criar ou editar um grupo, ou `null` quando não há o que salvar.
 * **Editar manda só o que mudou**, com o nome aparado: reenviar a série que a
 * janela leu ao abrir restauraria, em silêncio, uma ligação que outra aba
 * acabou de desfazer. Criar manda o nome e, só se escolhida, a série.
 */
export function pedidoDoGrupo(
  original: { nome: string; serieId: string | null } | null,
  nome: string,
  serieId: string,
): { nome?: string; serieId?: string | null } | null {
  const aparado = nome.trim();
  if (aparado === "" || aparado.length > TAMANHO_MAXIMO_NOME_GRUPO) return null;
  const serie = serieId === "" ? null : serieId;
  if (original === null) return serie === null ? { nome: aparado } : { nome: aparado, serieId: serie };
  const corpo: { nome?: string; serieId?: string | null } = {};
  if (aparado !== original.nome) corpo.nome = aparado;
  if (serie !== original.serieId) corpo.serieId = serie;
  return Object.keys(corpo).length > 0 ? corpo : null;
}

/* --------------------------------------------------------- Sugestões */

/**
 * As sugestões que a tela mostra: as lidas, menos as dispensadas com sucesso
 * nesta vida da página e as de set que ganharam coleção aqui (as ações em
 * lote de um grupo). As duas listas valem mesmo se a releitura seguinte falhar
 * ou chegar atrasada — uma sugestão dispensada nunca volta à tela por uma
 * leitura velha. Não reordena: a ordem é a do servidor (rodadas entre tipos).
 */
export function sugestoesNaTela(
  lidas: readonly SugestaoDTO[],
  dispensadas: ReadonlySet<string>,
  setsCriados: ReadonlySet<string>,
): SugestaoDTO[] {
  return lidas.filter((s) => !dispensadas.has(s.chave) && !(s.tipo === "set" && setsCriados.has(s.setId)));
}

/**
 * Recolhida ou aberta. A escolha feita nesta visita vence a guardada no
 * aparelho (`"1"` recolhida, `"0"` aberta); sem nenhuma das duas, recolhida
 * no celular (para não empurrar a lista de coleções para baixo) e aberta de
 * 768 px para cima, como na v1.
 */
export function sugestoesRecolhidas(escolha: boolean | null, guardada: string | null, celular: boolean): boolean {
  if (escolha !== null) return escolha;
  if (guardada === "1") return true;
  if (guardada === "0") return false;
  return celular;
}

/* -------------------------------------------------- Coleção temática */

/** A coleção que o 409 `temaJaTemColecao` aponta, ou `null` se a resposta é outra. */
export function colecaoQueJaExiste(corpo: unknown): { id: string; nome: string } | null {
  if (chaveDaRecusa(corpo) !== "temaJaTemColecao") return null;
  const valores = (corpo as { recusa: { valores?: Record<string, unknown> } }).recusa.valores ?? {};
  const { colecaoId, colecao } = valores;
  return typeof colecaoId === "string" && typeof colecao === "string" ? { id: colecaoId, nome: colecao } : null;
}
