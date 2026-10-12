"use client";

/**
 * Troféus — a lista de cada jogo, na ordem da história, com a platina no
 * topo. O usuário marca o que conquistou; o checkpoint diz quantas espécies
 * destrava, e "Caçar" abre um plano com o troféu como alvo (spec §6). Os do
 * HOME (`calculado`) não se marcam: valem pelos registros, sem data.
 */

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Alerta } from "@/app/_componentes/alerta";
import { Botao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { classesEntrada } from "@/app/_componentes/campo";
import { Distintivo } from "@/app/_componentes/distintivo";
import { BarraProgresso } from "@/app/_componentes/ds/barra-progresso";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { Icone } from "@/app/_componentes/icone";
import { Painel } from "@/app/_componentes/painel";
import { textoDaRecusa } from "@/app/_componentes/recusa";
import { progressoTrofeus, type IdiomaTrofeu, type NivelTrofeu } from "@/lib/dominio/dex-trofeus";
import type { TrofeuDexDTO } from "@/lib/dominio/tipos-cliente";

import { hojeLocal } from "../_componentes/hoje";

const COR_NIVEL: Record<NivelTrofeu | "platina", string> = {
  bronze: "var(--trophy-bronze)",
  prata: "var(--trophy-silver)",
  ouro: "var(--trophy-gold)",
  platina: "var(--trophy-platinum)",
};

const classesOpcao = (ativa: boolean) =>
  `rounded-pill border px-3 py-1 text-xs font-semibold [transition:var(--transition-control)] ${
    ativa ? "border-accent bg-accent text-accent-fg" : "border-line text-muted hover:bg-surface-hover"
  }`;

export function PainelTrofeus({
  jogos,
  trofeus,
  jogoInicial,
}: {
  /** As abas: o HOME e os jogos do usuário que têm troféus. */
  jogos: { jogoId: string; nome: string }[];
  trofeus: TrofeuDexDTO[];
  jogoInicial: string;
}) {
  const t = useTranslations("dex");
  const tr = useTranslations("recusas");
  const idioma = useLocale() as IdiomaTrofeu;
  const router = useRouter();
  const [jogoId, setJogoId] = useState(
    jogos.some((j) => j.jogoId === jogoInicial) ? jogoInicial : (jogos[0]?.jogoId ?? ""),
  );
  const [soFalta, setSoFalta] = useState(false);
  const [marcando, setMarcando] = useState<{ id: string; data: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const doJogo = useMemo(() => trofeus.filter((x) => x.jogoId === jogoId), [trofeus, jogoId]);
  const obtidos = useMemo(() => new Set(doJogo.filter((x) => x.obtido).map((x) => x.id)), [doJogo]);
  const progresso = progressoTrofeus(doJogo, jogoId, obtidos);
  const titulo = (id: string) => trofeus.find((x) => x.id === id)?.textos[idioma].titulo ?? id;
  const visiveis = soFalta ? doJogo.filter((x) => !x.obtido) : doJogo;

  async function enviar(url: string, method: string, corpo?: unknown): Promise<Response | null> {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
      if (!r.ok) {
        setErro(textoDaRecusa(tr, await r.json().catch(() => null), t("trofeus.erro")));
        return null;
      }
      return r;
    } catch {
      setErro(t("trofeus.erro"));
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function confirmarConquista() {
    if (!marcando) return;
    if (await enviar("/api/dex/trofeus", "POST", { trofeuId: marcando.id, obtidoEm: marcando.data })) {
      setMarcando(null);
      router.refresh();
    }
  }

  async function desfazer(x: TrofeuDexDTO) {
    if (!window.confirm(t("trofeus.confirmarDesfazer", { trofeu: x.textos[idioma].titulo }))) return;
    if (await enviar(`/api/dex/trofeus/${x.id}`, "DELETE")) router.refresh();
  }

  async function cacar(x: TrofeuDexDTO) {
    const r = await enviar("/api/dex/planos", "POST", {
      titulo: t("trofeus.tituloPlanoCacar", { trofeu: x.textos[idioma].titulo }),
      inicio: hojeLocal(),
      trofeuIds: [x.id],
    });
    if (r) router.push("/dex/planos");
  }

  if (jogos.length === 0) {
    return (
      <main className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-8">
        <CabecalhoPagina titulo={t("trofeus.titulo")} />
        <EstadoVazio>{t("trofeus.nenhumJogo")}</EstadoVazio>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-8">
      <CabecalhoPagina titulo={t("trofeus.titulo")} />

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("trofeus.jogo")}>
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

      <Painel className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span style={{ color: progresso.platina ? COR_NIVEL.platina : "var(--slate-3)" }}>
            <Icone nome="trophy" tamanho={20} />
          </span>
          <div className="flex flex-1 flex-col gap-1">
            <span className="font-display text-base font-bold text-strong">
              {progresso.platina ? t("trofeus.platinaConquistada") : t("trofeus.platina")}
            </span>
            <BarraProgresso valor={progresso.obtidos} maximo={progresso.total} cor={COR_NIVEL.platina} />
          </div>
          <span className="font-mono text-sm tabular-nums text-strong">
            {progresso.obtidos}/{progresso.total}
          </span>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {(["ouro", "prata", "bronze"] as const).map((n) => (
            <span key={n} className="flex items-center gap-1.5">
              <span style={{ color: COR_NIVEL[n] }}>
                <Icone nome="medal" tamanho={16} />
              </span>
              <span className="text-muted">{t(`trofeus.nivel.${n}`)}</span>
              <span className="font-mono tabular-nums text-strong">
                {progresso.porNivel[n].obtidos}/{progresso.porNivel[n].total}
              </span>
            </span>
          ))}
          <label className="ml-auto flex items-center gap-2">
            <input type="checkbox" checked={soFalta} onChange={(e) => setSoFalta(e.target.checked)} />
            {t("trofeus.soFalta")}
          </label>
        </div>
      </Painel>

      {erro && <Alerta tom="perigo">{erro}</Alerta>}

      <ul className="flex flex-col gap-2">
        {visiveis.map((x) => {
          const texto = x.textos[idioma];
          return (
            <Painel as="li" key={x.id} className={`flex gap-3 ${x.obtido ? "" : "opacity-90"}`}>
              <span className="pt-0.5" style={{ color: x.obtido ? COR_NIVEL[x.nivel] : "var(--slate-3)" }}>
                <Icone nome={x.tipo === "checkpoint" && !x.obtido ? "lock" : "medal"} tamanho={20} />
              </span>
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-base font-bold text-strong">{texto.titulo}</span>
                  <Distintivo>{t(`trofeus.nivel.${x.nivel}`)}</Distintivo>
                  {x.tipo === "checkpoint" && (
                    <Distintivo tom="acento">
                      {t("trofeus.libera", { quantidade: String(x.libera.length) })}
                    </Distintivo>
                  )}
                  {x.obtido && (
                    <Distintivo tom="sucesso">
                      {x.obtido.em ? t("trofeus.conquistadoEm", { data: x.obtido.em }) : t("trofeus.conquistado")}
                    </Distintivo>
                  )}
                </div>
                <p className="text-sm text-muted">{texto.descricao}</p>
                {!x.obtido && x.requer.length > 0 && (
                  <p className="text-xs text-muted">
                    {t("trofeus.depoisDe", { trofeus: x.requer.map(titulo).join(", ") })}
                  </p>
                )}

                {x.tipo === "calculado" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted">{t("trofeus.contaSozinho")}</span>
                    {!x.obtido && (
                      <Botao tamanho="xs" disabled={ocupado} onClick={() => cacar(x)}>
                        {t("trofeus.cacar")}
                      </Botao>
                    )}
                  </div>
                ) : marcando?.id === x.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      aria-label={t("trofeus.data")}
                      className={classesEntrada}
                      value={marcando.data}
                      onChange={(e) => setMarcando({ id: x.id, data: e.target.value })}
                    />
                    <Botao tamanho="xs" variante="primario" disabled={ocupado || !marcando.data} onClick={confirmarConquista}>
                      {t("trofeus.confirmar")}
                    </Botao>
                    <Botao tamanho="xs" onClick={() => setMarcando(null)}>
                      {t("trofeus.cancelar")}
                    </Botao>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {x.obtido ? (
                      <Botao tamanho="xs" disabled={ocupado} onClick={() => desfazer(x)}>
                        {t("trofeus.desfazer")}
                      </Botao>
                    ) : (
                      <>
                        <Botao
                          tamanho="xs"
                          variante="primario"
                          disabled={ocupado}
                          onClick={() => setMarcando({ id: x.id, data: hojeLocal() })}
                        >
                          {t("trofeus.conquistei")}
                        </Botao>
                        <Botao tamanho="xs" disabled={ocupado} onClick={() => cacar(x)}>
                          {t("trofeus.cacar")}
                        </Botao>
                      </>
                    )}
                  </div>
                )}
              </div>
            </Painel>
          );
        })}
      </ul>
    </main>
  );
}
