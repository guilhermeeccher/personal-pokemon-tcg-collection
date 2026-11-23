"use client";

/**
 * `/dex` na v2 (pacote 5a): a Living Dex como vitrine. As contas são as da
 * v1 (`(v1)/v1/dex/visao-geral-dex.tsx`), feitas pelas mesmas funções de
 * domínio sobre as mesmas leituras do servidor; só o desenho muda. De cima
 * para baixo:
 *
 * - a vitrine: os últimos Pokémon que chegaram ao HOME, ou, com o HOME
 *   vazio, o que os jogos da pessoa alcançam agora (`pegueAgora`);
 * - o progresso no HOME nas duas trilhas, a vista cosmética numa linha, e as
 *   regiões com os três iniciais, que ganham cor conforme a região avança;
 * - conquistas: a estante, o próximo troféu do HOME e as últimas;
 * - o HOME e cada jogo como cartão de coleção, com o Pokémon de capa;
 * - o plano ativo e o que está num jogo e ainda não foi ao HOME.
 *
 * **Só lê e só navega** (DEX-01 a DEX-04 de `docs/design-v2/parity.md`): cada
 * Pokémon da vitrine abre o cadastro (`?busca=`), cada jogo os troféus dele
 * (`?jogo=`), o plano os planos. Os troféus do HOME são calculados dos
 * registros (`comTrofeusDoHome`), nunca marcados; as seções contam como a
 * pessoa as deixou na Pokédex.
 *
 * Imagens: o render do HOME (`urlRenderHomeDex`, ~80 KB) só na vitrine (no
 * máximo oito) e na capa dos cartões; o resto é sprite pequeno.
 */

import { Crown, Lock, Medal, Trophy } from "lucide-react";
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { type ReactNode, useMemo } from "react";

import { useRotuloForma } from "@/app/_comum/dex/use-rotulo-forma";
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
import { percentualSemFechar } from "@/lib/dominio/visao-geral-v2";
import { urlRenderHomeDex } from "@/lib/imagens";

import { BotaoLink } from "../../_componentes/primitivos/botao";
import { Painel } from "../../_componentes/primitivos/painel";
import { hrefCadastroDex, hrefTrofeus } from "../_componentes/caminhos";
import { SpriteDex } from "../_componentes/sprite-dex";

import estilos from "./visao-geral-dex.module.css";

