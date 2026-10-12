"use client";

/**
 * Cadastro por jogo — o "por set" das cartas aplicado à Living Dex: escolhe
 * o jogo, a tabela traz todas as vagas em ordem de nome, e cada linha recebe
 * a quantidade normal e a shiny. Um botão grava tudo; cada Pokémon vira um
 * registro, nascido no jogo e ainda nele.
 *
 * A tabela mostra só o que existe no jogo escolhido (`catalogoDoJogo`), com
 * a marca de troca e de evento; "Mostrar todas" abre o resto, para o
 * Pokémon que chegou de fora. Seções desligadas na Pokédex somem daqui, e
 * as cosméticas ficam na vista delas, como na grade.
 *
 * 1.391 linhas com dois campos cada: a linha é memorizada e só redesenha
 * quando a quantidade dela muda.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { memo, useCallback, useMemo, useState } from "react";

import { Alerta } from "@/app/_componentes/alerta";
import { Botao, classesBotao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { classesEntrada } from "@/app/_componentes/campo";
import { Distintivo } from "@/app/_componentes/distintivo";
import { textosDasRecusas } from "@/app/_componentes/recusa";
import { classesCelulaCabecalho, classesLinha, classesLinhaCabecalho, Tabela } from "@/app/_componentes/tabela";
import { catalogoDoJogo, type DisponibilidadeForma } from "@/lib/dominio/dex-disponibilidade";
import { filtrarFormasDex, type VistaDex } from "@/lib/dominio/dex-grade";
import { categoriaConta, type SecoesContadas } from "@/lib/dominio/dex-secoes";
import { MAX_QUANTIDADE_POR_LINHA } from "@/lib/dominio/dex-registro";
import type { FormaDexDTO, JogoPossuidoDTO } from "@/lib/dominio/tipos-cliente";

import { SpriteDex } from "../_componentes/sprite-dex";
import { useRotuloForma } from "../_componentes/use-rotulo-forma";

type Quantidades = Record<string, { normal: number; shiny: number }>;
type Trilha = "normal" | "shiny";

const classesOpcao = (ativa: boolean) =>
  `rounded-pill border px-3 py-1 text-xs font-semibold [transition:var(--transition-control)] ${
    ativa ? "border-accent bg-accent text-accent-fg" : "border-line text-muted hover:bg-surface-hover"
  }`;

function lerQuantidade(texto: string): number {
  const n = Number.parseInt(texto, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_QUANTIDADE_POR_LINHA);
}

const LinhaForma = memo(function LinhaForma({
  forma,
  rotulo,
  disponibilidade,
  comCatalogo,
  normal,
  shiny,
  tenhoNormal,
  tenhoShiny,
  aoMudar,
}: {
  forma: FormaDexDTO;
  /** Nome da forma na tela (macho/fêmea traduzidos), ou nulo. */
  rotulo: string | null;
  /** `undefined` com catálogo = fora do jogo. */
  disponibilidade: DisponibilidadeForma | undefined;
  comCatalogo: boolean;
  normal: number;
  shiny: number;
  tenhoNormal: number;
  tenhoShiny: number;
  aoMudar: (formaId: string, trilha: Trilha, valor: number) => void;
}) {
  const t = useTranslations("dex");
  const marcada = normal + shiny > 0;
  const campo = (trilha: Trilha, valor: number) => (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={MAX_QUANTIDADE_POR_LINHA}
      aria-label={`${forma.especie} ${rotulo ?? ""} ${trilha}`}
      className={`${classesEntrada} w-16 text-right tabular-nums`}
      value={valor || ""}
      onChange={(e) => aoMudar(forma.id, trilha, lerQuantidade(e.target.value))}
    />
  );
  return (
    <tr className={`${classesLinha} ${marcada ? "bg-accent-soft" : ""}`}>
      <td className="p-1">
        <SpriteDex sprite={forma.sprite} shiny={false} tamanho={40} />
      </td>
      <td className="p-2">
        <span className="font-semibold text-strong">{forma.especie}</span>
        {rotulo && <span className="ml-1 text-xs text-muted">{rotulo}</span>}
        {comCatalogo && !disponibilidade && (
          <Distintivo className="ml-2">{t("cadastrar.foraDoJogo")}</Distintivo>
        )}
        {disponibilidade && disponibilidade.como !== "livre" && (
          <Distintivo tom="aviso" className="ml-2">
            {t(`cadastrar.como.${disponibilidade.como}`)}
          </Distintivo>
        )}
        {disponibilidade && !disponibilidade.transferivel && (
          <Distintivo tom="perigo" className="ml-2">
            {t("cadastrar.naoVaiAoHome")}
          </Distintivo>
        )}
      </td>
      <td className="p-2 font-mono text-xs tabular-nums text-muted">{forma.numero}</td>
      <td className="p-2 text-xs tabular-nums">
        {tenhoNormal > 0 && <span className="mr-1">{tenhoNormal}</span>}
        {tenhoShiny > 0 && <Distintivo tom="acento">★{tenhoShiny}</Distintivo>}
      </td>
      <td className="p-1">{campo("normal", normal)}</td>
      <td className="p-1">{campo("shiny", shiny)}</td>
    </tr>
  );
});

