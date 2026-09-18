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
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { seloOrigemImagem, type OrigemImagem } from "@/lib/dominio/origem-imagem";
import { urlImagemCarta } from "@/lib/imagens";

const ATRASO_MOSTRAR_MS = 250;
const MARGEM_VIEWPORT_PX = 12;
const LARGURA_ZOOM_PX = 280;
// Proporção real da arte da TCGdex (245x337 em baixa resolução).
const PROPORCAO_ALTURA_LARGURA = 337 / 245;
const ALTURA_ZOOM_PX = Math.round(LARGURA_ZOOM_PX * PROPORCAO_ALTURA_LARGURA);

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
  const selo = seloOrigemImagem(origem);


  function aoEntrar() {
    if (!urlGrande) return;
    timerRef.current = setTimeout(() => {
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

  return (
    <>
      {selo ? (
        // O wrapper só existe quando há selo: sem ele, a miniatura é
        // renderizada exatamente como antes, sem elemento extra no
        // layout de grade/tabela.
        <span className="relative inline-block leading-none" title={selo.titulo}>
          {miniatura}
          <span
            aria-label={selo.titulo}
            className="pointer-events-none absolute bottom-0 right-0 rounded-tl-sm bg-black/70 px-0.5 text-[8px] font-semibold leading-tight text-white"
          >
            {selo.texto}
          </span>
        </span>
      ) : (
        miniatura
      )}
      {visivel && posicao && urlGrande && typeof document !== "undefined"
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
