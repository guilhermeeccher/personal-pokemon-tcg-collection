"use client";

/**
 * Página inicial — só apresentação. Tudo chega pronto do servidor
 * (`page.tsx`, `lib/dominio/resumo-inicio.ts`); aqui nada é somado.
 *
 * Uma seção por módulo, de cima para baixo: o TCG sempre, o Virtual Game
 * (Living Dex) só com o módulo ligado. Cada uma abre com os três atalhos
 * que o usuário mais usa (decisão de 2026-10-24) e segue com o resumo da
 * visão geral do módulo. De `lg` para cima, com os dois módulos, as seções
 * ficam lado a lado.
 *
 * Os ícones dos atalhos e dos módulos são os da navegação
 * (`nav-estrutura.ts`), lidos pelo `href`, para o atalho e o item do menu
 * serem reconhecíveis como a mesma coisa.
 *
 * No celular: atalhos em 3 colunas com 64px de altura; toda linha clicável
 * com 44px (`max-md:min-h-11`) e 8px entre elas; nada só em hover ou
 * `title`. As miniaturas do "Quase lá" são decorativas — a informação é o
 * texto da linha, e o nome de cada carta que falta está na tela da coleção.
 *
 * Nomes (coleção, divisão, plano, tarefa, troféu) quebram linha em qualquer
 * largura, nunca são cortados com reticências: sem `title`, o resto do nome
 * não estaria em lugar nenhum da tela.
 */

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Distintivo } from "@/app/_componentes/distintivo";
import { BarraProgresso } from "@/app/_componentes/ds/barra-progresso";
import { formatarPercentual } from "@/app/_componentes/ds/linha-distribuicao";
import {
  COR_DIVISAO_COMPLETA,
  corDaDivisao,
  percentualDe,
  useRotuloDivisao,
} from "@/app/_componentes/ds/progresso-divisoes";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { Icone, type NomeIcone } from "@/app/_componentes/icone";
import { MODULO_TCG, MODULO_VIRTUAL_GAME, type ModuloNav } from "@/app/_componentes/nav-estrutura";
import { Painel } from "@/app/_componentes/painel";
import { JOGO_HOME } from "@/lib/dominio/dex-trofeus";
import type {
  ColecaoInicioDTO,
  QuaseLaInicioDTO,
  ResumoDexInicioDTO,
  TotaisInicioDTO,
} from "@/lib/dominio/tipos-cliente";

const ICONE_POR_HREF = new Map<string, NomeIcone>(
  [MODULO_TCG, MODULO_VIRTUAL_GAME].flatMap((m) => m.grupos.flatMap((g) => g.itens.map((i) => [i.href, i.icone]))),
);

const ATALHOS_TCG = [
  { href: "/colecoes", chave: "colecoes" },
  { href: "/inventario", chave: "inventario" },
  { href: "/cadastro/set", chave: "cadastroSet" },
] as const;

const ATALHOS_DEX = [
  { href: "/dex/planos", chave: "planos" },
  { href: "/dex/trofeus", chave: "trofeus" },
  { href: "/dex/pokedex", chave: "pokedex" },
] as const;

const COR_NIVEL = {
  bronze: "var(--trophy-bronze)",
  prata: "var(--trophy-silver)",
  ouro: "var(--trophy-gold)",
  platina: "var(--trophy-platinum)",
} as const;

/** Linha clicável: 44px de altura no celular; o desktop fica com o próprio conteúdo. */
const LINHA = "flex rounded-md [transition:var(--transition-surface)] hover:bg-surface-hover max-md:min-h-11";
/** Link de texto solto (estado vazio, "Ver todas"): 44px de altura no celular. */
const LINK_TEXTO =
  "inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline max-md:min-h-11";

