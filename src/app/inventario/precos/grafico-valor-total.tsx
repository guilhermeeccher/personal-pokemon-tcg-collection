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
 */

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import type { PontoDaSerie } from "@/lib/dominio/historico-precos";

const ALTURA = 220;
const MARGEM = { topo: 26, direita: 20, base: 28, esquerda: 56 };
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
  const areaW = Math.max(w - MARGEM.esquerda - MARGEM.direita, 1);
  const areaH = ALTURA - MARGEM.topo - MARGEM.base;
  const { topo, ticks } = escalaY(Math.max(...serie.map((p) => p.somaMedios)));
  const tempos = serie.map((p) => new Date(p.tiradoEm).getTime());
  const t0 = Math.min(...tempos);
  const t1 = Math.max(...tempos, t0 + HORA_MS);
  const x = (i: number) =>
    serie.length === 1
      ? MARGEM.esquerda + areaW / 2
      : MARGEM.esquerda + FOLGA_X + ((tempos[i] - t0) / (t1 - t0)) * (areaW - 2 * FOLGA_X);
  const y = (v: number) => MARGEM.topo + areaH - (v / topo) * areaH;
  const caminho = serie.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.somaMedios).toFixed(1)}`).join(" ");
  const rotularCartas = serie.length <= 6;
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
            onPointerLeave={() => setAtivo(null)}
            className="block touch-pan-y"
          >
            {ticks.map((v) => (
              <g key={v}>
                <line
                  x1={MARGEM.esquerda}
                  x2={w - MARGEM.direita}
                  y1={y(v)}
                  y2={y(v)}
                  stroke="var(--hairline)"
                  strokeWidth={1}
                />
                <text
                  x={MARGEM.esquerda - 8}
                  y={y(v)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={11}
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
              <line x1={x(ativo)} x2={x(ativo)} y1={MARGEM.topo} y2={MARGEM.topo + areaH} stroke="var(--line)" strokeWidth={1} />
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
                    fontSize={11}
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
              fontSize={11}
              fill="var(--muted)"
            >
              {dia(serie[0].tiradoEm)}
            </text>
            {serie.length > 1 && (
              <text x={x(serie.length - 1)} y={ALTURA - 8} textAnchor="end" fontSize={11} fill="var(--muted)">
                {dia(ultima.tiradoEm)}
              </text>
            )}
          </svg>
        )}

        {p && ativo !== null && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 rounded-card border border-hairline bg-surface-elevated p-2 text-xs shadow-1"
            style={{ top: MARGEM.topo + areaH * 0.5, ...(tooltipNaEsquerda ? { right: w - x(ativo) + 10 } : { left: x(ativo) + 10 }) }}
          >
            <div className="font-semibold text-strong">{diaHora(p.tiradoEm)}</div>
            <div className="font-mono tabular-nums text-strong">{brl(p.somaMedios)}</div>
            <div className="text-muted">{t("tooltipMedia", { media: brl(p.precoMedioPorCarta) })}</div>
            <div className="text-muted">{t("tooltipCartas", { cartas: p.cartasComPreco })}</div>
          </div>
        )}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted">{t("verTabela")}</summary>
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
