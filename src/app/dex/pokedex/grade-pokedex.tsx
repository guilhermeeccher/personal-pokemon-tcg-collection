"use client";

/**
 * Grade da Pokédex da Living Dex — todas as vagas do HOME, por região, nas
 * duas trilhas (normal e shiny).
 *
 * Cada vaga mostra o estado na trilha escolhida (falta, no jogo, no HOME),
 * derivado dos registros a cada render (`dex-estado.ts`), e leva ao cadastro
 * com a forma e a trilha já escolhidas.
 *
 * O catálogo inteiro vem do servidor de uma vez (~1.400 linhas, poucas
 * dezenas de KB): filtrar por região, seção e busca é local, sem ida ao
 * banco a cada clique. A única escrita é ligar e desligar seção.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { BarraProgresso } from "@/app/_componentes/ds/barra-progresso";
import { Distintivo } from "@/app/_componentes/distintivo";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { Painel } from "@/app/_componentes/painel";
import { montarCaixasDex, posicoesNasCaixas } from "@/lib/dominio/dex-caixas";
import { SECOES_LIGAVEIS, CATEGORIAS_FORMA_DEX, type SecaoLigavel } from "@/lib/dominio/dex-classificacao";
import {
  contaNaTrilha,
  contarVagasDex,
  filtrarFormasDex,
  vistaDaCategoria,
  type TrilhaDex,
  type VistaDex,
} from "@/lib/dominio/dex-grade";
import {
  estadoDaVaga,
  mapearEstadosDex,
  progressoDex,
  type EstadoVagaDex,
} from "@/lib/dominio/dex-estado";
import { categoriaConta, type SecoesContadas } from "@/lib/dominio/dex-secoes";
import { NOME_REGIAO, REGIOES, type Regiao } from "@/lib/dominio/escopo-pokedex";
import type { FormaDexDTO, RegistroDexDTO } from "@/lib/dominio/tipos-cliente";
import { urlSpriteDex } from "@/lib/imagens";

import { useRotuloForma } from "../_componentes/use-rotulo-forma";
import { PainelOportunidades } from "./painel-oportunidades";

const classesOpcao = (ativa: boolean) =>
  `rounded-pill border px-3 py-1 text-xs font-semibold [transition:var(--transition-control)] ${
    ativa ? "border-accent bg-accent text-accent-fg" : "border-line text-muted hover:bg-surface-hover"
  }`;

const ESTADOS: readonly EstadoVagaDex[] = ["falta", "no_jogo", "no_home"];

/* Moldura da vaga por estado: no HOME é a cor de sucesso; no jogo, aviso
   (pego, falta transferir); em falta, o sprite apagado. */
const MOLDURA: Record<EstadoVagaDex, string> = {
  falta: "border-hairline",
  no_jogo: "border-warning/60",
  no_home: "border-success/60 bg-success-soft",
};

