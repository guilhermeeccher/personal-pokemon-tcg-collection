/**
 * A marcação de compra da aba "O que falta" (pacote 1e) — as decisões, sem
 * React e sem rede, para serem testadas sem banco.
 *
 * Tudo aqui escreve pela **mesma rota da v1**,
 * `PATCH /api/colecoes/:id/opcoes-compra/selecao`, com os mesmos corpos:
 * `{ cartas: [{ chave, cartaId }], selecionada }` na fonte Cardmarket (a
 * carta do catálogo, presa à vaga) e `{ ids, selecionada }` na Liga (a opção
 * de uma varredura salva) ou para desmarcar uma escolha pelo id dela. Nenhuma
 * regra muda: o sistema mostra, ordena e propõe; quem marca é o usuário
 * (regra 5), e a escolha mora em `escolha_compra`, presa à vaga, durável
 * (seção "Buy triage" do `AGENTS.md`).
 *
 * ## O toque (decisão 2 do README da v2)
 *
 * - **Set:** o toque marca a carta da vaga, e tocar de novo a tira. A vaga com
 *   duas ou mais escolhas não se resolve num toque: abre as opções, onde cada
 *   uma sai pelo nome e "Limpar a vaga" é ação nomeada.
 * - **Pokédex:** o toque abre as opções da vaga (a vaga é uma espécie, várias
 *   cartas servem — regra 3), lidas sob demanda.
 * - **Vaga com cópia livre:** o toque abre o detalhe, onde se aloca. Ela é a
 *   única vaga vazia que pede outra coisa que comprar; marcar compra nela
 *   continua possível, pelo detalhe.
 *
 * ## Otimista, e sempre conferido
 *
 * Marcar é gesto de lista (a v1 é otimista pelo mesmo motivo): a tela mostra
 * a marca na hora, como uma **pendência** por vaga, e o pedido sai em fila,
 * um de cada vez, na ordem. A pendência só cai quando uma leitura pedida
 * **depois** que o pedido terminou chega (`podarPendencias`): até lá a tela
 * não pisca de volta para o estado velho. Um pedido recusado tira a marca na
 * hora e relê; um pedido que mudou menos linhas do que levou (a vaga foi
 * preenchida em outra aba, a carta deixou de ser candidata) também relê —
 * a rota responde 200 com `alteradas` menor, e isso é a recusa silenciosa
 * que a tela precisa dizer.
 */

import type { FontePreco } from "@/lib/dominio/fonte-preco";
import type { TipoColecao } from "@/lib/dominio/parametro-colecao";
import type {
  AlvoDaOpcaoV2DTO,
  EscolhaDaVagaFaltaV2DTO,
  ListaDeCompraV2DTO,
  OpcaoFaltaV2DTO,
  VagaFaltaV2DTO,
} from "@/lib/dominio/tipos-cliente";

/* ------------------------------------------------------------ Corpos */

/** O corpo de `PATCH .../opcoes-compra/selecao`, nas duas formas que a rota aceita. */
export type CorpoSelecao =
  | { ids: string[]; selecionada: boolean }
  | { cartas: { chave: string; cartaId: string }[]; selecionada: boolean };

/** O teto da rota por pedido de cartas (`MAXIMO_CARTAS_POR_PEDIDO` da rota de seleção). */
export const MAXIMO_POR_PEDIDO = 1100;

/**
 * O corpo que marca ou desmarca uma opção (`alvo` da leitura do 1a). A
 * escolha avulsa — de uma varredura antiga, que nenhuma candidata explica —
 * só se desmarca: marcá-la não tem corpo.
 */
export function corpoDoAlvo(alvo: AlvoDaOpcaoV2DTO, selecionada: boolean): CorpoSelecao | null {
  switch (alvo.tipo) {
    case "candidata":
      return { cartas: [{ chave: alvo.chave, cartaId: alvo.cartaId }], selecionada };
    case "opcaoLiga":
      return { ids: [alvo.id], selecionada };
    case "escolha":
      return selecionada ? null : { ids: [alvo.escolhaId], selecionada: false };
  }
}

/** Quantas linhas o corpo pede para mudar (sem repetição). */
export function tamanhoDoCorpo(c: CorpoSelecao): number {
  return "ids" in c ? c.ids.length : c.cartas.length;
}

/**
 * Junta vários corpos no menor número de pedidos: um por forma (`ids` ou
 * `cartas`) e por sentido (marcar ou desmarcar), sem repetir item e em
 * fatias de `MAXIMO_POR_PEDIDO` — "marcar a melhor de cada vaga" de uma
 * Pokédex nacional cabe em um.
 */
