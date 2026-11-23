/**
 * O lote do Novo cadastro, sem pele: a seleção das duas trilhas, o teto, as
 * linhas da etapa 2 com as marcas de cada item e o que impede o envio.
 * Módulo puro, testado sem banco (`lote-envio.test.ts`); a tela só traduz as
 * marcas e desenha. As regras são as da v1
 * (`(v1)/v1/dex/novo-cadastro/novo-cadastro.tsx`), tiradas do componente.
 *
 * - **A seleção é vaga + trilha**, um Pokémon por par, como a rota pede
 *   (`chaveVagaTrilha`). Busca, "só caixas com faltantes" e trilha só mudam a
 *   vista; a seleção não depende do que está na tela.
 * - **O teto é o da rota** (`MAX_ITENS_ENVIO_HOME`): o toque que passaria
 *   dele não marca, e diz por quê. Acima do teto a rota recusaria com uma
 *   frase que não passa pelo catálogo de mensagens.
 * - **A tela só avisa; quem decide é a rota**, que confere tudo de novo. As
 *   marcas que só avisam (fora do jogo, troca, evento, trancada, o que será
 *   movido, onde nasceu) não travam nada: o Pokémon pode ter vindo por
 *   troca. As que impedem são o que a rota recusaria com certeza — o HOME não
 *   recebe aquela forma daquele jogo, ou a vaga já está no HOME —, e o envio
 *   espera a pessoa tirar o item.
 * - **O registro que a rota moveria** é o primeiro daquela vaga e trilha no
 *   jogo de saída, na ordem `criado_em, id` em que os registros chegam (a
 *   mesma da rota). Sair do HOME sempre cria.
 */
import type { PosicaoNaCaixa } from "@/lib/dominio/dex-caixas";
import type { ComoObter, DisponibilidadeForma } from "@/lib/dominio/dex-disponibilidade";
import { chaveVagaTrilha } from "@/lib/dominio/dex-envio-home";
import { estadoDaVaga, type MapaEstadosDex } from "@/lib/dominio/dex-estado";
import type { TrilhaDex } from "@/lib/dominio/dex-grade";
import { ORIGEM_HOME } from "@/lib/dominio/dex-jogos";

import type { ItemEnvio } from "./fluxo-envio";

/** Vaga + trilha → item. */
export type Selecao = ReadonlyMap<string, ItemEnvio>;

export const trilhaDoItem = (shiny: boolean): TrilhaDex => (shiny ? "shiny" : "normal");

/** O que um toque fez: marcou, desmarcou, ou não marcou por causa do teto. */
export type EventoToque = "marcou" | "desmarcou" | "teto";

/**
 * Marca ou desmarca uma vaga numa trilha. Devolve a seleção de sempre quando
 * nada muda (marcar o que já está marcado), para o React não redesenhar à
 * toa; o teto só vale para marcar — desmarcar sempre passa.
 */
export function alternarVaga(
  atual: Selecao,
  item: ItemEnvio,
  marcar: boolean,
  maximo: number,
): { selecao: Selecao; evento: EventoToque } {
  const chave = chaveVagaTrilha(item.formaId, item.shiny);
  if (atual.has(chave) === marcar) return { selecao: atual, evento: marcar ? "marcou" : "desmarcou" };
  if (marcar && atual.size >= maximo) return { selecao: atual, evento: "teto" };
  const proxima = new Map(atual);
  if (marcar) proxima.set(chave, { formaId: item.formaId, shiny: item.shiny });
  else proxima.delete(chave);
  return { selecao: proxima, evento: marcar ? "marcou" : "desmarcou" };
}

/** Tira do lote as chaves pedidas (o "x" de um item, ou "tirar os que não podem ir"). */
export function tirarDaSelecao(atual: Selecao, chaves: Iterable<string>): Selecao {
  const proxima = new Map(atual);
  let mudou = false;
  for (const c of chaves) mudou = proxima.delete(c) || mudou;
  return mudou ? proxima : atual;
}

