"use client";

/**
 * Miniatura de carta com ampliação ao passar o mouse — usada em todo
 * lugar onde imagem de carta aparece (grade do cadastro por set, cadastro
 * por busca, inventário). Componente único de propósito: decisão explícita
 * para não ter três implementações da mesma coisa.
 *
 * Requisitos (pedido original):
 * - Não pode atrapalhar a digitação em volume: o fluxo é teclado, o mouse
 *   é secundário. Por isso: atraso antes de mostrar (passagem rápida do
 *   cursor não dispara o zoom), nunca captura foco (só onMouseEnter/Leave
 *   — nada de onFocus), e a ampliação é renderizada num portal com
 *   `position: fixed` + `pointer-events: none`, então nunca desloca
 *   layout nem intercepta clique/teclado do campo por baixo.
 * - Usa a imagem em resolução maior da TCGdex (`/high.webp`) quando houver.
 * - Nunca corta nas bordas da tela: posição calculada a partir do
 *   retângulo da miniatura e sempre clampada ao viewport (`fixed`, não
 *   `absolute` — não depende de overflow do container pai).
 * - Prefere abrir ACIMA da miniatura (não para o lado): a miniatura é a
 *   coluna mais à esquerda da grade/tabela, e o campo de quantidade que o
 *   usuário está digitando fica nas colunas à direita, na mesma linha —
 *   abrir para cima evita cobri-lo no caso comum. Se não houver espaço
 *   acima (perto do topo da viewport), cai para abaixo.
 *
 * Procedência (2026-08-29): QUAL foto exibir deixou de ser decidido
 * aqui. A cadeia inteira — foto própria > catálogo do idioma > mypcards >
 * empréstimo do outro idioma ocidental > palpite de CDN — é resolvida em
 * SQL (`imagemDaCarta`/`origemDaImagem`, em `lib/db/consultas.ts`), que
 * devolve a URL já escolhida e a origem dela. Este componente só exibe, e
 * usa a origem para o selo de foto emprestada (`seloOrigemImagem`).
 *
 * A montagem especulativa de URL de CDN que existia aqui foi REMOVIDA na
 * mesma data. Ela nunca chegou a rodar (nenhum chamador passou os quatro
 * campos que ela exigia) e hoje estaria errada: o CDN da TCGdex não
 * devolve 404 para arquivo inexistente, ele segura a conexão por 60 s e
 * responde 504 — palpite errado não cai no estado vazio, ele pendura a
 * grade. O corte de onde o palpite ainda vale (só japonês) mora na
 * cadeia em SQL, num lugar só.
 *
 * Se a imagem falhar ao carregar mesmo assim, cai no estado vazio de
 * sempre: o componente renderiza o `fallback` (por padrão, nada).
 *
 * ## Celular (abaixo de 768px)
 *
 * No toque não há passar o mouse, e o iOS ainda dispara `mouseenter` falso
 * depois de um toque — o zoom por hover abriria sozinho, atrasado, sobre o
 * que o usuário acabou de tocar. Por isso, abaixo de 768px o hover é
 * desligado e entra o zoom por toque:
 *
 * - Um toque na miniatura abre a imagem grande sobreposta (portal em
 *   `document.body`, `z-50`, fundo escuro). Usa o `click`, que o navegador
 *   não dispara depois de uma rolagem ou arrasto: é isso que distingue
 *   "toque" de "arrasto" sem medir nada à mão.
 * - O toque que abre não aciona o pai (`stopPropagation` +
 *   `preventDefault`): a miniatura vive dentro de linhas e de `label`s.
 * - Fecha no "×" (44px), no fundo ou com Esc. Tocar na própria imagem não
 *   fecha, e a pinça fica liberada (nenhum `touch-action` restritivo).
 * - É uma camada modal (`useCamada`, nível `zoom`): fica acima da janela do
 *   `Modal`, o Esc fecha só ela e a janela continua travando o fundo. O foco
 *   vai para o "×", o Tab circula entre os controles do zoom enquanto ele é a
 *   camada modal do topo, e ao fechar o foco volta para a miniatura.
 * - A miniatura vira um controle (`role="button"`, nome acessível) num
 *   invólucro com área de toque de 44px. O invólucro só existe no celular; o
 *   desktop renderiza exatamente o que sempre renderizou.
 */

import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as TecladoReact,
  type MouseEvent as MouseReact,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { Icone } from "./icone";
import { useCamada } from "./use-camada";
import { useEhMobile } from "./use-eh-mobile";

import { seloOrigemImagem, type OrigemImagem } from "@/lib/dominio/origem-imagem";
import { urlImagemCarta } from "@/lib/imagens";