export function juntarCorpos(corpos: readonly CorpoSelecao[]): CorpoSelecao[] {
  const ids = new Map<boolean, Set<string>>();
  const cartas = new Map<boolean, Map<string, { chave: string; cartaId: string }>>();
  for (const c of corpos) {
    if ("ids" in c) {
      const s = ids.get(c.selecionada) ?? new Set<string>();
      for (const id of c.ids) s.add(id);
      ids.set(c.selecionada, s);
    } else {
      const m = cartas.get(c.selecionada) ?? new Map<string, { chave: string; cartaId: string }>();
      for (const x of c.cartas) m.set(`${x.chave}|${x.cartaId}`, x);
      cartas.set(c.selecionada, m);
    }
  }
  const saida: CorpoSelecao[] = [];
  // Desmarcar antes de marcar: um lote que tira e põe na mesma vaga termina
  // com o que foi posto.
  for (const selecionada of [false, true]) {
    const i = [...(ids.get(selecionada) ?? [])];
    for (let k = 0; k < i.length; k += MAXIMO_POR_PEDIDO) saida.push({ ids: i.slice(k, k + MAXIMO_POR_PEDIDO), selecionada });
    const c = [...(cartas.get(selecionada)?.values() ?? [])];
    for (let k = 0; k < c.length; k += MAXIMO_POR_PEDIDO) saida.push({ cartas: c.slice(k, k + MAXIMO_POR_PEDIDO), selecionada });
  }
  return saida;
}

/* ------------------------------------------------------- Pendências */

/** Uma marca que a tela já mostra e o servidor ainda não confirmou por uma leitura. */
export interface Pendencia {
  /** A ordem do gesto: uma leitura pedida depois que o pedido dele terminou a confirma. */
  seq: number;
  /** Como a vaga aparece: na lista ou fora dela. */
  selecionada: boolean;
  /** O que foi pedido, e o que o desfaz (nulo quando não há como refazer sem reler). */
  corpo: CorpoSelecao;
  desfazer: CorpoSelecao | null;
  /** O preço conhecido da carta que entra ou sai, para o total da barra. */
  preco: number | null;
  /** Se a vaga estava na lista pela última leitura — o que o resumo compara. */
  antes: boolean;
}

export type Pendencias = ReadonlyMap<string, Pendencia>;

/** A vaga está na lista? A pendência vence a leitura; sem leitura da falta, as escolhas da grade. */
export function naListaDaVaga(
  falta: Pick<VagaFaltaV2DTO, "escolhas"> | undefined,
  escolhasNaGrade: number,
  pendente: Pendencia | undefined,
): boolean {
  if (pendente) return pendente.selecionada;
  return (falta ? falta.escolhas.length : escolhasNaGrade) > 0;
}

/**
 * Põe (ou troca) a pendência de uma vaga. Uma pendência sobre outra guarda o
 * `antes` da primeira: ele é o estado da última leitura, não o da tela.
 */
export function comPendencia(
  pendencias: Pendencias,
  vagaId: string,
  nova: Omit<Pendencia, "antes">,
  naListaPelaLeitura: boolean,
): Map<string, Pendencia> {
  const saida = new Map(pendencias);
  const anterior = pendencias.get(vagaId);
  saida.set(vagaId, { ...nova, antes: anterior ? anterior.antes : naListaPelaLeitura });
  return saida;
}

/** Tira as pendências que uma leitura nova já reflete: as de pedidos terminados antes de ela sair. */
export function podarPendencias(pendencias: Pendencias, confirmadasAte: number): Map<string, Pendencia> {
  const saida = new Map<string, Pendencia>();
  for (const [vagaId, p] of pendencias) if (p.seq > confirmadasAte) saida.set(vagaId, p);
  return saida;
}

/**
 * Desfaz um gesto que não foi confirmado (o arrasto que o navegador
 * cancelou): cada vaga que ele tocou volta à pendência que tinha antes dele,
 * ou a nenhuma. Nada foi enviado, então nada há a desfazer no servidor.
 *
 * A pendência de antes só volta se ainda estiver viva (`viva(seq)`): uma
 * leitura que chegou durante o gesto pode tê-la refletido, uma recusa a
 * derrubado, ou a fila a descartado; ressuscitá-la deixaria a vaga
 * "salvando" para sempre.
 */
export function restaurarPendencias(
  pendencias: Pendencias,
  antes: ReadonlyMap<string, Pendencia | undefined>,
  viva: (seq: number) => boolean,
): Map<string, Pendencia> {
  const saida = new Map(pendencias);
  for (const [vagaId, anterior] of antes) {
    if (anterior && viva(anterior.seq)) saida.set(vagaId, anterior);
    else saida.delete(vagaId);
  }
  return saida;
}

