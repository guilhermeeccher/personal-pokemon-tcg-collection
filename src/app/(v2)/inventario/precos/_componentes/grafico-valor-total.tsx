"use client";

/**
 * O gráfico do valor total das cartas precificadas ao longo das rodadas: um
 * ponto por foto (`liga_snapshot_preco`) da **fonte de preço ativa**, em reais,
 * em SVG inline e sem dependência. Uma série só — o título já diz o que é.
 *
 * ## O que ele precisa dizer
 *
 * O total também sobe quando **entram cartas** na tabela (uma rodada nova pode
 * precificar mais cartas), e não só quando os preços valorizam; por isso cada
 * ponto mostra quantas cartas tinha e o preço médio por carta, e o aviso
 * escrito acima do desenho diz que comprar ou precificar mais cartas não é
 * valorização. Na fonte Cardmarket o aviso acrescenta que a série acompanha o
 * câmbio.
 *
 * O servidor só manda as fotos da fonte ativa: a série da Liga e a do
 * Cardmarket **nunca se misturam** nem se comparam, porque trocar uma pela
 * outra no mesmo desenho pareceria uma queda que não aconteceu (a tendência do
 * Cardmarket fica perto do menor preço da Liga, bem abaixo do médio).
 *
 * ## Como se lê, sem mouse
 *
 * Um painel de leitura fica **sempre** embaixo do desenho, com o ponto
 * escolhido (o último, enquanto ninguém escolheu): ponteiro (mouse e caneta
 * seguem o movimento), toque e as setas do teclado escolhem o ponto, e ele
 * fica até outra escolha. Um painel fixo, e não uma caixa que segue o dedo: o
 * dedo que tocou cobriria a caixa, e num gráfico de ~300 px ela vazaria da
 * tela. O desenho só cede a rolagem vertical (`touch-action: pan-y`). Os mesmos
 * pontos estão numa tabela (`<details>`), e o desenho em si é escondido do
 * leitor de tela, que lê a tabela e o painel.
 *
 * A largura é medida (`ResizeObserver`) e o SVG é desenhado nela, em vez de um
 * `viewBox` esticado: assim o texto dos eixos mantém o tamanho a 320 px. A
 * geometria é pura e testada (`lib/dominio/precos-v2.ts`).
 */

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import type { FontePreco } from "@/lib/dominio/fonte-preco";
import type { PontoDaSerie } from "@/lib/dominio/historico-precos";
import {
  ALTURA_GRAFICO,
  MARGEM_GRAFICO,
  escalaY,
  indiceEmFoco,
  moverFoco,
  pontoMaisProximo,
  posicoesX,
} from "@/lib/dominio/precos-v2";

import estilos from "./precos.module.css";

const RAIO = 5;

/** Os rótulos que dizem o que é o total; cada um tem a versão do Cardmarket em `grafico.cardmarket`. */
type RotuloDaFonte = "titulo" | "aviso" | "rotuloGrafico" | "ponto" | "leituraMedia" | "colunaTotal" | "colunaMedia";