export function CadastroPorJogo({
  formas,
  jogos,
  tenho,
  secoes,
  buscaInicial,
}: {
  formas: FormaDexDTO[];
  jogos: JogoPossuidoDTO[];
  tenho: Quantidades;
  secoes: SecoesContadas;
  buscaInicial: string;
}) {
  const t = useTranslations("dex");
  const tr = useTranslations("recusas");
  const router = useRouter();
  const rotulo = useRotuloForma(formas);

  const [jogoId, setJogoId] = useState(jogos[0]?.jogoId ?? "");
  const [filtro, setFiltro] = useState(buscaInicial);
  const [soQueNaoTenho, setSoQueNaoTenho] = useState(false);
  const [vista, setVista] = useState<VistaDex>("principal");
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const [quantidades, setQuantidades] = useState<Quantidades>({});
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const catalogo = useMemo(() => catalogoDoJogo(jogoId, formas), [jogoId, formas]);

  const visiveis = useMemo(
    () =>
      filtrarFormasDex(formas, { vista, regiao: "todas", categoria: "todas", busca: filtro }).filter(
        (f) =>
          categoriaConta(f.categoria, secoes) &&
          (mostrarTodas || !catalogo || catalogo.has(f.id)) &&
          (!soQueNaoTenho || !tenho[f.id]),
      ),
    [formas, vista, filtro, secoes, mostrarTodas, catalogo, soQueNaoTenho, tenho],
  );

  const total = useMemo(
    () => Object.values(quantidades).reduce((soma, q) => soma + q.normal + q.shiny, 0),
    [quantidades],
  );

  const aoMudar = useCallback((formaId: string, trilha: Trilha, valor: number) => {
    setSucesso(null);
    setQuantidades((atual) => {
      const linha = { ...(atual[formaId] ?? { normal: 0, shiny: 0 }), [trilha]: valor };
      const proximo = { ...atual };
      if (linha.normal + linha.shiny === 0) delete proximo[formaId];
      else proximo[formaId] = linha;
      return proximo;
    });
  }, []);

  async function cadastrar() {
    if (total === 0 || !jogoId) return;
    setEnviando(true);
    setErros([]);
    setSucesso(null);
    try {
      const r = await fetch("/api/dex/registros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jogoId,
          itens: Object.entries(quantidades).map(([formaId, q]) => ({ formaId, ...q })),
        }),
      });
      if (!r.ok) {
        setErros(textosDasRecusas(tr, await r.json().catch(() => null), t("cadastrar.erro")));
        return;
      }
      const nomeJogo = jogos.find((j) => j.jogoId === jogoId)?.nome ?? jogoId;
      setSucesso(t("cadastrar.cadastrados", { quantidade: String(total), jogo: nomeJogo }));
      setQuantidades({});
      router.refresh();
    } catch {
      setErros([t("cadastrar.erro")]);
    } finally {
      setEnviando(false);
    }
  }

  if (jogos.length === 0) {
    return (
      <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-8">
        <CabecalhoPagina titulo={t("cadastrar.titulo")} />
        <p className="text-sm text-muted">{t("cadastrar.semJogos")}</p>
        <div>
          <Link href="/dex/jogos" className={classesBotao("primario")}>
            {t("cadastrar.irParaJogos")}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-8 md:h-full">
      <CabecalhoPagina titulo={t("cadastrar.titulo")} />

      {/* Jogo, filtro e botão ficam parados; só a tabela rola (`rolagemPropria`). */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("cadastrar.jogo")}>
          {jogos.map((j) => (
            <button
              key={j.jogoId}
              type="button"
              aria-pressed={jogoId === j.jogoId}
              onClick={() => setJogoId(j.jogoId)}
              className={classesOpcao(jogoId === j.jogoId)}
            >
              {j.nome}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("vista.rotulo")}>
          {(["principal", "cosmeticas"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vista === v}
              onClick={() => setVista(v)}
              className={classesOpcao(vista === v)}
            >
              {t(`vista.${v}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            aria-label={t("cadastrar.filtrar")}
            className={`${classesEntrada} w-56`}
            value={filtro}
            placeholder={t("cadastrar.placeholderFiltrar")}
            onChange={(e) => setFiltro(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soQueNaoTenho} onChange={(e) => setSoQueNaoTenho(e.target.checked)} />
            {t("cadastrar.soQueNaoTenho")}
          </label>
          {catalogo ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={mostrarTodas} onChange={(e) => setMostrarTodas(e.target.checked)} />
              {t("cadastrar.mostrarTodas")}
            </label>
          ) : (
            <span className="text-xs text-muted">{t("cadastrar.semCatalogo")}</span>
          )}
          <div className="ml-auto flex gap-2">
            {total > 0 && (
              <Botao tamanho="sm" onClick={() => setQuantidades({})} disabled={enviando}>
                {t("cadastrar.limpar")}
              </Botao>
            )}
            <Botao variante="primario" tamanho="sm" onClick={cadastrar} disabled={enviando || total === 0}>
              {t("cadastrar.cadastrar", { quantidade: String(total) })}
            </Botao>
          </div>
        </div>
        {erros.length > 0 && (
          <Alerta tom="perigo">
            <ul>
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alerta>
        )}
        {sucesso && <Alerta tom="sucesso">{sucesso}</Alerta>}
      </div>

      <Tabela rolagemPropria>
        <thead>
          <tr className={classesLinhaCabecalho}>
            <th className={classesCelulaCabecalho} />
            <th className={classesCelulaCabecalho}>{t("cadastrar.colPokemon")}</th>
            <th className={classesCelulaCabecalho}>{t("cadastrar.colNumero")}</th>
            <th className={classesCelulaCabecalho}>{t("cadastrar.colTenho")}</th>
            <th className={classesCelulaCabecalho}>{t("cadastrar.colNormal")}</th>
            <th className={classesCelulaCabecalho}>{t("cadastrar.colShiny")}</th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map((f) => (
            <LinhaForma
              key={f.id}
              forma={f}
              rotulo={rotulo.forma(f)}
              disponibilidade={catalogo?.get(f.id)}
              comCatalogo={catalogo !== null}
              normal={quantidades[f.id]?.normal ?? 0}
              shiny={quantidades[f.id]?.shiny ?? 0}
              tenhoNormal={tenho[f.id]?.normal ?? 0}
              tenhoShiny={tenho[f.id]?.shiny ?? 0}
              aoMudar={aoMudar}
            />
          ))}
          {visiveis.length === 0 && (
            <tr>
              <td colSpan={6} className="p-4 text-center text-sm text-muted">
                {t("cadastrar.nada")}
              </td>
            </tr>
          )}
        </tbody>
      </Tabela>
    </main>
  );
}
