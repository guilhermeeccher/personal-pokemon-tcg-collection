"use client";

/**
 * Item 1 — Visão geral. Desde 2026-10-05 abre como vitrine, não como
 * relatório ("está parecendo um ERP, e não um sistema de diversão de
 * coleção de cartas"): as joias do inventário, cada coleção como capa de
 * fichário (logo do set, carta-capa, percentual e divisões) e as divisões
 * mais perto de fechar. As distribuições continuam todas, clicáveis, no
 * fim da página, sob "Estatísticas".
 *
 * Tudo vem já agregado de `GET /api/inventario/resumo`
 * (`lib/db/consultas.ts` faz a soma em SQL; aqui só formata % para
 * exibição, sobre arrays já pequenos — nunca soma cópia por cópia).
 *
 * Cada linha de distribuição e os totais "Alocadas"/"Livres" linkam para
 * `/inventario` com a MESMA querystring que a tela de inventário já lê
 * (filtros existentes, nenhum sistema de filtro novo).
 */

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { BarraProgresso } from "@/app/_componentes/ds/barra-progresso";
import { BlocoContagem } from "@/app/_componentes/ds/bloco-contagem";
import { corCondicao } from "@/app/_componentes/ds/chip-condicao";
import { corVariante } from "@/app/_componentes/ds/chip-variante";
import { formatarPercentual, LinhaDistribuicao } from "@/app/_componentes/ds/linha-distribuicao";
import { corRaridade, MarcaRaridade } from "@/app/_componentes/ds/marca-raridade";
import {
  COR_DIVISAO_COMPLETA,
  corDaDivisao,
  percentualDe,
  ProgressoDivisoes,
  useRotuloDivisao,
} from "@/app/_componentes/ds/progresso-divisoes";
import { Distintivo } from "@/app/_componentes/distintivo";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { Icone } from "@/app/_componentes/icone";
import { Painel } from "@/app/_componentes/painel";
import { urlImagemCarta, urlSpritePokemon } from "@/lib/imagens";
import { rotuloChaveVaga } from "@/lib/dominio/chave-vaga-set";
import type {
  CartaVitrineDTO,
  ColecaoVitrineDTO,
  DistribuicaoCondicaoDTO,
  DistribuicaoExpansaoDTO,
  DistribuicaoIdiomaDTO,
  DistribuicaoRaridadeDTO,
  DistribuicaoVarianteDTO,
  QuaseLaDTO,
  ResumoInventarioDTO,
} from "@/lib/dominio/tipos-cliente";

/** Divisões listadas no cartão da coleção; o resto vira "+N" (a tela da coleção mostra todas). */
const DIVISOES_NO_CARTAO = 4;