/**
 * Depois de uma leitura nova, cada pendência que sobrou passa a se comparar
 * com ela: `antes` vira o que a leitura diz da vaga. Sem isto, um toque
 * refletido e um segundo, inverso, ainda pendente fariam a barra contar uma
 * carta a mais.
 */
export function rebasearPendencias(pendencias: Pendencias, naListaPelaLeitura: (vagaId: string) => boolean): Map<string, Pendencia> {
  const saida = new Map<string, Pendencia>();
  for (const [vagaId, p] of pendencias) saida.set(vagaId, { ...p, antes: naListaPelaLeitura(vagaId) });
  return saida;
}

/** Tira as pendências de gestos que nunca saíram (descartados na fila por uma recusa anterior). */
export function semGestos(pendencias: Pendencias, seqs: readonly number[]): Map<string, Pendencia> {
  const descartados = new Set(seqs);
  const saida = new Map<string, Pendencia>();
  for (const [vagaId, p] of pendencias) if (!descartados.has(p.seq)) saida.set(vagaId, p);
  return saida;
}

/** O resumo da barra: o da última leitura, mais o que as pendências mudam. */
export function resumoComPendencias(
  lista: Pick<ListaDeCompraV2DTO, "selecionadas" | "total"> | null,
  pendencias: Pendencias,
): { cartas: number; total: number; pendentes: number } {
  let cartas = lista?.selecionadas ?? 0;
  let total = lista?.total ?? 0;
  let pendentes = 0;
  for (const p of pendencias.values()) {
    pendentes++;
    if (p.selecionada === p.antes) continue;
    cartas += p.selecionada ? 1 : -1;
    if (p.preco !== null) total += p.selecionada ? p.preco : -p.preco;
  }
  // Centavos inteiros: somar e subtrair reais em ponto flutuante deixa resto.
  return { cartas: Math.max(0, cartas), total: Math.max(0, Math.round(total * 100) / 100), pendentes };
}

/* ------------------------------------------------------------ Toque */

/** O que um toque (ou Enter) na carta da vaga faz. */
export type AcaoDoToque =
  /** A leitura da falta ainda não chegou, ou a pendência não tem como ser desfeita sem reler. */
  | { tipo: "esperar" }
  | { tipo: "abrirDetalhe" }
  | { tipo: "abrirOpcoes" }
  | { tipo: "marcar" | "desmarcar"; corpo: CorpoSelecao; desfazer: CorpoSelecao | null; preco: number | null };

export interface VagaDoToque {
  tipo: TipoColecao;
  fonte: FontePreco;
  chave: string;
  /** Cópias livres que cabem na vaga (`livres` da grade). */
  livres: number;
  /** A carta esperada da vaga de set (`carta.cartaId` da grade); nula na Pokédex. */
  cartaDaVaga: string | null;
  /** A vaga na leitura `GET .../falta`; ausente enquanto ela não chega. */
  falta: VagaFaltaV2DTO | undefined;
  pendente: Pendencia | undefined;
}

export function acaoDoToque(v: VagaDoToque): AcaoDoToque {
  if (!v.falta) return { tipo: "esperar" };
  if (v.livres > 0) return { tipo: "abrirDetalhe" };
  if (v.tipo !== "set") return { tipo: "abrirOpcoes" };

  // Tocar de novo enquanto o primeiro toque não foi relido: desfaz o que ele fez.
  if (v.pendente) {
    const p = v.pendente;
    if (!p.desfazer) return { tipo: "esperar" };
    return { tipo: p.selecionada ? "desmarcar" : "marcar", corpo: p.desfazer, desfazer: p.corpo, preco: p.preco };
  }

  const escolhas = v.falta.escolhas;
  if (escolhas.length === 1) return desmarcarEscolha(v, escolhas[0]);
  if (escolhas.length > 1) return { tipo: "abrirOpcoes" };
  // Nada oferecido (fora do catálogo, sem varredura, escondida pelo teto ou
  // sem estoque): as opções dizem por quê.
  if (v.falta.opcoes === 0) return { tipo: "abrirOpcoes" };

  const proposta = v.falta.proposta;
  if (proposta) return marcarOpcao(proposta);
  // Cardmarket antes da busca de preços: a vaga de set tem uma carta só, e o
  // toque é a escolha manual dela — o preço existe para escolher entre várias.
  if (v.fonte === "cardmarket" && v.cartaDaVaga !== null) {
    const corpo: CorpoSelecao = { cartas: [{ chave: v.chave, cartaId: v.cartaDaVaga }], selecionada: true };
    return { tipo: "marcar", corpo, desfazer: { ...corpo, selecionada: false }, preco: null };
  }
  return { tipo: "abrirOpcoes" };
}

