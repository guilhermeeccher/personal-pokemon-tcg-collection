"use client";

/**
 * Visão geral da Living Dex — o modelo é a vitrine das coleções de carta
 * (`/inventario/visao-geral`): imagem grande, % grande, confete quando
 * completa (pedidos de 2026-10-12: "mais animado, com imagens" e "valorizar
 * as conquistas"). De cima para baixo:
 *
 * - vitrine: os últimos Pokémon que chegaram ao HOME, ou, com o HOME vazio,
 *   o que os jogos do usuário alcançam agora (`pegueAgora`);
 * - progresso no HOME e as regiões, cada uma com os três iniciais, que ganham
 *   cor conforme a região avança;
 * - conquistas: a estante (platinas, ouros, pratas, bronzes), o próximo
 *   troféu do HOME e as últimas conquistas;
 * - o HOME e cada jogo como cartão de coleção, com o Pokémon de capa;
 * - plano ativo e o que está num jogo e ainda não foi ao HOME.
 *
 * As imagens grandes são os renders do HOME (`urlRenderHomeDex`), baixados
 * na hora como os sprites. Os troféus do HOME são calculados aqui dos
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
import { CAPA_DO_JOGO } from "@/lib/dominio/dex-capas";
import { naoTransferiveis } from "@/lib/dominio/dex-disponibilidade";
import { mapearEstadosDex, progressoDex, type ProgressoTrilha } from "@/lib/dominio/dex-estado";
import { vistaDaCategoria } from "@/lib/dominio/dex-grade";
import { oportunidadesHome } from "@/lib/dominio/dex-inventario";
import { jogoDex } from "@/lib/dominio/dex-jogos";
import type { SecoesContadas } from "@/lib/dominio/dex-secoes";
import {
  JOGO_HOME,
  progressoTrofeus,
  type IdiomaTrofeu,
  type NivelTrofeu,
  type ProgressoTrofeus,
} from "@/lib/dominio/dex-trofeus";
import { comTrofeusDoHome, proximoTrofeuHome } from "@/lib/dominio/dex-trofeus-home";
import {
  estanteDeTrofeus,
  pegueAgora,
  progressoDoJogo,
  progressoPorRegiao,
  ultimasConquistas,
  ultimosNoHome,
  type ProgressoJogoDex,
} from "@/lib/dominio/dex-visao-geral";
import { NOME_REGIAO, type Regiao } from "@/lib/dominio/escopo-pokedex";
import type {
  FormaDexDTO,
  JogoPossuidoDTO,
  PlanoDexDTO,
  RegistroDexDTO,
  TrofeuDexDTO,
} from "@/lib/dominio/tipos-cliente";
import { urlRenderHomeDex, urlSpriteDex } from "@/lib/imagens";

import { useRotuloForma } from "./_componentes/use-rotulo-forma";

const COR_NIVEL: Record<NivelTrofeu | "platina", string> = {
  bronze: "var(--trophy-bronze)",
  prata: "var(--trophy-silver)",
  ouro: "var(--trophy-gold)",
  platina: "var(--trophy-platinum)",
};

/** Os três iniciais de cada região, na ordem planta, fogo, água. */
const INICIAIS: Record<Regiao, [number, number, number]> = {
  kanto: [1, 4, 7],
  johto: [152, 155, 158],
  hoenn: [252, 255, 258],
  sinnoh: [387, 390, 393],
  unova: [495, 498, 501],
  kalos: [650, 653, 656],
  alola: [722, 725, 728],
  galar: [810, 813, 816],
  paldea: [906, 909, 912],
};

