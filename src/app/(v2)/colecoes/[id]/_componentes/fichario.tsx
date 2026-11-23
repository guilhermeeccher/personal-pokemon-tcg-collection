"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from "react";

import type { TipoColecao } from "@/lib/dominio/parametro-colecao";
import type { VagaGradeV2DTO } from "@/lib/dominio/tipos-cliente";

import { Botao } from "../../../_componentes/primitivos/botao";

import { Bolso } from "./bolso";
import estilos from "./colecao.module.css";
import { type GradeFichario, faixaDaPagina, sentidoDoGesto, totalDePaginas } from "./vista-colecao";

/** Largura do fichário a partir da qual as duas páginas abertas cabem lado a lado. */
const LARGURA_DUAS_PAGINAS = 720;

/** Acima disto o paginador não desenha os pontos: 114 pontos (uma Pokédex nacional em 3×3) não dizem nada. */
const MAXIMO_PONTOS = 30;

/**
 * O respiro da página do fichário (`.folha`): 14 px a partir de 768 px, 10
 * abaixo. A conta usa sempre o maior — errar para o lado de uma grade menor,
 * nunca para bolsos abaixo de 44 px.
 */
const RESPIRO_PAGINA = 14;
const VAO_PAGINAS = 26;

/**
 * Quantas páginas abertas cabem e quanto sobra para os bolsos de cada uma:
 * uma no celular e no desktop estreito, duas (o fichário aberto) quando o
 * próprio fichário passa de 720 px. É medida do componente, não o corte de
 * 768 px da casca: com o trilho ao lado, a 1024 px a área útil não comporta
 * duas páginas legíveis. Recebe o elemento (não um `ref`): ele só existe
 * depois que a grade chega, e o efeito precisa rodar de novo quando ele
 * aparece.
 */
export function useMedidaFichario(el: HTMLElement | null): { paginasPorVez: 1 | 2; larguraUtil: number } {
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    if (!el) return;
    // O `ResizeObserver` entrega uma primeira medida logo ao observar.
    const observador = new ResizeObserver(([e]) => e && setLargura(e.contentRect.width));
    observador.observe(el);
    return () => observador.disconnect();
  }, [el]);
  const paginasPorVez = largura >= LARGURA_DUAS_PAGINAS ? 2 : 1;
  const pagina = paginasPorVez === 2 ? (largura - VAO_PAGINAS) / 2 : largura;
  // Antes da primeira medida, nada limita: a grade guardada vale.
  return { paginasPorVez, larguraUtil: largura === 0 ? Infinity : pagina - 2 * RESPIRO_PAGINA };
}

/**
 * O fichário: páginas de N×N bolsos, uma ou duas abertas, na ordem das vagas
 * (numa Pokédex, o número nacional). Página em vez de filtro: a pessoa folheia
 * como folheia o fichário de verdade.
 *
 * - **Virar** é pelos botões, pelo campo de página e, no toque, por um arrasto horizontal largo — que
 *   nunca começa na borda esquerda, onde mora o "voltar" do Safari, e tem os
 *   botões como equivalente (regras 2 e 3 de `rules.md`).
 * - A página nova entra com uma animação curta de CSS; movimento reduzido e o
 *   modo leve a desligam (`v2-anima`), e o estado final é o mesmo. Não há
 *   cópia das páginas durante a virada: o conteúdo é um só.
 * - O fichário não guarda estado de vaga; tudo vem de quem o usa.
 */