/** Quantos itens em cada trilha: a contagem separa, para o que ficou na outra trilha não passar batido. */
export function contarSelecao(selecao: Selecao): { normal: number; shiny: number } {
  let shiny = 0;
  for (const i of selecao.values()) if (i.shiny) shiny += 1;
  return { normal: selecao.size - shiny, shiny };
}

/** Um registro que já existe, no formato que este módulo precisa (`RegistroDexDTO` serve). */
export interface RegistroParaLote {
  id: string;
  formaId: string;
  shiny: boolean;
  jogoOrigem: string;
  local: string;
}

/**
 * Por vaga e trilha, o registro que a rota moveria ao sair de `saida`: o
 * primeiro que está nesse jogo, na ordem recebida. Saída pelo HOME (ou
 * nenhuma escolhida) não move nada.
 */
export function registrosQueSeriamMovidos(
  registros: readonly RegistroParaLote[],
  saida: string | null,
): Map<string, RegistroParaLote> {
  const r = new Map<string, RegistroParaLote>();
  if (!saida || saida === ORIGEM_HOME) return r;
  for (const reg of registros) {
    if (reg.local !== saida) continue;
    const chave = chaveVagaTrilha(reg.formaId, reg.shiny);
    if (!r.has(chave)) r.set(chave, reg);
  }
  return r;
}

/** Uma marca de um item do lote, já com o que a tela precisa para escrevê-la. */
export type MarcaLote =
  | { tipo: "foraDoJogo" }
  | { tipo: "como"; como: Exclude<ComoObter, "livre"> }
  | { tipo: "trancada"; checkpoint: string }
  | { tipo: "moveDoJogo"; jogo: string }
  | { tipo: "nascidoEm"; jogo: string }
  | { tipo: "naoVaiAoHome" }
  | { tipo: "jaNoHome" };

/** As marcas que impedem: a rota recusaria o lote com elas. */
const MARCAS_QUE_IMPEDEM: ReadonlySet<MarcaLote["tipo"]> = new Set(["naoVaiAoHome", "jaNoHome"]);

export interface FormaParaLote {
  id: string;
  numero: number;
}

export interface LinhaLote<F extends FormaParaLote> {
  chave: string;
  forma: F;
  shiny: boolean;
  /** Caixa e posição com as reservadas de agora; nulo se a vaga saiu das caixas (seção desligada em outra aba). */
  destino: PosicaoNaCaixa | null;
  marcas: MarcaLote[];
  impede: boolean;
}

export interface ContextoLote<F extends FormaParaLote> {
  formaPorId: ReadonlyMap<string, F>;
  /** Onde cada vaga fica, por trilha (`posicoesNasCaixas`). */
  posicoes: Readonly<Record<TrilhaDex, ReadonlyMap<string, PosicaoNaCaixa>>>;
  estados: MapaEstadosDex;
  /** O jogo de onde saem, ou nulo enquanto a pessoa não escolheu. */
  saida: string | null;
  /** O catálogo do jogo de saída (`catalogoDoJogo`); nulo sem saída ou num jogo sem catálogo. */
  catalogo: ReadonlyMap<string, DisponibilidadeForma> | null;
  /** `jogo:forma` que o HOME não recebe daquele jogo (`naoTransferiveis`): a lista que a rota confere. */
  naoVaiAoHome: ReadonlySet<string>;
  /** Por vaga e trilha, o registro que seria movido (`registrosQueSeriamMovidos`). */
  movidos: ReadonlyMap<string, RegistroParaLote>;
  /** Número nacional → nomes dos checkpoints ainda não conquistados que o trancam no jogo de saída. */
  trancadas: ReadonlyMap<number, string>;
}

