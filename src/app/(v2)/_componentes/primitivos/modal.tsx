"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import { Botao } from "./botao";
import estilos from "./modal.module.css";
import { zDaCamada } from "./camadas";
import { type NivelCamada, type ResolvedorFoco, devolverFoco, focoAntesDoAtual, useCamada } from "./use-camada";

const SELETOR_FOCAVEL = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const assinarNada = () => () => {};

/**
 * A janela da v2: diálogo no desktop, folha que sobe de baixo no celular,
 * com as ações no `rodape`, sempre à vista no fim da folha.
 *
 * - **Camada da pilha** (`use-camada.ts`): Esc fecha só a do topo; a trava de
 *   rolagem vale em qualquer largura; o Tab fica preso aqui enquanto esta for
 *   a camada modal mais alta.
 * - **Foco**: ao abrir vai para `focoInicial`, ou para o próprio painel (o
 *   leitor de tela lê o título); ao fechar volta para o que
 *   `devolverFocoPara` achar, senão para o elemento que abriu, senão para o
 *   conteúdo principal — o primeiro que ainda estiver no DOM.
 * - **Portal no `body`**: a janela não herda contenção, transformação nem
 *   `overflow` de quem a abriu.
 *
 * Controlada: quem chama guarda `aberto` e fecha em `onFechar`.
 */
export function Modal({
  aberto,
  onFechar,
  titulo,
  descricao,
  rodape,
  children,
  largura,
  nivel = "janela",
  papel = "dialog",
  focoInicial,
  devolverFocoPara,
  fecharPeloVeu = true,
  semBotaoFechar = false,
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo: ReactNode;
  descricao?: ReactNode;
  rodape?: ReactNode;
  children?: ReactNode;
  /** Largura máxima no desktop, em px (padrão 520). */
  largura?: number;
  nivel?: NivelCamada;
  /** `alertdialog` para confirmação: o leitor de tela anuncia como alerta. */
  papel?: "dialog" | "alertdialog";
  focoInicial?: RefObject<HTMLElement | null>;
  devolverFocoPara?: ResolvedorFoco;
  /** Tocar fora fecha. Desligue quando fechar perderia algo digitado. */
  fecharPeloVeu?: boolean;
  /** Sem o X do canto (a confirmação tem "Cancelar" no rodapé). */
  semBotaoFechar?: boolean;
}) {
  const t = useTranslations("v2Primitivos");
  const montado = useSyncExternalStore(
    assinarNada,
    () => true,
    () => false,
  );
  const painel = useRef<HTMLDivElement>(null);
  const abridor = useRef<HTMLElement | null>(null);
  // O resolvedor e o fechar mais recentes, sem reabrir efeitos a cada render.
  const resolvedor = useRef(devolverFocoPara);
  const fechar = useRef(onFechar);
  useLayoutEffect(() => {
    resolvedor.current = devolverFocoPara;
    fechar.current = onFechar;
  });
  const idTitulo = useId();
  const idDescricao = useId();

  const { ehModalDoTopo, ordem } = useCamada(aberto, { nivel, onEsc: onFechar, travaRolagem: true });

  // Abrir: guarda quem abriu e põe o foco dentro. Fechar (ou desmontar
  // aberta): devolve o foco.
  useLayoutEffect(() => {
    if (!aberto || !montado) return;
    // Um descendente com `autoFocus` já tomou o foco quando este efeito roda
    // (o React foca na montagem, antes do efeito do pai): aí o abridor é o
    // foco anterior ao dele, que a pilha acompanha.
    const ativo = document.activeElement;
    const dentro = ativo instanceof Node && painel.current?.contains(ativo);
    abridor.current = dentro
      ? focoAntesDoAtual()
      : ativo instanceof HTMLElement && ativo !== document.body
        ? ativo
        : null;
    (focoInicial?.current ?? painel.current)?.focus({ preventScroll: true });
    return () => devolverFoco(abridor.current, resolvedor.current);
  }, [aberto, montado, focoInicial]);

  // Tab preso no painel, só enquanto esta for a camada modal do topo (uma
  // confirmação aberta por cima prende o dela).
  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== "Tab" || !ehModalDoTopo()) return;
      const raiz = painel.current;
      if (!raiz) return;
      // Só o que está na ordem do Tab: um segmentado deixa as opções não
      // escolhidas com `tabIndex=-1`, e contá-las como ponta deixaria o foco
      // sair da janela pela opção escolhida.
      const focaveis = Array.from(raiz.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL)).filter(
        (el) => el.tabIndex >= 0 && el.getClientRects().length > 0,
      );
      if (focaveis.length === 0) {
        e.preventDefault();
        raiz.focus();
        return;
      }
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const ativo = document.activeElement;
      const dentro = ativo instanceof Node && raiz.contains(ativo);
      if (e.shiftKey && (ativo === primeiro || ativo === raiz || !dentro)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (ativo === ultimo || !dentro)) {
        e.preventDefault();
        primeiro.focus();
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto, ehModalDoTopo]);

  if (!aberto || !montado) return null;

  const estiloPainel = largura ? ({ "--largura-janela": `${largura}px` } as CSSProperties) : undefined;

  return createPortal(
    <div className={estilos.raiz} style={{ zIndex: zDaCamada(nivel, ordem) }} data-v2-camada="">
      <div className={estilos.veu} aria-hidden onClick={fecharPeloVeu ? () => fechar.current() : undefined} />
      <div
        ref={painel}
        className={`${estilos.painel} v2-painel-flutuante v2-painel-aro`}
        role={papel}
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={descricao ? idDescricao : undefined}
        tabIndex={-1}
        style={estiloPainel}
      >
        <div className={estilos.cabecalho}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id={idTitulo} className={estilos.titulo}>
              {titulo}
            </h2>
            {descricao && (
              <p id={idDescricao} className={estilos.descricao}>
                {descricao}
              </p>
            )}
          </div>
          {!semBotaoFechar && (
            <Botao
              variante="fantasma"
              soIcone
              aria-label={t("fechar")}
              icone={<X aria-hidden />}
              onClick={() => fechar.current()}
            />
          )}
        </div>
        {children !== undefined && <div className={estilos.corpo}>{children}</div>}
        {rodape && <div className={estilos.rodape}>{rodape}</div>}
      </div>
    </div>,
    document.body,
  );
}
