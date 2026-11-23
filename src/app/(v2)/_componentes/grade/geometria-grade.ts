/**
 * A conta da grade virtual da v2 (`grade-virtual.tsx`). Módulo puro: recebe
 * medidas, devolve medidas. Nada aqui lê o DOM.
 *
 * ## O modelo
 *
 * Todas as células têm o mesmo tamanho: a largura sai da largura do
 * contêiner dividida pelas colunas que cabem (`minCelula` é a menor largura
 * aceita), e a altura é a largura vezes a proporção da carta mais uma altura
 * fixa de legenda. Com célula uniforme, a posição de um item é aritmética
 * (linha = índice ÷ colunas) e a altura total da grade é conhecida sem
 * montar nada — é isso que deixa a janela rolar a lista inteira com só uma
 * faixa de linhas no DOM.
 *
 * ## Por que a rolagem é da janela
 *
 * A v2 rola o documento em toda largura (regra 11 de `rules.md`): no iOS a
 * barra de endereço que recolhe e as áreas seguras seguem a rolagem do
 * documento, e um painel com rolagem própria dentro da página quebraria as
 * duas. A grade mede a própria posição na janela (`topo`, do
 * `getBoundingClientRect`) e calcula a faixa a partir dela.
 *
 * ## O limiar
 *
 * Abaixo de `LIMIAR_VIRTUALIZACAO` itens a grade monta tudo, com a mesma
 * marcação e as mesmas posições (uma árvore só, como pede a regra "One tree,
 * not two"): virtualizar uma lista pequena só troca nós baratos por trabalho
 * de rolagem. O número foi medido, não chutado — a medição, o orçamento e o
 * porquê estão em `docs/design-v2/rules.md`, regra 13.
 */

/**
 * Acima disto a grade monta só a faixa visível. Medido em 2026-11-23 no
 * Chromium com perfil de iPhone e CPU 4× (`rules.md`, regra 13): uma grade
 * montada inteira passa do orçamento de toque (100 ms) entre 400 e 600
 * células; 300 deixa folga para a célula mais pesada (a vaga vazia de set,
 * que carrega a carta esperada apagada).
 */
export const LIMIAR_VIRTUALIZACAO = 300;

/** Linhas montadas além das visíveis, acima e abaixo: a rolagem rápida não mostra buraco. */
export const SOBRA_LINHAS = 3;

/** Proporção da carta (altura ÷ largura), a mesma de `--v2-raio-carta` e da Carta. */
export const PROPORCAO_CARTA = 825 / 600;

export interface MedidasGrade {
  /** Largura útil do contêiner, em px. */
  largura: number;
  /** A menor largura de célula aceita; cabem tantas colunas quanto este valor permitir. */
  minCelula: number;
  /** Altura ÷ largura da área da carta. */
  proporcao?: number;
  /** Altura fixa abaixo da carta (legenda), em px. */
  alturaExtra?: number;
  vaoX: number;
  vaoY: number;
}

export interface Geometria {
  colunas: number;
  larguraCelula: number;
  alturaCelula: number;
  /** Altura de uma linha mais o vão de baixo: o passo de uma linha para a seguinte. */
  passoLinha: number;
  /** Largura da célula mais o vão: o passo de uma coluna para a seguinte. */
  passoColuna: number;
  vaoY: number;
}

export function geometriaDaGrade(m: MedidasGrade): Geometria {
  const largura = Math.max(0, m.largura);
  const colunas = Math.max(1, Math.floor((largura + m.vaoX) / (m.minCelula + m.vaoX)));
  const larguraCelula = Math.max(0, (largura - m.vaoX * (colunas - 1)) / colunas);
  const alturaCelula = larguraCelula * (m.proporcao ?? PROPORCAO_CARTA) + (m.alturaExtra ?? 0);
  return {
    colunas,
    larguraCelula,
    alturaCelula,
    passoLinha: alturaCelula + m.vaoY,
    passoColuna: larguraCelula + m.vaoX,
    vaoY: m.vaoY,
  };
}

export function linhasDaGrade(total: number, g: Geometria): number {
  return Math.ceil(Math.max(0, total) / g.colunas);
}

/** A altura que a grade ocupa no documento, com todas as linhas (montadas ou não). */
export function alturaDaGrade(total: number, g: Geometria): number {
  const linhas = linhasDaGrade(total, g);
  return linhas === 0 ? 0 : linhas * g.passoLinha - g.vaoY;
}

export function posicaoDoItem(indice: number, g: Geometria): { linha: number; coluna: number; x: number; y: number } {
  const linha = Math.floor(indice / g.colunas);
  const coluna = indice % g.colunas;
  return { linha, coluna, x: coluna * g.passoColuna, y: linha * g.passoLinha };
}

/** Os índices montados: `[inicio, fim)`. */
export interface Faixa {
  inicio: number;
  fim: number;
}

/**
 * A faixa de itens a montar.
 *
 * - `topo`: onde a grade começa, relativo ao topo da janela (negativo quando
 *   já rolou para dentro dela).
 * - Abaixo do limiar (ou com `virtualizar` falso), a faixa é a lista inteira.
 * - Com a grade toda fora da tela, a faixa ainda tem as linhas de sobra da
 *   ponta mais próxima: rolar de volta não começa com um buraco.
 */