export function Inicio({
  totais,
  colecoes,
  totalColecoes,
  quaseLa,
  dex,
}: {
  totais: TotaisInicioDTO;
  colecoes: ColecaoInicioDTO[];
  totalColecoes: number;
  quaseLa: QuaseLaInicioDTO[];
  /** `null` com a Living Dex desligada: a seção não existe. */
  dex: ResumoDexInicioDTO | null;
}) {
  const t = useTranslations("home");
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-8">
      <CabecalhoPagina titulo={t("titulo")} />
      <div className={dex ? "grid gap-8 lg:grid-cols-2 lg:items-start" : "flex flex-col gap-8"}>
        <SecaoModulo modulo={MODULO_TCG} id="inicio-tcg" visaoGeral="/inventario/visao-geral" atalhos={ATALHOS_TCG}>
          <ResumoTcg totais={totais} colecoes={colecoes} totalColecoes={totalColecoes} quaseLa={quaseLa} />
        </SecaoModulo>
        {dex && (
          <SecaoModulo modulo={MODULO_VIRTUAL_GAME} id="inicio-dex" visaoGeral="/dex" atalhos={ATALHOS_DEX}>
            <ResumoDex dex={dex} />
          </SecaoModulo>
        )}
      </div>
    </main>
  );
}

function SecaoModulo({
  modulo,
  id,
  visaoGeral,
  atalhos,
  children,
}: {
  modulo: ModuloNav;
  id: string;
  visaoGeral: string;
  atalhos: readonly { href: string; chave: string }[];
  children: ReactNode;
}) {
  const t = useTranslations("home");
  const tn = useTranslations("nav");
  const nome = tn(modulo.chaveTitulo);
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id={id} className="flex items-center gap-2 text-[length:var(--fs-title-1)] text-strong">
          <span className="text-accent">
            <Icone nome={modulo.icone} tamanho={20} />
          </span>
          {nome}
        </h2>
        <Link href={visaoGeral} className={LINK_TEXTO}>
          {t("visaoGeral")}
          <Icone nome="chevron-right" tamanho={16} />
        </Link>
      </div>
      <nav aria-label={t("atalhosDe", { modulo: nome })}>
        <ul className="grid grid-cols-3 gap-2">
          {atalhos.map((a) => (
            <li key={a.href} className="min-w-0">
              <Painel
                as={Link}
                href={a.href}
                padding="sm"
                className="flex h-full min-h-16 flex-col items-center justify-center gap-1 px-1.5 text-center [transition:var(--transition-surface)] hover:-translate-y-0.5 hover:shadow-3"
              >
                <span className="text-accent">
                  <Icone nome={ICONE_POR_HREF.get(a.href) ?? "circle"} tamanho={20} />
                </span>
                <span className="text-sm leading-tight font-semibold text-strong [overflow-wrap:anywhere]">
                  {t(`atalho.${a.chave}`)}
                </span>
              </Painel>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </section>
  );
}

/* ---------- TCG ---------- */

function ResumoTcg({
  totais,
  colecoes,
  totalColecoes,
  quaseLa,
}: {
  totais: TotaisInicioDTO;
  colecoes: ColecaoInicioDTO[];
  totalColecoes: number;
  quaseLa: QuaseLaInicioDTO[];
}) {
  const t = useTranslations("home.tcg");
  return (
    <>
      <Link href="/inventario" className="self-start text-sm text-muted hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center">
        {t("totais", { cartas: totais.cartasDistintas, unidades: totais.totalUnidades })}
      </Link>

      <Painel as="section" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[length:var(--fs-title-2)] text-strong">{t("suasColecoes")}</h3>
          {totalColecoes > colecoes.length && (
            <Link href="/colecoes" className={LINK_TEXTO}>
              {t("verTodas", { total: totalColecoes })}
            </Link>
          )}
        </div>
        {colecoes.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-2">
            <EstadoVazio>{t("semColecao")}</EstadoVazio>
            <Link href="/colecoes" className={LINK_TEXTO}>
              {t("criarPrimeira")}
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {colecoes.map((c) => (
              <li key={c.id}>
                <LinhaColecao colecao={c} />
              </li>
            ))}
          </ul>
        )}
      </Painel>

      {quaseLa.length > 0 && (
        <Painel as="section" className="@container flex flex-col gap-2">
          {/* `@container`: a linha decide pela largura do painel, não da janela —
              em duas colunas (de `lg` para cima, com a Dex) o painel é estreito, e
              lado a lado as miniaturas espremiam o nome da divisão. */}
          <h3 className="text-[length:var(--fs-title-2)] text-strong">{t("quaseLa")}</h3>
          <ul className="flex flex-col gap-2">
            {quaseLa.map((q, i) => (
              <li key={`${q.colecaoId}|${q.divisao.id}`}>
                <LinhaQuaseLa item={q} indice={i} />
              </li>
            ))}
          </ul>
        </Painel>
      )}
    </>
  );
}

function LinhaColecao({ colecao: c }: { colecao: ColecaoInicioDTO }) {
  const t = useTranslations("home.tcg");
  const locale = useLocale();
  const customizada = c.tipo === "customizada";
  const completa = !customizada && c.totalVagas > 0 && c.vagasPreenchidas === c.totalVagas;
  return (
    <Link href={`/colecoes/${c.id}`} className={`${LINHA} -mx-2 flex-col justify-center gap-1.5 px-2 py-1.5`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 font-semibold text-strong [overflow-wrap:anywhere]">{c.nome}</span>
        {customizada ? (
          <span className="shrink-0 font-mono text-sm tabular-nums text-muted">
            {t("cartas", { total: c.vagasPreenchidas })}
          </span>
        ) : (
          <span className="shrink-0 font-mono text-sm tabular-nums whitespace-nowrap text-muted">
            <span className="font-semibold" style={{ color: completa ? COR_DIVISAO_COMPLETA : "var(--berry-4)" }}>
              {formatarPercentual(percentualDe(c.vagasPreenchidas, c.totalVagas), locale)}
            </span>{" "}
            {c.vagasPreenchidas}/{c.totalVagas}
          </span>
        )}
      </div>
      {!customizada && (
        <BarraProgresso
          valor={c.vagasPreenchidas}
          maximo={c.totalVagas}
          cor={completa ? COR_DIVISAO_COMPLETA : undefined}
        />
      )}
    </Link>
  );
}

function LinhaQuaseLa({ item: q, indice }: { item: QuaseLaInicioDTO; indice: number }) {
  const t = useTranslations("home.tcg");
  const locale = useLocale();
  const rotulo = useRotuloDivisao();
  /* Divisão de região só existe em coleção Pokédex: a miniatura é o sprite. */
  const pokedex = q.divisao.tipo === "regiao";
  const alem = q.faltam - q.miniaturas.length;
  return (
    <Link
      href={`/colecoes/${q.colecaoId}`}
      className={`${LINHA} -mx-2 flex-col gap-2 px-2 py-2 @md:flex-row @md:items-center @md:gap-3`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 [overflow-wrap:anywhere]">
            <span className="font-semibold text-strong">{rotulo(q.divisao)}</span>{" "}
            <span className="text-sm text-muted">· {q.colecaoNome}</span>
          </span>
          <span className="shrink-0 font-mono text-sm tabular-nums text-muted">
            {formatarPercentual(percentualDe(q.divisao.preenchidas, q.divisao.total), locale)}
          </span>
        </div>
        <BarraProgresso valor={q.divisao.preenchidas} maximo={q.divisao.total} cor={corDaDivisao(indice, q.divisao)} />
        <span className="text-sm font-semibold text-[color:var(--berry-5)]">{t("faltam", { total: q.faltam })}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
        {q.miniaturas.map((m, i) =>
          m.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- miniatura de carta ou sprite, sem otimizador (mesma convenção do resto); decorativa.
            <img
              key={i}
              src={m.url}
              alt=""
              loading="lazy"
              className={
                pokedex
                  ? "h-10 w-10 rounded-tcg bg-[var(--slot-empty-bg)] opacity-70"
                  : "h-12 w-9 rounded-tcg object-cover opacity-60 grayscale"
              }
            />
          ) : (
            <span
              key={i}
              className="flex h-12 w-9 items-center justify-center rounded-tcg border border-dashed border-[color:var(--slot-empty-border)] font-mono text-[10px] text-muted"
            >
              {m.rotulo}
            </span>
          ),
        )}
        {alem > 0 && <span className="pl-1 font-mono text-xs text-muted">+{alem}</span>}
      </div>
    </Link>
  );
}

/* ---------- Living Dex ---------- */

function ResumoDex({ dex }: { dex: ResumoDexInicioDTO }) {
  const t = useTranslations("home.dex");
  const td = useTranslations("dex");
  return (
    <>
      {(dex.recebidos > 0 || dex.levarAoHome > 0) && (
        <ul className="flex flex-col gap-2">
          {dex.recebidos > 0 && (
            <li>
              <Pendencia href="/dex/recebidos">{t("recebidos", { total: dex.recebidos })}</Pendencia>
            </li>
          )}
          {dex.levarAoHome > 0 && (
            <li>
              <Pendencia href="/dex/pokedex">{t("levarAoHome", { total: dex.levarAoHome })}</Pendencia>
            </li>
          )}
        </ul>
      )}

      <Painel as="section" className="flex flex-col gap-3">
        <h3 className="text-[length:var(--fs-title-2)] text-strong">{t("progressoHome")}</h3>
        <div className="grid grid-cols-2 gap-4">
          <ProgressoTrilha rotulo={td("trilha.normal")} p={dex.progresso.normal} />
          <ProgressoTrilha rotulo={td("trilha.shiny")} p={dex.progresso.shiny} />
        </div>
      </Painel>

      <Painel as="section" className="flex flex-col gap-2">
        <h3 className="text-[length:var(--fs-title-2)] text-strong">{t("planosAtivos")}</h3>
        {dex.planos.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-2">
            <EstadoVazio>{t("semPlano")}</EstadoVazio>
            <Link href="/dex/planos" className={LINK_TEXTO}>
              {t("abrirPlanos")}
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {dex.planos.map((p) => (
              <li key={p.id} className="flex flex-col gap-2">
                <Link href="/dex/planos" className={`${LINHA} -mx-2 flex-col justify-center gap-1.5 px-2 py-1.5`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 font-display font-bold text-strong [overflow-wrap:anywhere]">
                      {p.titulo}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums whitespace-nowrap text-muted">
                      {t("tarefas", { feitas: p.feitas, total: p.total })}
                    </span>
                  </div>
                  <BarraProgresso valor={p.feitas} maximo={p.total} />
                </Link>
                {p.tarefas.length > 0 && (
                  <ul className="flex flex-col gap-2 pl-2">
                    {p.tarefas.map((x) => (
                      <li key={x.id}>
                        <Link href="/dex/planos" className={`${LINHA} -mx-2 items-center gap-2 px-2 py-1 text-sm`}>
                          <span className="shrink-0 text-muted">
                            <Icone nome="circle" tamanho={14} />
                          </span>
                          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="min-w-0 text-strong [overflow-wrap:anywhere]">{x.titulo}</span>
                            {x.jogoNome && <span className="text-xs text-muted">{x.jogoNome}</span>}
                          </span>
                          {x.etapasTotal > 0 && (
                            <span className="shrink-0 font-mono text-xs tabular-nums whitespace-nowrap text-muted">
                              {t("etapas", { feitas: x.etapasFeitas, total: x.etapasTotal })}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {p.abertasAlem > 0 && (
                  <span className="pl-2 text-xs text-muted">{t("maisTarefas", { total: p.abertasAlem })}</span>
                )}
              </li>
            ))}
            {dex.planosAlem > 0 && (
              <li className="text-xs text-muted">{t("maisPlanos", { total: dex.planosAlem })}</li>
            )}
          </ul>
        )}
      </Painel>

      <Trofeus dex={dex} />
    </>
  );
}

function Pendencia({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Painel
      as={Link}
      href={href}
      padding="sm"
      className="flex items-center gap-2 text-sm font-semibold text-strong [transition:var(--transition-surface)] hover:border-accent/40 max-md:min-h-11"
    >
      <span className="h-2 w-2 shrink-0 rounded-pill bg-[var(--berry-4)]" aria-hidden="true" />
      <span className="min-w-0 flex-1">{children}</span>
      <span className="shrink-0 text-muted">
        <Icone nome="chevron-right" tamanho={16} />
      </span>
    </Painel>
  );
}

function ProgressoTrilha({ rotulo, p }: { rotulo: string; p: { noHome: number; contam: number } }) {
  const locale = useLocale();
  const completa = p.contam > 0 && p.noHome === p.contam;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{rotulo}</span>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span
          className="font-display text-[length:var(--fs-title-1)] leading-none font-bold tabular-nums"
          style={{ color: completa ? COR_DIVISAO_COMPLETA : "var(--berry-4)" }}
        >
          {formatarPercentual(percentualDe(p.noHome, p.contam), locale)}
        </span>
        <span className="font-mono text-xs tabular-nums text-muted">
          {p.noHome}/{p.contam}
        </span>
      </div>
      <BarraProgresso valor={p.noHome} maximo={p.contam} cor={completa ? COR_DIVISAO_COMPLETA : undefined} />
    </div>
  );
}

function Trofeus({ dex }: { dex: ResumoDexInicioDTO }) {
  const t = useTranslations("home.dex");
  const td = useTranslations("dex");
  const proximo = dex.proximoTrofeu;
  return (
    <Painel as="section" className="flex flex-col gap-3">
      <h3 className="text-[length:var(--fs-title-2)] text-strong">{t("trofeus")}</h3>
      {/* A estante aparece sempre, mesmo zerada: soma os jogos dele e o HOME. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {(["platina", "ouro", "prata", "bronze"] as const).map((n) => (
          <li key={n} className="flex items-center gap-1.5 text-sm">
            <span style={{ color: dex.estante[n] > 0 ? COR_NIVEL[n] : "var(--slate-3)" }}>
              <Icone nome={n === "platina" ? "trophy" : "medal"} tamanho={18} />
            </span>
            <span className="font-mono font-bold tabular-nums text-strong">{dex.estante[n]}</span>
            <span className="text-muted">{n === "platina" ? td("trofeus.platina") : td(`trofeus.nivel.${n}`)}</span>
          </li>
        ))}
      </ul>

      {proximo ? (
        <Link href={`/dex/trofeus?jogo=${JOGO_HOME}`} className={`${LINHA} -mx-2 flex-col justify-center gap-1.5 px-2 py-1.5`}>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t("proximoDoHome")}</span>
          <div className="flex flex-wrap items-center gap-2">
            <span style={{ color: COR_NIVEL[proximo.nivel] }}>
              <Icone nome="medal" tamanho={16} />
            </span>
            <span className="min-w-0 font-semibold text-strong [overflow-wrap:anywhere]">{proximo.titulo}</span>
            <Distintivo>{td(`trofeus.nivel.${proximo.nivel}`)}</Distintivo>
          </div>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <BarraProgresso valor={proximo.feito} maximo={proximo.alvo} cor={COR_NIVEL[proximo.nivel]} />
            </div>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
              {proximo.feito}/{proximo.alvo}
            </span>
          </div>
        </Link>
      ) : (
        dex.todosDoHome && <p className="text-sm text-muted">{t("todosDoHome")}</p>
      )}

      {dex.semJogos && (
        <Link href="/dex/jogos" className={`${LINK_TEXTO} self-start`}>
          {t("semJogos")}
          <Icone nome="chevron-right" tamanho={16} />
        </Link>
      )}
    </Painel>
  );
}
