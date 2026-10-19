"use client";

/**
 * Modal — véu + painel centralizado, elevado. O véu é o único lugar do
 * sistema com transparência e blur: ameixa a 52% (`--surface-overlay`)
 * com desfoque, exatamente como o design system especifica. Extraído dos 4 modais que hoje reimplementam a mesma
 * estrutura (`ModalEdicao`, `ModalAlocarDestino` e `ModalEdicaoMassa` no
 * inventário; `ModalAlocarVaga` na coleção) — o conteúdo e o
 * comportamento de cada um continuam onde estavam, só a casca visual é
 * compartilhada.
 *
 * `as="form"` permite repassar `onSubmit` para os modais que são
 * formulários (evita reintroduzir um <form> aninhado dentro de um <div>).
 *
 * ## Janela de verdade, em qualquer largura (decisão de 2026-10-18)
 *
 * O painel é um `role="dialog"` com `aria-modal` e nome acessível: o
 * `rotulo` (vira `aria-label`) ou o `rotuloId` (vira `aria-labelledby`). Quem
 * não passa nenhum dos dois ganha o primeiro título (`h1`–`h6`) do painel como
 * nome — todos os consumidores abrem com um, e assim ninguém fica sem nome
 * enquanto não migra.
 *
 * - **Esc fecha**, se houver `onFechar`, e só a camada do topo (`useCamada`):
 *   com o zoom de carta aberto por cima, o Esc fecha o zoom, não a janela. Sem
 *   `onFechar`, o Esc não faz nada — a janela não sabe se fechar perde algo.
 * - **Foco vai para o painel ao abrir**, nunca para um campo: no iPhone, foco
 *   em campo abre o teclado e cobre metade da janela antes de a pessoa ler o
 *   título. Ao fechar, volta para quem abriu (o botão "Editar" da linha).
 * - **Tab circula dentro do painel** enquanto esta for a camada modal do topo
 *   (`ehModalDoTopo`). Uma `Dica` aberta por cima não é modal e não tira a
 *   contenção daqui; o zoom é, e prende o próprio foco. Sem `inert` no resto
 *   da página e sem portal: a contenção é o ciclo de Tab + `aria-modal`, e a
 *   janela continua renderizada no lugar de sempre.
 *
 * ## Celular (< 768px): sheet
 *
 * Abaixo do `md` o mesmo painel vira um sheet ancorado embaixo, na largura
 * toda, cantos de cima arredondados. Tudo isso é `max-md:` — do `md` para
 * cima as classes que valem são as de sempre, e o desenho não muda:
 *
 * - `max-h` de 90dvh: com a barra do Safari aparecendo e sumindo, `vh` mede a
 *   tela sem a barra e o fim do sheet ficaria escondido atrás dela. O `90vh`
 *   de sempre fica como reserva para navegador sem `dvh` (a declaração
 *   inválida é descartada e a outra vale).
 * - `rodape` (as ações) fica grudado no fim do sheet, com fundo próprio, e o
 *   corpo rola por baixo dele: num formulário comprido, "Salvar" não some
 *   rolagem abaixo. O recuo de baixo soma `env(safe-area-inset-bottom)`, para
 *   os botões não ficarem sob a barra de gestos do iPhone.
 * - O fundo da página não rola enquanto a janela está aberta (trava do
 *   `useCamada`, só no celular: no desktop o `body` não rola).
 * - Tocar no véu NÃO fecha. Um toque perdido ao rolar o sheet jogaria fora o
 *   que foi digitado; fecha-se pelo botão do rodapé ou pelo Esc.
 * - `z-40`, acima da barra fixa de ação em lote (`z-30`) e abaixo do zoom de
 *   carta (`z-50`). No desktop continua `z-20`.
 *
 * ## Por que o rodapé vai num invólucro `md:contents`
 *
 * No desktop o rodapé tem de sair exatamente como saía quando era só o último
 * filho do painel: um item do `flex-col` com o `gap-3` do painel e as classes
 * do próprio consumidor (`flex justify-end gap-2 pt-2`). `display: contents`
 * faz o invólucro não gerar caixa nenhuma, e o rodapé do consumidor volta a ser,
 * para o layout, filho direto do painel. No celular o invólucro é a faixa
 * grudada. Com `as="form"` o rodapé continua dentro do form (o "Salvar"
 * `type="submit"` precisa disso).
 */

