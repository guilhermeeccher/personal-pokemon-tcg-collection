"use client";

/**
 * Grade da Pokédex da Living Dex — todas as vagas do HOME, por região, nas
 * duas trilhas (normal e shiny).
 *
 * Nesta fase a grade é só de leitura: mostra o catálogo e quantas vagas
 * contam em cada trilha. O estado de cada vaga (falta, no jogo, no HOME)
 * chega com o cadastro de registros.
 *
 * O catálogo inteiro vem do servidor de uma vez (~1.400 linhas, poucas
 * dezenas de KB): filtrar por região, seção e busca é local, sem ida ao
 * banco a cada clique. A única escrita é ligar e desligar seção.
 */

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Distintivo } from "@/app/_componentes/distintivo";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { Painel } from "@/app/_componentes/painel";
import { SECOES_LIGAVEIS, CATEGORIAS_FORMA_DEX, type SecaoLigavel } from "@/lib/dominio/dex-classificacao";
import { contaNaTrilha, contarVagasDex, filtrarFormasDex, type TrilhaDex } from "@/lib/dominio/dex-grade";
import { categoriaConta, type SecoesContadas } from "@/lib/dominio/dex-secoes";
import { NOME_REGIAO, REGIOES, type Regiao } from "@/lib/dominio/escopo-pokedex";
import type { FormaDexDTO } from "@/lib/dominio/tipos-cliente";
import { urlSpriteDex } from "@/lib/imagens";

const classesOpcao = (ativa: boolean) =>
  `rounded-pill border px-3 py-1 text-xs font-semibold [transition:var(--transition-control)] ${
    ativa ? "border-accent bg-accent text-accent-fg" : "border-line text-muted hover:bg-surface-hover"
  }`;

export function GradePokedex({
  formas,
  secoesIniciais,
}: {
  formas: FormaDexDTO[];
  secoesIniciais: SecoesContadas;
}) {
  const t = useTranslations("dex");
  const [secoes, setSecoes] = useState<SecoesContadas>(secoesIniciais);
  const [salvando, setSalvando] = useState<SecaoLigavel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [trilha, setTrilha] = useState<TrilhaDex>("normal");
  const [regiao, setRegiao] = useState<Regiao | "todas">("kanto");
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS_FORMA_DEX)[number] | "todas">("todas");
  const [busca, setBusca] = useState("");

  const totais = useMemo(() => contarVagasDex(formas, secoes), [formas, secoes]);
  const visiveis = useMemo(
    () => filtrarFormasDex(formas, { regiao, categoria, busca }),
    [formas, regiao, categoria, busca],
  );
  const totaisVisiveis = useMemo(() => contarVagasDex(visiveis, secoes), [visiveis, secoes]);

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
      <CabecalhoPagina titulo={t("pokedex.titulo")} descricao={t("pokedex.descricao")} />

      <Painel className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="text-sm text-muted">
            {t("pokedex.totalNormal")}{" "}
            <strong className="font-mono tabular-nums text-strong">{totais.normal}</strong>
          </span>
          <span className="text-sm text-muted">
            {t("pokedex.totalShiny")}{" "}
            <strong className="font-mono tabular-nums text-strong">{totais.shiny}</strong>
          </span>
        </div>
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
          <p className="text-xs text-muted">{t("pokedex.secoesAjuda")}</p>
          {erro && <p className="text-xs text-danger-fg">{erro}</p>}
        </fieldset>
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
            <span className="font-medium">{t("pokedex.secao")}</span>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as typeof categoria)}
              className="w-full max-w-xs rounded border border-line bg-transparent p-2"
            >
              <option value="todas">{t("pokedex.todas")}</option>
              {CATEGORIAS_FORMA_DEX.map((c) => (
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
            return (
              <li
                key={f.id}
                className={`flex flex-col items-center gap-1 rounded-card border border-hairline bg-surface p-2 text-center shadow-1 ${
                  conta ? "" : "opacity-60"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- sprite externo pequeno (PokeAPI, pixel art ~0,6 KB), centenas por tela; mesma convenção da vaga vazia de Pokédex. */}
                <img
                  src={urlSpriteDex(f.sprite, trilha === "shiny")}
                  alt={f.forma ? `${f.especie} (${f.forma})` : f.especie}
                  width={72}
                  height={72}
                  loading="lazy"
                  className={semShiny ? "opacity-40 grayscale" : ""}
                  style={{ imageRendering: "pixelated" }}
                />
                <span className="font-mono text-xs tabular-nums text-muted">
                  #{String(f.numero).padStart(4, "0")}
                </span>
                <span className="text-sm font-semibold text-strong">{f.especie}</span>
                {f.forma && <span className="text-xs text-muted">{f.forma}</span>}
                <div className="flex flex-wrap justify-center gap-1">
                  {f.categoria !== "base" && <Distintivo>{t(`categoria.${f.categoria}`)}</Distintivo>}
                  {semShiny && <Distintivo tom="aviso">{t("pokedex.semShiny")}</Distintivo>}
                  {foraDaConta && <Distintivo>{t("pokedex.foraDaConta")}</Distintivo>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
