"use client";

/**
 * Gráfico do valor total das cartas precificadas ao longo das rodadas: um
 * ponto por foto (`liga_snapshot_preco`), em reais, SVG inline sem
 * dependência. Uma série só — o título já diz o que é, então não há legenda.
 *
 * O total também sobe quando entram cartas na tabela (uma rodada nova pode
 * precificar mais cartas), e não só quando os preços valorizam. Por isso cada
 * ponto mostra quantas cartas tinha e o preço médio por carta, e a tela
 * avisa isso por escrito: comprar não pode ser lido como valorização.
 *
 * Largura medida (ResizeObserver) e o SVG desenhado nela, em vez de um
 * viewBox esticado: assim o texto dos eixos mantém o tamanho em 400 px.
 * Cores só por tokens (`var(--…)`); a série usa o acento de ação.
 *
 * ## Celular (abaixo de 768px)
 *
 * O ponteiro de hoje é do mouse: `pointermove` aponta o ponto mais próximo e
 * `pointerleave` solta. No dedo isso não serve — o `pointerleave` dispara
 * assim que o dedo sai, e o valor sumiria antes de ser lido. Por isso, no
 * celular e só para toque:
 *
 * - O toque (`pointerup`) fixa o ponto mais próximo e ele fica até outro
 *   toque no gráfico (que troca de ponto) ou um toque fora dele (que solta).
 *   Arrastar o dedo na horizontal também aponta (o gráfico só cede a rolagem
 *   vertical, `touch-pan-y`); o `pointerleave` do toque não solta nada.
 * - O valor aparece num painel embaixo do gráfico, e não na caixa flutuante
 *   do desktop: o dedo que tocou cobriria a caixa, e num gráfico de ~300px
 *   ela vazaria da tela. O painel tem altura reservada (com uma dica de uso
 *   enquanto nada está fixo), para o gráfico não pular quando ele aparece.
 * - O mouse, mesmo numa janela estreita, segue o comportamento de sempre.
 *
 * Os textos do SVG ficam em 12px no celular (11px é o piso do app) e a
 * margem do eixo y cresce para o rótulo caber. Os rótulos "N cartas" sobre os
 * pontos saem no celular: em ~270px eles encostam na linha e uns nos outros,
 * e o que dizem está no painel (ao tocar) e na tabela de pontos.
 */

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { useEhMobile } from "@/app/_componentes/use-eh-mobile";

import type { PontoDaSerie } from "@/lib/dominio/historico-precos";

const ALTURA = 220;
const MARGEM = { topo: 26, direita: 20, base: 28, esquerda: 56 };
/** Com 12px o rótulo "R$ 4.000" do eixo pede mais que os 56px de margem. */
const MARGEM_MOBILE = { ...MARGEM, esquerda: 64 };
const RAIO = 5;
const HORA_MS = 3_600_000;
/** Respiro nas pontas: o primeiro e o último ponto não encostam no eixo. */
const FOLGA_X = 24;

/** Limite do eixo y e os ticks: a partir de zero, em passos "redondos". */
function escalaY(maximo: number): { topo: number; ticks: number[] } {
  const alvo = Math.max(maximo, 1) / 4;
  const pot = 10 ** Math.floor(Math.log10(alvo));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= alvo) ?? alvo;
  const n = Math.ceil(maximo / passo);
  return { topo: n * passo, ticks: Array.from({ length: n + 1 }, (_, i) => i * passo) };
}