import { useCallback, useEffect, useId, useRef, useState, type ElementType, type ReactNode } from "react";

import { useCamada } from "@/app/_componentes/use-camada";
import { useEhMobile } from "@/app/_componentes/use-eh-mobile";

/** O que o navegador põe na ordem do Tab; o filtro em `focaveisNoCiclo` tira os desligados e escondidos. */
const SELETOR_FOCAVEL = [
  "a[href]",
  "area[href]",
  "button",
  'input:not([type="hidden"])',
  "select",
  "textarea",
  "summary",
  "iframe",
  '[contenteditable]:not([contenteditable="false"])',
  "[tabindex]",
].join(",");

/**
 * Os elementos do painel que o Tab visita, na ordem do documento. Grupo de
 * opção (`radio` com `name`) entra uma vez só, como o navegador faz: pela
 * opção marcada, ou pela primeira se nenhuma estiver — senão a "última" da
 * lista podia ser uma opção que o Tab pula, e o foco escaparia da janela.
 */
function focaveisNoCiclo(painel: HTMLElement): HTMLElement[] {
  const vistos = new Set<string>();
  return Array.from(painel.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL)).filter((el) => {
    if (el.tabIndex < 0 || el.matches(":disabled")) return false;
    const visivel =
      typeof el.checkVisibility === "function"
        ? el.checkVisibility({ checkVisibilityCSS: true })
        : el.getClientRects().length > 0;
    if (!visivel) return false;
    if (el instanceof HTMLInputElement && el.type === "radio" && el.name) {
      const grupo = `${el.form ? "f" : "s"}:${el.name}`;
      if (vistos.has(grupo)) return false;
      const opcoes = Array.from(
        painel.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(el.name)}"]`),
      ).filter((o) => o.form === el.form);
      const marcada = opcoes.find((o) => o.checked);
      if (marcada && marcada !== el) return false;
      vistos.add(grupo);
    }
    return true;
  });
}

