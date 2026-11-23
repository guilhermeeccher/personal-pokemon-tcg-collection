/**
 * As regras puras da tela de opções de compra da v2 (`/colecoes/[id]/opcoes-compra`,
 * pacote 4a): o que a tela decide sozinha, sem banco e sem React, para ser
 * testado.
 *
 * A tela lê **sempre o snapshot** de `GET /api/colecoes/:id/opcoes-compra`, a
 * rota da v1, sem mudança; quem fala com a Liga ou com a TCGdex é a rodada que
 * o botão dispara (`POST` na mesma rota), no ritmo que o servidor decide.
 * Nada aqui aumenta esse ritmo: o período de leitura sai do intervalo
 * (`periodoDeLeituraMs`), e a leitura é ao nosso banco.
 *
 * Os tipos `…DTO` descrevem a resposta do GET como a tela a lê. São os da v1,
 * reescritos aqui porque a v2 não importa nada de `src/app/(v1)/`.
 */

import { compararChavesVaga } from "@/lib/dominio/chave-vaga-set";
import { filtrarCandidatas } from "@/lib/dominio/candidatas-compra";
import { FAIXA_REGIAO, regiaoDoNumero, type Regiao } from "@/lib/dominio/escopo-pokedex";
import type { FontePreco } from "@/lib/dominio/fonte-preco";
import { FILTROS_PADRAO, FILTROS_PADRAO_SET, type Filtros, type Ordenacao } from "@/lib/dominio/liga-opcoes";
import type { OrigemImagem } from "@/lib/dominio/origem-imagem";
import type { CriterioValorCardmarket } from "@/lib/dominio/preco-cardmarket";
import { periodoDeAtualizacaoMs, type RitmoDTO } from "@/lib/dominio/precos-v2";
import type { AbaListaLigaV2DTO } from "@/lib/dominio/tipos-cliente";

import { type CorpoSelecao, juntarCorpos } from "../../_componentes/compra-falta";

/* ------------------------------------------------------------ A resposta */

export type TipoComVaga = "pokedex" | "set";

/** De onde saiu o valor de referência de uma candidata (fonte Cardmarket). */
export interface PrecoCardmarketDTO {
  valorEur: number | null;
  criterioValor: CriterioValorCardmarket | null;
  /** Só quando a tendência foi trocada pela média de 30 dias. */
  tendenciaEur?: number | null;
  cotacao: number | null;
  cotacaoData: string | null;
}

/**
 * Uma opção de uma vaga. Na fonte Cardmarket o servidor manda só o que a tela
 * lê (milhares de candidatas numa Pokédex): os campos opcionais vêm só da
 * varredura da Liga, e o `caminho` da candidata a tela monta do nome.
 */
export interface OpcaoDTO {
  id: string;
  chave: string;
  nome: string;
  edicaoSigla?: string;
  edicaoNome: string;
  numero: string;
  total: string | null;
  /** Nulo só na fonte Cardmarket: preço ainda não buscado, ou sem preço lá. */
  preco: number | null;
  raridade: string | null;
  cartaId: string | null;
  caminho?: string;
  selecionada: boolean;
  /** A Liga devolveu esta carta como sem estoque; só chega à tela quando está selecionada. */
  semEstoque: boolean;
  /** `null` na carta fora do nosso catálogo: não fazemos hotlink da foto deles. */
  imagemUrl: string | null;
  imagemOrigem: OrigemImagem | null;
  /** Cardmarket: o nome na ficha de exibição, quando difere do da Liga. */
  nomeExibicao?: string | null;
  /** Cardmarket: a escolha que nenhuma candidata explica (de uma varredura antiga), que só se desmarca. */
  escolhaId?: string | null;
  /** Cardmarket: a última pergunta ao Cardmarket, quando ele não tinha preço. */
  consultadaEm?: string | null;
  cardmarket?: PrecoCardmarketDTO | null;
}

export interface VagaDTO {
  chave: string;
  /** A espécie, na Pokédex; o nome da carta, no set. */
  rotulo: string;
  /** Nome do set da carta, em coleção de set. */
  setNome?: string | null;
  dex: number | null;
  opcoes: OpcaoDTO[];
  descartadas: number;
  /** Opções escondidas por estarem registradas como sem estoque na Liga. */
  semEstoque: number;
}

export interface VarreduraDTO {
  id: string;
  filtros: Filtros;
  vagasConsultadas: number;
  requisicoes: number;
  concluidaEm: string | null;
  erro: string | null;
  criadoEm: string;
  emAndamento: boolean;
  vagasRestantes: number | null;
  segundosRestantes: number | null;
  previsaoTermino: string | null;
}