const ATRASO_MOSTRAR_MS = 250;
const MARGEM_VIEWPORT_PX = 12;
const LARGURA_ZOOM_PX = 280;
// Proporção real da arte da TCGdex (245x337 em baixa resolução).
const PROPORCAO_ALTURA_LARGURA = 337 / 245;
const ALTURA_ZOOM_PX = Math.round(LARGURA_ZOOM_PX * PROPORCAO_ALTURA_LARGURA);
// Área de toque mínima do controle (R3).
const ALVO_TOQUE_PX = 44;

const SELETOR_FOCAVEIS =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Posicao {
  top: number;
  left: number;
}

function calcularPosicao(rect: DOMRect): Posicao {
  let top = rect.top - ALTURA_ZOOM_PX - 8; // preferir acima da miniatura
  if (top < MARGEM_VIEWPORT_PX) {
    top = rect.bottom + 8; // sem espaço acima: abre abaixo
  }
  const alturaJanela = typeof window !== "undefined" ? window.innerHeight : 0;
  const larguraJanela = typeof window !== "undefined" ? window.innerWidth : 0;

  top = Math.min(Math.max(top, MARGEM_VIEWPORT_PX), alturaJanela - ALTURA_ZOOM_PX - MARGEM_VIEWPORT_PX);
  let left = rect.left;
  left = Math.min(
    Math.max(left, MARGEM_VIEWPORT_PX),
    larguraJanela - LARGURA_ZOOM_PX - MARGEM_VIEWPORT_PX,
  );
  return { top, left };
}