export function faixaVisivel(p: {
  total: number;
  g: Geometria;
  topo: number;
  alturaJanela: number;
  virtualizar: boolean;
  sobra?: number;
}): Faixa {
  const { total, g } = p;
  if (total <= 0) return { inicio: 0, fim: 0 };
  if (!p.virtualizar) return { inicio: 0, fim: total };
  const sobra = p.sobra ?? SOBRA_LINHAS;
  const linhas = linhasDaGrade(total, g);
  const primeira = Math.floor(-p.topo / g.passoLinha) - sobra;
  const ultima = Math.ceil((p.alturaJanela - p.topo) / g.passoLinha) + sobra;
  const de = Math.min(Math.max(0, primeira), linhas - 1);
  const ate = Math.max(de + 1, Math.min(linhas, ultima));
  return { inicio: de * g.colunas, fim: Math.min(total, ate * g.colunas) };
}

export function deveVirtualizar(total: number, limiar: number = LIMIAR_VIRTUALIZACAO): boolean {
  return total > limiar;
}

/** O item sob um ponto, em coordenadas relativas ao canto da grade; `null` no vão ou fora. */
export function indiceNoPonto(x: number, y: number, total: number, g: Geometria): number | null {
  if (x < 0 || y < 0) return null;
  const coluna = Math.floor(x / g.passoColuna);
  const linha = Math.floor(y / g.passoLinha);
  if (coluna >= g.colunas) return null;
  // No vão entre duas células não há item: um arrasto que passa ali não marca o vizinho.
  if (x - coluna * g.passoColuna > g.larguraCelula) return null;
  if (y - linha * g.passoLinha > g.alturaCelula) return null;
  const indice = linha * g.colunas + coluna;
  return indice < total ? indice : null;
}

export type TeclaGrade = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End" | "PageUp" | "PageDown";

export function ehTeclaGrade(tecla: string): tecla is TeclaGrade {
  return ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(tecla);
}

/**
 * Para onde a tecla leva o foco. Setas andam uma célula ou uma linha; Home e
 * End vão às pontas da lista inteira (não da linha: a grade é uma lista que
 * quebra em linhas, e a pessoa pensa nela como lista); PageUp e PageDown
 * andam as linhas que cabem na janela. Na borda, fica onde está — a seta não
 * dá a volta, que no fim de uma Pokédex de 1.025 levaria ao começo sem aviso.
 */
export function proximoIndice(atual: number, tecla: TeclaGrade, p: { total: number; colunas: number; linhasPorPagina: number }): number {
  const ultimo = p.total - 1;
  if (ultimo < 0) return 0;
  const linhaPagina = Math.max(1, p.linhasPorPagina) * p.colunas;
  const destino = {
    ArrowLeft: atual - 1,
    ArrowRight: atual + 1,
    ArrowUp: atual - p.colunas,
    ArrowDown: atual + p.colunas,
    Home: 0,
    End: ultimo,
    PageUp: atual - linhaPagina,
    PageDown: atual + linhaPagina,
  }[tecla];
  // Seta para baixo na penúltima linha de uma grade incompleta: vai ao último
  // item, em vez de ficar parada sem explicação.
  if (tecla === "ArrowDown" && destino > ultimo && Math.floor(atual / p.colunas) < Math.floor(ultimo / p.colunas)) {
    return ultimo;
  }
  if (destino < 0) return tecla === "PageUp" ? 0 : atual;
  if (destino > ultimo) return tecla === "PageDown" ? ultimo : atual;
  return destino;
}

/**
 * A âncora de uma troca de colunas: o primeiro item cuja linha começa no
 * topo da janela ou abaixo dele, e onde ele está. Mudar de 6 para 3 colunas
 * (girar o celular, trocar o tamanho) muda a altura de tudo acima; sem
 * âncora, a pessoa que estava no nº 600 cairia no nº 300.
 */
export function ancoraDaRolagem(p: { total: number; g: Geometria; topo: number }): { indice: number; deslocamento: number } | null {
  if (p.total <= 0 || p.topo >= 0) return null;
  const linha = Math.min(linhasDaGrade(p.total, p.g) - 1, Math.ceil(-p.topo / p.g.passoLinha));
  const indice = linha * p.g.colunas;
  return { indice, deslocamento: p.topo + linha * p.g.passoLinha };
}

/**
 * O `scrollY` que põe a âncora de volta onde estava, com a geometria nova.
 * `topoNoDocumento` é onde a grade começa no documento (não muda com as
 * colunas: o que está acima dela não é da grade).
 */
export function rolagemDaAncora(p: { indice: number; deslocamento: number; g: Geometria; topoNoDocumento: number }): number {
  const y = posicaoDoItem(p.indice, p.g).y;
  return Math.max(0, p.topoNoDocumento + y - p.deslocamento);
}

/**
 * O `scrollY` que mostra um item inteiro, mexendo o mínimo: se já está à
 * vista, não rola; acima, alinha o topo dele com `margemTopo` (a barra fixa
 * de cima, se houver); abaixo, alinha a base com `alturaJanela - margemBase`
 * (a barra de abas no celular).
 */
export function rolagemParaMostrar(p: {
  indice: number;
  g: Geometria;
  topoNoDocumento: number;
  rolagemAtual: number;
  alturaJanela: number;
  margemTopo?: number;
  margemBase?: number;
}): number {
  const topoItem = p.topoNoDocumento + posicaoDoItem(p.indice, p.g).y;
  const baseItem = topoItem + p.g.alturaCelula;
  const margemTopo = p.margemTopo ?? 0;
  const margemBase = p.margemBase ?? 0;
  const visivelDe = p.rolagemAtual + margemTopo;
  const visivelAte = p.rolagemAtual + p.alturaJanela - margemBase;
  if (topoItem >= visivelDe && baseItem <= visivelAte) return p.rolagemAtual;
  if (topoItem < visivelDe) return Math.max(0, topoItem - margemTopo);
  return Math.max(0, baseItem - p.alturaJanela + margemBase);
}