function marcarOpcao(o: OpcaoFaltaV2DTO): AcaoDoToque {
  const corpo = corpoDoAlvo(o.alvo, true);
  if (!corpo) return { tipo: "abrirOpcoes" };
  return { tipo: "marcar", corpo, desfazer: corpoDoAlvo(o.alvo, false), preco: o.preco?.valor ?? null };
}

function desmarcarEscolha(v: VagaDoToque, e: EscolhaDaVagaFaltaV2DTO): AcaoDoToque {
  const corpo: CorpoSelecao = { ids: [e.escolhaId], selecionada: false };
  // Refazer precisa do que marca: no Cardmarket, a carta da vaga; na Liga, a
  // opção da varredura, que a escolha não diz — aí o segundo toque espera a
  // releitura, que traz a proposta de volta.
  const desfazer: CorpoSelecao | null =
    v.fonte === "cardmarket" && e.cartaId !== null
      ? { cartas: [{ chave: v.chave, cartaId: e.cartaId }], selecionada: true }
      : null;
  return { tipo: "desmarcar", corpo, desfazer, preco: e.preco?.valor ?? null };
}

/** O arrasto aplica um sentido só, o da primeira carta: as outras só entram se o toque nelas faria o mesmo. */
export function acaoDoArrasto(marcando: boolean, acao: AcaoDoToque): Extract<AcaoDoToque, { corpo: CorpoSelecao }> | null {
  if (acao.tipo === "marcar" && marcando) return acao;
  if (acao.tipo === "desmarcar" && !marcando) return acao;
  return null;
}

/* ------------------------------------------- "Marcar a melhor de cada vaga" */

export interface ItemDoAtalho {
  vagaId: string;
  opcao: OpcaoFaltaV2DTO;
}

export interface PlanoDoAtalho {
  itens: ItemDoAtalho[];
  /** Por que as outras vagas ficam de fora — o que a tela diz antes de confirmar. */
  fora: { jaTemEscolha: number; semPreco: number; semOpcao: number; pendentes: number };
  corpos: CorpoSelecao[];
}

/**
 * O que o atalho marcaria, vaga a vaga: a `proposta` da leitura (a primeira
 * opção na ordem do critério, com preço, só em vaga sem escolha — a regra da
 * v1 mais a trava `jaTemEscolha`, decidida no 1a). Uma vaga com marca ainda
 * pendente fica de fora: o estado dela ainda não foi relido.
 *
 * É só o plano: a tela o mostra com o critério e a carta de cada vaga, e só o
 * clique de confirmar envia (regra 5).
 */
export function planoDoAtalho(vagas: readonly VagaFaltaV2DTO[], pendencias: Pendencias): PlanoDoAtalho {
  const itens: ItemDoAtalho[] = [];
  const fora = { jaTemEscolha: 0, semPreco: 0, semOpcao: 0, pendentes: 0 };
  const corpos: CorpoSelecao[] = [];
  for (const v of vagas) {
    if (pendencias.has(v.vagaId)) {
      fora.pendentes++;
      continue;
    }
    const corpo = v.proposta ? corpoDoAlvo(v.proposta.alvo, true) : null;
    if (!v.proposta || !corpo) {
      const motivo = v.semProposta ?? "semOpcao";
      fora[motivo]++;
      continue;
    }
    itens.push({ vagaId: v.vagaId, opcao: v.proposta });
    corpos.push(corpo);
  }
  return { itens, fora, corpos: juntarCorpos(corpos) };
}

/* ------------------------------------------------------------ Resposta */

/** O que fazer com a resposta de um pedido de marcação. */
export type DesfechoDaSelecao =
  | { tipo: "ok" }
  /** Passou, mas mudou menos do que pediu: a vaga ou a carta mudou por baixo. */
  | { tipo: "parcial" }
  /** `rede`: o pedido nem chegou (a tela o diz; `desfechoDaSelecao` nunca o devolve). */
  | { tipo: "recusada"; motivo: "colecao" | "pedido" | "servidor" | "rede" };

/**
 * A rota de seleção ainda responde as recusas em texto (`{ erro }`), não por
 * chave: a tela traduz pelo status. 404 é a coleção que sumiu; 400 é um
 * pedido que o estado de agora não aceita (marcar na Liga sem varredura, um
 * corpo que não serve mais); o resto é falha. Todas relêem.
 */
export function desfechoDaSelecao(status: number, alteradas: number | null, esperadas: number): DesfechoDaSelecao {
  if (status === 404) return { tipo: "recusada", motivo: "colecao" };
  if (status >= 400 && status < 500) return { tipo: "recusada", motivo: "pedido" };
  if (status < 200 || status >= 300 || alteradas === null) return { tipo: "recusada", motivo: "servidor" };
  return alteradas < esperadas ? { tipo: "parcial" } : { tipo: "ok" };
}
