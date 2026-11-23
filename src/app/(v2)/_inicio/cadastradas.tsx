"use client";

import Link from "next/link";
import { type DateTimeFormatOptions, useFormatter, useTranslations } from "next-intl";

import { rotuloDoDia } from "@/lib/dominio/cadastradas-recentes";
import type { CadastradasInicioV2 } from "@/lib/dominio/inicio-v2";

import { CartaTocavel } from "./carta-tocavel";
import estilos from "./inicio.module.css";
import type { CartasDoInicio } from "./tipos";

/** `AAAA-MM-DD` como instante UTC, para formatar o dia sem fuso nenhum mexer nele. */
function diaComoData(dia: string): Date {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

/**
 * "Cadastradas nos últimos 7 dias" (decisão de 2026-11-22): as cópias que
 * entraram no inventário, pela data de cadastro, no fuso de São Paulo. A
 * janela, o dia de cada uma e "hoje" chegam do servidor
 * (`cadastradas-recentes.ts`); aqui o dia só vira texto, sempre formatado em
 * UTC sobre a data pura, para o fuso do navegador nunca trocar o dia.
 *
 * Uma cópia é uma linha do inventário: duas cópias da mesma carta (idiomas,
 * variantes diferentes) aparecem as duas. A contagem é de todas as da janela;
 * a grade mostra as mais recentes. O que a regra não alcança (unidades
 * fundidas numa cópia antiga, divisões de lote antigas) está escrito na nota,
 * em vez de ficar implícito.
 */
export function Cadastradas({ cadastradas, cartas }: { cadastradas: CadastradasInicioV2; cartas: CartasDoInicio }) {
  const t = useTranslations("v2Inicio.cadastradas");
  const formato = useFormatter();
  const data = (dia: string, opcoes: DateTimeFormatOptions) => formato.dateTime(diaComoData(dia), { ...opcoes, timeZone: "UTC" });
  const textoDoDia = (dia: string) => {
    const r = rotuloDoDia(dia, cadastradas.hoje);
    if (r.tipo === "hoje") return t("hoje");
    if (r.tipo === "ontem") return t("ontem");
    return data(r.dia, { weekday: "short", day: "2-digit", month: "2-digit" });
  };
  const alem = cadastradas.copias - cadastradas.itens.length;

  return (
    <section className={estilos.secao} aria-labelledby="inicio-cadastradas">
      <div className={estilos.secaoCab}>
        <div>
          <h2 id="inicio-cadastradas" className={estilos.secaoTitulo}>
            {t("titulo")}
          </h2>
          <p className={`${estilos.secaoSub} v2-num`}>
            {cadastradas.copias > 0 && <>{t("contagem", { unidades: cadastradas.unidades, cartas: cadastradas.cartas })} · </>}
            {t("desde", { data: data(cadastradas.desde, { day: "2-digit", month: "2-digit", year: "numeric" }) })}
          </p>
        </div>
        <Link href="/inventario" className={estilos.link}>
          {t("inventario")}
        </Link>
      </div>

      {cadastradas.itens.length === 0 ? (
        <p className={estilos.vazio}>{t("vazio")}</p>
      ) : (
        <ul className={estilos.cadastradas}>
          {cadastradas.itens.map((c) => {
            const dia = textoDoDia(c.dia);
            return (
              <li key={c.copiaId}>
                <CartaTocavel chave={`cadastrada:${c.copiaId}`} carta={c} cartas={cartas} rotulo={t("abrir", { nome: c.nome, dia })}>
                  <span className={estilos.legendaCarta} aria-hidden>
                    <b>{c.nome}</b>
                    <span>
                      {dia}
                      {c.quantidade > 1 && <span className="v2-num"> · {t("quantidade", { total: c.quantidade })}</span>}
                    </span>
                  </span>
                </CartaTocavel>
              </li>
            );
          })}
        </ul>
      )}
      {alem > 0 && (
        <Link href="/inventario" className={estilos.link}>
          {t("mais", { total: alem })}
        </Link>
      )}
      <p className={estilos.nota}>{t("nota")}</p>
    </section>
  );
}