/** Na ordem das caixas do HOME; o que ficou sem lugar vai para o fim, e na mesma posição o normal vem antes. */
function compararDestino<F extends FormaParaLote>(a: LinhaLote<F>, b: LinhaLote<F>): number {
  if (!a.destino || !b.destino) return (a.destino ? 0 : 1) - (b.destino ? 0 : 1);
  return a.destino.caixa - b.destino.caixa || a.destino.posicao - b.destino.posicao || Number(a.shiny) - Number(b.shiny);
}

/**
 * As linhas da etapa 2. **O que impede vem primeiro**, depois a ordem das
 * caixas: o lote mostra os itens aos poucos, e um item que trava o envio
 * nunca pode ficar escondido no fim da lista (na v1, que montava tudo, ele
 * ficava no meio, na posição da caixa). Forma que saiu do catálogo (seed
 * novo) não tem o que enviar e não entra.
 */
export function linhasDoLote<F extends FormaParaLote>(selecao: Selecao, ctx: ContextoLote<F>): LinhaLote<F>[] {
  const linhas: LinhaLote<F>[] = [];
  for (const [chave, item] of selecao) {
    const forma = ctx.formaPorId.get(item.formaId);
    if (!forma) continue;
    const trilha = trilhaDoItem(item.shiny);
    const marcas: MarcaLote[] = [];
    const disponibilidade = ctx.catalogo?.get(forma.id);
    if (ctx.catalogo && !disponibilidade) marcas.push({ tipo: "foraDoJogo" });
    if (disponibilidade && disponibilidade.como !== "livre") marcas.push({ tipo: "como", como: disponibilidade.como });
    const trancadaPor = ctx.trancadas.get(forma.numero);
    if (trancadaPor) marcas.push({ tipo: "trancada", checkpoint: trancadaPor });
    const movido = ctx.movidos.get(chave);
    if (movido && ctx.saida) {
      marcas.push({ tipo: "moveDoJogo", jogo: ctx.saida });
      if (movido.jogoOrigem !== ctx.saida) marcas.push({ tipo: "nascidoEm", jogo: movido.jogoOrigem });
    }
    if (ctx.saida !== null && ctx.naoVaiAoHome.has(`${ctx.saida}:${forma.id}`)) marcas.push({ tipo: "naoVaiAoHome" });
    if (estadoDaVaga(ctx.estados, forma.id, trilha) === "no_home") marcas.push({ tipo: "jaNoHome" });
    linhas.push({
      chave,
      forma,
      shiny: item.shiny,
      destino: ctx.posicoes[trilha].get(forma.id) ?? null,
      marcas,
      impede: marcas.some((m) => MARCAS_QUE_IMPEDEM.has(m.tipo)),
    });
  }
  return linhas.sort((a, b) => Number(b.impede) - Number(a.impede) || compararDestino(a, b));
}

/** Por que "Enviar" está travado, na ordem em que a pessoa resolve; nulo quando pode enviar. */
export type MotivoBloqueio =
  | { tipo: "loteVazio" }
  | { tipo: "acimaDoTeto"; excesso: number }
  | { tipo: "escolhaSaida" }
  | { tipo: "impedidos"; quantidade: number };

export function motivoDoBloqueio(
  linhas: readonly { impede: boolean }[],
  saida: string | null,
  maximo: number,
): MotivoBloqueio | null {
  if (linhas.length === 0) return { tipo: "loteVazio" };
  if (linhas.length > maximo) return { tipo: "acimaDoTeto", excesso: linhas.length - maximo };
  if (saida === null) return { tipo: "escolhaSaida" };
  const impedidos = linhas.filter((l) => l.impede).length;
  return impedidos > 0 ? { tipo: "impedidos", quantidade: impedidos } : null;
}

/**
 * A saída que vale agora: a escolhida nesta visita vence a lembrada no
 * aparelho, e as duas só valem se ainda forem opção (um jogo parado sai da
 * lista, e a rota o recusaria).
 */
export function saidaValida(escolhida: string | null, lembrada: string | null, opcoes: readonly string[]): string | null {
  const candidata = escolhida ?? lembrada;
  return candidata !== null && opcoes.includes(candidata) ? candidata : null;
}