export interface RodadaCandidatasDTO {
  id: string;
  totalCartas: number;
  cartasConsultadas: number;
  cartasComFalha: number;
  requisicoes: number;
  concluidaEm: string | null;
  erro: string | null;
  criadoEm: string;
  emAndamento: boolean;
  segundosRestantes: number | null;
}

export interface RespostaOpcoesDTO {
  tipo: TipoComVaga | "customizada";
  /** A fonte de preço da instalação (`PRECO_FONTE`); a resposta da Liga pode não trazê-la. */
  fonte?: FontePreco;
  rodada?: RodadaCandidatasDTO | null;
  precosCandidatas?: {
    cartas: number;
    comPreco: number;
    semPrecoNoCardmarket: number;
    aBuscar: number;
    validadeDias: number;
  };
  ritmo: RitmoDTO;
  varredura: VarreduraDTO | null;
  vagas: VagaDTO[];
  selecionadas: number;
  guardadas: number;
  abasLiga: AbaListaLigaV2DTO[];
  multiplas: Array<{ chave: string; rotulo: string; quantidade: number }>;
  total: number;
  semPreco: number;
  precoMaisAntigo: string | null;
}

/** A fonte que a resposta diz ter; sem o campo, é a Liga (a resposta de antes da escolha). */
export function fonteDasOpcoes(r: Pick<RespostaOpcoesDTO, "fonte">): FontePreco {
  return r.fonte === "cardmarket" ? "cardmarket" : "liga";
}

/* ------------------------------------------------------------ A leitura */

/**
 * A busca de preços das candidatas dura minutos, uma carta por fração de
 * segundo, e a leitura desta tela é pesada (milhares de candidatas numa
 * Pokédex): 10 s mostra a grade se preenchendo sem pesar. É o valor da v1
 * nesta tela, dentro da faixa da regra (5 a 60 s).
 */
export const PERIODO_CANDIDATAS_MS = 10_000;

/**
 * De quanto em quanto tempo a tela relê o snapshot enquanto há rodada viva.
 * Na Liga, `clamp(intervalo × 250 ms, 5 s, 60 s)` (`periodoDeAtualizacaoMs`,
 * o mesmo da tela de preços): **nunca um número fixo**, porque a janela que
 * declara uma rodada morta também sai do intervalo, e o caminho da Liga não
 * ganha constante de tempo própria (AGENTS.md, "Nothing may double the pace
 * behind our back"). No Cardmarket não há intervalo de `robots.txt` a seguir.
 */
export function periodoDeLeituraMs(dados: Pick<RespostaOpcoesDTO, "fonte" | "ritmo">): number {
  if (fonteDasOpcoes(dados) === "cardmarket") return PERIODO_CANDIDATAS_MS;
  return periodoDeAtualizacaoMs(dados.ritmo);
}

/** Há uma rodada viva a acompanhar — a varredura da Liga ou a busca de preços desta coleção. */
export function rodadaViva(dados: Pick<RespostaOpcoesDTO, "varredura" | "rodada">): boolean {
  return (dados.varredura?.emAndamento ?? false) || (dados.rodada?.emAndamento ?? false);
}

/** Os parâmetros que a tela começa mostrando: o set não tem teto e ordena por preço (`FILTROS_PADRAO_SET`). */
export function filtrosIniciais(tipo: RespostaOpcoesDTO["tipo"]): Filtros {
  return tipo === "set" ? FILTROS_PADRAO_SET : FILTROS_PADRAO;
}

/* ------------------------------------------------------------ Os parâmetros */

/**
 * O teto digitado: vazio é sem teto; vírgula vale como ponto. Inválido
 * (não número, zero, negativo) é `valido: false` — a varredura da Liga se
 * recusa a sair com ele, e o filtro da tela o trata como sem teto.
 */
