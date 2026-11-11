/**
 * Living Dex — envio ao HOME pelo Novo cadastro: o usuário escolhe nas caixas
 * as vagas que estão chegando e diz de que jogo saíram. Módulo puro: lê o
 * corpo e planeja o que criar e o que mover; quem grava é `enviarAoHome`.
 *
 * O resultado é sempre um registro **no HOME, "a guardar"** — o mesmo estado
 * que o "Levar ao HOME" produz. Nenhum estado novo, só um caminho mais curto.
 *
 * ## Jogo de saída não é origem histórica
 *
 * O registro guarda onde nasceu (`jogoOrigem`) e onde está (`local`). O jogo
 * do lote é o **local de onde o Pokémon sai agora**:
 *
 *  - se já há registro daquela vaga e trilha nesse jogo, ele é **movido**,
 *    mantendo origem, data e notas (nascido no Sword, hoje no Scarlet, sai do
 *    Scarlet e continua "do Sword"). O mais antigo primeiro, como em toda a
 *    dex;
 *  - senão, **cria** um registro com origem = jogo de saída, porque não há
 *    outro dado. Saída pelo HOME (presente, GTS) sempre cria, com origem e
 *    local `home`.
 *
 * Um registro criado aqui é tratado como se tivesse nascido no jogo de saída
 * e sido movido agora: passa pelo mesmo `validarMovimento` do registro
 * existente. É o que faz o Spinda do GO ser recusado nos dois casos e a
 * confirmação de "não volta" valer para o lote inteiro.
 *
 * ## Por que a regra não está em `validarNovoRegistro`
 *
 * `naoTransferiveis` é por jogo de saída, não por origem histórica: um Spinda
 * nascido no GO e hoje no HOME é válido, e a correção do Inventário revalida
 * registros que já existem. Pôr a restrição lá travaria a correção de notas
 * de um registro antigo. Ela mora aqui, onde há de fato uma transferência.
 *
 * ## O que não é recusa
 *
 * Seção desligada (preferência de vista: o registro nela é válido, só não
 * conta), forma fora do catálogo do jogo, troca, evento ou trancada por
 * checkpoint — o Pokémon pode ter vindo por troca. A tela marca; o servidor
 * aceita.
 */
import { jogoDex, LOCAL_HOME, ORIGEM_HOME } from "./dex-jogos";
import {
  ehPedidoDeConfirmacao,
  validarMovimento,
  type ContextoRegistroDex,
  type DadosRegistroDex,
} from "./dex-registro";
import { recusa, type Recusa } from "./recusa";

/**
 * Teto de itens por envio. Uma caixa tem 30 vagas e o uso típico é uma
 * rodada do GO; 500 cobre com folga um dia de arrumação sem deixar um corpo
 * malformado virar milhares de linhas.
 */
export const MAX_ITENS_ENVIO_HOME = 500;

export interface ItemEnvioHome {
  formaId: string;
  shiny: boolean;
}

export interface LoteEnvioHome {
  /**
   * O jogo de onde os Pokémon saem agora, ou `home`. O nome do campo segue o
   * corpo da rota; o que ele quer dizer está no cabeçalho deste módulo.
   */
  jogoOrigem: string;
  /** Um item por vaga e trilha: cada um é um Pokémon. */
  itens: ItemEnvioHome[];
  /** O usuário já confirmou que o Pokémon não volta ao jogo `so_envio`. */
  confirmarSemVolta: boolean;
}

/**
 * Chave de uma vaga numa trilha, no formato do mapa de estados
 * (`dex-estado.ts`): `raichu-alola:shiny`.
 */
export function chaveVagaTrilha(formaId: string, shiny: boolean): string {
  return `${formaId}:${shiny ? "shiny" : "normal"}`;
}

/**
 * Lê o corpo do envio; devolve a frase do problema (em português, como as
 * outras guardas de corpo malformado — a tela não alcança esse caminho) ou o
 * lote.
 *
 * Par forma + trilha repetido é corpo malformado, não recusa: a tela marca e
 * desmarca por vaga, então não tem como mandar dois. Cópia extra continua na
 * tela antiga, que cadastra por quantidade.
 */
export function lerLoteEnvioHome(corpo: unknown): LoteEnvioHome | string {
  if (typeof corpo !== "object" || corpo === null) return "Corpo inválido (objeto esperado).";
  const c = corpo as { jogoOrigem?: unknown; itens?: unknown; confirmarSemVolta?: unknown };
  if (typeof c.jogoOrigem !== "string" || c.jogoOrigem === "") return "jogoOrigem ausente ou vazio.";
  if (!Array.isArray(c.itens) || c.itens.length === 0) return "itens ausente ou vazio.";
  if (c.itens.length > MAX_ITENS_ENVIO_HOME) return `itens demais (no máximo ${MAX_ITENS_ENVIO_HOME} por envio).`;
  if (c.confirmarSemVolta !== undefined && typeof c.confirmarSemVolta !== "boolean") {
    return "confirmarSemVolta inválido (esperado boolean).";
  }

  const itens: ItemEnvioHome[] = [];
  const vistos = new Set<string>();
  for (const item of c.itens) {
    const i = item as { formaId?: unknown; shiny?: unknown } | null;
    if (typeof i?.formaId !== "string" || i.formaId === "") return "item sem formaId.";
    if (typeof i.shiny !== "boolean") return `shiny inválido em ${i.formaId} (esperado boolean).`;
    const chave = chaveVagaTrilha(i.formaId, i.shiny);
    if (vistos.has(chave)) return `${chave} repetido: um item por vaga e trilha.`;
    vistos.add(chave);
    itens.push({ formaId: i.formaId, shiny: i.shiny });
  }
  return { jogoOrigem: c.jogoOrigem, itens, confirmarSemVolta: c.confirmarSemVolta === true };
}