/** As cores dos níveis: só realce, o nível também vem escrito. */
const COR_NIVEL: Record<NivelTrofeu | "platina", string> = {
  bronze: "#d59a6a",
  prata: "#c9ced8",
  ouro: "#ffd27a",
  platina: "#d9e4f5",
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
  /** Só os planos ativos. */
  planos: PlanoDexDTO[];
}) {
  const t = useTranslations("v2Dex.visaoGeral");
  const td = useTranslations("dex");
  const idioma = useLocale() as IdiomaTrofeu;
  const rotulo = useRotuloForma(formas);
  const formaPorId = useMemo(() => new Map(formas.map((f) => [f.id, f])), [formas]);

  const mapa = useMemo(() => mapearEstadosDex(registros), [registros]);
  /* Só os troféus do HOME e dos jogos da pessoa entram nas contas desta tela. */
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

  const vitrine =
    ultimos.length > 0
      ? ultimos.map((u) => ({ formaId: u.formaId, shiny: u.shiny, legenda: null as string | null }))
      : sugestoes.map((s) => ({ formaId: s.formaId, shiny: false, legenda: nomeJogo(s.jogoId) }));

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecalho}>
        <div>
          <p className={estilos.sobretitulo}>Living Dex</p>
          <h1 className={estilos.titulo}>{t("titulo")}</h1>
          <p className={estilos.subtitulo}>{t("descricao")}</p>
        </div>
        <nav aria-label={t("atalhos")} className={estilos.acoes}>
          <BotaoLink href="/dex/pokedex" pequeno>
            {t("abrirPokedex")}
          </BotaoLink>
          <BotaoLink href={hrefTrofeus(JOGO_HOME)} pequeno>
            {td("trofeus.titulo")}
          </BotaoLink>
          <BotaoLink href="/dex/planos" pequeno>
            {t("abrirPlanos")}
          </BotaoLink>
        </nav>
      </header>

      {vitrine.length > 0 && (
        <section className={estilos.vitrine} aria-labelledby="dex-vitrine">
          <div className={estilos.secaoCab}>
            <h2 id="dex-vitrine" className={estilos.secaoTitulo}>
              {ultimos.length > 0 ? td("visaoGeral.chegaram") : td("visaoGeral.pegueAgora")}
            </h2>
            {ultimos.length === 0 && <p className={estilos.secaoNota}>{td("visaoGeral.pegueAgoraDica")}</p>}
          </div>
          <ul className={estilos.vitrineLista}>
            {vitrine.map(({ formaId, shiny, legenda }) => {
              const f = formaPorId.get(formaId);
              if (!f) return null;
              const forma = rotulo.forma(f);
              return (
                <li key={`${formaId}:${shiny}`}>
                  <Link
                    href={hrefCadastroDex(f.numero)}
                    className={estilos.vitrineItem}
                    aria-label={`${rotulo.nome(f)}${shiny ? ` (${td("trilha.shiny")})` : ""} — ${t("registrar")}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- render do HOME externo (PokeAPI), no máximo oito na vitrine. */}
                    <img
                      src={urlRenderHomeDex(f.sprite, shiny)}
                      alt=""
                      width={112}
                      height={112}
                      decoding="async"
                      draggable={false}
                      className={estilos.vitrineRender}
                    />
                    <span className={estilos.vitrineNome}>
                      {f.especie}
                      {shiny && (
                        <span className={estilos.estrela} aria-hidden>
                          ★
                        </span>
                      )}
                    </span>
                    {(legenda ?? forma) && <span className={estilos.vitrineLegenda}>{legenda ?? forma}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Painel as="section" className={estilos.progresso} aria-labelledby="dex-progresso">
        <h2 id="dex-progresso" className="v2-so-leitor">
          {t("progresso")}
        </h2>
        <div className={estilos.trilhas}>
          <NumeroGrande rotulo={td("trilha.normal")} p={progresso.normal} />
          <NumeroGrande rotulo={td("trilha.shiny")} p={progresso.shiny} />
        </div>
        <p className={estilos.nota}>
          {td("visaoGeral.cosmeticas", {
            normal: `${progressoCosmeticas.normal.noHome}/${progressoCosmeticas.normal.contam}`,
            shiny: `${progressoCosmeticas.shiny.noHome}/${progressoCosmeticas.shiny.contam}`,
          })}
        </p>
        <ul className={estilos.regioes} aria-label={t("regioes")}>
          {porRegiao.map(({ regiao, progresso: p }) => (
            <TileRegiao key={regiao} regiao={regiao} p={p} />
          ))}
        </ul>
      </Painel>

      <section className={estilos.secao} aria-labelledby="dex-conquistas">
        <h2 id="dex-conquistas" className={estilos.secaoTitulo}>
          {td("visaoGeral.conquistas")}
        </h2>
        <div className={estilos.conquistas}>
          <Painel className={estilos.bloco}>
            <h3 className={estilos.blocoTitulo}>{td("visaoGeral.estante")}</h3>
            <ul className={estilos.estante}>
              {(["platina", "ouro", "prata", "bronze"] as const).map((n) => (
                <li key={n}>
                  <span style={{ color: estante[n] > 0 ? COR_NIVEL[n] : "var(--v2-tinta-3)" }} aria-hidden>
                    {n === "platina" ? <Trophy size={26} /> : <Medal size={26} />}
                  </span>
                  <b className="v2-num">{estante[n]}</b>
                  <span>{n === "platina" ? td("trofeus.platina") : td(`trofeus.nivel.${n}`)}</span>
                </li>
              ))}
            </ul>
          </Painel>

          <Link href={hrefTrofeus(JOGO_HOME)} className={`v2-painel ${estilos.bloco} ${estilos.blocoLink}`}>
            <h3 className={estilos.blocoTitulo}>{td("visaoGeral.proximoTrofeu")}</h3>
            {proximo ? (
              <>
                <span className={estilos.trofeuLinha}>
                  <Medal size={18} style={{ color: COR_NIVEL[proximo.trofeu.nivel] }} aria-hidden />
                  <b>{proximo.trofeu.textos[idioma].titulo}</b>
                  <span className={estilos.selo}>{td(`trofeus.nivel.${proximo.trofeu.nivel}`)}</span>
                </span>
                <span className={estilos.textoFraco}>{proximo.trofeu.textos[idioma].descricao}</span>
                <span className={estilos.barraLinha}>
                  <Barra valor={proximo.feito} maximo={proximo.alvo} cor={COR_NIVEL[proximo.trofeu.nivel]} />
                  <span className="v2-num">
                    {proximo.feito}/{proximo.alvo}
                  </span>
                </span>
              </>
            ) : (
              <span className={estilos.textoFraco}>{td("visaoGeral.todosDoHome")}</span>
            )}
          </Link>

          <Painel className={estilos.bloco}>
            <h3 className={estilos.blocoTitulo}>{td("visaoGeral.ultimasConquistas")}</h3>
            {recentes.length === 0 ? (
              <p className={estilos.textoFraco}>{td("visaoGeral.nenhumaConquista")}</p>
            ) : (
              <ul className={estilos.linhas}>
                {recentes.map((x) => (
                  <li key={x.id}>
                    <Link href={hrefTrofeus(x.jogoId)} className={estilos.linhaLink}>
                      <Medal size={16} style={{ color: COR_NIVEL[x.nivel] }} aria-hidden />
                      <span className={estilos.linhaNome}>{x.textos[idioma].titulo}</span>
                      <span className={estilos.linhaNota}>
                        {nomeJogo(x.jogoId).replace(/^Pokémon:? /, "")}
                        {x.obtido?.em && (
                          <>
                            {" · "}
                            <DataCurta iso={x.obtido.em} />
                          </>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Painel>
        </div>
      </section>

      <section className={estilos.secao} aria-labelledby="dex-colecoes">
        <h2 id="dex-colecoes" className={estilos.secaoTitulo}>
          {td("visaoGeral.colecoes")}
        </h2>
        <ul className={estilos.cartoes}>
          <li>
            <CartaoDex
              href={hrefTrofeus(JOGO_HOME)}
              nome="Pokémon HOME"
              subtitulo={td("visaoGeral.livingDex")}
              feitas={progresso.normal.noHome}
              total={progresso.normal.contam}
              trofeus={cartaoHome}
              arte={(() => {
                const f = ultimos[0] && formaPorId.get(ultimos[0].formaId);
                return f ? urlRenderHomeDex(f.sprite, false) : null;
              })()}
            >
              <span>
                {td("visaoGeral.shinyNoHome", {
                  feitas: String(progresso.shiny.noHome),
                  total: String(progresso.shiny.contam),
                })}
              </span>
            </CartaoDex>
          </li>
          {cartoesJogos.map(({ jogo, dex, trofeus: tj }) => (
            <li key={jogo.jogoId}>
              <CartaoDex
                href={hrefTrofeus(jogo.jogoId)}
                nome={jogo.nome}
                subtitulo={jogo.ativo ? td(`conexao.${jogo.conexaoHome}`) : td("visaoGeral.parado")}
                feitas={dex?.pegas ?? null}
                total={dex?.total ?? null}
                trofeus={tj}
                arte={CAPA_DO_JOGO[jogo.jogoId] ? urlRenderHomeDex(String(CAPA_DO_JOGO[jogo.jogoId]), false) : null}
              >
                <DetalheJogo dex={dex} registrosAqui={jogo.registrosAqui} titulo={titulo} />
              </CartaoDex>
            </li>
          ))}
        </ul>
        {jogos.length === 0 && (
          <p className={estilos.textoFraco}>
            {t("semJogos")}{" "}
            <Link href="/dex/jogos" className={estilos.link}>
              {t("abrirJogos")}
            </Link>
          </p>
        )}
      </section>

      <div className={estilos.duas}>
        <Painel as="section" className={estilos.bloco} aria-labelledby="dex-plano">
          <h2 id="dex-plano" className={estilos.blocoTitulo}>
            {td("visaoGeral.planoAtivo")}
          </h2>
          {planos.length === 0 ? (
            <p className={estilos.textoFraco}>
              {td("visaoGeral.semPlano")}{" "}
              <Link href="/dex/planos" className={estilos.link}>
                {t("abrirPlanos")}
              </Link>
            </p>
          ) : (
            <ul className={estilos.linhas}>
              {planos.map((p) => {
                const feitas = p.tarefas.filter((x) => x.status !== "aberta").length;
                return (
                  <li key={p.id}>
                    <Link href="/dex/planos" className={estilos.plano}>
                      <b className={estilos.planoTitulo}>{p.titulo}</b>
                      {p.objetivo && <span className={estilos.textoFraco}>{p.objetivo}</span>}
                      <span className={estilos.barraLinha}>
                        <Barra valor={feitas} maximo={p.tarefas.length} />
                        <span className="v2-num">
                          {feitas}/{p.tarefas.length}
                        </span>
                      </span>
                      {p.trofeuIds.length > 0 && (
                        <span className={estilos.linhaNota}>{p.trofeuIds.map(titulo).join(", ")}</span>
                      )}
                      {p.fim && (
                        <span className={estilos.linhaNota}>
                          {t("ate")} <DataCurta iso={p.fim} />
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Painel>

        <Painel as="section" className={estilos.bloco} aria-labelledby="dex-fora">
          <h2 id="dex-fora" className={estilos.blocoTitulo}>
            {td("visaoGeral.foraDoHome")}
          </h2>
          {foraDoHome.length === 0 ? (
            <p className={estilos.textoFraco}>{td("visaoGeral.nadaForaDoHome")}</p>
          ) : (
            <>
              <ul className={estilos.linhas}>
                {foraDoHome.map((g) => (
                  <li key={g.jogoId} className={estilos.foraLinha}>
                    <span className={estilos.linhaNome}>{nomeJogo(g.jogoId)}</span>
                    <span className={estilos.sprites}>
                      {g.itens.slice(0, 5).map((i) => {
                        const f = formaPorId.get(i.formaId);
                        return f ? (
                          <SpriteDex
                            key={`${i.formaId}:${i.trilha}`}
                            sprite={f.sprite}
                            shiny={i.trilha === "shiny"}
                            tamanho={32}
                            alt={rotulo.nome(f)}
                          />
                        ) : null;
                      })}
                    </span>
                    <span className={`${estilos.linhaValor} v2-num`}>{g.itens.length}</span>
                  </li>
                ))}
              </ul>
              <BotaoLink href="/dex/pokedex" variante="primario" pequeno>
                {td("visaoGeral.levarAoHome")}
              </BotaoLink>
            </>
          )}
        </Painel>
      </div>
    </div>
  );
}

/** Uma data guardada como `AAAA-MM-DD`, curta, no idioma da interface (sem fuso: é uma data, não um instante). */
function DataCurta({ iso }: { iso: string }) {
  const formato = useFormatter();
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return <>{iso}</>;
  return (
    <time dateTime={iso.slice(0, 10)}>
      {formato.dateTime(new Date(Date.UTC(a, m - 1, d)), { dateStyle: "medium", timeZone: "UTC" })}
    </time>
  );
}

/** A barra de progresso, só desenho: quem usa escreve o número ao lado. */
function Barra({ valor, maximo, cor }: { valor: number; maximo: number; cor?: string }) {
  const fracao = maximo > 0 ? Math.min(Math.max(valor / maximo, 0), 1) : 0;
  return (
    <span className={estilos.barra} aria-hidden>
      <span style={{ width: `${fracao * 100}%`, background: cor }} />
    </span>
  );
}

function NumeroGrande({ rotulo, p }: { rotulo: string; p: ProgressoTrilha }) {
  const t = useTranslations("v2Dex.visaoGeral");
  const td = useTranslations("dex");
  const completa = p.contam > 0 && p.noHome >= p.contam;
  return (
    <div className={estilos.numeroGrande} data-completa={completa || undefined}>
      <span className={estilos.rotuloPequeno}>{rotulo}</span>
      <span className={estilos.numeroLinha}>
        <b className={`${estilos.percentual} v2-num`}>{t("percentual", { valor: percentualSemFechar(p.noHome, p.contam) })}</b>
        <span className="v2-num">{td("pokedex.progresso", { noHome: String(p.noHome), contam: String(p.contam) })}</span>
      </span>
      <Barra valor={p.noHome} maximo={p.contam} />
      {p.noJogo > 0 && (
        <span className={estilos.linhaNota}>{td("pokedex.progressoNoJogo", { noJogo: String(p.noJogo) })}</span>
      )}
    </div>
  );
}

/** Uma região: os três iniciais ganham cor conforme ela avança. A cor é realce; o número vem escrito. */
function TileRegiao({ regiao, p }: { regiao: Regiao; p: Record<"normal" | "shiny", ProgressoTrilha> }) {
  const t = useTranslations("v2Dex.visaoGeral");
  const td = useTranslations("dex");
  const fracao = p.normal.contam > 0 ? Math.min(p.normal.noHome / p.normal.contam, 1) : 0;
  const completa = p.normal.contam > 0 && p.normal.noHome >= p.normal.contam;
  return (
    <li className={estilos.regiao} data-completa={completa || undefined}>
      <span className={estilos.regiaoTopo}>
        <b>{NOME_REGIAO[regiao]}</b>
        <span className={`${estilos.regiaoPct} v2-num`}>
          {t("percentual", { valor: percentualSemFechar(p.normal.noHome, p.normal.contam) })}
        </span>
      </span>
      <span className={estilos.iniciais} style={{ filter: `grayscale(${1 - fracao})`, opacity: 0.55 + 0.45 * fracao }}>
        {INICIAIS[regiao].map((n) => (
          <SpriteDex key={n} sprite={String(n)} shiny={false} tamanho={48} />
        ))}
      </span>
      <Barra valor={p.normal.noHome} maximo={p.normal.contam} />
      <span className={`${estilos.linhaNota} v2-num`}>
        {td("visaoGeral.regiaoLinha", {
          normal: `${p.normal.noHome}/${p.normal.contam}`,
          shiny: `${p.shiny.noHome}/${p.shiny.contam}`,
        })}
      </span>
    </li>
  );
}

/** Cartão de coleção: o HOME ou um jogo. `feitas`/`total` nulos = jogo sem catálogo. Leva aos troféus dele. */
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
  /** Render do HOME no canto: a capa do jogo, ou o último que chegou ao HOME. */
  arte: string | null;
  children?: ReactNode;
}) {
  const t = useTranslations("v2Dex.visaoGeral");
  const td = useTranslations("dex");
  const completa = feitas !== null && total !== null && total > 0 && feitas >= total;
  return (
    <Link href={href} className={`v2-painel ${estilos.cartao}`} data-completa={completa || undefined}>
      {arte && (
        // eslint-disable-next-line @next/next/no-img-element -- render do HOME externo (PokeAPI), decorativo, um por cartão.
        <img src={arte} alt="" width={96} height={96} decoding="async" loading="lazy" draggable={false} className={estilos.cartaoArte} />
      )}
      <span className={estilos.cartaoCab}>
        <b className={estilos.cartaoNome}>{nome}</b>
        {completa && (
          <span className={estilos.seloCompleta}>
            <Crown size={12} aria-hidden />
            {td("visaoGeral.completa")}
          </span>
        )}
        <span className={estilos.linhaNota}>{subtitulo}</span>
      </span>

      {feitas !== null && total !== null && (
        <>
          <span className={estilos.numeroLinha}>
            <b className={`${estilos.percentualMedio} v2-num`}>{t("percentual", { valor: percentualSemFechar(feitas, total) })}</b>
            <span className="v2-num">
              {feitas}/{total}
            </span>
          </span>
          <Barra valor={feitas} maximo={total} />
        </>
      )}

      <span className={estilos.cartaoTexto}>{children}</span>

      {trofeus.total > 0 && (
        <span className={estilos.cartaoTrofeus}>
          <Trophy size={16} style={{ color: trofeus.platina ? COR_NIVEL.platina : "var(--v2-tinta-3)" }} aria-hidden />
          <span>{trofeus.platina ? td("trofeus.platinaConquistada") : td("trofeus.platina")}</span>
          <span className={estilos.medalhas}>
            {(["ouro", "prata", "bronze"] as const).map((n) => (
              <span key={n}>
                <Medal size={12} style={{ color: COR_NIVEL[n] }} aria-hidden />
                <span className="v2-so-leitor">{td(`trofeus.nivel.${n}`)}</span>
                <span className="v2-num">{trofeus.porNivel[n].obtidos}</span>
              </span>
            ))}
          </span>
          <b className={`${estilos.linhaValor} v2-num`}>
            {trofeus.obtidos}/{trofeus.total}
          </b>
        </span>
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
  const td = useTranslations("dex");
  if (!dex) return <span>{td("visaoGeral.semCatalogo", { aqui: String(registrosAqui) })}</span>;
  return (
    <>
      <span>
        {dex.pegas === 0
          ? td("visaoGeral.nadaPego")
          : td("visaoGeral.pegasNoHome", { noHome: String(dex.noHome), pegas: String(dex.pegas) })}
      </span>
      <span>{td("visaoGeral.faltamAgora", { faltam: String(dex.faltamAgora) })}</span>
      {dex.trancadas.slice(0, 2).map((c) => (
        <span key={c.trofeuId} className={estilos.trancada}>
          <Lock size={12} aria-hidden />
          {td("visaoGeral.trancadasAtras", { vagas: String(c.vagas), trofeu: titulo(c.trofeuId) })}
        </span>
      ))}
    </>
  );
}