export default function VisaoGeralPage() {
  const t = useTranslations("visaoGeral");
  const [dados, setDados] = useState<ResumoInventarioDTO | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/inventario/resumo")
      .then((r) => r.json())
      .then((d: ResumoInventarioDTO) => setDados(d))
      .catch(() => setErro(t("erroCarregar")))
      .finally(() => setCarregando(false));
  }, [t]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 p-4 sm:p-8">
      <CabecalhoPagina titulo={t("titulo")} descricao={t("descricao")} />

      {erro && <p className="text-sm text-danger">{erro}</p>}
      {carregando && <p className="text-sm text-muted">{t("carregando")}</p>}

      {dados && (
        <>
          <div className="-mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* As quatro contagens em quatro cores do sistema — menores
                que antes: a vitrine abaixo é o assunto, elas são o rodapé
                do cabeçalho. */}
            <BlocoContagem
              compacto
              rotulo={t("cartasDistintas")}
              valor={dados.totais.cartasDistintas}
              tom="var(--berry-4)"
              href="/inventario"
            />
            <BlocoContagem
              compacto
              rotulo={t("unidadesTotais")}
              valor={dados.totais.totalUnidades}
              tom="var(--sky-4)"
              href="/inventario"
            />
            <BlocoContagem
              compacto
              rotulo={t("alocadas")}
              valor={dados.totais.unidadesAlocadas}
              tom="var(--grape-2)"
              href="/inventario?alocacao=alocada"
            />
            <BlocoContagem
              compacto
              rotulo={t("livres")}
              valor={dados.totais.unidadesLivres}
              tom="var(--leaf-4)"
              href="/inventario?alocacao=livre"
            />
          </div>

          {dados.joias.length > 0 && <Joias joias={dados.joias} />}

          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[length:var(--fs-title-1)] text-strong">{t("suasColecoes")}</h2>
              <Link href="/colecoes" className="text-sm text-accent hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center">
                {t("verTodas")}
              </Link>
            </div>
            {dados.colecoes.length === 0 ? (
              <EstadoVazio className="py-6">{t("nenhumaColecao")}</EstadoVazio>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {dados.colecoes.map((c) => (
                  <CartaoColecao key={c.id} colecao={c} />
                ))}
              </div>
            )}
          </section>

          {dados.quaseLa.length > 0 && <QuaseLa itens={dados.quaseLa} />}

          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-[length:var(--fs-title-1)] text-strong">{t("estatisticas")}</h2>
              <p className="mt-1 text-sm text-muted">{t("estatisticasDescricao")}</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <SecaoExpansao itens={dados.distribuicoes.porExpansao} totalUnidades={dados.totais.totalUnidades} />
              <SecaoRaridade itens={dados.distribuicoes.porRaridade} totalUnidades={dados.totais.totalUnidades} />
              <SecaoIdioma itens={dados.distribuicoes.porIdioma} totalUnidades={dados.totais.totalUnidades} />
              <SecaoCondicao itens={dados.distribuicoes.porCondicao} totalUnidades={dados.totais.totalUnidades} />
              <SecaoVariante itens={dados.distribuicoes.porVariante} totalUnidades={dados.totais.totalUnidades} />
              <Painel as={Link} href="/inventario/repetidas" className="transition-colors hover:border-accent/40">
                <h2 className="text-[length:var(--fs-title-2)] text-strong">{t("repetidas")}</h2>
                <p className="mt-1 text-sm text-muted">{t("repetidasDescricao")}</p>
              </Painel>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

/**
 * As cartas que mais valem no inventário, em leque leve: ordem pelo preço
 * guardado na Liga quando existe (`ordenarJoias`), senão pela vitrine
 * (`destaque-carta.ts`).
 * A inclinação alterna para a faixa não parecer uma tabela de miniaturas;
 * no hover a carta endireita e sobe, como tirada do fichário.
 */
function Joias({ joias }: { joias: CartaVitrineDTO[] }) {
  const t = useTranslations("visaoGeral");
  const tc = useTranslations("componentes");
  const locale = useLocale();
  const inclinacoes = ["-rotate-3", "rotate-2", "-rotate-1", "rotate-3", "-rotate-2", "rotate-1"];
  return (
    <section
      className="flex flex-col gap-4 overflow-hidden rounded-card border border-hairline bg-surface p-5 shadow-1"
      style={{ backgroundImage: "var(--motif-sunburst)" }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[color:var(--sun-3)]">
          <Icone nome="sparkles" tamanho={20} />
        </span>
        <div>
          <h2 className="text-[length:var(--fs-title-1)] text-strong">{t("joias")}</h2>
          <p className="text-sm text-muted">{t("joiasDescricao")}</p>
        </div>
      </div>
      {/* No celular a faixa rola na horizontal; no desktop cabe inteira. */}
      <ul className="-mx-5 flex snap-x gap-4 overflow-x-auto px-5 pt-2 pb-3 lg:grid lg:grid-cols-8 lg:overflow-visible">
        {joias.map((j, i) => (
          <li key={`${j.cartaId}|${j.idioma}`} className="w-28 shrink-0 snap-start lg:w-auto">
            <figure className="flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- mesma convenção das outras imagens de carta: URL do CDN ou da rota local, sem otimizador. */}
              <img
                src={urlImagemCarta(j.imagemUrl, "low") ?? undefined}
                alt={j.nome}
                loading="lazy"
                className={`aspect-[63/88] w-full rounded-tcg object-cover shadow-tcg [transition:var(--transition-surface)] hover:-translate-y-1.5 hover:rotate-0 ${inclinacoes[i % inclinacoes.length]}`}
              />
              <figcaption className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-xs font-semibold text-strong max-md:break-words max-md:whitespace-normal max-md:overflow-visible" title={j.nome}>
                  {j.nome}
                </span>
                {/* A raridade aqui é só o ícone, com o nome no `title`; no celular,
                    sem hover, o nome vai escrito (o cartão da joia é estreito
                    demais para o botão de uma `Dica`). */}
                <MarcaRaridade raridade={j.raridade} comRotulo={false} />
                <span className="text-[11px] text-muted md:hidden">{j.raridade ?? tc("semRaridade")}</span>
                <span className="truncate text-[11px] text-muted max-md:break-words max-md:whitespace-normal max-md:overflow-visible" title={j.setNome}>
                  {j.setNome} · {j.localId}
                </span>
                {/* Só quando a carta já foi consultada: sem preço, nada a
                    mostrar — "R$ 0" seria mentira, e "—" em 8 cartas, ruído. */}
                {j.preco !== null && (
                  <span className="font-mono text-xs font-semibold tabular-nums text-strong">
                    {t("joiaPreco", { valor: j.preco.toLocaleString(locale, { style: "currency", currency: "BRL" }) })}
                  </span>
                )}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Logo do set no CDN da TCGdex. Nem todo set tem logo em todo idioma, e
 * não há como saber antes: tenta as URLs na ordem e, se todas falharem,
 * não mostra nada — o nome da coleção logo abaixo já identifica.
 */
function LogoSet({ urls, alt }: { urls: string[]; alt: string }) {
  const [indice, setIndice] = useState(0);
  if (indice >= urls.length) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- logo externo do CDN da TCGdex, sem otimizador (mesma convenção das imagens de carta).
    <img
      src={urls[indice]}
      alt={alt}
      loading="lazy"
      className="h-10 w-auto max-w-[170px] object-contain object-left"
      onError={() => setIndice((i) => i + 1)}
    />
  );
}

/** Pokébola desenhada em SVG — a identidade da coleção Pokédex, que não tem logo de set. */
function Pokebola({ tamanho = 40 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="var(--paper-1)" stroke="var(--ink-1)" strokeWidth="2.5" />
      <path d="M2 20a18 18 0 0 1 36 0Z" fill="var(--berry-4)" stroke="var(--ink-1)" strokeWidth="2.5" />
      <circle cx="20" cy="20" r="5.5" fill="var(--paper-1)" stroke="var(--ink-1)" strokeWidth="2.5" />
    </svg>
  );
}

function CartaoColecao({ colecao: c }: { colecao: ColecaoVitrineDTO }) {
  const t = useTranslations("visaoGeral");
  const locale = useLocale();
  const customizada = c.tipo === "customizada";
  const pct = percentualDe(c.vagasPreenchidas, c.totalVagas);
  const completa = !customizada && c.totalVagas > 0 && c.vagasPreenchidas === c.totalVagas;

  return (
    <Link
      href={`/colecoes/${c.id}`}
      className="group relative flex min-h-[200px] overflow-hidden rounded-card border border-hairline bg-surface shadow-1 [transition:var(--transition-surface)] hover:-translate-y-0.5 hover:shadow-3"
      // Coleção fechada ganha confete: é a recompensa visual de 100%.
      style={completa ? { backgroundImage: "var(--motif-confetti)", backgroundSize: "var(--motif-confetti-size)" } : undefined}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
        <div className="flex min-h-10 items-center gap-2">
          {c.tipo === "pokedex" && <Pokebola />}
          {c.logos.length > 0 && <LogoSet urls={c.logos} alt={c.nome} />}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[length:var(--fs-title-2)] text-strong">{c.nome}</h3>
            {completa && (
              <Distintivo tom="sucesso" className="gap-1">
                <Icone nome="crown" tamanho={12} />
                {t("completa")}
              </Distintivo>
            )}
          </div>
          <span className="text-xs text-muted">
            {t.has(`tipo.${c.tipo}`) ? t(`tipo.${c.tipo}`) : c.tipo}
          </span>
        </div>

        {customizada ? (
          <p className="font-display text-[length:var(--fs-title-1)] font-bold text-strong">
            {t("cartas", { total: c.vagasPreenchidas })}
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span
                className="font-display text-[length:var(--fs-display-2)] leading-none font-bold tabular-nums"
                style={{ color: completa ? COR_DIVISAO_COMPLETA : "var(--berry-4)" }}
              >
                {formatarPercentual(pct, locale)}
              </span>
              <span className="font-mono text-sm tabular-nums text-muted">
                {c.vagasPreenchidas}/{c.totalVagas}
              </span>
            </div>
            {c.divisoes.length > 1 ? (
              <ProgressoDivisoes divisoes={c.divisoes} limite={DIVISOES_NO_CARTAO} compacto />
            ) : (
              <BarraProgresso
                valor={c.vagasPreenchidas}
                maximo={c.totalVagas}
                cor={completa ? COR_DIVISAO_COMPLETA : undefined}
                altura={8}
              />
            )}
          </>
        )}
      </div>

      {/* A capa: a carta mais vistosa já alocada, saindo do fichário. */}
      {c.capa && (
        <div
          className="relative hidden w-32 shrink-0 items-center justify-center sm:flex"
          style={{ backgroundImage: "var(--motif-sunburst)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- imagem de carta do CDN ou da rota local, sem otimizador (mesma convenção do resto). */}
          <img
            src={urlImagemCarta(c.capa.imagemUrl, "low") ?? undefined}
            alt={c.capa.nome}
            loading="lazy"
            className="w-28 rotate-6 rounded-tcg shadow-tcg [transition:var(--transition-surface)] group-hover:rotate-2"
          />
        </div>
      )}
    </Link>
  );
}

/**
 * As divisões mais perto de fechar, com as primeiras cartas que faltam
 * (apagadas, como a vaga vazia da grade). É a lista de compras virando meta.
 */
function QuaseLa({ itens }: { itens: QuaseLaDTO[] }) {
  const t = useTranslations("visaoGeral");
  const locale = useLocale();
  const rotulo = useRotuloDivisao();
  return (
    <Painel as="section" className="flex flex-col gap-3">
      <div>
        <h2 className="text-[length:var(--fs-title-1)] text-strong">{t("quaseLa")}</h2>
        <p className="text-sm text-muted">{t("quaseLaDescricao")}</p>
      </div>
      <ul className="flex flex-col divide-y divide-hairline">
        {itens.map((q, i) => (
          <li key={`${q.colecaoId}|${q.divisao.id}`}>
            <Link
              href={`/colecoes/${q.colecaoId}`}
              className="flex flex-col gap-3 py-3 hover:bg-surface-hover sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold text-strong">{rotulo(q.divisao)}</span>{" "}
                    <span className="text-sm text-muted">· {q.colecaoNome}</span>
                  </span>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-muted">
                    {formatarPercentual(percentualDe(q.divisao.preenchidas, q.divisao.total), locale)}
                  </span>
                </div>
                <BarraProgresso
                  valor={q.divisao.preenchidas}
                  maximo={q.divisao.total}
                  cor={corDaDivisao(i, q.divisao)}
                />
                <span className="text-sm font-semibold text-[color:var(--berry-5)]">
                  {t("faltam", { total: q.faltam })}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {q.faltantes.map((f) => (
                  <Faltante key={f.chave} faltante={f} tipo={q.tipo} />
                ))}
                {q.faltam > q.faltantes.length && (
                  <span className="pl-1 font-mono text-xs text-muted">
                    +{q.faltam - q.faltantes.length}
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Painel>
  );
}

function Faltante({ faltante: f, tipo }: { faltante: QuaseLaDTO["faltantes"][number]; tipo: QuaseLaDTO["tipo"] }) {
  const titulo = f.nome ? `${f.nome} (${rotuloChaveVaga(f.chave)})` : rotuloChaveVaga(f.chave);
  // Pokédex não tem "a carta esperada" (regra 3): mostra o sprite da espécie.
  const url = tipo === "pokedex" ? urlSpritePokemon(f.chave) : urlImagemCarta(f.imagemUrl, "low");
  if (!url) {
    return (
      <span
        title={titulo}
        className="flex h-14 w-10 items-center justify-center rounded-tcg border border-dashed border-[color:var(--slot-empty-border)] font-mono text-[10px] text-muted"
      >
        {rotuloChaveVaga(f.chave)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- miniatura de carta ou sprite, sem otimizador (mesma convenção do resto).
    <img
      src={url}
      alt={titulo}
      title={titulo}
      loading="lazy"
      className={
        tipo === "pokedex"
          ? "h-12 w-12 rounded-tcg bg-[var(--slot-empty-bg)] opacity-70"
          : "h-14 w-10 rounded-tcg object-cover opacity-60 grayscale"
      }
    />
  );
}

function CartaoSecao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Painel as="section" className="flex flex-col gap-1 max-md:gap-2">
      <h2 className="mb-1 text-[length:var(--fs-title-2)] text-strong">{titulo}</h2>
      {children}
    </Painel>
  );
}

function SecaoExpansao({ itens, totalUnidades }: { itens: DistribuicaoExpansaoDTO[]; totalUnidades: number }) {
  const t = useTranslations("visaoGeral");
  return (
    <CartaoSecao titulo={t("porExpansao")}>
      {itens.map((i) => (
        <LinhaDistribuicao
          key={i.setId}
          rotulo={i.setNome}
          contagem={i.unidades}
          total={totalUnidades}
          href={`/inventario?set=${encodeURIComponent(i.setId)}`}
        />
      ))}
      {itens.length === 0 && (
        <EstadoVazio className="text-left">{t("nenhumaCopia")}</EstadoVazio>
      )}
    </CartaoSecao>
  );
}

function SecaoRaridade({ itens, totalUnidades }: { itens: DistribuicaoRaridadeDTO[]; totalUnidades: number }) {
  const t = useTranslations("visaoGeral");
  return (
    <CartaoSecao titulo={t("porRaridade")}>
      {itens.map((i) => (
        <LinhaDistribuicao
          key={i.raridade ?? "sem-raridade"}
          rotulo={<MarcaRaridade raridade={i.raridade} />}
          contagem={i.unidades}
          total={totalUnidades}
          cor={corRaridade(i.raridade)}
          href={i.raridade ? `/inventario?raridade=${encodeURIComponent(i.raridade)}` : undefined}
        />
      ))}
      {itens.length === 0 && (
        <EstadoVazio className="text-left">{t("nenhumaCopia")}</EstadoVazio>
      )}
    </CartaoSecao>
  );
}

function SecaoIdioma({ itens, totalUnidades }: { itens: DistribuicaoIdiomaDTO[]; totalUnidades: number }) {
  const t = useTranslations("visaoGeral");
  return (
    <CartaoSecao titulo={t("porIdioma")}>
      {itens.map((i) => (
        <LinhaDistribuicao
          key={i.idioma}
          rotulo={i.idioma}
          contagem={i.unidades}
          total={totalUnidades}
          cor="var(--caramel-3)"
          href={`/inventario?idioma=${i.idioma}`}
        />
      ))}
      {itens.length === 0 && (
        <EstadoVazio className="text-left">{t("nenhumaCopia")}</EstadoVazio>
      )}
    </CartaoSecao>
  );
}

function SecaoCondicao({ itens, totalUnidades }: { itens: DistribuicaoCondicaoDTO[]; totalUnidades: number }) {
  const t = useTranslations("visaoGeral");
  return (
    <CartaoSecao titulo={t("porCondicao")}>
      {itens.map((i) => (
        <LinhaDistribuicao
          key={i.condicao}
          rotulo={i.condicao}
          contagem={i.unidades}
          total={totalUnidades}
          cor={corCondicao(i.condicao)}
          href={`/inventario?condicao=${i.condicao}`}
        />
      ))}
      {itens.length === 0 && (
        <EstadoVazio className="text-left">{t("nenhumaCopia")}</EstadoVazio>
      )}
    </CartaoSecao>
  );
}

function SecaoVariante({ itens, totalUnidades }: { itens: DistribuicaoVarianteDTO[]; totalUnidades: number }) {
  const t = useTranslations("visaoGeral");
  return (
    <CartaoSecao titulo={t("porVariante")}>
      {itens.map((i) => (
        <LinhaDistribuicao
          key={i.variante}
          rotulo={i.variante}
          contagem={i.unidades}
          total={totalUnidades}
          cor={corVariante(i.variante)}
          href={`/inventario?variante=${i.variante}`}
        />
      ))}
      {itens.length === 0 && (
        <EstadoVazio className="text-left">{t("nenhumaCopia")}</EstadoVazio>
      )}
    </CartaoSecao>
  );
}
