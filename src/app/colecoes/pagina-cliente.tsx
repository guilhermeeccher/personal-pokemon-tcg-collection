"use client";

/**
 * A lista de coleções, em seções por grupo (decisão de 2026-11-22).
 *
 * - **A ordem vem pronta do servidor** (`listarColecoes`); aqui as seções saem
 *   de `secoesDeColecoes`, sem ordenar de novo. Sem nenhum grupo, a lista é a
 *   de sempre, sem cabeçalho.
 * - **Ver e organizar são modos separados.** Fechado, cada linha é um link para
 *   a coleção, como era. "Organizar" troca os links por controles — subir,
 *   descer, mudar de grupo — e mostra os do grupo (renomear, ligar série,
 *   excluir, mover, criar as que faltam, trazer as existentes). Quatro botões
 *   por linha enterravam o nome no celular, e um link com botão dentro é
 *   markup inválido.
 * - **Reordenar é subir/descer, nunca arrastar** (arrastar briga com a
 *   rolagem da página no celular). Cada clique manda a lista inteira da
 *   seção na ordem nova (`moverNaOrdem`); uma lista velha (outra aba mexeu)
 *   volta como recusa, e a tela recarrega.
 * - Toda escrita recarrega a lista depois, dê certo ou não: a tela nunca
 *   fica com uma ordem que o servidor não tem.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Alerta } from "@/app/_componentes/alerta";
import { Botao, classesBotao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { classesEntrada } from "@/app/_componentes/campo";
import { Distintivo } from "@/app/_componentes/distintivo";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { textoDaRecusa } from "@/app/_componentes/recusa";
import { moverNaOrdem, secoesDeColecoes } from "@/lib/dominio/ordem-colecoes";
import type { ColecaoListaDTO, GrupoColecaoDTO, ListaColecoesDTO } from "@/lib/dominio/tipos-cliente";

import { chamarApi } from "./chamar-api";
import { ModalExcluirGrupo, ModalGrupo } from "./modal-grupo";
import { ModalExistentes } from "./modal-existentes";
import { ModalFaltantes } from "./modal-faltantes";

interface ContagemElegiveis {
  prontas: number;
  foraDePadrao: number;
}

type JanelaAberta =
  | { tipo: "grupo"; grupo: GrupoColecaoDTO | null }
  | { tipo: "excluir"; grupo: GrupoColecaoDTO }
  | { tipo: "faltantes"; grupo: GrupoColecaoDTO }
  | { tipo: "existentes"; grupo: GrupoColecaoDTO };

/* Botões de linha: o desenho `xs` de sempre, e no celular a área de 44px que
   a tela precisa para os botões não se tocarem (`gap-2` entre eles). */
const classesBotaoLinha = "max-md:h-11 max-md:min-w-11";