/** Um registro que já existe e pode ser o Pokémon que está saindo. */
export interface CandidatoEnvioHome {
  id: string;
  formaId: string;
  shiny: boolean;
  /** Onde nasceu: é mantido quando o registro é movido. */
  jogoOrigem: string;
  local: string;
}

export interface ContextoEnvioHome extends ContextoRegistroDex {
  /** Formas ativas nunca liberadas em shiny (`shiny_obtenivel = false`). */
  formasSemShiny: ReadonlySet<string>;
  /** Vagas com algum registro no HOME, na chave de `chaveVagaTrilha`. */
  vagasNoHome: ReadonlySet<string>;
}

export type PlanoEnvioHome =
  | { ok: true; criar: DadosRegistroDex[]; mover: string[] }
  | { ok: false; recusas: Recusa[] }
  // A confirmação não é um "não": a tela pergunta e reenvia com `confirmarSemVolta`.
  | { ok: false; confirmacao: Recusa };

/**
 * Planeja o envio: o que criar e quais registros mover para o HOME.
 *
 * `candidatos` na ordem de cadastro (`criado_em`, depois `id`): o primeiro da
 * vaga e trilha que está no jogo de saída é o movido. Quem não está no jogo
 * de saída é ignorado — o Pokémon que está no Sword não sai do Scarlet.
 *
 * As recusas vêm todas juntas e sem repetir; com qualquer uma, nada é
 * gravado. Só sem nenhuma recusa de verdade vem o pedido de confirmação, uma
 * vez para o lote (como `validarMovimentoEmLote`): não faz sentido confirmar
 * um envio que depois seria negado.
 */
export function planejarEnvioHome(
  lote: LoteEnvioHome,
  candidatos: readonly CandidatoEnvioHome[],
  ctx: ContextoEnvioHome,
): PlanoEnvioHome {
  const saida = lote.jogoOrigem;
  const recusas = new Map<string, Recusa>();
  const recusar = (r: Recusa) => recusas.set(JSON.stringify(r), r);
  let confirmacao: Recusa | null = null;

  // A rota descreve uma transferência real: jogo parado ou que o usuário não
  // tem não manda nada. O HOME como saída é o Pokémon que nasceu nele.
  if (saida !== ORIGEM_HOME) {
    const jogo = jogoDex(saida);
    if (!jogo) recusar(recusa("dexJogoDesconhecido", { jogo: saida }));
    else if (!ctx.jogosAtivos.has(saida)) recusar(recusa("dexLocalNaoPossuido", { jogo: jogo.nome }));
  }

  // Fila por vaga e trilha, só com quem está no jogo de saída, na ordem
  // recebida. Saída pelo HOME não move nada: o que já está lá é vaga no HOME.
  const filas = new Map<string, CandidatoEnvioHome[]>();
  if (saida !== ORIGEM_HOME) {
    for (const c of candidatos) {
      if (c.local !== saida) continue;
      const k = chaveVagaTrilha(c.formaId, c.shiny);
      const fila = filas.get(k);
      if (fila) fila.push(c);
      else filas.set(k, [c]);
    }
  }

  const criar: DadosRegistroDex[] = [];
  const mover: string[] = [];
  for (const item of lote.itens) {
    if (!ctx.formasAtivas.has(item.formaId)) {
      recusar(recusa("dexFormaDesconhecida", { forma: item.formaId }));
      continue;
    }
    const chave = chaveVagaTrilha(item.formaId, item.shiny);
    if (item.shiny && ctx.formasSemShiny.has(item.formaId)) {
      recusar(recusa("dexSemShiny", { forma: item.formaId }));
    }
    // Também é o que barra o reenvio depois de uma resposta perdida, e duas
    // abas mandando a mesma vaga: a segunda já a encontra no HOME.
    if (ctx.vagasNoHome.has(chave)) {
      recusar(recusa("dexVagaJaNoHome", { forma: item.formaId, trilha: item.shiny ? "shiny" : "normal" }));
    }

    // `shift` tira o candidato da fila: um registro não é movido duas vezes.
    const movido = filas.get(chave)?.shift();
    const r = validarMovimento(
      {
        formaId: item.formaId,
        jogoOrigem: movido?.jogoOrigem ?? saida,
        localAtual: saida,
        novoLocal: LOCAL_HOME,
        confirmarSemVolta: lote.confirmarSemVolta,
      },
      ctx,
    );
    if (r && ehPedidoDeConfirmacao(r)) confirmacao ??= r;
    else if (r) recusar(r);

    if (movido) mover.push(movido.id);
    else {
      criar.push({
        formaId: item.formaId,
        shiny: item.shiny,
        jogoOrigem: saida,
        local: LOCAL_HOME,
        capturadoEm: null,
        notas: null,
      });
    }
  }

  if (recusas.size > 0) return { ok: false, recusas: [...recusas.values()] };
  if (confirmacao) return { ok: false, confirmacao };
  return { ok: true, criar, mover };
}