export function lerTeto(texto: string): { valido: boolean; valor: number | null } {
  const limpo = texto.trim();
  if (limpo === "") return { valido: true, valor: null };
  const n = Number(limpo.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? { valido: true, valor: n } : { valido: false, valor: null };
}

/** O corpo do `POST` da varredura da Liga — o da v1. `validadeHoras: 0` desliga o pulo por frescor. */
export function corpoDaVarredura(p: {
  teto: number | null;
  ordenacao: Ordenacao;
  incluirFora: boolean;
  reconsultarTudo: boolean;
}): Record<string, unknown> {
  return {
    tetoPreco: p.teto,
    ordenacao: p.ordenacao,
    incluirForaDoCatalogo: p.incluirFora,
    ...(p.reconsultarTudo ? { validadeHoras: 0 } : {}),
  };
}

/** O corpo do `POST` da busca de preços das candidatas — o da v1. */
export function corpoDaBuscaDePrecos(reconsultarTudo: boolean): Record<string, unknown> {
  return reconsultarTudo ? { validadeHoras: 0 } : {};
}

/* ------------------------------------------------------------ Pendências */

/**
 * Uma marca que a tela já mostra e que nenhuma leitura confirmou ainda, por
 * opção (várias por vaga são permitidas). Some quando chega uma leitura
 * pedida **depois** que o pedido dela terminou (`podarPendencias`), e com
 * qualquer recusa.
 */
export interface PendenciaOpcao {
  seq: number;
  selecionada: boolean;
}

export type PendenciasOpcao = ReadonlyMap<string, PendenciaOpcao>;

/** As vagas com a marca otimista de cada opção pendente por cima da leitura. */
export function comPendencias(vagas: readonly VagaDTO[], pendencias: PendenciasOpcao): VagaDTO[] {
  if (pendencias.size === 0) return [...vagas];
  return vagas.map((v) =>
    v.opcoes.some((o) => pendencias.has(o.id))
      ? {
          ...v,
          opcoes: v.opcoes.map((o) => {
            const p = pendencias.get(o.id);
            return p ? { ...o, selecionada: p.selecionada } : o;
          }),
        }
      : v,
  );
}

/** Tira as pendências que uma leitura já reflete: as de pedidos terminados antes de ela sair. */
export function podarPendencias(pendencias: PendenciasOpcao, confirmadasAte: number): Map<string, PendenciaOpcao> {
  const saida = new Map<string, PendenciaOpcao>();
  for (const [id, p] of pendencias) if (p.seq > confirmadasAte) saida.set(id, p);
  return saida;
}

/** Tira as pendências dos gestos que a fila descartou (nunca saíram). */
export function semSeqs(pendencias: PendenciasOpcao, seqs: readonly number[]): Map<string, PendenciaOpcao> {
  const fora = new Set(seqs);
  const saida = new Map<string, PendenciaOpcao>();
  for (const [id, p] of pendencias) if (!fora.has(p.seq)) saida.set(id, p);
  return saida;
}

/**
 * O resumo da barra com as pendências: a contagem e o total da última
 * leitura, mais o que cada marca otimista muda em relação a ela. O total é
 * em centavos inteiros (somar reais em ponto flutuante deixa resto). Uma
 * opção que a leitura não traz mais (a vaga foi preenchida) não conta.
 */
export function resumoComPendencias(
  dados: Pick<RespostaOpcoesDTO, "selecionadas" | "total" | "vagas">,
  pendencias: PendenciasOpcao,
): { cartas: number; total: number } {
  let cartas = dados.selecionadas;
  let centavos = Math.round(dados.total * 100);
  if (pendencias.size > 0) {
    for (const v of dados.vagas) {
      for (const o of v.opcoes) {
        const p = pendencias.get(o.id);
        if (!p || p.selecionada === o.selecionada) continue;
        cartas += p.selecionada ? 1 : -1;
        if (o.preco !== null) centavos += (p.selecionada ? 1 : -1) * Math.round(o.preco * 100);
      }
    }
  }
  return { cartas: Math.max(0, cartas), total: Math.max(0, centavos) / 100 };
}

/* ------------------------------------------------------------ A marcação */

/**
 * O corpo de `PATCH …/opcoes-compra/selecao` que marca ou desmarca uma
 * opção — o da v1. Na Liga, a opção da varredura (`{ ids }`); no Cardmarket,
 * a carta do catálogo presa à vaga (`{ cartas: [{ chave, cartaId }] }`); a
 * escolha avulsa, só para desmarcar, pelo id dela. `null` quando o gesto não
 * tem corpo (marcar de novo uma escolha avulsa, uma candidata sem carta).
 */
export function corpoDaMarcacao(opcao: OpcaoDTO, fonte: FontePreco, selecionada: boolean): CorpoSelecao | null {
  if (fonte !== "cardmarket") return { ids: [opcao.id], selecionada };
  if (opcao.escolhaId) return selecionada ? null : { ids: [opcao.escolhaId], selecionada: false };
  if (opcao.cartaId === null) return null;
  return { cartas: [{ chave: opcao.chave, cartaId: opcao.cartaId }], selecionada };
}

/* ------------------------------------------------------------ A grade da tela */

/**
 * As vagas como a tela as mostra. No Cardmarket o teto e a ordem são filtro
 * da tela, aplicado na hora sobre todas as candidatas (`filtrarCandidatas`):
 * mudar o teto não pede rodada nova, a carta sem preço fica (por último) e a
 * selecionada nunca some. No set a ordem das opções é sempre por preço (há uma
 * carta só). Na Liga as opções chegam como a varredura as deixou, e o teto e a
 * ordem são parâmetros da próxima varredura.
 */
export function vagasDaTela(
  vagas: readonly VagaDTO[],
  {
    fonte,
    tipo,
    teto,
    ordenacao,
  }: { fonte: FontePreco; tipo: RespostaOpcoesDTO["tipo"]; teto: number | null; ordenacao: Ordenacao },
): VagaDTO[] {
  if (fonte !== "cardmarket") return [...vagas];
  return vagas.map((v) => ({
    ...v,
    ...filtrarCandidatas(v.opcoes, { tetoPreco: teto, ordenacao: tipo === "set" ? "preco" : ordenacao }),
  }));
}

/** Como a lista de vagas de um set é ordenada na tela. */
export type OrdemVagasSet = "numero" | "preco";

/** O menor preço da vaga, ou `null` quando ela não tem oferta com preço. */
export function menorPreco(vaga: Pick<VagaDTO, "opcoes">): number | null {
  let menor: number | null = null;
  for (const o of vaga.opcoes) if (o.preco !== null && (menor === null || o.preco < menor)) menor = o.preco;
  return menor;
}

/**
 * As vagas na ordem e no recorte da tela: "só com opção" esconde a vaga sem
 * nenhuma; no set, "mais barata primeiro" põe a vaga sem preço no fim (não no
 * topo, como um R$ 0,00 faria), e o empate cai na ordem impressa.
 */
export function vagasVisiveis(
  vagas: readonly VagaDTO[],
  { soComOpcao, ehSet, ordemVagas }: { soComOpcao: boolean; ehSet: boolean; ordemVagas: OrdemVagasSet },
): VagaDTO[] {
  const filtradas = soComOpcao ? vagas.filter((v) => v.opcoes.length > 0) : [...vagas];
  if (!ehSet || ordemVagas === "numero") return filtradas;
  const porChave = compararChavesVaga();
  return filtradas.sort((a, b) => {
    const pa = menorPreco(a);
    const pb = menorPreco(b);
    if (pa === null && pb === null) return porChave(a.chave, b.chave);
    if (pa === null) return 1;
    if (pb === null) return -1;
    return pa - pb;
  });
}

/** Uma região da Pokédex (ou um set) e as vagas dela, na ordem da tela. */
export interface GrupoVagas {
  /** Chave estável do grupo, para o React e para recolher o grupo. */
  id: string;
  regiao: Regiao | null;
  /** O set, numa coleção que junta sets; nulo nas outras. */
  setNome: string | null;
  vagas: VagaDTO[];
}

/**
 * Agrupa as vagas na ordem em que chegam: por região na Pokédex (a vaga fora
 * da Nacional num grupo à parte); num set, um grupo só, sem título — ou um por
 * set quando a coleção junta sets, na ordem em que cada set aparece primeiro.
 */
export function agruparVagas(vagas: readonly VagaDTO[], ehSet: boolean): GrupoVagas[] {
  if (ehSet) {
    const porSet = new Map<string, VagaDTO[]>();
    for (const v of vagas) {
      const nome = v.setNome ?? "";
      const grupo = porSet.get(nome);
      if (grupo) grupo.push(v);
      else porSet.set(nome, [v]);
    }
    if (porSet.size <= 1) return [{ id: "lista", regiao: null, setNome: null, vagas: [...vagas] }];
    return [...porSet].map(([setNome, doSet]) => ({ id: `set:${setNome}`, regiao: null, setNome, vagas: doSet }));
  }
  const grupos: GrupoVagas[] = [];
  for (const v of vagas) {
    const regiao = v.dex !== null && v.dex >= 1 && v.dex <= FAIXA_REGIAO.paldea.fim ? regiaoDoNumero(v.dex) : null;
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.regiao === regiao) ultimo.vagas.push(v);
    // Uma região que volta depois de outra (a ordem "mais barata") ganha id próprio.
    else grupos.push({ id: `${regiao ?? "fora"}:${grupos.length}`, regiao, setNome: null, vagas: [v] });
  }
  return grupos;
}