const NA_VITRINE = 8;

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
  const rotulo = useRotuloForma(formas);
  const formaPorId = useMemo(() => new Map(formas.map((f) => [f.id, f])), [formas]);

  const mapa = useMemo(() => mapearEstadosDex(registros), [registros]);
  /* Só os troféus do HOME e dos jogos do usuário entram nas contas desta tela. */
  const trofeus = useMemo(() => {
    const meus = new Set([JOGO_HOME, ...jogos.map((j) => j.jogoId)]);
    return comTrofeusDoHome(
      trofeusBrutos.filter((x) => meus.has(x.jogoId)),
      formas,
      mapa,
      secoes,
    );
  }, [trofeusBrutos, jogos, formas, mapa, secoes]);
  const obtidos = useMemo(() => new Set(trofeus.filter((x) => x.obtido).map((x) => x.id)), [trofeus]);
  const titulo = (id: string) => trofeus.find((x) => x.id === id)?.textos[idioma].titulo ?? id;
  const nomeJogo = (id: string) => (id === JOGO_HOME ? "Pokémon HOME" : (jogoDex(id)?.nome ?? id));

  const principal = useMemo(() => formas.filter((f) => vistaDaCategoria(f.categoria) === "principal"), [formas]);
  const cosmeticas = useMemo(() => formas.filter((f) => vistaDaCategoria(f.categoria) === "cosmeticas"), [formas]);
  const progresso = useMemo(() => progressoDex(principal, mapa, secoes), [principal, mapa, secoes]);
  const progressoCosmeticas = useMemo(() => progressoDex(cosmeticas, mapa, secoes), [cosmeticas, mapa, secoes]);
  const porRegiao = useMemo(() => progressoPorRegiao(formas, mapa, secoes), [formas, mapa, secoes]);
  const foraDoHome = useMemo(() => oportunidadesHome(registros, naoTransferiveis()), [registros]);

  const ultimos = useMemo(() => ultimosNoHome(registros, NA_VITRINE), [registros]);
  const sugestoes = useMemo(
    () =>
      ultimos.length > 0
        ? []
        : pegueAgora(
            jogos.filter((j) => j.ativo).map((j) => j.jogoId),
            formas,
            mapa,
            secoes,
            trofeus,
            obtidos,
            NA_VITRINE,
          ),
    [ultimos, jogos, formas, mapa, secoes, trofeus, obtidos],
  );

  const estante = estanteDeTrofeus(trofeus);
  const proximo = proximoTrofeuHome(
    trofeus.filter((x) => x.jogoId === JOGO_HOME),
    formas,
    mapa,
    secoes,
  );
  const recentes = ultimasConquistas(trofeus, 5);

  const cartaoHome = progressoTrofeus(trofeus, JOGO_HOME, obtidos);
  const cartoesJogos = jogos.map((j) => ({
    jogo: j,
    dex: progressoDoJogo(j.jogoId, formas, mapa, secoes, trofeus, obtidos),
    trofeus: progressoTrofeus(trofeus, j.jogoId, obtidos),
  }));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 p-4 sm:p-8">
      <CabecalhoPagina titulo={t("visaoGeral.titulo")} />

      {(ultimos.length > 0 || sugestoes.length > 0) && (
        <section
          className="flex flex-col gap-3 rounded-card border border-hairline p-5 shadow-1"
          style={{ background: "linear-gradient(135deg, var(--surface) 0%, var(--accent-soft, var(--surface)) 100%)" }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[length:var(--fs-title-1)] text-strong">
              {ultimos.length > 0 ? t("visaoGeral.chegaram") : t("visaoGeral.pegueAgora")}
            </h2>
            {ultimos.length === 0 && <span className="text-xs text-muted">{t("visaoGeral.pegueAgoraDica")}</span>}
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {(ultimos.length > 0
              ? ultimos.map((u) => ({ formaId: u.formaId, shiny: u.shiny, legenda: null as string | null }))
              : sugestoes.map((s) => ({ formaId: s.formaId, shiny: false, legenda: nomeJogo(s.jogoId) }))
            ).map(({ formaId, shiny, legenda }) => {
              const f = formaPorId.get(formaId);
              if (!f) return null;
              return (
                <li key={`${formaId}:${shiny}`}>
                  <Link
                    href={`/dex/cadastrar?busca=${f.numero}`}
                    className="group flex flex-col items-center gap-1 rounded-card p-2 text-center [transition:var(--transition-surface)] hover:bg-surface/70"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- render do HOME externo (PokeAPI), no máximo 8 na vitrine. */}
                    <img
                      src={urlRenderHomeDex(f.sprite, shiny)}
                      alt={rotulo.nome(f)}
                      width={112}
                      height={112}
                      className="h-28 w-28 object-contain drop-shadow-md [transition:transform_200ms] group-hover:-translate-y-1 group-hover:scale-105"
                    />
                    <span className="text-sm font-semibold text-strong">
                      {f.especie}
                      {shiny && <span className="ml-1 text-[color:var(--trophy-gold)]">★</span>}
                    </span>
                    {(rotulo.forma(f) || legenda) && (
                      <span className="text-xs text-muted">{legenda ?? rotulo.forma(f)}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {porRegiao.map(({ regiao, progresso: p }) => (
            <TileRegiao key={regiao} regiao={regiao} p={p} />
          ))}
        </ul>
      </Painel>

      <section className="flex flex-col gap-3">
        <h2 className="text-[length:var(--fs-title-1)] text-strong">{t("visaoGeral.conquistas")}</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <Painel className="flex flex-col gap-3">
            <h3 className="text-[length:var(--fs-title-2)] text-strong">{t("visaoGeral.estante")}</h3>
            <div className="grid grid-cols-4 gap-2">
              {(["platina", "ouro", "prata", "bronze"] as const).map((n) => (
                <div key={n} className="flex flex-col items-center gap-1">
                  <span style={{ color: estante[n] > 0 ? COR_NIVEL[n] : "var(--slate-3)" }}>
                    <Icone nome={n === "platina" ? "trophy" : "medal"} tamanho={28} />
                  </span>
                  <span className="font-display text-[length:var(--fs-title-1)] font-bold tabular-nums text-strong">
                    {estante[n]}
                  </span>
                  <span className="text-xs text-muted">
                    {n === "platina" ? t("trofeus.platina") : t(`trofeus.nivel.${n}`)}
                  </span>
                </div>
              ))}
            </div>
          </Painel>

          <Painel as={Link} href={`/dex/trofeus?jogo=${JOGO_HOME}`} className="flex flex-col gap-2 transition-colors hover:border-accent/40">
            <h3 className="text-[length:var(--fs-title-2)] text-strong">{t("visaoGeral.proximoTrofeu")}</h3>
            {proximo ? (
              <>
                <div className="flex items-center gap-2">
                  <span style={{ color: COR_NIVEL[proximo.trofeu.nivel] }}>
                    <Icone nome="medal" tamanho={20} />
                  </span>
                  <span className="font-display text-base font-bold text-strong">
                    {proximo.trofeu.textos[idioma].titulo}
                  </span>
                  <Distintivo>{t(`trofeus.nivel.${proximo.trofeu.nivel}`)}</Distintivo>
                </div>
                <p className="text-sm text-muted">{proximo.trofeu.textos[idioma].descricao}</p>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <BarraProgresso valor={proximo.feito} maximo={proximo.alvo} cor={COR_NIVEL[proximo.trofeu.nivel]} altura={8} />
                  </div>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                    {proximo.feito}/{proximo.alvo}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">{t("visaoGeral.todosDoHome")}</p>
            )}
          </Painel>

          <Painel className="flex flex-col gap-2">
            <h3 className="text-[length:var(--fs-title-2)] text-strong">{t("visaoGeral.ultimasConquistas")}</h3>
            {recentes.length === 0 ? (
              <p className="text-sm text-muted">{t("visaoGeral.nenhumaConquista")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {recentes.map((x) => (
                  <li key={x.id}>
                    <Link href={`/dex/trofeus?jogo=${x.jogoId}`} className="flex items-center gap-2 text-sm hover:underline max-md:min-h-11">
                      <span style={{ color: COR_NIVEL[x.nivel] }}>
                        <Icone nome="medal" tamanho={16} />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold text-strong">{x.textos[idioma].titulo}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {nomeJogo(x.jogoId).replace(/^Pokémon:? /, "")} · {x.obtido?.em}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Painel>
        </div>
      </section>

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
            arte={ultimos
              .slice(0, 1)
              .map((u) => formaPorId.get(u.formaId))
              .filter((f): f is FormaDexDTO => !!f)
              .map((f) => urlRenderHomeDex(f.sprite, false))}
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
              arte={CAPA_DO_JOGO[jogo.jogoId] ? [urlRenderHomeDex(String(CAPA_DO_JOGO[jogo.jogoId]), false)] : []}
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
                  {p.trofeuIds.length > 0 && (
                    <span className="text-xs text-muted">{p.trofeuIds.map(titulo).join(", ")}</span>
                  )}
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
            <ul className="flex flex-col gap-2">
              {foraDoHome.map((g) => (
                <li key={g.jogoId} className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 text-strong">{nomeJogo(g.jogoId)}</span>
                  <span className="flex -space-x-2">
                    {g.itens.slice(0, 5).map((i) => {
                      const f = formaPorId.get(i.formaId);
                      return f ? (
                        // eslint-disable-next-line @next/next/no-img-element -- sprite pequeno externo (PokeAPI).
                        <img
                          key={`${i.formaId}:${i.trilha}`}
                          src={urlSpriteDex(f.sprite, i.trilha === "shiny")}
                          alt={rotulo.nome(f)}
                          width={32}
                          height={32}
                          style={{ imageRendering: "pixelated" }}
                        />
                      ) : null;
                    })}
                  </span>
                  <span className="font-mono tabular-nums text-muted">{g.itens.length}</span>
                </li>
              ))}
              <li>
                <Link href="/dex/pokedex" className="text-sm font-semibold text-accent hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center">
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

/** Uma região: os três iniciais ganham cor conforme ela avança (e de vez, ao passar o mouse). */
function TileRegiao({ regiao, p }: { regiao: Regiao; p: Record<"normal" | "shiny", ProgressoTrilha> }) {
  const t = useTranslations("dex");
  const locale = useLocale();
  const fracao = p.normal.contam > 0 ? p.normal.noHome / p.normal.contam : 0;
  const completa = p.normal.contam > 0 && p.normal.noHome === p.normal.contam;
  return (
    <li
      className="group flex flex-col gap-2 rounded-card border border-hairline bg-surface p-3"
      style={completa ? { backgroundImage: "var(--motif-confetti)", backgroundSize: "var(--motif-confetti-size)" } : undefined}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-base font-bold text-strong">{NOME_REGIAO[regiao]}</span>
        <span className="font-mono text-sm tabular-nums" style={{ color: completa ? COR_DIVISAO_COMPLETA : "var(--berry-4)" }}>
          {formatarPercentual(percentualDe(p.normal.noHome, p.normal.contam), locale)}
        </span>
      </div>
      <div className="flex justify-center gap-1">
        {INICIAIS[regiao].map((n) => (
          // eslint-disable-next-line @next/next/no-img-element -- sprite pequeno externo (PokeAPI), 27 na tela.
          <img
            key={n}
            src={urlSpriteDex(String(n), false)}
            alt=""
            width={56}
            height={56}
            className="[transition:filter_300ms,opacity_300ms,transform_200ms] group-hover:scale-110 group-hover:opacity-100 group-hover:grayscale-0"
            style={{ imageRendering: "pixelated", filter: `grayscale(${1 - fracao})`, opacity: 0.55 + 0.45 * fracao }}
          />
        ))}
      </div>
      <BarraProgresso valor={p.normal.noHome} maximo={p.normal.contam} cor={completa ? COR_DIVISAO_COMPLETA : undefined} />
      <span className="text-xs text-muted">
        {t("visaoGeral.regiaoLinha", {
          normal: `${p.normal.noHome}/${p.normal.contam}`,
          shiny: `${p.shiny.noHome}/${p.shiny.contam}`,
        })}
      </span>
    </li>
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
  arte,
  children,
}: {
  href: string;
  nome: string;
  subtitulo: string;
  feitas: number | null;
  total: number | null;
  trofeus: ProgressoTrofeus;
  /** Render do HOME no canto do cartão: a capa do jogo, ou o último que chegou ao HOME. */
  arte: string[];
  children?: React.ReactNode;
}) {
  const t = useTranslations("dex");
  const locale = useLocale();
  const completa = feitas !== null && total !== null && total > 0 && feitas === total;
  return (
    <Link
      href={href}
      className="group relative flex min-h-[220px] flex-col gap-3 overflow-hidden rounded-card border border-hairline bg-surface p-5 shadow-1 [transition:var(--transition-surface)] hover:-translate-y-0.5 hover:shadow-3"
      // Coleção fechada ganha confete, como as de carta.
      style={completa ? { backgroundImage: "var(--motif-confetti)", backgroundSize: "var(--motif-confetti-size)" } : undefined}
    >
      {arte.length > 0 && (
        <div className="pointer-events-none absolute -right-3 -top-2 flex" aria-hidden>
          {arte.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element -- render do HOME externo (PokeAPI), decorativo.
            <img
              key={url}
              src={url}
              alt=""
              width={112}
              height={112}
              className="h-28 w-28 object-contain opacity-90 drop-shadow-md [transition:transform_300ms] group-hover:-translate-y-1 group-hover:scale-105"
            />
          ))}
        </div>
      )}
      <div className={`relative min-w-0 ${arte.length > 0 ? "pr-24" : ""}`}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[length:var(--fs-title-2)] text-strong">{nome}</h3>
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
          <div className={`relative flex items-baseline gap-2 ${arte.length > 0 ? "pr-24" : ""}`}>
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
          <span style={{ color: trofeus.platina ? COR_NIVEL.platina : "var(--slate-3)" }}>
            <Icone nome="trophy" tamanho={16} />
          </span>
          <span className="text-muted">{trofeus.platina ? t("trofeus.platinaConquistada") : t("trofeus.platina")}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            {(["ouro", "prata", "bronze"] as const).map((n) => (
              <span key={n} className="flex items-center gap-0.5" style={{ color: COR_NIVEL[n] }}>
                <Icone nome="medal" tamanho={12} />
                <span className="font-mono tabular-nums text-muted">{trofeus.porNivel[n].obtidos}</span>
              </span>
            ))}
          </span>
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
        <span key={c.trofeuId} className="flex items-center gap-1">
          <Icone nome="lock" tamanho={12} />
          {t("visaoGeral.trancadasAtras", { vagas: String(c.vagas), trofeu: titulo(c.trofeuId) })}
        </span>
      ))}
    </div>
  );
}
