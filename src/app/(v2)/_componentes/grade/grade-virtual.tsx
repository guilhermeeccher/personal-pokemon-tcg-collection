"use client";

/**
 * `<GradeVirtual>` — a grade de cartas reutilizável da v2 (regra 13 de
 * `docs/design-v2/rules.md`). A coleção a usa no "Set inteiro" e na
 * "Pokédex inteira"; "O que falta" (pacote 1e) e o inventário (2b) a
 * reaproveitam. A interface está documentada em `rules.md`, regra 28; a
 * medição do limiar, na regra 13.
 *
 * ## O que ela garante
 *
 * - **A janela rola, em toda largura.** A grade ocupa no documento a altura
 *   de todas as linhas e monta só a faixa à vista, mais `SOBRA_LINHAS` de
 *   cada lado. Abaixo do limiar medido (`LIMIAR_VIRTUALIZACAO`) monta tudo,
 *   com a mesma marcação e as mesmas posições: uma árvore só.
 * - **Estado não mora na célula.** Seleção, marcas de compra, o que está
 *   aberto — tudo isso é de quem usa a grade, por chave; a célula só
 *   desenha o item que recebe. Uma célula que sai da faixa e volta não perde
 *   nada, porque não tinha nada a perder.
 * - **Teclado.** Uma célula só na ordem do Tab (a ativa); setas, Home/End e
 *   PageUp/PageDown andam pela lista inteira, montando e rolando até a
 *   célula de destino antes de focar. A célula com foco fica montada mesmo
 *   fora da faixa: rolar com a roda não tira o foco de dentro da grade.
 * - **Troca de colunas com âncora.** Girar o celular ou mudar o tamanho das
 *   cartas recalcula as colunas e devolve a rolagem ao mesmo item.
 * - **`manterMontadas`**: chaves que ficam montadas mesmo fora da faixa —
 *   a carta que abriu o detalhe, para a transição de volta ter onde pousar.
 * - **`elementoDe(chave)`**: rola até o item, espera ele montar e o devolve.
 *   É o `devolverFocoPara` de uma camada aberta a partir da grade: o foco
 *   volta à célula certa mesmo quando ela saiu do DOM.
 *
 * ## Orçamento
 *
 * Cada célula é um `div` posicionado por `top`/`left` (sem `transform` nem
 * `will-change`: nenhuma camada de composição por célula, regra 5a). O
 * contêiner não tem `container-type` (regra 5d): a barra de abas e a barra de
 * compra são fixas e ficariam presas a ele.
 */

import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type Faixa,
  type Geometria,
  LIMIAR_VIRTUALIZACAO,
  PROPORCAO_CARTA,
  ancoraDaRolagem,
  alturaDaGrade,
  celulaDeEntrada,
  deveVirtualizar,
  ehTeclaGrade,
  faixaVisivel,
  geometriaDaGrade,
  geometriaMoveLinhas,
  indiceNoPonto,
  posicaoDoItem,
  proximoIndice,
  rolagemDaAncora,
  rolagemParaMostrar,
} from "./geometria-grade";
import { ID_CONTEUDO } from "../primitivos/use-camada";

import estilos from "./grade-virtual.module.css";

/** O atributo que marca o elemento focável de cada célula, com o índice. */
export const ATRIBUTO_CELULA = "data-v2-celula";
/** O atributo da célula (o `listitem`) com a chave do item. */
const ATRIBUTO_CHAVE = "data-v2-chave";

/** O que a célula espalha no elemento focável dela (o botão da carta). */
export interface PropsCelula {
  tabIndex: 0 | -1;
  [ATRIBUTO_CELULA]: number;
}

export interface ControleGradeVirtual {
  /** Rola até mostrar o item inteiro (sem rolar se ele já está à vista). */
  rolarAte: (indice: number) => void;
  /** Rola até o item, espera ele montar e devolve o elemento focável dele. */
  elementoDe: (chave: string) => Promise<HTMLElement | null>;
  /** O índice sob um ponto da janela (`clientX`, `clientY`), ou nulo no vão e fora. */
  indiceNoPonto: (clientX: number, clientY: number) => number | null;
}