export function Modal({
  as: Componente = "div",
  className = "",
  rotulo,
  rotuloId,
  rodape,
  onFechar,
  children,
  ...props
}: {
  as?: ElementType;
  className?: string;
  /** Nome acessível da janela (`aria-label`), quando não há título visível para apontar. */
  rotulo?: string;
  /** `id` do título visível que nomeia a janela (`aria-labelledby`). Tem preferência sobre o título achado sozinho. */
  rotuloId?: string;
  /** Ações da janela. No celular ficam grudadas no fim do sheet; no desktop, como o último filho do painel. */
  rodape?: ReactNode;
  /** Fechar sem salvar. É o que o Esc chama; sem ele, o Esc não faz nada. */
  onFechar?: () => void;
  children: ReactNode;
  [key: string]: unknown;
}) {
  const painelRef = useRef<HTMLElement | null>(null);
  const idBase = useId();
  const ehMobile = useEhMobile();

  // Quem tinha o foco antes de a janela abrir. Lido na primeira renderização,
  // e não num efeito: um campo com `autoFocus` dentro do painel já teria
  // tomado o foco quando o efeito rodasse, e a volta iria para ele.
  const [origem] = useState<Element | null>(() => (typeof document === "undefined" ? null : document.activeElement));

  // Antes do efeito de foco, de propósito: ao fechar, as limpezas rodam na
  // ordem em que os efeitos foram declarados, e a trava do celular tem de
  // devolver a rolagem da página ANTES de o foco voltar para o botão de origem.
  const { ehModalDoTopo } = useCamada(true, { nivel: "janela", onEsc: onFechar, travaRolagem: ehMobile });

  // Nome acessível de quem ainda não passa `rotulo`/`rotuloId`: o primeiro título do painel.
  // Declarado antes do efeito de foco: os efeitos rodam na ordem em que aparecem, e o leitor de
  // tela tem de encontrar a janela já com nome no instante em que o foco chega nela.
  useEffect(() => {
    const painel = painelRef.current;
    if (!painel || rotulo || rotuloId) return;
    const titulo = painel.querySelector("h1, h2, h3, h4, h5, h6");
    if (!titulo) return;
    if (!titulo.id) titulo.id = `${idBase}-titulo`;
    const alvo = titulo.id;
    painel.setAttribute("aria-labelledby", alvo);
    return () => {
      if (painel.getAttribute("aria-labelledby") === alvo) painel.removeAttribute("aria-labelledby");
    };
  }, [rotulo, rotuloId, idBase]);

  useEffect(() => {
    painelRef.current?.focus({ preventScroll: true });
    return () => {
      // A linha que abriu a janela pode ter sido recarregada (salvar recarrega
      // a lista) — foco num elemento que saiu da página não vai a lugar algum.
      if (origem instanceof HTMLElement && origem.isConnected) origem.focus({ preventScroll: true });
    };
  }, [origem]);

  // No `document`, e não no painel: depois de um clique no véu o foco está no
  // `body`, fora do painel, e o Tab seguinte tem de voltar para dentro.
  const aoTeclar = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;
      const painel = painelRef.current;
      if (!painel || !ehModalDoTopo()) return;
      const lista = focaveisNoCiclo(painel);
      if (lista.length === 0) {
        e.preventDefault();
        painel.focus({ preventScroll: true });
        return;
      }
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      const ativo = document.activeElement;
      if (!(ativo instanceof Node) || !painel.contains(ativo)) {
        e.preventDefault();
        (e.shiftKey ? ultimo : primeiro).focus();
        return;
      }
      // Dá a volta quando não há mais nada do ciclo naquele sentido. Pela
      // posição no documento, e não por "é o primeiro/último?": o foco pode
      // estar no próprio painel (logo ao abrir) ou num elemento fora do ciclo.
      const posicao = (el: HTMLElement) => ativo.compareDocumentPosition(el);
      const temProximo = e.shiftKey
        ? lista.some((el) => posicao(el) & Node.DOCUMENT_POSITION_PRECEDING && !(posicao(el) & Node.DOCUMENT_POSITION_CONTAINS))
        : lista.some((el) => posicao(el) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (!temProximo) {
        e.preventDefault();
        (e.shiftKey ? ultimo : primeiro).focus();
      }
    },
    [ehModalDoTopo],
  );

  useEffect(() => {
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoTeclar]);

  const temRodape = rodape !== undefined && rodape !== null;

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-[var(--surface-overlay)] p-4 backdrop-blur-[10px] backdrop-saturate-150 max-md:z-40 max-md:items-end max-md:p-0">
      <Componente
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        aria-labelledby={rotuloId}
        tabIndex={-1}
        // Linha 1: as classes de sempre (o desktop). Linha 2: o painel focado
        // não pode ganhar o anel de foco global (`:focus-visible` em
        // `globals.css`, fora de camada, troca a sombra e o raio de quem foca)
        // — quem recebe o foco é a janela inteira, não um controle; o `!` vence
        // a regra fora de camada. Linha 3: o sheet do celular.
        className={[
          "flex max-h-[90vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-[var(--raio-lg)] border border-hairline bg-surface-elevated p-5 text-sm text-foreground shadow-4",
          "focus-visible:rounded-[var(--raio-lg)]! focus-visible:shadow-4! max-md:focus-visible:rounded-b-none!",
          "max-md:max-h-[90dvh] max-md:max-w-none max-md:overscroll-contain max-md:rounded-b-none max-md:border-x-0 max-md:border-b-0",
          temRodape ? "max-md:pb-0" : "max-md:pb-[calc(1.25rem+env(safe-area-inset-bottom))]",
          className,
        ].join(" ")}
        {...props}
      >
        {children}
        {temRodape && (
          <div className="md:contents max-md:sticky max-md:bottom-0 max-md:-mx-5 max-md:border-t max-md:border-hairline max-md:bg-surface-elevated max-md:px-5 max-md:pt-1 max-md:pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            {rodape}
          </div>
        )}
      </Componente>
    </div>
  );
}