export function ImagemCartaComZoom({
  imagemUrl,
  origem,
  alt,
  width = 40,
  height = 55,
  className,
  fallback = null,
}: {
  imagemUrl: string | null;
  /**
   * De onde veio `imagemUrl` (`origemDaImagem`, em
   * `lib/db/consultas.ts`). Governa o selo: origem emprestada — outro
   * idioma ou scan de terceiro — aparece marcada; o caso normal, não.
   * Opcional: quem não passa não ganha selo, que é o comportamento de
   * antes desta prop existir.
   */
  origem?: OrigemImagem | null;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  /**
   * Renderizado no lugar de "nada" — tanto quando não há URL alguma
   * quanto quando a URL tentada falha ao carregar (`onError`, ex.:
   * `mep-079`: o catálogo tem `set_serie_id` e monta um palpite de URL de
   * CDN, mas o arquivo não existe lá — só se sabe depois do 404 real do
   * `<img>`). Usado pela tarefa "carta sem foto" (2026-08-26) para
   * oferecer o controle de upload exatamente onde a imagem de fato não
   * aparece. `null` por padrão: todo chamador que não passar mantém o
   * comportamento de sempre (nada renderizado).
   */
  fallback?: ReactNode;
}) {
  const t = useTranslations("componentes");
  const mobile = useEhMobile();
  const [ampliada, setAmpliada] = useState(false);
  const gatilhoRef = useRef<HTMLSpanElement | null>(null);
  const [visivel, setVisivel] = useState(false);
  const [posicao, setPosicao] = useState<Posicao | null>(null);
  // Guarda QUAL url falhou, não um "falhou: sim/não". O React reaproveita
  // esta instância quando a lista muda (filtro, paginação, ordenação) e a
  // `key` da linha se repete na mesma posição; com um booleano, uma carta
  // que deu 404 no CDN esconderia a PRÓXIMA carta renderizada aqui, mesmo
  // que essa tenha imagem — apareceria como carta sumida ao paginar.
  // Comparando a url, a falha deixa de valer sozinha quando a imagem muda,
  // sem precisar de efeito para zerar estado.
  const [urlQueFalhou, setUrlQueFalhou] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Só cleanup (nenhum setState síncrono no corpo do efeito): cancela um
  // atraso de exibição pendente se o componente desmontar antes dele
  // disparar.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // A escolha já foi feita em SQL — aqui só resta a resolução de
  // qualidade (low para a miniatura, high para a ampliação).
  const urlMini = urlImagemCarta(imagemUrl, "low");
  const urlGrande = urlImagemCarta(imagemUrl, "high");
  /* `seloOrigemImagem` continua decidindo SE há selo e qual é o código
     curto (EN/PT/MYP — códigos, não texto). Só a explicação do `title`
     vem do catálogo de mensagens, porque essa é frase, e frase tem
     idioma. */
  const selo = seloOrigemImagem(origem);
  const tituloSelo = selo ? t(`seloOrigem.${origem}`) : null;


  // Cruzou para o celular com um hover aberto ou pendente (girou o aparelho):
  // o hover não existe abaixo de 768px e não pode reaparecer sozinho, na
  // posição velha, quando a tela voltar a ser desktop. Ajuste de estado na
  // própria renderização (padrão do React para estado derivado), sem efeito.
  if (mobile && visivel) setVisivel(false);
  // E o atraso de exibição ainda pendente morre na mesma virada, para não
  // abrir depois sem um hover novo.
  useEffect(() => {
    if (mobile && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [mobile]);

  function aoEntrar() {
    // No celular o hover é desligado (ver o cabeçalho): o `mouseenter`
    // emulado depois de um toque abriria o zoom por conta própria.
    if (!urlGrande || mobile) return;
    timerRef.current = setTimeout(() => {
      // Só abre se o ponteiro ainda está sobre a miniatura e a tela continua
      // desktop: o atraso pode vencer depois de a tela virar celular (e até
      // depois de voltar a desktop, sem hover nenhum).
      if (window.matchMedia("(width < 48rem)").matches || !imgRef.current?.matches(":hover")) return;
      const rect = imgRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosicao(calcularPosicao(rect));
      setVisivel(true);
    }, ATRASO_MOSTRAR_MS);
  }

  function aoSair() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setVisivel(false);
  }

  const fechar = useCallback(() => setAmpliada(false), []);
  // Girou para 768px ou mais com o zoom aberto: ele não existe mais nessa
  // largura, e não deve reaparecer sozinho se o aparelho voltar ao retrato.
  if (!mobile && ampliada) setAmpliada(false);

  if (!urlMini || urlQueFalhou === urlMini) return fallback;

  const miniatura = (
    /* eslint-disable-next-line @next/next/no-img-element -- miniaturas em grade/lista (dezenas a centenas por página); <img> simples evita configurar layout do next/image para cada uma. */
    <img
      ref={imgRef}
      src={urlMini}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      className={className}
      onMouseEnter={aoEntrar}
      onMouseLeave={aoSair}
      // A imagem escolhida pode não existir de fato (palpite de CDN no
      // japonês, ou scan removido da fonte). Cai no estado vazio em vez de
      // mostrar o ícone de imagem quebrada.
      onError={() => setUrlQueFalhou(urlMini)}
    />
  );

  // Em tela de celular o invólucro vira o controle; fora dele (sem imagem
  // grande para mostrar) cai no desenho de sempre.
  if (mobile && urlGrande) {
    // A miniatura costuma ser mais estreita que 44px (32 na lista): o
    // pseudo-elemento amplia só o que falta, sem ocupar lugar no fluxo.
    const extraX = Math.max(0, (ALVO_TOQUE_PX - width) / 2);
    const extraY = Math.max(0, (ALVO_TOQUE_PX - height) / 2);
    return (
      <>
        <span
          ref={gatilhoRef}
          role="button"
          tabIndex={0}
          aria-label={t("mobile.ampliarImagem", { nome: alt })}
          aria-haspopup="dialog"
          onClick={(e: MouseReact) => {
            // A miniatura vive dentro de linhas e de `label`s: o toque que
            // abre o zoom não pode marcar, selecionar nem navegar nada.
            e.preventDefault();
            e.stopPropagation();
            setAmpliada(true);
          }}
          onKeyDown={(e: TecladoReact) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            e.stopPropagation();
            setAmpliada(true);
          }}
          style={{ "--extra-x": `-${extraX}px`, "--extra-y": `-${extraY}px` } as CSSProperties}
          className="relative inline-block cursor-zoom-in leading-none after:absolute after:inset-x-(--extra-x) after:inset-y-(--extra-y) after:content-['']"
        >
          {miniatura}
          {selo && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 right-0 rounded-tl-sm bg-black/70 px-0.5 text-[8px] font-semibold leading-tight text-white"
            >
              {selo.texto}
            </span>
          )}
        </span>
        {ampliada ? (
          <ZoomMobile
            urlGrande={urlGrande}
            alt={alt}
            legenda={tituloSelo}
            gatilhoRef={gatilhoRef}
            onFechar={fechar}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      {selo ? (
        // O wrapper só existe quando há selo: sem ele, a miniatura é
        // renderizada exatamente como antes, sem elemento extra no
        // layout de grade/tabela.
        <span className="relative inline-block leading-none" title={tituloSelo ?? undefined}>
          {miniatura}
          <span
            aria-label={tituloSelo ?? undefined}
            className="pointer-events-none absolute bottom-0 right-0 rounded-tl-sm bg-black/70 px-0.5 text-[8px] font-semibold leading-tight text-white"
          >
            {selo.texto}
          </span>
        </span>
      ) : (
        miniatura
      )}
      {visivel && posicao && urlGrande && !mobile && typeof document !== "undefined"
        ? createPortal(
            <div
              role="presentation"
              style={{
                position: "fixed",
                top: posicao.top,
                left: posicao.left,
                width: LARGURA_ZOOM_PX,
                pointerEvents: "none",
                zIndex: 50,
              }}
              className="overflow-hidden rounded-lg border border-line bg-surface-elevated shadow-xl"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- preview pontual (um por vez, só enquanto hover ativo); não é um caso de otimização de imagem. */}
              <img src={urlGrande} alt={alt} className="block h-auto w-full" />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * A imagem grande do celular. Componente à parte porque só existe montado
 * (aberto, abaixo de 768px): `useCamada` e o foco entram e saem com ele.
 */
function ZoomMobile({
  urlGrande,
  alt,
  legenda,
  gatilhoRef,
  onFechar,
}: {
  urlGrande: string;
  alt: string;
  /** Explicação do selo de foto emprestada: no celular o `title` não existe. */
  legenda: string | null;
  gatilhoRef: RefObject<HTMLElement | null>;
  onFechar: () => void;
}) {
  const t = useTranslations("componentes");
  const fundoRef = useRef<HTMLDivElement | null>(null);
  const fecharRef = useRef<HTMLButtonElement | null>(null);
  const { ehModalDoTopo } = useCamada(true, { nivel: "zoom", onEsc: onFechar, travaRolagem: true });

  // Foco: guarda quem tinha, vai para o "×" (nunca para um campo — abriria o
  // teclado) e, ao fechar, volta para quem tinha o foco antes, se ainda
  // estiver na página. No iPhone um toque não foca a miniatura, então "quem
  // tinha" costuma ser o `body`: nesse caso volta para a miniatura tocada, que
  // está no mesmo lugar de onde veio (inclusive dentro da janela de editar
  // cópia, para o foco não escapar dela).
  useEffect(() => {
    const guardado = document.activeElement;
    const gatilho = gatilhoRef.current;
    fecharRef.current?.focus({ preventScroll: true });
    return () => {
      const guardadoServe = guardado instanceof HTMLElement && guardado.isConnected && guardado !== document.body;
      const alvo = guardadoServe ? guardado : gatilho;
      if (alvo instanceof HTMLElement && alvo.isConnected) alvo.focus({ preventScroll: true });
    };
  }, [gatilhoRef]);

  // Tab circula entre os controles do zoom enquanto ele é a camada modal do
  // topo. Hoje é só o "×", então o Tab fica nele; o laço já serve para o dia
  // em que houver mais de um.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== "Tab" || !ehModalDoTopo()) return;
      const fundo = fundoRef.current;
      if (!fundo) return;
      const itens = Array.from(fundo.querySelectorAll<HTMLElement>(SELETOR_FOCAVEIS));
      if (itens.length === 0) {
        e.preventDefault();
        return;
      }
      const i = itens.indexOf(document.activeElement as HTMLElement);
      if (i === -1) {
        e.preventDefault();
        itens[0].focus();
      } else if (e.shiftKey && i === 0) {
        e.preventDefault();
        itens[itens.length - 1].focus();
      } else if (!e.shiftKey && i === itens.length - 1) {
        e.preventDefault();
        itens[0].focus();
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [ehModalDoTopo]);

  return createPortal(
    <div
      ref={fundoRef}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      // O portal sobe pela árvore do React: sem o `stopPropagation`, o toque
      // no fundo chegaria ao `onClick` da linha ou da janela de baixo.
      onClick={(e) => {
        e.stopPropagation();
        onFechar();
      }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-4"
    >
      <button
        ref={fecharRef}
        type="button"
        aria-label={t("mobile.fecharImagem")}
        onClick={(e) => {
          e.stopPropagation();
          onFechar();
        }}
        className="absolute right-[max(0.5rem,env(safe-area-inset-right))] top-[max(0.5rem,env(safe-area-inset-top))] inline-flex size-11 items-center justify-center rounded-full bg-black/60 text-white"
      >
        <Icone nome="x" tamanho={22} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- imagem ampliada pontual (uma por vez); não é um caso de otimização de imagem. */}
      <img
        src={urlGrande}
        alt={alt}
        // Tocar na imagem não fecha. Nenhum `touch-action` restritivo: a
        // pinça do navegador continua livre. A largura sai do menor entre o
        // espaço lateral, um teto e o que a altura da tela comporta.
        onClick={(e) => e.stopPropagation()}
        style={{ width: `min(100%, 24rem, calc((100dvh - 8rem) * ${1 / PROPORCAO_ALTURA_LARGURA}))` }}
        className="block h-auto rounded-lg"
      />
      {legenda ? <p className="max-w-full text-center text-sm text-white/80">{legenda}</p> : null}
    </div>,
    document.body,
  );
}