export function Fichario({
  vagas,
  tipo,
  grade,
  pagina,
  paginasPorVez,
  aoIrPara,
  abertaId,
  parAtivo,
  aoAbrir,
  aoTirar,
  rotuloDaPagina,
}: {
  vagas: readonly VagaGradeV2DTO[];
  tipo: TipoColecao;
  grade: GradeFichario;
  /** A primeira página da vista (já normalizada por `inicioDaVista`). */
  pagina: number;
  paginasPorVez: 1 | 2;
  aoIrPara: (pagina: number) => void;
  abertaId: string | null;
  parAtivo: string | null;
  aoAbrir: (vaga: VagaGradeV2DTO) => void;
  aoTirar?: (vaga: VagaGradeV2DTO) => void;
  /** O rótulo da faixa de uma página ("nº 001–009", "001–009"). */
  rotuloDaPagina: (primeira: VagaGradeV2DTO, ultima: VagaGradeV2DTO) => string;
}) {
  const t = useTranslations("v2Colecao.fichario");
  const total = totalDePaginas(vagas.length, grade);
  const paginas = Array.from({ length: paginasPorVez }, (_, i) => pagina + i);
  const ultimaDaVista = Math.min(total - 1, pagina + paginasPorVez - 1);
  const anterior = pagina > 0;
  const proxima = pagina + paginasPorVez < total;
  const [sentido, setSentido] = useState<1 | -1>(1);

  function virar(passo: -1 | 1) {
    const destino = pagina + passo * paginasPorVez;
    if (destino < 0 || destino >= total) return;
    setSentido(passo);
    aoIrPara(destino);
  }

  // O arrasto: só toque e caneta (o mouse tem os botões), só depois de 8 px,
  // e só decide no fim. `touch-action: pan-y` no fichário deixa a rolagem
  // vertical com o navegador (regra 2).
  const gesto = useRef<{ id: number; x: number; y: number } | null>(null);
  function aoApertar(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse") return;
    gesto.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
  function aoSoltar(e: PointerEvent<HTMLDivElement>) {
    const g = gesto.current;
    gesto.current = null;
    if (!g || g.id !== e.pointerId) return;
    const s = sentidoDoGesto({ xInicio: g.x, dx: e.clientX - g.x, dy: e.clientY - g.y });
    if (s !== 0) virar(s);
  }

  const primeiraVaga = vagas[faixaDaPagina(pagina, grade, vagas.length).inicio];
  const ultimaVaga = vagas[faixaDaPagina(ultimaDaVista, grade, vagas.length).fim - 1];

  return (
    <div className={estilos.fichario}>
      <div className={estilos.paginador}>
        <div className={estilos.rotuloPaginas}>
          <b>
            {paginasPorVez === 2 && ultimaDaVista > pagina
              ? t("paginas", { de: pagina + 1, ate: ultimaDaVista + 1, total })
              : t("pagina", { pagina: pagina + 1, total })}
          </b>
          {primeiraVaga && ultimaVaga && <span className="v2-num">{rotuloDaPagina(primeiraVaga, ultimaVaga)}</span>}
        </div>
        {total <= MAXIMO_PONTOS && (
          // Os pontos são só leitura (o que está cheio, onde você está): um ponto
          // de 9 px não é alvo de toque. Pular de página é o campo ao lado.
          <div className={estilos.pontos} aria-hidden>
            {Array.from({ length: total }, (_, i) => {
              const { inicio, fim } = faixaDaPagina(i, grade, vagas.length);
              const completa = vagas.slice(inicio, fim).every((v) => v.copia);
              const atual = i >= pagina && i <= ultimaDaVista;
              return (
                <span key={i} className={[estilos.ponto, atual ? estilos.pontoAtual : null, completa ? estilos.pontoCheio : null].filter(Boolean).join(" ")} />
              );
            })}
          </div>
        )}
        <div className={estilos.setas}>
          <Botao soIcone variante="secundario" aria-label={t("anterior")} disabled={!anterior} icone={<ChevronLeft aria-hidden />} onClick={() => virar(-1)} />
          <CampoPagina
            pagina={pagina}
            total={total}
            aoIrPara={(p) => {
              setSentido(p < pagina ? -1 : 1);
              aoIrPara(p);
            }}
          />
          <Botao soIcone variante="secundario" aria-label={t("proxima")} disabled={!proxima} icone={<ChevronRight aria-hidden />} onClick={() => virar(1)} />
        </div>
      </div>

      <div
        className={estilos.paginas}
        data-por-vez={paginasPorVez}
        onPointerDown={aoApertar}
        onPointerUp={aoSoltar}
        onPointerCancel={() => (gesto.current = null)}
      >
        {paginas.map((p, i) => {
          const { inicio, fim } = faixaDaPagina(p, grade, vagas.length);
          const daPagina = vagas.slice(inicio, fim);
          const vazias = daPagina.filter((v) => !v.copia).length;
          return (
            <section
              // A chave inclui a página: a página nova monta e roda a entrada.
              key={`${p}-${i}`}
              className={`${estilos.folha} v2-anima`}
              data-entrada={sentido === 1 ? "proxima" : "anterior"}
              aria-label={t("pagina", { pagina: p + 1, total })}
              style={{ "--colunas": grade } as CSSProperties}
            >
              {daPagina.length === 0 ? (
                <div className={estilos.fimDoFichario}>
                  <b>{t("fim")}</b>
                  <span>{t("fimTexto", { total: vagas.length })}</span>
                </div>
              ) : (
                <>
                  <div className={estilos.bolsosDaPagina} data-densidade={grade}>
                    {daPagina.map((v) => (
                      <Bolso
                        key={v.id}
                        vaga={v}
                        tipo={tipo}
                        densidade={grade}
                        aberta={abertaId === v.id}
                        noParAtivo={parAtivo === v.id}
                        aoAbrir={() => aoAbrir(v)}
                        aoTirar={aoTirar ? () => aoTirar(v) : undefined}
                      />
                    ))}
                    {/* Os bolsos que sobram na última página: o fichário de verdade também os tem. */}
                    {Array.from({ length: grade * grade - daPagina.length }, (_, k) => (
                      <span key={`sobra-${k}`} className={estilos.bolsoSobra} aria-hidden />
                    ))}
                  </div>
                  <div className={estilos.rodapePagina}>
                    <span>{vazias > 0 ? t("vazias", { total: vazias }) : t("completa")}</span>
                    <span className="v2-num">{rotuloDaPagina(daPagina[0], daPagina[daPagina.length - 1])}</span>
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** O campo de página de um fichário longo (uma Pokédex nacional em 3×3 tem 114 páginas). */
function CampoPagina({ pagina, total, aoIrPara }: { pagina: number; total: number; aoIrPara: (p: number) => void }) {
  const t = useTranslations("v2Colecao.fichario");
  const [texto, setTexto] = useState(String(pagina + 1));
  const [paginaAntes, setPaginaAntes] = useState(pagina);
  // A página mudou por fora (seta, salto de região): o campo acompanha.
  if (paginaAntes !== pagina) {
    setPaginaAntes(pagina);
    setTexto(String(pagina + 1));
  }
  return (
    <form
      className={estilos.campoPagina}
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(texto);
        if (Number.isInteger(n) && n >= 1 && n <= total) aoIrPara(n - 1);
        else setTexto(String(pagina + 1));
      }}
    >
      <label>
        <span className="v2-so-leitor">{t("irParaPagina", { total })}</span>
        <input
          className={`${estilos.entradaPagina} v2-num`}
          inputMode="numeric"
          pattern="[0-9]*"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={(e) => e.currentTarget.form?.requestSubmit()}
        />
      </label>
    </form>
  );
}
