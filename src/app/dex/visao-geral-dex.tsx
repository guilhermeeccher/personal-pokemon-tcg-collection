"use client";

/**
 * Visão geral da Living Dex — o modelo é a vitrine das coleções de carta
 * (`/inventario/visao-geral`): o HOME e cada jogo do usuário como um cartão
 * de coleção, com % grande e confete quando completa (pedido de
 * 2026-10-12). Acima, o progresso no HOME por região; abaixo, o plano ativo
 * e o que está num jogo e ainda não foi ao HOME.
 *
 * Os troféus do HOME chegam sem conquista e são calculados aqui dos
 * registros (`comTrofeusDoHome`), como na tela de Troféus.
 */

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Distintivo } from "@/app/_componentes/distintivo";
import { BarraProgresso } from "@/app/_componentes/ds/barra-progresso";
import { formatarPercentual } from "@/app/_componentes/ds/linha-distribuicao";
import { COR_DIVISAO_COMPLETA, percentualDe } from "@/app/_componentes/ds/progresso-divisoes";
import { Icone } from "@/app/_componentes/icone";
import { Painel } from "@/app/_componentes/painel";
import { naoTransferiveis } from "@/lib/dominio/dex-disponibilidade";
import { mapearEstadosDex, progressoDex, type ProgressoTrilha } from "@/lib/dominio/dex-estado";
import { vistaDaCategoria } from "@/lib/dominio/dex-grade";
import { oportunidadesHome } from "@/lib/dominio/dex-inventario";
import { jogoDex } from "@/lib/dominio/dex-jogos";
import type { SecoesContadas } from "@/lib/dominio/dex-secoes";
import { JOGO_HOME, progressoTrofeus, type IdiomaTrofeu, type ProgressoTrofeus } from "@/lib/dominio/dex-trofeus";
import { comTrofeusDoHome } from "@/lib/dominio/dex-trofeus-home";
import { progressoDoJogo, progressoPorRegiao, type ProgressoJogoDex } from "@/lib/dominio/dex-visao-geral";
import { NOME_REGIAO } from "@/lib/dominio/escopo-pokedex";
import type {
  FormaDexDTO,
  JogoPossuidoDTO,
  PlanoDexDTO,
  RegistroDexDTO,
  TrofeuDexDTO,
} from "@/lib/dominio/tipos-cliente";

const COR_PLATINA = "var(--trophy-platinum)";