export function GradePokedex({
  formas,
  secoesIniciais,
  registros,
}: {
  formas: FormaDexDTO[];
  secoesIniciais: SecoesContadas;
  registros: RegistroDexDTO[];
}) {
  const t = useTranslations("dex");
  const rotulo = useRotuloForma(formas);
  const [secoes, setSecoes] = useState<SecoesContadas>(secoesIniciais);
  const [salvando, setSalvando] = useState<SecaoLigavel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [trilha, setTrilha] = useState<TrilhaDex>("normal");
  const [vista, setVista] = useState<VistaDex>("principal");
  const [regiao, setRegiao] = useState<Regiao | "todas">("kanto");
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS_FORMA_DEX)[number] | "todas">("todas");
  const [busca, setBusca] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<EstadoVagaDex | "todos">("todos");

  const estados = useMemo(() => mapearEstadosDex(registros), [registros]);
  const formasDaVista = useMemo(() => formas.filter((f) => vistaDaCategoria(f.categoria) === vista), [formas, vista]);
  const progresso = useMemo(
    () => progressoDex(formasDaVista, estados, secoes),
    [formasDaVista, estados, secoes],
  );
  const categoriasDaVista = CATEGORIAS_FORMA_DEX.filter((c) => vistaDaCategoria(c) === vista);

  const visiveis = useMemo(
    () =>
      filtrarFormasDex(formas, { vista, regiao, categoria, busca }).filter(
        (f) => filtroEstado === "todos" || estadoDaVaga(estados, f.id, trilha) === filtroEstado,
      ),
    [formas, vista, regiao, categoria, busca, filtroEstado, estados, trilha],
  );
  const totaisVisiveis = useMemo(() => contarVagasDex(visiveis, secoes), [visiveis, secoes]);
  /* Caixa e posição no HOME, na trilha e com as seções de agora (`dex-caixas.ts`). */
  const posicoes = useMemo(
    () => posicoesNasCaixas(montarCaixasDex(formas, trilha, secoes)),
    [formas, trilha, secoes],
  );

  async function alternarSecao(secao: SecaoLigavel) {
    const conta = !secoes[secao];
    setSalvando(secao);
    setErro(null);
    try {
      const r = await fetch("/api/dex/secoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoria: secao, conta }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setSecoes((atual) => ({ ...atual, [secao]: conta }));
    } catch {
      setErro(t("erroSalvarSecao"));
    } finally {
      setSalvando(null);
    }
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-8">
      <CabecalhoPagina titulo={t("pokedex.titulo")} />

      <PainelOportunidades formas={formas} registros={registros} />

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("vista.rotulo")}>
        {(["principal", "cosmeticas"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={vista === v}
            onClick={() => {
              setVista(v);
              setCategoria("todas");
            }}
            className={classesOpcao(vista === v)}
          >
            {t(`vista.${v}`)}
          </button>
        ))}
      </div>

      <Painel className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {(["normal", "shiny"] as const).map((tr) => (
            <div key={tr} className="flex flex-col gap-1">
              <BarraProgresso
                valor={progresso[tr].noHome}
                maximo={progresso[tr].contam}
                tom={tr === "shiny" ? "acento" : "primario"}
                rotulo={t(`trilha.${tr}`)}
              />
              <span className="text-sm text-strong">
                {t("pokedex.progresso", {
                  noHome: String(progresso[tr].noHome),
                  contam: String(progresso[tr].contam),
                })}
              </span>
              {progresso[tr].noJogo > 0 && (
                <span className="text-xs text-muted">
                  {t("pokedex.progressoNoJogo", { noJogo: String(progresso[tr].noJogo) })}
                </span>
              )}
            </div>
          ))}
        </div>
        {vista === "principal" && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t("pokedex.secoesQueContam")}</legend>
            <div className="flex flex-wrap items-center gap-2">
              <span className={classesOpcao(true)} title={t("pokedex.baseSempre")}>
                {t("categoria.base")}
              </span>
              {SECOES_LIGAVEIS.map((secao) => (
                <button
                  key={secao}
                  type="button"
                  aria-pressed={secoes[secao]}
                  disabled={salvando !== null}
                  onClick={() => alternarSecao(secao)}
                  className={classesOpcao(secoes[secao])}
                >
                  {t(`categoria.${secao}`)}
                </button>
              ))}
            </div>
            {erro && <p className="text-xs text-danger-fg">{erro}</p>}
          </fieldset>
        )}
      </Painel>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("pokedex.trilha")}>
          {(["normal", "shiny"] as const).map((opcao) => (
            <button
              key={opcao}
              type="button"
              aria-pressed={trilha === opcao}
              onClick={() => setTrilha(opcao)}
              className={classesOpcao(trilha === opcao)}
            >
              {t(`trilha.${opcao}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("pokedex.regiao")}>
          {(["todas", ...REGIOES] as const).map((opcao) => (
            <button
              key={opcao}
              type="button"
              aria-pressed={regiao === opcao}
              onClick={() => setRegiao(opcao)}
              className={classesOpcao(regiao === opcao)}
            >
              {opcao === "todas" ? t("pokedex.todas") : NOME_REGIAO[opcao]}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("pokedex.buscar")}</span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={t("pokedex.placeholderBuscar")}
              className="w-full max-w-xs rounded border border-line bg-transparent p-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("pokedex.filtroEstado")}</span>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}
              className="w-full max-w-xs rounded border border-line bg-transparent p-2"
            >
              <option value="todos">{t("pokedex.todas")}</option>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {t(`estado.${e}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("pokedex.secao")}</span>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as typeof categoria)}
              className="w-full max-w-xs rounded border border-line bg-transparent p-2"
            >
              <option value="todas">{t("pokedex.todas")}</option>
              {categoriasDaVista.map((c) => (
                <option key={c} value={c}>
                  {t(`categoria.${c}`)}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-muted sm:ml-auto">
            {t("pokedex.exibindo", {
              exibidas: String(visiveis.length),
              contam: String(totaisVisiveis[trilha]),
            })}
          </p>
        </div>
      </div>

      {formas.length === 0 ? (
        <EstadoVazio>{t("pokedex.catalogoVazio")}</EstadoVazio>
      ) : visiveis.length === 0 ? (
        <EstadoVazio>{t("pokedex.nadaEncontrado")}</EstadoVazio>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {visiveis.map((f) => {
            const semShiny = trilha === "shiny" && !f.shinyObtenivel;
            const foraDaConta = !categoriaConta(f.categoria, secoes);
            const conta = contaNaTrilha(f, trilha, secoes);
            const estado = estadoDaVaga(estados, f.id, trilha);
            const naCaixa = posicoes.get(f.id);
            return (
              <li
                key={f.id}
                className={`rounded-card border bg-surface shadow-1 ${MOLDURA[estado]} ${conta ? "" : "opacity-60"}`}
              >
                <Link
                  href={`/dex/cadastrar?busca=${f.numero}`}
                  title={t("pokedex.registrarEsta")}
                  className="flex h-full flex-col items-center gap-1 p-2 text-center"
                >
                {/* eslint-disable-next-line @next/next/no-img-element -- sprite externo pequeno (PokeAPI, pixel art ~0,6 KB), centenas por tela; mesma convenção da vaga vazia de Pokédex. */}
                <img
                  src={urlSpriteDex(f.sprite, trilha === "shiny")}
                  alt={rotulo.nome(f)}
                  width={72}
                  height={72}
                  loading="lazy"
                  className={semShiny || estado === "falta" ? "opacity-40 grayscale" : ""}
                  style={{ imageRendering: "pixelated" }}
                />
                <span className="font-mono text-xs tabular-nums text-muted">
                  #{String(f.numero).padStart(4, "0")}
                </span>
                <span className="text-sm font-semibold text-strong">{f.especie}</span>
                {rotulo.forma(f) && <span className="text-xs text-muted">{rotulo.forma(f)}</span>}
                {naCaixa && (
                  <span className="font-mono text-xs tabular-nums text-muted">
                    {t("pokedex.posicaoNaCaixa", { caixa: String(naCaixa.caixa), posicao: String(naCaixa.posicao) })}
                  </span>
                )}
                <div className="flex flex-wrap justify-center gap-1">
                  {estado !== "falta" && (
                    <Distintivo tom={estado === "no_home" ? "sucesso" : "aviso"}>{t(`estado.${estado}`)}</Distintivo>
                  )}
                  {f.categoria !== "base" && <Distintivo>{t(`categoria.${f.categoria}`)}</Distintivo>}
                  {semShiny && <Distintivo tom="aviso">{t("pokedex.semShiny")}</Distintivo>}
                  {foraDaConta && <Distintivo>{t("pokedex.foraDaConta")}</Distintivo>}
                </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