export default function ColecoesPage() {
  const t = useTranslations("colecoes");
  const tr = useTranslations("recusas");
  const [itens, setItens] = useState<ColecaoListaDTO[]>([]);
  const [grupos, setGrupos] = useState<GrupoColecaoDTO[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [elegiveis, setElegiveis] = useState<ContagemElegiveis | null>(null);
  const [organizando, setOrganizando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [janela, setJanela] = useState<JanelaAberta | null>(null);

  // Em promessas encadeadas, não `async`: o `setState` fica no `then`, e o
  // efeito abaixo não o chama de forma síncrona.
  const carregar = useCallback(
    () =>
      fetch("/api/colecoes")
        .then((r) => r.json() as Promise<Partial<ListaColecoesDTO>>)
        .then((d) => {
          setItens(d.itens ?? []);
          setGrupos(d.grupos ?? []);
        })
        .catch(() => setErro(t("erroCarregar")))
        .finally(() => setCarregando(false)),
    [t],
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Item 3: "você tem cartas que preenchem vagas vazias" — só conta e
  // avisa, com link para agir (regra 5 do AGENTS.md: o sistema nunca
  // aloca sozinho). Falha aqui não deve travar a tela de coleções.
  useEffect(() => {
    fetch("/api/copias/elegiveis-vagas-vazias")
      .then((r) => r.json())
      .then((d) => setElegiveis(d))
      .catch(() => {});
  }, []);

  // A lista dos grupos já chega na ordem, mas a DTO não leva `criadoEm`, e
  // `secoesDeColecoes` desempata por ele: a posição na lista faz esse papel
  // (quem veio antes é "mais novo"), então um empate de `ordem` nunca
  // reembaralha o que o servidor mandou.
  const secoes = useMemo(
    () =>
      secoesDeColecoes(
        itens,
        grupos.map((g, i) => ({ ...g, criadoEm: new Date(grupos.length - i) })),
      ),
    [itens, grupos],
  );
  const comGrupos = grupos.length > 0;

  async function escrever(url: string, method: string, corpo: unknown) {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await chamarApi(url, method, corpo);
      if (!r.ok) setErro(textoDaRecusa(tr, r.corpo, t("erroOperacao")));
    } catch {
      setErro(t("erroRede"));
    } finally {
      // Dê certo ou não, recarrega: uma lista velha tem de sumir antes do próximo clique.
      await carregar();
      setOcupado(false);
    }
  }

  function moverGrupo(g: GrupoColecaoDTO, direcao: -1 | 1) {
    void escrever("/api/grupos-colecao/ordem", "PUT", {
      ids: moverNaOrdem(
        grupos.map((x) => x.id),
        g.id,
        direcao,
      ),
    });
  }

  function moverColecao(c: ColecaoListaDTO, ids: string[], direcao: -1 | 1) {
    void escrever("/api/colecoes/ordem", "PUT", { grupoId: c.grupoId, ids: moverNaOrdem(ids, c.id, direcao) });
  }

  function mudarDeGrupo(c: ColecaoListaDTO, grupoId: string) {
    void escrever(`/api/colecoes/${c.id}/grupo`, "PATCH", { grupoId: grupoId || null });
  }

  function fecharEAtualizar() {
    setJanela(null);
    void carregar();
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-8">
      <CabecalhoPagina
        titulo={t("titulo")}
        descricao={t("contagem", { total: itens.length })}
        acoes={
          <>
            <Botao aria-pressed={organizando} onClick={() => setOrganizando(!organizando)}>
              {organizando ? t("fecharOrganizar") : t("organizar")}
            </Botao>
            <Link href="/colecoes/falta" className={classesBotao("secundario")}>
              {t("oQueFalta")}
            </Link>
            <Link href="/colecoes/nova" className={classesBotao("primario")}>
              {t("nova")}
            </Link>
          </>
        }
      />

      {elegiveis && (elegiveis.prontas > 0 || elegiveis.foraDePadrao > 0) && (
        <Link
          href="/colecoes/falta"
          className="rounded border border-success/30 bg-success-soft p-3 text-sm text-success-fg hover:bg-success/10"
        >
          {elegiveis.prontas > 0 && (
            <>
              {t.rich("elegiveisProntas", {
                total: elegiveis.prontas,
                forte: (partes) => <strong>{partes}</strong>,
              })}{" "}
            </>
          )}
          {elegiveis.foraDePadrao > 0 && (
            <>
              {t.rich("elegiveisForaDePadrao", {
                total: elegiveis.foraDePadrao,
                forte: (partes) => <strong>{partes}</strong>,
              })}{" "}
            </>
          )}
          {t("verOQueFalta")}
        </Link>
      )}

      {organizando && (
        <div className="flex flex-col gap-2">
          <Alerta>{t("ajudaOrganizar")}</Alerta>
          <div>
            <Botao disabled={ocupado} onClick={() => setJanela({ tipo: "grupo", grupo: null })}>
              {t("novoGrupo")}
            </Botao>
          </div>
        </div>
      )}

      {erro && <p className="text-sm text-danger">{erro}</p>}
      {carregando && <p className="text-sm text-muted">{t("carregando")}</p>}

      {secoes.map((secao) => {
        const grupo = secao.grupo;
        const chave = grupo?.id ?? "sem-grupo";
        const idsDaSecao = secao.colecoes.map((c) => c.id);
        const posicaoGrupo = grupo ? grupos.findIndex((g) => g.id === grupo.id) : -1;
        return (
          <section key={chave} aria-labelledby={comGrupos ? `grupo-${chave}` : undefined} className="flex flex-col gap-2">
            {comGrupos && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h2 id={`grupo-${chave}`} className="text-[length:var(--fs-title-2)] text-strong">
                    {grupo ? grupo.nome : t("semGrupo")}
                  </h2>
                  {grupo?.serieRotulo && (
                    <span className="text-sm text-muted">{t("serie", { serie: grupo.serieRotulo })}</span>
                  )}
                </div>
                {organizando && grupo && (
                  <div className="flex flex-wrap gap-2">
                    <Botao
                      tamanho="xs"
                      className={classesBotaoLinha}
                      aria-label={t("subirGrupo", { grupo: grupo.nome })}
                      disabled={ocupado || posicaoGrupo === 0}
                      onClick={() => moverGrupo(grupo, -1)}
                    >
                      ↑
                    </Botao>
                    <Botao
                      tamanho="xs"
                      className={classesBotaoLinha}
                      aria-label={t("descerGrupo", { grupo: grupo.nome })}
                      disabled={ocupado || posicaoGrupo === grupos.length - 1}
                      onClick={() => moverGrupo(grupo, 1)}
                    >
                      ↓
                    </Botao>
                    <Botao
                      tamanho="xs"
                      className={classesBotaoLinha}
                      disabled={ocupado}
                      onClick={() => setJanela({ tipo: "grupo", grupo })}
                    >
                      {t("editarGrupo")}
                    </Botao>
                    <Botao
                      tamanho="xs"
                      variante="perigo"
                      className={classesBotaoLinha}
                      disabled={ocupado}
                      onClick={() => setJanela({ tipo: "excluir", grupo })}
                    >
                      {t("excluirGrupo")}
                    </Botao>
                    {grupo.serieId && (
                      <>
                        <Botao
                          tamanho="xs"
                          className={classesBotaoLinha}
                          disabled={ocupado}
                          onClick={() => setJanela({ tipo: "faltantes", grupo })}
                        >
                          {t("criarFaltantes")}
                        </Botao>
                        <Botao
                          tamanho="xs"
                          className={classesBotaoLinha}
                          disabled={ocupado}
                          onClick={() => setJanela({ tipo: "existentes", grupo })}
                        >
                          {t("trazerExistentes")}
                        </Botao>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <ul className="flex flex-col divide-y divide-hairline">
              {secao.colecoes.map((c, i) => {
                const customizada = c.tipo === "customizada";
                const descricao = (
                  <div className="min-w-0">
                    <div className="font-medium break-words">{c.nome}</div>
                    <div className="text-sm text-muted">
                      {t.has(`tipo.${c.tipo}`) ? t(`tipo.${c.tipo}`) : c.tipo}
                      {c.idiomaExigido ? t("idiomaExigido", { idioma: c.idiomaExigido }) : ""}
                    </div>
                  </div>
                );
                const resumo = (
                  <div className="flex items-center gap-3 text-sm">
                    {c.avisoCatalogoIncompleto && <Distintivo tom="aviso">{t("catalogoIncompleto")}</Distintivo>}
                    {c.avisoSemNumeracaoOficial && <Distintivo tom="aviso">{t("semNumeracaoOficial")}</Distintivo>}
                    <span className="tabular-nums text-muted">
                      {customizada ? t("cartas", { total: c.vagasPreenchidas }) : `${c.vagasPreenchidas}/${c.totalVagas}`}
                    </span>
                  </div>
                );
                if (!organizando) {
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/colecoes/${c.id}`}
                        className="flex items-center justify-between gap-3 py-3 hover:bg-surface-hover"
                      >
                        {descricao}
                        {resumo}
                      </Link>
                    </li>
                  );
                }
                return (
                  <li key={c.id} className="flex flex-col gap-2 py-3">
                    <div className="flex items-center justify-between gap-3">
                      {descricao}
                      {resumo}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Botao
                        tamanho="xs"
                        className={classesBotaoLinha}
                        aria-label={t("subirColecao", { colecao: c.nome })}
                        disabled={ocupado || i === 0}
                        onClick={() => moverColecao(c, idsDaSecao, -1)}
                      >
                        ↑
                      </Botao>
                      <Botao
                        tamanho="xs"
                        className={classesBotaoLinha}
                        aria-label={t("descerColecao", { colecao: c.nome })}
                        disabled={ocupado || i === secao.colecoes.length - 1}
                        onClick={() => moverColecao(c, idsDaSecao, 1)}
                      >
                        ↓
                      </Botao>
                      {comGrupos && (
                        <label className="flex items-center gap-2 text-sm text-muted">
                          <span>{t("campoGrupo")}</span>
                          <select
                            className={`${classesEntrada} max-w-full md:w-56`}
                            value={c.grupoId ?? ""}
                            disabled={ocupado}
                            onChange={(e) => mudarDeGrupo(c, e.target.value)}
                          >
                            <option value="">{t("semGrupo")}</option>
                            {grupos.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.nome}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  </li>
                );
              })}
              {secao.colecoes.length === 0 && grupo && (
                <EstadoVazio as="li" className="py-4">
                  {t("grupoVazio")}
                </EstadoVazio>
              )}
            </ul>
          </section>
        );
      })}
      {itens.length === 0 && !comGrupos && !carregando && (
        <ul>
          <EstadoVazio as="li" className="py-6">
            {t("vazio")}
          </EstadoVazio>
        </ul>
      )}

      {janela?.tipo === "grupo" && (
        <ModalGrupo grupo={janela.grupo} onFechar={() => setJanela(null)} onSalvo={fecharEAtualizar} />
      )}
      {janela?.tipo === "excluir" && (
        <ModalExcluirGrupo grupo={janela.grupo} onFechar={() => setJanela(null)} onExcluido={fecharEAtualizar} />
      )}
      {janela?.tipo === "faltantes" && (
        <ModalFaltantes grupo={janela.grupo} onFechar={() => setJanela(null)} onCriadas={fecharEAtualizar} />
      )}
      {janela?.tipo === "existentes" && (
        <ModalExistentes grupo={janela.grupo} onFechar={() => setJanela(null)} onTrazidas={fecharEAtualizar} />
      )}
    </main>
  );
}