export function GraficoValorTotal({ serie }: { serie: readonly PontoDaSerie[] }) {
  const t = useTranslations("precos.grafico");
  const locale = useLocale();
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  const [ativo, setAtivo] = useState<number | null>(null);
  const mobile = useEhMobile();
  const fonte = mobile ? 12 : 11;
  const margem = mobile ? MARGEM_MOBILE : MARGEM;

  // Celular: o ponto fica fixo até um toque fora do gráfico. O painel com o
  // valor fica fora da área protegida: tocar nele também solta o ponto.
  useEffect(() => {
    if (!mobile || ativo === null) return;
    const soltar = (e: PointerEvent) => {
      if (e.target instanceof Node && caixa.current?.contains(e.target)) return;
      setAtivo(null);
    };
    document.addEventListener("pointerdown", soltar);
    return () => document.removeEventListener("pointerdown", soltar);
  }, [mobile, ativo]);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setLargura(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const brl = (v: number) => v.toLocaleString(locale, { style: "currency", currency: "BRL" });
  const brlCurto = (v: number) =>
    v.toLocaleString(locale, { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const diaCurto = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
  const horaCurta = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const diaHora = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const descricaoPonto = (p: PontoDaSerie) =>
    t("ponto", {
      data: diaHora(p.tiradoEm),
      total: brl(p.somaMedios),
      media: brl(p.precoMedioPorCarta),
      cartas: p.cartasComPreco,
    });

  if (serie.length === 0) return null;

  const w = Math.max(largura, 0);
  const areaW = Math.max(w - margem.esquerda - margem.direita, 1);
  const areaH = ALTURA - margem.topo - margem.base;
  const { topo, ticks } = escalaY(Math.max(...serie.map((p) => p.somaMedios)));
  const tempos = serie.map((p) => new Date(p.tiradoEm).getTime());
  const t0 = Math.min(...tempos);
  const t1 = Math.max(...tempos, t0 + HORA_MS);
  const x = (i: number) =>
    serie.length === 1
      ? margem.esquerda + areaW / 2
      : margem.esquerda + FOLGA_X + ((tempos[i] - t0) / (t1 - t0)) * (areaW - 2 * FOLGA_X);
  const y = (v: number) => margem.topo + areaH - (v / topo) * areaH;
  const caminho = serie.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.somaMedios).toFixed(1)}`).join(" ");
  const rotularCartas = serie.length <= 6 && !mobile;
  // Pontos no mesmo dia: o eixo mostra a hora junto, senão as duas pontas leriam igual.
  const mesmoDia = diaCurto(serie[0].tiradoEm) === diaCurto(serie[serie.length - 1].tiradoEm);
  const dia = (iso: string) => (mesmoDia ? `${diaCurto(iso)} ${horaCurta(iso)}` : diaCurto(iso));

  function apontar(e: React.PointerEvent<SVGSVGElement>) {
    const caixaSvg = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - caixaSvg.left;
    let melhor = 0;
    serie.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(melhor) - px)) melhor = i;
    });
    setAtivo(melhor);
  }

  const p = ativo === null ? null : serie[ativo];
  // O tooltip fica do lado com mais espaço, para não vazar em 400 px.
  const tooltipNaEsquerda = ativo !== null && x(ativo) > w / 2;
  const ultima = serie[serie.length - 1];

  return (
    <section className="flex flex-col gap-3 rounded-card border border-hairline bg-surface p-4 shadow-1">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-strong">{t("titulo")}</h2>
        <p className="text-sm text-muted">{t("aviso")}</p>
      </div>

      {serie.length === 1 && (
        <p className="text-sm text-muted">
          {t("umPonto", { total: brl(ultima.somaMedios), cartas: ultima.cartasComPreco, data: diaHora(ultima.tiradoEm) })}
        </p>
      )}

      <div ref={caixa} className="relative w-full">
        {w > 0 && (
          <svg
            width={w}
            height={ALTURA}
            role="img"
            aria-label={t("rotuloGrafico", { pontos: serie.length })}
            onPointerMove={apontar}
            onPointerUp={(e) => {
              if (mobile && e.pointerType === "touch") apontar(e);
            }}
            onPointerLeave={(e) => {
              // O dedo "sai" do gráfico ao levantar: soltar aqui apagaria o valor
              // antes de ele ser lido. No toque, quem solta é o toque fora.
              if (mobile && e.pointerType === "touch") return;
              setAtivo(null);
            }}
            className="block touch-pan-y"
          >
            {ticks.map((v) => (
              <g key={v}>
                <line
                  x1={margem.esquerda}
                  x2={w - margem.direita}
                  y1={y(v)}
                  y2={y(v)}
                  stroke="var(--hairline)"
                  strokeWidth={1}
                />
                <text
                  x={margem.esquerda - 8}
                  y={y(v)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={fonte}
                  fill="var(--muted)"
                >
                  {brlCurto(v)}
                </text>
              </g>
            ))}

            {serie.length > 1 && (
              <path d={caminho} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            )}

            {p && ativo !== null && (
              <line x1={x(ativo)} x2={x(ativo)} y1={margem.topo} y2={margem.topo + areaH} stroke="var(--line)" strokeWidth={1} />
            )}

            {serie.map((q, i) => (
              <g key={q.tiradoEm}>
                <circle
                  cx={x(i)}
                  cy={y(q.somaMedios)}
                  r={ativo === i ? RAIO + 2 : RAIO}
                  fill="var(--accent)"
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
                {rotularCartas && (
                  <text
                    x={x(i)}
                    y={y(q.somaMedios) - 12}
                    textAnchor={i === 0 && serie.length > 1 ? "start" : i === serie.length - 1 && serie.length > 1 ? "end" : "middle"}
                    fontSize={fonte}
                    fill="var(--muted)"
                  >
                    {t("cartasNoPonto", { cartas: q.cartasComPreco })}
                  </text>
                )}
              </g>
            ))}

            <text
              x={x(0)}
              y={ALTURA - 8}
              textAnchor={serie.length === 1 ? "middle" : "start"}
              fontSize={fonte}
              fill="var(--muted)"
            >
              {dia(serie[0].tiradoEm)}
            </text>
            {serie.length > 1 && (
              <text x={x(serie.length - 1)} y={ALTURA - 8} textAnchor="end" fontSize={fonte} fill="var(--muted)">
                {dia(ultima.tiradoEm)}
              </text>
            )}
          </svg>
        )}

        {p && ativo !== null && !mobile && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 rounded-card border border-hairline bg-surface-elevated p-2 text-xs shadow-1"
            style={{ top: margem.topo + areaH * 0.5, ...(tooltipNaEsquerda ? { right: w - x(ativo) + 10 } : { left: x(ativo) + 10 }) }}
          >
            <div className="font-semibold text-strong">{diaHora(p.tiradoEm)}</div>
            <div className="font-mono tabular-nums text-strong">{brl(p.somaMedios)}</div>
            <div className="text-muted">{t("tooltipMedia", { media: brl(p.precoMedioPorCarta) })}</div>
            <div className="text-muted">{t("tooltipCartas", { cartas: p.cartasComPreco })}</div>
          </div>
        )}
      </div>

      {mobile && (
        <div
          role="status"
          // Altura do estado com ponto (4 linhas de 20px + intervalos + padding
          // + borda ≈ 112px) reservada também no estado vazio: escolher um ponto
          // não pode empurrar a página para baixo.
          className="flex min-h-[7.5rem] flex-col justify-center gap-0.5 rounded-card border border-hairline bg-surface-elevated p-3 text-sm"
        >
          {p ? (
            <>
              <div className="font-semibold text-strong">{diaHora(p.tiradoEm)}</div>
              <div className="font-mono tabular-nums text-strong">{brl(p.somaMedios)}</div>
              <div className="text-muted">{t("tooltipMedia", { media: brl(p.precoMedioPorCarta) })}</div>
              <div className="text-muted">{t("tooltipCartas", { cartas: p.cartasComPreco })}</div>
            </>
          ) : (
            <p className="text-muted">{t("toqueParaVer")}</p>
          )}
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted max-md:py-3">{t("verTabela")}</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left text-xs">
            <thead>
              <tr className="text-muted">
                <th className="p-1 font-medium">{t("colunaData")}</th>
                <th className="p-1 text-right font-medium">{t("colunaTotal")}</th>
                <th className="p-1 text-right font-medium">{t("colunaMedia")}</th>
                <th className="p-1 text-right font-medium">{t("colunaCartas")}</th>
              </tr>
            </thead>
            <tbody>
              {serie.map((q) => (
                <tr key={q.tiradoEm} title={descricaoPonto(q)}>
                  <td className="p-1">{diaHora(q.tiradoEm)}</td>
                  <td className="p-1 text-right font-mono tabular-nums">{brl(q.somaMedios)}</td>
                  <td className="p-1 text-right font-mono tabular-nums">{brl(q.precoMedioPorCarta)}</td>
                  <td className="p-1 text-right font-mono tabular-nums">{q.cartasComPreco}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="sr-only">{serie.map(descricaoPonto).join(". ")}</p>
    </section>
  );
}
