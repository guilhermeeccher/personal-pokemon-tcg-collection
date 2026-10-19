"use client";

/**
 * Planos — o que fazer nos jogos, montado nas sessões com o Claude ou aqui
 * mesmo. Cada plano tem tarefas marcáveis e pode mirar troféus.
 *
 * Concluir uma tarefa de captura ou evolução **oferece** o cadastro, já no
 * jogo da tarefa; nunca registra o Pokémon sozinho (regra 8 da spec).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Alerta } from "@/app/_componentes/alerta";
import { Botao, classesBotao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Campo, classesEntrada } from "@/app/_componentes/campo";
import { Distintivo } from "@/app/_componentes/distintivo";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { Painel } from "@/app/_componentes/painel";
import { textoDaRecusa } from "@/app/_componentes/recusa";
import { jogoDex } from "@/lib/dominio/dex-jogos";
import { TIPOS_TAREFA, type StatusPlanoDex, type StatusTarefaDex } from "@/lib/dominio/dex-sessao";
import type { IdiomaTrofeu } from "@/lib/dominio/dex-trofeus";
import type { FormaDexDTO, JogoPossuidoDTO, PlanoDexDTO, TarefaDexDTO, TrofeuDexDTO } from "@/lib/dominio/tipos-cliente";

import { hojeLocal } from "../_componentes/hoje";
import { SpriteDex } from "../_componentes/sprite-dex";

type TrofeuResumo = Pick<TrofeuDexDTO, "id" | "jogoId" | "textos">;

const OFERECE_CADASTRO = new Set<TarefaDexDTO["tipo"]>(["captura", "evolucao", "troca"]);

export function PainelPlanos({
  planos,
  trofeus,
  jogos,
  formas,
}: {
  planos: PlanoDexDTO[];
  trofeus: TrofeuResumo[];
  jogos: JogoPossuidoDTO[];
  formas: FormaDexDTO[];
}) {
  const t = useTranslations("dex");
  const tr = useTranslations("recusas");
  const idioma = useLocale() as IdiomaTrofeu;
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [novoPlano, setNovoPlano] = useState<null | { titulo: string; objetivo: string; inicio: string; fim: string }>(null);
  const [novaTarefa, setNovaTarefa] = useState<null | { planoId: string; titulo: string; tipo: string; jogoId: string }>(null);
  /** Tarefa recém-concluída que pede o cadastro do Pokémon. */
  const [oferta, setOferta] = useState<TarefaDexDTO | null>(null);

  const formaPorId = new Map(formas.map((f) => [f.id, f]));
  const trofeuPorId = new Map(trofeus.map((x) => [x.id, x]));
  const ativos = planos.filter((p) => p.status === "ativo");
  const fechados = planos.filter((p) => p.status !== "ativo");

  async function enviar(url: string, method: string, corpo: unknown): Promise<boolean> {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      if (!r.ok) {
        setErro(textoDaRecusa(tr, await r.json().catch(() => null), t("planos.erro")));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setErro(t("planos.erro"));
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function statusTarefa(tarefa: TarefaDexDTO, status: StatusTarefaDex) {
    if (!(await enviar(`/api/dex/tarefas/${tarefa.id}`, "PATCH", { status }))) return;
    setOferta(status === "feita" && OFERECE_CADASTRO.has(tarefa.tipo) ? tarefa : null);
  }

  const statusPlano = (p: PlanoDexDTO, status: StatusPlanoDex) => enviar(`/api/dex/planos/${p.id}`, "PATCH", { status });

  function linkCadastro(tarefa: TarefaDexDTO): string {
    const q = new URLSearchParams();
    if (tarefa.jogoId) q.set("jogo", tarefa.jogoId);
    const unica = tarefa.formaIds.length === 1 ? formaPorId.get(tarefa.formaIds[0]) : undefined;
    if (unica) q.set("busca", unica.especie);
    return `/dex/cadastrar?${q.toString()}`;
  }

  function renderPlano(p: PlanoDexDTO) {
    const feitas = p.tarefas.filter((x) => x.status === "feita").length;
    return (
      <Painel as="li" key={p.id} className={`flex flex-col gap-3 ${p.status === "ativo" ? "" : "opacity-80"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-base font-bold text-strong">{p.titulo}</span>
          <Distintivo>
            {p.inicio}
            {p.fim ? ` → ${p.fim}` : ""}
          </Distintivo>
          {p.status !== "ativo" && <Distintivo tom="neutro">{t(`planos.status.${p.status}`)}</Distintivo>}
          {p.origem === "sessao" && <Distintivo tom="acento">{t("planos.daSessao")}</Distintivo>}
          <span className="ml-auto font-mono text-xs tabular-nums text-muted">
            {feitas}/{p.tarefas.length}
          </span>
        </div>
        {p.objetivo && <p className="text-sm text-muted">{p.objetivo}</p>}
        {p.trofeuIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs max-md:gap-2">
            <span className="text-muted">{t("planos.alvo")}</span>
            {p.trofeuIds.map((id) => {
              const x = trofeuPorId.get(id);
              return (
                <Link key={id} href={`/dex/trofeus?jogo=${x?.jogoId ?? ""}`} className="max-md:inline-flex max-md:min-h-11 max-md:items-center">
                  <Distintivo tom="aviso">{x?.textos[idioma].titulo ?? id}</Distintivo>
                </Link>
              );
            })}
          </div>
        )}

        {p.tarefas.length > 0 && (
          <ul className="flex flex-col divide-y divide-hairline">
            {p.tarefas.map((x) => (
              <li key={x.id} className="flex flex-wrap items-start gap-2 py-2">
                <div className={`flex flex-1 flex-col gap-1 ${x.status === "aberta" ? "" : "text-muted"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-semibold ${x.status === "feita" ? "line-through" : ""} ${x.status === "aberta" ? "text-strong" : ""}`}>
                      {x.titulo}
                    </span>
                    <Distintivo>{t(`planos.tipo.${x.tipo}`)}</Distintivo>
                    {x.jogoId && <Distintivo>{jogoDex(x.jogoId)?.nome ?? x.jogoId}</Distintivo>}
                    {x.trofeuId && <Distintivo tom="aviso">{trofeuPorId.get(x.trofeuId)?.textos[idioma].titulo ?? x.trofeuId}</Distintivo>}
                  </div>
                  {x.descricao && <p className="text-sm text-muted">{x.descricao}</p>}
                  {x.formaIds.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      {x.formaIds.map((id) => {
                        const f = formaPorId.get(id);
                        return f ? (
                          <span key={id} className="flex items-center text-xs" title={f.especie}>
                            <SpriteDex sprite={f.sprite} shiny={false} tamanho={32} />
                            {f.especie}
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
                {p.status === "ativo" && (
                  <div className="flex gap-1.5 max-md:gap-2">
                    {x.status === "aberta" ? (
                      <>
                        <Botao tamanho="xs" className="max-md:h-11 max-md:min-w-11" variante="primario" disabled={ocupado} onClick={() => statusTarefa(x, "feita")}>
                          {t("planos.feita")}
                        </Botao>
                        <Botao tamanho="xs" className="max-md:h-11 max-md:min-w-11" disabled={ocupado} onClick={() => statusTarefa(x, "descartada")}>
                          {t("planos.descartar")}
                        </Botao>
                      </>
                    ) : (
                      <Botao tamanho="xs" className="max-md:h-11 max-md:min-w-11" disabled={ocupado} onClick={() => statusTarefa(x, "aberta")}>
                        {t("planos.reabrir")}
                      </Botao>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {p.status === "ativo" &&
          (novaTarefa?.planoId === p.id ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await enviar(`/api/dex/planos/${p.id}/tarefas`, "POST", {
                  titulo: novaTarefa.titulo,
                  tipo: novaTarefa.tipo,
                  jogoId: novaTarefa.jogoId || null,
                });
                if (ok) setNovaTarefa(null);
              }}
            >
              <Campo rotulo={t("planos.tarefa")} className="min-w-48 flex-1">
                <input
                  className={classesEntrada}
                  value={novaTarefa.titulo}
                  required
                  onChange={(e) => setNovaTarefa({ ...novaTarefa, titulo: e.target.value })}
                />
              </Campo>
              <Campo rotulo={t("planos.tipoRotulo")}>
                <select
                  className={classesEntrada}
                  value={novaTarefa.tipo}
                  onChange={(e) => setNovaTarefa({ ...novaTarefa, tipo: e.target.value })}
                >
                  {TIPOS_TAREFA.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {t(`planos.tipo.${tipo}`)}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo={t("planos.jogo")}>
                <select
                  className={classesEntrada}
                  value={novaTarefa.jogoId}
                  onChange={(e) => setNovaTarefa({ ...novaTarefa, jogoId: e.target.value })}
                >
                  <option value="">{t("planos.semJogo")}</option>
                  {jogos.map((j) => (
                    <option key={j.jogoId} value={j.jogoId}>
                      {j.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Botao type="submit" tamanho="sm" variante="primario" disabled={ocupado || !novaTarefa.titulo.trim()}>
                {t("planos.adicionar")}
              </Botao>
              <Botao type="button" tamanho="sm" onClick={() => setNovaTarefa(null)}>
                {t("planos.cancelar")}
              </Botao>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Botao
                tamanho="xs"
                disabled={ocupado}
                onClick={() => setNovaTarefa({ planoId: p.id, titulo: "", tipo: "captura", jogoId: jogos[0]?.jogoId ?? "" })}
              >
                {t("planos.novaTarefa")}
              </Botao>
              <Botao tamanho="xs" className="max-md:h-11 max-md:min-w-11" disabled={ocupado} onClick={() => statusPlano(p, "concluido")}>
                {t("planos.concluir")}
              </Botao>
              <Botao tamanho="xs" className="max-md:h-11 max-md:min-w-11" disabled={ocupado} onClick={() => statusPlano(p, "encerrado")}>
                {t("planos.encerrar")}
              </Botao>
            </div>
          ))}
        {p.status !== "ativo" && (
          <div>
            <Botao tamanho="xs" className="max-md:h-11 max-md:min-w-11" disabled={ocupado} onClick={() => statusPlano(p, "ativo")}>
              {t("planos.reativar")}
            </Botao>
          </div>
        )}
      </Painel>
    );
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-8">
      <CabecalhoPagina titulo={t("planos.titulo")} />
      {erro && <Alerta tom="perigo">{erro}</Alerta>}
      {oferta && (
        <Alerta tom="sucesso">
          <div className="flex flex-wrap items-center gap-3">
            <span>{t("planos.oferta", { tarefa: oferta.titulo })}</span>
            <Link href={linkCadastro(oferta)} className={classesBotao("primario", "xs", "max-md:h-11 max-md:min-w-11")}>
              {t("planos.irCadastrar")}
            </Link>
            <Botao tamanho="xs" className="max-md:h-11 max-md:min-w-11" onClick={() => setOferta(null)}>
              {t("planos.agoraNao")}
            </Botao>
          </div>
        </Alerta>
      )}

      {ativos.length === 0 ? (
        <EstadoVazio>{t("planos.nenhumAtivo")}</EstadoVazio>
      ) : (
        <ul className="flex flex-col gap-3">
          {ativos.map(renderPlano)}
        </ul>
      )}

      {novoPlano ? (
        <Painel>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await enviar("/api/dex/planos", "POST", {
                titulo: novoPlano.titulo,
                objetivo: novoPlano.objetivo || null,
                inicio: novoPlano.inicio,
                fim: novoPlano.fim || null,
              });
              if (ok) setNovoPlano(null);
            }}
          >
            <Campo rotulo={t("planos.tituloRotulo")} className="min-w-48 flex-1">
              <input
                className={classesEntrada}
                required
                value={novoPlano.titulo}
                onChange={(e) => setNovoPlano({ ...novoPlano, titulo: e.target.value })}
              />
            </Campo>
            <Campo rotulo={t("planos.objetivo")} className="min-w-48 flex-1">
              <input
                className={classesEntrada}
                value={novoPlano.objetivo}
                onChange={(e) => setNovoPlano({ ...novoPlano, objetivo: e.target.value })}
              />
            </Campo>
            <Campo rotulo={t("planos.inicio")}>
              <input
                type="date"
                required
                className={classesEntrada}
                value={novoPlano.inicio}
                onChange={(e) => setNovoPlano({ ...novoPlano, inicio: e.target.value })}
              />
            </Campo>
            <Campo rotulo={t("planos.fim")}>
              <input
                type="date"
                className={classesEntrada}
                value={novoPlano.fim}
                onChange={(e) => setNovoPlano({ ...novoPlano, fim: e.target.value })}
              />
            </Campo>
            <Botao type="submit" tamanho="sm" variante="primario" disabled={ocupado || !novoPlano.titulo.trim()}>
              {t("planos.criar")}
            </Botao>
            <Botao type="button" tamanho="sm" onClick={() => setNovoPlano(null)}>
              {t("planos.cancelar")}
            </Botao>
          </form>
        </Painel>
      ) : (
        <div>
          <Botao tamanho="sm" onClick={() => setNovoPlano({ titulo: "", objetivo: "", inicio: hojeLocal(), fim: "" })}>
            {t("planos.novoPlano")}
          </Botao>
        </div>
      )}

      {fechados.length > 0 && (
        <details className="flex flex-col gap-3">
          <summary className="cursor-pointer text-sm font-semibold text-muted max-md:py-3">
            {t("planos.historico", { quantidade: String(fechados.length) })}
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {fechados.map(renderPlano)}
          </ul>
        </details>
      )}
    </main>
  );
}