export function VisaoGeralDex({
  formas,
  secoes,
  registros,
  jogos,
  trofeus: trofeusBrutos,
  planos,
}: {
  formas: FormaDexDTO[];
  secoes: SecoesContadas;
  registros: RegistroDexDTO[];
  jogos: JogoPossuidoDTO[];
  trofeus: TrofeuDexDTO[];
  planos: PlanoDexDTO[];
}) {
  const t = useTranslations("dex");
  const idioma = useLocale() as IdiomaTrofeu;

  const mapa = useMemo(() => mapearEstadosDex(registros), [registros]);
  const trofeus = useMemo(() => comTrofeusDoHome(trofeusBrutos, formas, mapa, secoes), [trofeusBrutos, formas, mapa, secoes]);
  const obtidos = useMemo(() => new Set(trofeus.filter((x) => x.obtido).map((x) => x.id)), [trofeus]);
  const titulo = (id: string) => trofeus.find((x) => x.id === id)?.textos[idioma].titulo ?? id;

  const principal = useMemo(() => formas.filter((f) => vistaDaCategoria(f.categoria) === "principal"), [formas]);
  const cosmeticas = useMemo(() => formas.filter((f) => vistaDaCategoria(f.categoria) === "cosmeticas"), [formas]);
  const progresso = useMemo(() => progressoDex(principal, mapa, secoes), [principal, mapa, secoes]);
  const progressoCosmeticas = useMemo(() => progressoDex(cosmeticas, mapa, secoes), [cosmeticas, mapa, secoes]);
  const porRegiao = useMemo(() => progressoPorRegiao(formas, mapa, secoes), [formas, mapa, secoes]);
  const foraDoHome = useMemo(() => oportunidadesHome(registros, naoTransferiveis()), [registros]);

  const cartaoHome = progressoTrofeus(trofeus, JOGO_HOME, obtidos);
  const cartoesJogos = jogos.map((j) => ({
    jogo: j,
    dex: progressoDoJogo(j.jogoId, formas, registros, mapa, secoes, trofeus, obtidos),
    trofeus: progressoTrofeus(trofeus, j.jogoId, obtidos),
  }));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 p-4 sm:p-8">
      <CabecalhoPagina titulo={t("visaoGeral.titulo")} />

      <Painel as="section" className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <NumeroGrande rotulo={t("trilha.normal")} p={progresso.normal} />
          <NumeroGrande rotulo={t("trilha.shiny")} p={progresso.shiny} />
        </div>
        <p className="text-xs text-muted">
          {t("visaoGeral.cosmeticas", {
            normal: `${progressoCosmeticas.normal.noHome}/${progressoCosmeticas.normal.contam}`,
            shiny: `${progressoCosmeticas.shiny.noHome}/${progressoCosmeticas.shiny.contam}`,
          })}
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-1 font-semibold">{t("pokedex.regiao")}</th>
              <th className="py-1 font-semibold">{t("trilha.normal")}</th>
              <th className="hidden py-1 text-right font-semibold sm:table-cell">{t("trilha.shiny")}</th>
            </tr>
          </thead>
          <tbody>
            {porRegiao.map(({ regiao, progresso: p }) => (
              <tr key={regiao} className="border-t border-hairline">
                <td className="py-1.5 pr-3 font-medium text-strong">{NOME_REGIAO[regiao]}</td>
                <td className="w-full py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <BarraProgresso
                        valor={p.normal.noHome}
                        maximo={p.normal.contam}
                        cor={p.normal.contam > 0 && p.normal.noHome === p.normal.contam ? COR_DIVISAO_COMPLETA : undefined}
                      />
                    </div>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                      {p.normal.noHome}/{p.normal.contam}
                    </span>
                  </div>
                </td>
                <td className="hidden py-1.5 pl-3 text-right font-mono text-xs tabular-nums text-muted sm:table-cell">
                  {p.shiny.noHome}/{p.shiny.contam}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Painel>

      <section className="flex flex-col gap-3">
        <h2 className="text-[length:var(--fs-title-1)] text-strong">{t("visaoGeral.colecoes")}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CartaoDex
            href={`/dex/trofeus?jogo=${JOGO_HOME}`}
            nome="Pokémon HOME"
            subtitulo={t("visaoGeral.livingDex")}
            feitas={progresso.normal.noHome}
            total={progresso.normal.contam}
            trofeus={cartaoHome}
          >
            <p className="text-xs text-muted">
              {t("visaoGeral.shinyNoHome", { feitas: String(progresso.shiny.noHome), total: String(progresso.shiny.contam) })}
            </p>
          </CartaoDex>
          {cartoesJogos.map(({ jogo, dex, trofeus: tj }) => (
            <CartaoDex
              key={jogo.jogoId}
              href={`/dex/trofeus?jogo=${jogo.jogoId}`}
              nome={jogo.nome}
              subtitulo={jogo.ativo ? t(`conexao.${jogo.conexaoHome}`) : t("visaoGeral.parado")}
              feitas={dex?.pegas ?? null}
              total={dex?.total ?? null}
              trofeus={tj}
            >
              <DetalheJogo dex={dex} registrosAqui={jogo.registrosAqui} titulo={titulo} />
            </CartaoDex>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel as="section" className="flex flex-col gap-3">
          <h2 className="text-[length:var(--fs-title-2)] text-strong">{t("visaoGeral.planoAtivo")}</h2>
          {planos.length === 0 ? (
            <p className="text-sm text-muted">{t("visaoGeral.semPlano")}</p>
          ) : (
            planos.map((p) => {
              const feitas = p.tarefas.filter((x) => x.status !== "aberta").length;
              return (
                <Link key={p.id} href="/dex/planos" className="flex flex-col gap-1.5 rounded-md hover:bg-surface-hover">
                  <span className="font-display text-base font-bold text-strong">{p.titulo}</span>
                  {p.objetivo && <span className="text-sm text-muted">{p.objetivo}</span>}
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <BarraProgresso valor={feitas} maximo={p.tarefas.length} />
                    </div>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                      {feitas}/{p.tarefas.length}
                    </span>
                  </div>
                  {p.fim && <span className="text-xs text-muted">{t("visaoGeral.ate", { data: p.fim })}</span>}
                </Link>
              );
            })
          )}
        </Painel>

        <Painel as="section" className="flex flex-col gap-3">
          <h2 className="text-[length:var(--fs-title-2)] text-strong">{t("visaoGeral.foraDoHome")}</h2>
          {foraDoHome.length === 0 ? (
            <p className="text-sm text-muted">{t("visaoGeral.nadaForaDoHome")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {foraDoHome.map((g) => (
                <li key={g.jogoId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-strong">{jogoDex(g.jogoId)?.nome ?? g.jogoId}</span>
                  <span className="font-mono tabular-nums text-muted">{g.itens.length}</span>
                </li>
              ))}
              <li>
                <Link href="/dex/pokedex" className="text-sm font-semibold text-accent hover:underline">
                  {t("visaoGeral.levarAoHome")}
                </Link>
              </li>
            </ul>
          )}
        </Painel>
      </div>
    </main>
  );
}

function NumeroGrande({ rotulo, p }: { rotulo: string; p: ProgressoTrilha }) {
  const t = useTranslations("dex");
  const locale = useLocale();
  const completa = p.contam > 0 && p.noHome === p.contam;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{rotulo}</span>
      <div className="flex items-baseline gap-2">
        <span
          className="font-display text-[length:var(--fs-display-2)] leading-none font-bold tabular-nums"
          style={{ color: completa ? COR_DIVISAO_COMPLETA : "var(--berry-4)" }}
        >
          {formatarPercentual(percentualDe(p.noHome, p.contam), locale)}
        </span>
        <span className="font-mono text-sm tabular-nums text-muted">
          {p.noHome}/{p.contam}
        </span>
      </div>
      <BarraProgresso valor={p.noHome} maximo={p.contam} cor={completa ? COR_DIVISAO_COMPLETA : undefined} altura={8} />
      {p.noJogo > 0 && (
        <span className="text-xs text-muted">{t("pokedex.progressoNoJogo", { noJogo: String(p.noJogo) })}</span>
      )}
    </div>
  );
}

/** Cartão de coleção: o HOME ou um jogo. `feitas`/`total` nulos = jogo sem catálogo. */
function CartaoDex({
  href,
  nome,
  subtitulo,
  feitas,
  total,
  trofeus,
  children,
}: {
  href: string;
  nome: string;
  subtitulo: string;
  feitas: number | null;
  total: number | null;
  trofeus: ProgressoTrofeus;
  children?: React.ReactNode;
}) {
  const t = useTranslations("dex");
  const locale = useLocale();
  const completa = feitas !== null && total !== null && total > 0 && feitas === total;
  return (
    <Link
      href={href}
      className="group flex min-h-[200px] flex-col gap-3 rounded-card border border-hairline bg-surface p-5 shadow-1 [transition:var(--transition-surface)] hover:-translate-y-0.5 hover:shadow-3"
      // Coleção fechada ganha confete, como as de carta.
      style={completa ? { backgroundImage: "var(--motif-confetti)", backgroundSize: "var(--motif-confetti-size)" } : undefined}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-[length:var(--fs-title-2)] text-strong">{nome}</h3>
          {completa && (
            <Distintivo tom="sucesso" className="gap-1">
              <Icone nome="crown" tamanho={12} />
              {t("visaoGeral.completa")}
            </Distintivo>
          )}
        </div>
        <span className="text-xs text-muted">{subtitulo}</span>
      </div>

      {feitas !== null && total !== null && (
        <>
          <div className="flex items-baseline gap-2">
            <span
              className="font-display text-[length:var(--fs-display-2)] leading-none font-bold tabular-nums"
              style={{ color: completa ? COR_DIVISAO_COMPLETA : "var(--berry-4)" }}
            >
              {formatarPercentual(percentualDe(feitas, total), locale)}
            </span>
            <span className="font-mono text-sm tabular-nums text-muted">
              {feitas}/{total}
            </span>
          </div>
          <BarraProgresso valor={feitas} maximo={total} cor={completa ? COR_DIVISAO_COMPLETA : undefined} altura={8} />
        </>
      )}

      {children}

      {trofeus.total > 0 && (
        <div className="mt-auto flex items-center gap-2 text-sm">
          <span style={{ color: trofeus.platina ? COR_PLATINA : "var(--slate-3)" }}>
            <Icone nome="trophy" tamanho={16} />
          </span>
          <span className="text-muted">{trofeus.platina ? t("trofeus.platinaConquistada") : t("trofeus.platina")}</span>
          <span className="ml-auto font-mono tabular-nums text-strong">
            {trofeus.obtidos}/{trofeus.total}
          </span>
        </div>
      )}
    </Link>
  );
}

function DetalheJogo({
  dex,
  registrosAqui,
  titulo,
}: {
  dex: ProgressoJogoDex | null;
  registrosAqui: number;
  titulo: (id: string) => string;
}) {
  const t = useTranslations("dex");
  if (!dex) return <p className="text-xs text-muted">{t("visaoGeral.semCatalogo", { aqui: String(registrosAqui) })}</p>;
  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted">
      <span>
        {dex.pegas === 0
          ? t("visaoGeral.nadaPego")
          : t("visaoGeral.pegasNoHome", { noHome: String(dex.noHome), pegas: String(dex.pegas) })}
      </span>
      <span>{t("visaoGeral.faltamAgora", { faltam: String(dex.faltamAgora) })}</span>
      {dex.trancadas.slice(0, 2).map((c) => (
        <span key={c.trofeuId}>{t("visaoGeral.trancadasAtras", { vagas: String(c.vagas), trofeu: titulo(c.trofeuId) })}</span>
      ))}
    </div>
  );
}