/**
 * Quantas vagas montar de uma vez. A lista não é virtualizada: cada vaga tem
 * altura própria (recolhida, aberta com N opções), e a grade virtual da v2
 * exige células uniformes. Montar por partes, com "Mostrar mais", segura o
 * orçamento da regra 13 (uns 2.500 nós e 60 imagens carregadas) numa Pokédex
 * nacional com milhares de candidatas — o mesmo caminho da aba Upgrades.
 */
export const VAGAS_POR_VEZ = 60;
/** Quantas opções de uma vaga aberta montar antes de "Mostrar todas". */
export const OPCOES_POR_VAGA = 6;

/** Corta os grupos para as primeiras `limite` vagas, sem grupo vazio. */
export function cortarGrupos(grupos: readonly GrupoVagas[], limite: number): GrupoVagas[] {
  const saida: GrupoVagas[] = [];
  let resta = Math.max(0, limite);
  for (const g of grupos) {
    if (resta === 0) break;
    const vagas = g.vagas.slice(0, resta);
    resta -= vagas.length;
    saida.push({ ...g, vagas });
  }
  return saida;
}

/* ------------------------------------------------------------ Recolher */

/** Preferência do aparelho (regra 19 de `rules.md`): prefixo `v2-`, nunca a chave da v1. */
export const chaveRecolhidas = (colecaoId: string) => `v2-opcoes-compra-recolhidas:${colecaoId}`;