export function GraficoValorTotal({ serie, fonte }: { serie: readonly PontoDaSerie[]; fonte: FontePreco }) {
  const t = useTranslations("v2Precos.grafico");
  const r = (chave: RotuloDaFonte) => (fonte === "cardmarket" ? `cardmarket.${chave}` : chave);
  const locale = useLocale();
  const caixa = useRef<HTMLDivElement>(null);
  const idLeitura = useId();
  const [largura, setLargura] = useState(0);
  const [ativo, setAtivo] = useState<number | null>(null);
  const temSerie = serie.length > 0;

  // A caixa só existe com série; o efeito roda de novo quando a primeira chega.
  useEffect(() => {
    if (!temSerie) return;
    const el = caixa.current;
    if (!el) return;
    const medir = () => setLargura(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [temSerie]);

  if (!temSerie) return null;

  const brl = (v: number) => v.toLocaleString(locale, { style: "currency", currency: "BRL" });
  const brlCurto = (v: number) =>
    v.toLocaleString(locale, { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const diaCurto = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
  const horaCurta = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const diaHora = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const descricaoPonto = (p: PontoDaSerie) =>
    t(r("ponto"), {
      data: diaHora(p.tiradoEm),
      total: brl(p.somaMedios),
      media: brl(p.precoMedioPorCarta),
      cartas: p.cartasComPreco,
    });

  const margem = MARGEM_GRAFICO;
  const w = Math.max(largura, 0);
  const areaH = ALTURA_GRAFICO - margem.topo - margem.base;
  const { topo, ticks } = escalaY(Math.max(...serie.map((p) => p.somaMedios)));
  const xs = posicoesX(
    serie.map((p) => new Date(p.tiradoEm).getTime()),
    w,
  );
  const y = (v: number) => margem.topo + areaH - (v / topo) * areaH;
  const caminho = serie
    .map((p, i) => `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)},${y(p.somaMedios).toFixed(1)}`)
    .join(" ");
  // Pontos no mesmo dia: o eixo mostra a hora junto, senão as duas pontas leriam igual.
  const mesmoDia = diaCurto(serie[0].tiradoEm) === diaCurto(serie[serie.length - 1].tiradoEm);
  const dia = (iso: string) => (mesmoDia ? `${diaCurto(iso)} ${horaCurta(iso)}` : diaCurto(iso));

  const foco = indiceEmFoco(ativo, serie.length);
  const p = serie[foco];
  const ultima = serie[serie.length - 1];

  function apontar(e: PointerEvent<SVGSVGElement>) {
    const caixaSvg = e.currentTarget.getBoundingClientRect();
    const i = pontoMaisProximo(xs, e.clientX - caixaSvg.left);
    if (i >= 0) setAtivo(i);
  }

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const proximo = moverFoco(foco, serie.length, e.key);
    if (proximo === null) return;
    e.preventDefault();
    setAtivo(proximo);
  }

  return (
    <section className={`v2-painel ${estilos.grafico}`}>
      <div className={estilos.graficoTexto}>
        <h2 className={estilos.subtitulo}>{t(r("titulo"))}</h2>
        {/* À vista, e não numa dica: é o que impede ler a subida do total como valorização. */}
        <p className={estilos.aviso}>{t(r("aviso"))}</p>
      </div>

      {serie.length === 1 && (
        <p className={estilos.aviso}>
          {t("umPonto", { total: brl(ultima.somaMedios), cartas: ultima.cartasComPreco, data: diaHora(ultima.tiradoEm) })}
        </p>
      )}

      <div
        ref={caixa}
        className={estilos.areaGrafico}
        tabIndex={0}
        role="group"
        aria-label={t(r("rotuloGrafico"), { pontos: serie.length })}
        aria-describedby={idLeitura}
        onKeyDown={aoTeclar}
      >
        {w > 0 && (
          <svg
            width={w}
            height={ALTURA_GRAFICO}
            aria-hidden
            focusable="false"
            onPointerMove={(e) => {
              // O toque escolhe no `pointerdown`/`up`: durante o gesto de rolar
              // a página o dedo passa por aqui e não deve trocar o ponto.
              if (e.pointerType !== "touch") apontar(e);
            }}
            onPointerDown={apontar}
            className={estilos.svg}
          >
            {ticks.map((v) => (
              <g key={v}>
                <line x1={margem.esquerda} x2={w - margem.direita} y1={y(v)} y2={y(v)} className={estilos.linhaGrade} />
                <text x={margem.esquerda - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" className={estilos.textoEixo}>
                  {brlCurto(v)}
                </text>
              </g>
            ))}

            {serie.length > 1 && <path d={caminho} className={estilos.serie} />}

            <line x1={xs[foco]} x2={xs[foco]} y1={margem.topo} y2={margem.topo + areaH} className={estilos.guia} />

            {serie.map((q, i) => (
              <circle
                key={q.tiradoEm}
                cx={xs[i]}
                cy={y(q.somaMedios)}
                r={foco === i ? RAIO + 2 : RAIO}
                className={foco === i ? `${estilos.ponto} ${estilos.pontoAtivo}` : estilos.ponto}
              />
            ))}

            <text
              x={xs[0]}
              y={ALTURA_GRAFICO - 8}
              textAnchor={serie.length === 1 ? "middle" : "start"}
              className={estilos.textoEixo}
            >
              {dia(serie[0].tiradoEm)}
            </text>
            {serie.length > 1 && (
              <text x={xs[serie.length - 1]} y={ALTURA_GRAFICO - 8} textAnchor="end" className={estilos.textoEixo}>
                {dia(ultima.tiradoEm)}
              </text>
            )}
          </svg>
        )}
      </div>

      {/* Altura reservada: trocar de ponto não empurra a página. */}
      <div id={idLeitura} className={`v2-painel ${estilos.leitura}`} role="status" aria-live="polite">
        <span className={estilos.leituraRotulo}>{t("leituraRotulo")}</span>
        <span className={estilos.leituraData}>{diaHora(p.tiradoEm)}</span>
        <span className={`${estilos.leituraTotal} v2-num`}>{brl(p.somaMedios)}</span>
        <span className={estilos.leituraLinha}>{t(r("leituraMedia"), { media: brl(p.precoMedioPorCarta) })}</span>
        <span className={estilos.leituraLinha}>{t("leituraCartas", { cartas: p.cartasComPreco })}</span>
      </div>
      <p className={estilos.dica}>{t("dica")}</p>

      <details className={estilos.detalhes}>
        <summary className={estilos.resumo}>{t("verTabela")}</summary>
        <div className={estilos.tabelaPontos}>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("colunaData")}</th>
                <th scope="col">{t(r("colunaTotal"))}</th>
                <th scope="col">{t(r("colunaMedia"))}</th>
                <th scope="col">{t("colunaCartas")}</th>
              </tr>
            </thead>
            <tbody>
              {serie.map((q) => (
                <tr key={q.tiradoEm}>
                  <td>{diaHora(q.tiradoEm)}</td>
                  <td className="v2-num">{brl(q.somaMedios)}</td>
                  <td className="v2-num">{brl(q.precoMedioPorCarta)}</td>
                  <td className="v2-num">{q.cartasComPreco}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="v2-so-leitor">{serie.map(descricaoPonto).join(". ")}</p>
    </section>
  );
}