export interface PropsGradeVirtual<T> {
  itens: readonly T[];
  chaveDe: (item: T) => string;
  /** Desenha uma célula. Espalhe `celula` no elemento focável (o botão da carta). */
  renderizar: (item: T, celula: PropsCelula, indice: number) => ReactNode;
  /** A menor largura de célula, em px. Mais largura cabe → mais colunas. */
  minCelula: number;
  vaoX?: number;
  vaoY?: number;
  /** Altura ÷ largura da área da carta; o padrão é a proporção da carta. */
  proporcao?: number;
  /** Altura fixa abaixo da carta (legenda), em px. */
  alturaExtra?: number;
  /** Quantos itens a grade monta inteira antes de virtualizar. */
  limiar?: number;
  /** Chaves que ficam montadas mesmo fora da faixa (a carta aberta no detalhe). */
  manterMontadas?: readonly string[];
  /** Nome da lista para o leitor de tela. */
  rotulo: string;
  ref?: Ref<ControleGradeVirtual>;
}

/** Espera o React montar o que mudou e o navegador pintar: dois quadros. */
function doisQuadros(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/**
 * Quanto do pé da janela uma barra fixa cobre: a barra de abas abaixo de
 * 768 px (`--v2-reserva-base` de `v2.css`, lida pronta do `main` da casca,
 * que a usa como respiro de baixo). Sem casca, nada.
 */
function margemDeBaixo(): number {
  const conteudo = document.getElementById(ID_CONTEUDO);
  if (!conteudo) return 0;
  return Number.parseFloat(getComputedStyle(conteudo).paddingBottom) || 0;
}

export function GradeVirtual<T>({
  itens,
  chaveDe,
  renderizar,
  minCelula,
  vaoX = 10,
  vaoY = 12,
  proporcao = PROPORCAO_CARTA,
  alturaExtra = 0,
  limiar = LIMIAR_VIRTUALIZACAO,
  manterMontadas,
  rotulo,
  ref,
}: PropsGradeVirtual<T>) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  const total = itens.length;
  const virtualizar = deveVirtualizar(total, limiar);

  const g: Geometria = useMemo(
    () => geometriaDaGrade({ largura, minCelula, vaoX, vaoY, proporcao, alturaExtra }),
    [largura, minCelula, vaoX, vaoY, proporcao, alturaExtra],
  );
  const [faixa, setFaixa] = useState<Faixa>({ inicio: 0, fim: 0 });
  // O que está de fato à vista (sem as linhas de sobra): é dali que o Tab entra.
  const [visivel, setVisivel] = useState<Faixa>({ inicio: 0, fim: 0 });
  // A célula ativa (a do Tab) pela chave, com o índice de quando foi ativada
  // para o caso de a chave sumir da lista: uma vaga que sai antes dela não
  // pode passar o "ativo" para a vizinha.
  const [ativo, setAtivo] = useState<{ chave: string | null; indice: number }>({ chave: null, indice: 0 });
  const [focoDentro, setFocoDentro] = useState(false);
  // Chaves pedidas por `elementoDe` (o foco que volta de uma camada): montadas até chegarem.
  const [pedidos, setPedidos] = useState<readonly string[]>([]);

  // Os valores mais recentes, para os ouvintes da janela não se refazerem a cada render.
  const estado = useRef({ total, g, virtualizar, itens, chaveDe });
  // A âncora da última rolagem, medida com a geometria de então.
  const ancora = useRef<{ indice: number; deslocamento: number } | null>(null);
  const focoPendente = useRef<number | null>(null);

  /* ---------- Medida e faixa ---------- */

  const recalcular = useCallback(() => {
    const el = contenedor.current;
    if (!el) return;
    const { total: n, g: geo, virtualizar: v } = estado.current;
    const topo = el.getBoundingClientRect().top;
    ancora.current = ancoraDaRolagem({ total: n, g: geo, topo });
    const nova = faixaVisivel({ total: n, g: geo, topo, alturaJanela: window.innerHeight, virtualizar: v });
    setFaixa((atual) => (atual.inicio === nova.inicio && atual.fim === nova.fim ? atual : nova));
    const aVista = faixaVisivel({ total: n, g: geo, topo, alturaJanela: window.innerHeight, virtualizar: true, sobra: 0 });
    setVisivel((atual) => (atual.inicio === aVista.inicio && atual.fim === aVista.fim ? atual : aVista));
  }, []);

  useLayoutEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    setLargura(el.clientWidth);
    const observador = new ResizeObserver(([entrada]) => {
      if (entrada) setLargura(entrada.contentRect.width);
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  // A geometria mudou de um jeito que move as linhas (outras colunas, ou
  // células de outra altura): a âncora volta ao lugar antes de recalcular a
  // faixa. Só com a grade já rolada para dentro.
  const geometriaAntes = useRef(g);
  useLayoutEffect(() => {
    estado.current = { total, g, virtualizar, itens, chaveDe };
    const el = contenedor.current;
    if (el && geometriaMoveLinhas(geometriaAntes.current, g) && ancora.current && largura > 0) {
      const topoNoDocumento = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: rolagemDaAncora({ ...ancora.current, g, topoNoDocumento }), behavior: "instant" });
    }
    geometriaAntes.current = g;
    recalcular();
  }, [total, g, virtualizar, largura, recalcular, itens, chaveDe]);

  useEffect(() => {
    let quadro = 0;
    const agendar = () => {
      if (quadro) return;
      quadro = requestAnimationFrame(() => {
        quadro = 0;
        recalcular();
      });
    };
    window.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar, { passive: true });
    return () => {
      window.removeEventListener("scroll", agendar);
      window.removeEventListener("resize", agendar);
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, [recalcular]);

  /* ---------- O que montar ---------- */

  const indicePorChave = useMemo(() => {
    const mapa = new Map<string, number>();
    itens.forEach((item, i) => mapa.set(chaveDe(item), i));
    return mapa;
  }, [itens, chaveDe]);
  // O mapa mais recente, para `elementoDe` resolver a chave de novo depois de esperar.
  const indicesAgora = useRef(indicePorChave);
  useLayoutEffect(() => {
    indicesAgora.current = indicePorChave;
  });

  // O índice da ativa na lista de agora; se a chave saiu, o mesmo lugar, dentro do fim.
  const ativoValido =
    (ativo.chave !== null ? indicePorChave.get(ativo.chave) : undefined) ?? Math.min(ativo.indice, Math.max(0, total - 1));
  const ativar = useCallback((indice: number) => {
    const item = estado.current.itens[indice];
    setAtivo({ chave: item === undefined ? null : estado.current.chaveDe(item), indice });
  }, []);

  const montados = useMemo(() => {
    const conjunto = new Set<number>();
    for (let i = faixa.inicio; i < Math.min(faixa.fim, total); i++) conjunto.add(i);
    for (const chave of manterMontadas ?? []) {
      const i = indicePorChave.get(chave);
      if (i !== undefined) conjunto.add(i);
    }
    for (const chave of pedidos) {
      const i = indicePorChave.get(chave);
      if (i !== undefined) conjunto.add(i);
    }
    if (focoDentro && total > 0) conjunto.add(ativoValido);
    // Na ordem visual: é a ordem do Tab e a do leitor de tela.
    return [...conjunto].sort((a, b) => a - b);
  }, [faixa, total, manterMontadas, indicePorChave, pedidos, focoDentro, ativoValido]);

  // A célula na ordem do Tab: a ativa, se à vista; senão a primeira à vista
  // (Tab de fora não salta para uma célula que a pessoa já rolou para longe,
  // nem para uma linha de sobra acima da janela).
  const focavel = celulaDeEntrada({ ativo: ativoValido, focoDentro, visivel });

  /* ---------- Rolar e focar ---------- */

  const rolarAte = useCallback((indice: number) => {
    const el = contenedor.current;
    if (!el) return;
    const destino = rolagemParaMostrar({
      indice,
      g: estado.current.g,
      topoNoDocumento: el.getBoundingClientRect().top + window.scrollY,
      rolagemAtual: window.scrollY,
      alturaJanela: window.innerHeight,
      margemBase: margemDeBaixo(),
    });
    if (destino !== window.scrollY) window.scrollTo({ top: destino, behavior: "instant" });
  }, []);

  // Depois de cada render: foca a célula que a tecla pediu, já montada.
  useLayoutEffect(() => {
    const alvo = focoPendente.current;
    if (alvo === null) return;
    const el = contenedor.current?.querySelector<HTMLElement>(`[${ATRIBUTO_CELULA}="${alvo}"]`);
    if (!el) return;
    focoPendente.current = null;
    el.focus({ preventScroll: true });
  });

  /*
   * Monta o item pela chave, rola até ele, espera e devolve o elemento
   * focável. A lista pode mudar durante a espera (a releitura que a escrita
   * pediu chega): o índice é resolvido de novo depois, e o elemento é achado
   * pela chave da célula, nunca pelo índice de antes.
   */
  const elementoDe = useCallback(
    async (chave: string): Promise<HTMLElement | null> => {
      if (!indicesAgora.current.has(chave)) return null;
      setPedidos((atuais) => (atuais.includes(chave) ? atuais : [...atuais, chave]));
      let el: HTMLElement | null = null;
      for (let tentativa = 0; tentativa < 2 && !el; tentativa++) {
        const indice = indicesAgora.current.get(chave);
        if (indice === undefined) break;
        setAtivo({ chave, indice });
        rolarAte(indice);
        await doisQuadros();
        el =
          contenedor.current
            ?.querySelector(`[${ATRIBUTO_CHAVE}="${CSS.escape(chave)}"]`)
            ?.querySelector<HTMLElement>(`[${ATRIBUTO_CELULA}]`) ?? null;
      }
      setPedidos((atuais) => atuais.filter((c) => c !== chave));
      return el;
    },
    [rolarAte],
  );

  useImperativeHandle(
    ref,
    () => ({
      rolarAte,
      elementoDe,
      indiceNoPonto(clientX: number, clientY: number) {
        const el = contenedor.current;
        if (!el) return null;
        const caixa = el.getBoundingClientRect();
        return indiceNoPonto(clientX - caixa.left, clientY - caixa.top, estado.current.total, estado.current.g);
      },
    }),
    [rolarAte, elementoDe],
  );

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    if (!ehTeclaGrade(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    const origem = (e.target as HTMLElement).closest(`[${ATRIBUTO_CELULA}]`);
    // Só a célula em si: setas dentro de um campo ou de um controle da célula são dele.
    if (!origem || origem !== e.target) return;
    const atual = Number(origem.getAttribute(ATRIBUTO_CELULA));
    const linhasPorPagina = Math.max(1, Math.floor(window.innerHeight / g.passoLinha) - 1);
    const destino = proximoIndice(atual, e.key, { total, colunas: g.colunas, linhasPorPagina });
    e.preventDefault();
    if (destino === atual) return;
    focoPendente.current = destino;
    ativar(destino);
    rolarAte(destino);
  }

  function aoFocar(e: FocusEvent<HTMLDivElement>) {
    setFocoDentro(true);
    const celula = (e.target as HTMLElement).closest(`[${ATRIBUTO_CELULA}]`);
    if (celula) ativar(Number(celula.getAttribute(ATRIBUTO_CELULA)));
  }

  function aoDesfocar(e: FocusEvent<HTMLDivElement>) {
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    setFocoDentro(false);
  }

  const medida = largura > 0;
  return (
    <div
      ref={contenedor}
      className={estilos.grade}
      role="list"
      aria-label={rotulo}
      style={{ height: medida ? alturaDaGrade(total, g) : undefined }}
      onKeyDown={aoTeclar}
      onFocus={aoFocar}
      onBlur={aoDesfocar}
    >
      {medida &&
        montados.map((i) => {
          const item = itens[i];
          const { x, y } = posicaoDoItem(i, g);
          return (
            <div
              key={chaveDe(item)}
              {...{ [ATRIBUTO_CHAVE]: chaveDe(item) }}
              role="listitem"
              aria-setsize={total}
              aria-posinset={i + 1}
              className={estilos.celula}
              style={{ left: x, top: y, width: g.larguraCelula, height: g.alturaCelula }}
            >
              {renderizar(item, { tabIndex: i === focavel ? 0 : -1, [ATRIBUTO_CELULA]: i }, i)}
            </div>
          );
        })}
    </div>
  );
}
