"use client";

/**
 * Cadastrar Pokémon — o caminho principal de entrada da Living Dex (spec
 * §1: o cadastro do dia a dia é do usuário, pela interface).
 *
 * Pensado para lançar vários seguidos do mesmo jogo: depois de registrar, a
 * forma limpa e a origem, o local e o shiny ficam como estavam.
 *
 * O catálogo inteiro vem do servidor (~1.400 vagas): a busca é local.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Alerta } from "@/app/_componentes/alerta";
import { Botao, classesBotao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Campo, classesEntrada } from "@/app/_componentes/campo";
import { Distintivo } from "@/app/_componentes/distintivo";
import { Painel } from "@/app/_componentes/painel";
import { textosDasRecusas } from "@/app/_componentes/recusa";
import { filtrarFormasDex } from "@/lib/dominio/dex-grade";
import { JOGOS_DEX, LOCAL_HOME } from "@/lib/dominio/dex-jogos";
import type { FormaDexDTO, JogoPossuidoDTO } from "@/lib/dominio/tipos-cliente";
import { urlSpriteDex } from "@/lib/imagens";

import { ListaRegistros } from "./lista-registros";

const MAX_RESULTADOS = 24;

export function nomeDaForma(f: { especie: string; forma: string | null }): string {
  return f.forma ? `${f.especie} (${f.forma})` : f.especie;
}

export function CadastroRegistro({
  formas,
  jogos,
  formaInicial,
  shinyInicial,
}: {
  formas: FormaDexDTO[];
  jogos: JogoPossuidoDTO[];
  formaInicial: FormaDexDTO | null;
  shinyInicial: boolean;
}) {
  const t = useTranslations("dex");
  const tr = useTranslations("recusas");

  const ativos = useMemo(() => jogos.filter((j) => j.ativo), [jogos]);
  const idsAtivos = useMemo(() => new Set(ativos.map((j) => j.jogoId)), [ativos]);
  const outros = JOGOS_DEX.filter((j) => !idsAtivos.has(j.id));

  const origemInicial = ativos[0]?.jogoId ?? "";
  const [forma, setForma] = useState<FormaDexDTO | null>(formaInicial);
  const [busca, setBusca] = useState("");
  const [shiny, setShiny] = useState(shinyInicial);
  const [jogoOrigem, setJogoOrigem] = useState(origemInicial);
  const [local, setLocal] = useState(origemInicial || LOCAL_HOME);
  const [capturadoEm, setCapturadoEm] = useState("");
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [versaoLista, setVersaoLista] = useState(0);

  const resultados = useMemo(
    () => (busca.trim() ? filtrarFormasDex(formas, { regiao: "todas", categoria: "todas", busca }) : []),
    [formas, busca],
  );

  function escolherOrigem(id: string) {
    setJogoOrigem(id);
    // O Pokémon está, por padrão, no jogo de onde veio — se for um jogo seu.
    setLocal(idsAtivos.has(id) ? id : LOCAL_HOME);
  }

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (!forma || !jogoOrigem) return;
    setEnviando(true);
    setErros([]);
    setSucesso(null);
    try {
      const r = await fetch("/api/dex/registros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formaId: forma.id, shiny, jogoOrigem, local, capturadoEm, notas }),
      });
      if (!r.ok) {
        setErros(textosDasRecusas(tr, await r.json().catch(() => null), t("cadastrar.erro")));
        return;
      }
      setSucesso(t("cadastrar.registrado", { nome: nomeDaForma(forma) }));
      setForma(null);
      setBusca("");
      setNotas("");
      setVersaoLista((v) => v + 1);
    } catch {
      setErros([t("cadastrar.erro")]);
    } finally {
      setEnviando(false);
    }
  }

  if (ativos.length === 0) {
    return (
      <main className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-8">
        <CabecalhoPagina titulo={t("cadastrar.titulo")} descricao={t("cadastrar.descricao")} />
        <Painel className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted">{t("cadastrar.semJogos")}</p>
          <Link href="/dex/jogos" className={classesBotao("primario")}>
            {t("cadastrar.irParaJogos")}
          </Link>
        </Painel>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-8">
      <CabecalhoPagina titulo={t("cadastrar.titulo")} descricao={t("cadastrar.descricao")} />

      <Painel as="form" className="flex flex-col gap-4" onSubmit={registrar}>
        {forma ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- sprite externo pequeno da PokeAPI, mesma convenção da grade. */}
            <img
              src={urlSpriteDex(forma.sprite, shiny)}
              alt={nomeDaForma(forma)}
              width={72}
              height={72}
              style={{ imageRendering: "pixelated" }}
            />
            <div className="flex flex-col">
              <span className="font-mono text-xs tabular-nums text-muted">#{String(forma.numero).padStart(4, "0")}</span>
              <span className="font-display text-base font-bold text-strong">{forma.especie}</span>
              {forma.forma && <span className="text-xs text-muted">{forma.forma}</span>}
            </div>
            <Botao type="button" tamanho="xs" className="ml-auto" onClick={() => setForma(null)}>
              {t("cadastrar.trocarForma")}
            </Botao>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Campo rotulo={t("cadastrar.buscarForma")}>
              <input
                autoFocus
                className={classesEntrada}
                value={busca}
                placeholder={t("cadastrar.placeholderBuscarForma")}
                onChange={(e) => setBusca(e.target.value)}
              />
            </Campo>
            {resultados.length === 0 ? (
              <p className="text-xs text-muted">{t("cadastrar.escolhaUmaForma")}</p>
            ) : (
              <>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {resultados.slice(0, MAX_RESULTADOS).map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => setForma(f)}
                        className="flex w-full flex-col items-center gap-0.5 rounded-card border border-hairline bg-surface p-1.5 text-center [transition:var(--transition-control)] hover:bg-surface-hover"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- sprite externo pequeno da PokeAPI. */}
                        <img
                          src={urlSpriteDex(f.sprite, shiny)}
                          alt=""
                          width={56}
                          height={56}
                          loading="lazy"
                          style={{ imageRendering: "pixelated" }}
                        />
                        <span className="text-xs font-semibold text-strong">{f.especie}</span>
                        {f.forma && <span className="text-[11px] text-muted">{f.forma}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
                {resultados.length > MAX_RESULTADOS && (
                  <p className="text-xs text-muted">
                    {t("cadastrar.mais", { quantidade: String(resultados.length - MAX_RESULTADOS) })}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex h-[34px] items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={shiny} onChange={(e) => setShiny(e.target.checked)} />
            {t("cadastrar.shiny")}
          </label>
          <Campo rotulo={t("cadastrar.jogoOrigem")}>
            <select className={classesEntrada} value={jogoOrigem} onChange={(e) => escolherOrigem(e.target.value)}>
              <optgroup label={t("cadastrar.seusJogos")}>
                {ativos.map((j) => (
                  <option key={j.jogoId} value={j.jogoId}>
                    {j.nome}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t("cadastrar.outrosJogos")}>
                {outros.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.nome}
                  </option>
                ))}
              </optgroup>
            </select>
          </Campo>
          <Campo rotulo={t("cadastrar.local")}>
            <select className={classesEntrada} value={local} onChange={(e) => setLocal(e.target.value)}>
              <option value={LOCAL_HOME}>{t("home")}</option>
              {ativos.map((j) => (
                <option key={j.jogoId} value={j.jogoId}>
                  {j.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo={t("cadastrar.capturadoEm")}>
            <input
              type="date"
              className={classesEntrada}
              value={capturadoEm}
              onChange={(e) => setCapturadoEm(e.target.value)}
            />
          </Campo>
          <Campo rotulo={t("cadastrar.notas")} className="min-w-48 flex-1">
            <input
              className={classesEntrada}
              value={notas}
              placeholder={t("cadastrar.placeholderNotas")}
              onChange={(e) => setNotas(e.target.value)}
            />
          </Campo>
        </div>

        {forma && shiny && !forma.shinyObtenivel && (
          <Alerta tom="aviso">
            <Distintivo tom="aviso" className="mr-2">
              {t("pokedex.semShiny")}
            </Distintivo>
            {t("cadastrar.avisoSemShiny")}
          </Alerta>
        )}
        {erros.length > 0 && (
          <Alerta tom="perigo">
            <ul className="flex flex-col gap-1">
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alerta>
        )}
        {sucesso && <Alerta tom="sucesso">{sucesso}</Alerta>}

        <div>
          <Botao type="submit" variante="primario" disabled={enviando || !forma || !jogoOrigem}>
            {t("cadastrar.registrar")}
          </Botao>
        </div>
      </Painel>

      <ListaRegistros jogos={jogos} versao={versaoLista} />
    </main>
  );
}