/** O que foi guardado, ou nada: um valor estragado vale como nenhuma escolha. */
export function lerRecolhidas(bruto: string | null): Record<string, boolean> {
  if (!bruto) return {};
  try {
    const lido: unknown = JSON.parse(bruto);
    if (lido === null || typeof lido !== "object" || Array.isArray(lido)) return {};
    return Object.fromEntries(Object.entries(lido).filter((e): e is [string, boolean] => typeof e[1] === "boolean"));
  } catch {
    return {};
  }
}

/**
 * Padrão de 2026-09-24, o da v1: a vaga com carta selecionada começa
 * recolhida, a vaga sem seleção começa aberta — a tela abre mostrando o que
 * falta triar. Só a escolha explícita do usuário é guardada; a vaga que ele
 * nunca tocou segue o padrão, e muda sozinha quando ganha a primeira marca.
 */
export function estaRecolhida(vaga: VagaDTO, guardadas: Readonly<Record<string, boolean>>): boolean {
  return guardadas[vaga.chave] ?? vaga.opcoes.some((o) => o.selecionada);
}

/* ------------------------------------------------------------ "Marcar a melhor" */

export interface ItemDoPlano {
  vaga: VagaDTO;
  opcao: OpcaoDTO;
}

export interface PlanoMelhor {
  itens: ItemDoPlano[];
  /** Por que as outras vagas ficam de fora — o que a janela diz antes de confirmar. */
  fora: { jaTemEscolha: number; semPreco: number; semOpcao: number; pendentes: number };
  corpos: CorpoSelecao[];
}

/**
 * "Marcar a melhor de cada vaga", como a v1 o faz, só que mostrado antes de
 * enviar (decisão 2): em cada vaga **ainda sem escolha**, a primeira opção na
 * ordem da tela — que já é o critério escolhido (teto e ordem no Cardmarket;
 * os da última varredura na Liga). No Cardmarket, só se essa primeira tiver
 * preço: marcar carta sem preço seria escolher às cegas, e `filtrarCandidatas`
 * já põe as sem preço por último. Uma vaga com marca ainda pendente fica de
 * fora: o estado dela ainda não foi relido.
 *
 * É só o plano: a tela o mostra e só o clique de confirmar envia (regra 5).
 */
export function planoMelhor(vagas: readonly VagaDTO[], fonte: FontePreco, pendencias: PendenciasOpcao): PlanoMelhor {
  const itens: ItemDoPlano[] = [];
  const fora = { jaTemEscolha: 0, semPreco: 0, semOpcao: 0, pendentes: 0 };
  const corpos: CorpoSelecao[] = [];
  for (const v of vagas) {
    if (v.opcoes.some((o) => pendencias.has(o.id))) {
      fora.pendentes++;
      continue;
    }
    if (v.opcoes.length === 0) {
      fora.semOpcao++;
      continue;
    }
    if (v.opcoes.some((o) => o.selecionada)) {
      fora.jaTemEscolha++;
      continue;
    }
    const primeira = v.opcoes[0];
    const corpo = fonte === "cardmarket" && primeira.preco === null ? null : corpoDaMarcacao(primeira, fonte, true);
    if (!corpo) {
      fora.semPreco++;
      continue;
    }
    itens.push({ vaga: v, opcao: primeira });
    corpos.push(corpo);
  }
  return { itens, fora, corpos: juntarCorpos(corpos) };
}
