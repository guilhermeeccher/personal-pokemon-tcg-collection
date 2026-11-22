"use client";

/**
 * A lista de coleções, em seções por grupo (decisão de 2026-11-22).
 *
 * - **A ordem vem pronta do servidor** (`listarColecoes`); as seções saem dela
 *   na ordem em que a API devolve (`secoesNaOrdemDaApi`), sem ordenar de novo
 *   nem inventar data de desempate. Sem nenhum grupo, a lista é a de sempre,
 *   sem cabeçalho.
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
 *   fica com uma ordem que o servidor não tem. Os controles ficam ocupados
 *   até chegar a **última** lista válida: cada leitura leva um número de
 *   sequência, e a resposta de uma leitura já superada é descartada (uma
 *   leitura lenta não pode desfazer a que veio depois). Uma leitura recusada
 *   é erro na tela, nunca lista vazia, e os controles seguem travados até
 *   "Tentar de novo" trazer uma lista boa.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Alerta } from "@/app/_componentes/alerta";
import { Botao, classesBotao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { classesEntrada } from "@/app/_componentes/campo";
import { Distintivo } from "@/app/_componentes/distintivo";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { textoDaRecusa } from "@/app/_componentes/recusa";
import { moverNaOrdem, type SecaoDeColecoes } from "@/lib/dominio/ordem-colecoes";
import { temaDaColecao } from "@/lib/dominio/tema-colecao";
import type {
  ColecaoListaDTO,
  GrupoColecaoDTO,
  ListaColecoesDTO,
  SugestaoDeTemaDTO,
} from "@/lib/dominio/tipos-cliente";

import { chamarApi } from "./chamar-api";
import { ModalExcluirGrupo, ModalGrupo } from "./modal-grupo";
import { ModalExistentes } from "./modal-existentes";
import { ModalFaltantes } from "./modal-faltantes";
import { ModalCartasDoTema } from "./modal-cartas-do-tema";
import { ModalTema } from "./modal-tema";
import { useRotuloTema } from "./rotulo-tema";
import { SecaoSugestoes } from "./secao-sugestoes";

interface ContagemElegiveis {
  prontas: number;
  foraDePadrao: number;
}

/* A janela guarda só o id do grupo: o grupo que ela mostra é sempre o da
   última lista lida (`grupos`), para uma série trocada em outra aba chegar
   à janela aberta em vez de ela confirmar com o que viu ao abrir. */
type JanelaAberta =
  | { tipo: "grupo"; grupoId: string | null }
  | { tipo: "excluir"; grupoId: string }
  | { tipo: "faltantes"; grupoId: string }
  | { tipo: "existentes"; grupoId: string };

/* As janelas das sugestões de tema, à parte das de grupo: não dependem de um
   grupo da lista. Primeiro a janela que confirma o nome, depois a que lista as
   cartas que cabem na coleção recém-criada (que nasce vazia). */
type JanelaTema =
  | { tipo: "criar"; sugestao: SugestaoDeTemaDTO }
  | { tipo: "cartas"; colecaoId: string; nome: string };

/**
 * As seções na ordem em que a API devolve: os grupos como vieram, as
 * coleções de cada um como vieram, "sem grupo" por último e só quando tem
 * coleção. Coleção com grupo que não está na lista cai em "sem grupo" em vez
 * de sumir. Não ordena: `ordenarColecoes` já rodou no servidor, e ordenar de
 * novo aqui exigiria inventar o `criadoEm` que a DTO do grupo não traz.
 */
function secoesNaOrdemDaApi(
  itens: readonly ColecaoListaDTO[],
  grupos: readonly GrupoColecaoDTO[],
): SecaoDeColecoes<ColecaoListaDTO, GrupoColecaoDTO>[] {
  const conhecidos = new Set(grupos.map((g) => g.id));
  const porGrupo = new Map<string | null, ColecaoListaDTO[]>();
  for (const c of itens) {
    const chave = c.grupoId !== null && conhecidos.has(c.grupoId) ? c.grupoId : null;
    const lista = porGrupo.get(chave);
    if (lista) lista.push(c);
    else porGrupo.set(chave, [c]);
  }
  const secoes = grupos.map((g) => ({ grupo: g, colecoes: porGrupo.get(g.id) ?? [] }));
  const semGrupo = porGrupo.get(null) ?? [];
  return semGrupo.length > 0 ? [...secoes, { grupo: null, colecoes: semGrupo }] : secoes;
}

/* Botões de linha: o desenho `xs` de sempre, e no celular a área de 44px que
   a tela precisa para os botões não se tocarem (`gap-2` entre eles). */
const classesBotaoLinha = "max-md:h-11 max-md:min-w-11";

export default function ColecoesPage() {
  const t = useTranslations("colecoes");
  const tr = useTranslations("recusas");
  const { rotuloDoTema } = useRotuloTema();
  const [itens, setItens] = useState<ColecaoListaDTO[]>([]);
  const [grupos, setGrupos] = useState<GrupoColecaoDTO[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // O erro da leitura da lista fica à parte do da escrita: ler de novo com
  // sucesso apaga este, mas não a recusa da escrita que acabou de acontecer.
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [elegiveis, setElegiveis] = useState<ContagemElegiveis | null>(null);
  const [organizando, setOrganizando] = useState(false);
  // Ocupado: uma escrita em andamento OU a lista ainda não releu depois dela.
  // Só a última leitura válida o desliga.
  const [ocupado, setOcupado] = useState(false);
  const [janela, setJanela] = useState<JanelaAberta | null>(null);
  const [janelaTema, setJanelaTema] = useState<JanelaTema | null>(null);
  // Sobe a cada coleção criada ou alocada pelas sugestões: a seção relê.
  const [versaoSugestoes, setVersaoSugestoes] = useState(0);
  // Os sets criados em lote (ações do grupo) nesta vida da página.
  const [setsCriados, setSetsCriados] = useState<string[]>([]);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const sequencia = useRef(0);
  // O aviso de uma janela que fechou sozinha (o grupo dela foi excluído em
  // outra aba) e a janela aberta, lida de dentro da leitura da lista.
  const [aviso, setAviso] = useState<string | null>(null);
  const janelaRef = useRef<JanelaAberta | null>(null);
  useEffect(() => {
    janelaRef.current = janela;
  }, [janela]);

  // Em promessas encadeadas, não `async`: o `setState` fica no `then`, e o
  // efeito abaixo não o chama de forma síncrona.
  const carregar = useCallback(() => {
    const minha = ++sequencia.current;
    return fetch("/api/colecoes")
      .then(async (r) => ({ ok: r.ok, corpo: (await r.json().catch(() => null)) as unknown }))
      .then(({ ok, corpo }) => {
        if (minha !== sequencia.current) return; // superada por uma leitura mais nova
        const d = (corpo ?? {}) as Partial<ListaColecoesDTO>;
        if (!ok || !Array.isArray(d.itens) || !Array.isArray(d.grupos)) {
          setErroLista(ok ? t("erroCarregar") : textoDaRecusa(tr, corpo, t("erroCarregar")));
          return;
        }
        setItens(d.itens);
        setGrupos(d.grupos);
        // Janela de um grupo que a leitura nova já não traz: fecha COM aviso,
        // não em silêncio (quem a abriu estava no meio de uma decisão).
        const aberta = janelaRef.current;
        if (aberta && aberta.grupoId !== null && !d.grupos.some((g) => g.id === aberta.grupoId)) {
          setJanela(null);
          setAviso(t("grupoExcluido"));
        }
        setErroLista(null);
        setOcupado(false);
      })
      .catch(() => {
        if (minha === sequencia.current) setErroLista(t("erroCarregar"));
      })
      .finally(() => {
        if (minha === sequencia.current) setCarregando(false);
      });
  }, [t, tr]);

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

  const secoes = useMemo(() => secoesNaOrdemDaApi(itens, grupos), [itens, grupos]);
  const comGrupos = grupos.length > 0;

  async function escrever(url: string, method: string, corpo: unknown) {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const r = await chamarApi(url, method, corpo);
      if (!r.ok) setErro(textoDaRecusa(tr, r.corpo, t("erroOperacao")));
    } catch {
      setErro(t("erroRede"));
    }
    // Dê certo ou não, relê: uma lista velha tem de sumir antes do próximo
    // clique, e o `ocupado` só cai quando a leitura nova chega.
    await carregar();
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

  function abrir(j: JanelaAberta) {
    setAviso(null);
    setJanela(j);
  }

  /**
   * A lista pode ter mudado por baixo (uma escrita de resultado incerto, uma
   * recusa por lista velha): relê e trava até chegar. Relê as sugestões
   * junto: uma coleção criada ou trazida aqui (inclusive pelas ações em lote
   * de um grupo) cobre uma sugestão de set, e a que ficasse na tela deixaria
   * criar a mesma coleção de novo.
   */
  function recarregar() {
    setOcupado(true);
    void carregar();
    setVersaoSugestoes((v) => v + 1);
  }

  /** O lote criou coleções de set: a sugestão de cada um sai já (e fica fora, mesmo se a releitura falhar). */
  function setsCriadosEmLote(setIds: string[]) {
    setSetsCriados((atuais) => [...new Set([...atuais, ...setIds])]);
    fecharEAtualizar();
  }

  function fecharEAtualizar() {
    setJanela(null);
    recarregar();
  }

  function temaCriado(colecao: { id: string; nome: string }) {
    // A coleção já existe, vazia: a lista e as sugestões (que a cobrem agora)
    // recarregam já, e a janela seguinte oferece as cartas que cabem.
    recarregar();
    setJanelaTema({ tipo: "cartas", colecaoId: colecao.id, nome: colecao.nome });
  }

  function cartasAlocadas(total: number) {
    setJanelaTema(null);
    setMensagem(t("sugestoes.cartasAlocadas", { total }));
    recarregar();
  }

  const grupoDaJanela =
    janela && janela.grupoId !== null ? grupos.find((g) => g.id === janela.grupoId) : undefined;

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

      <SecaoSugestoes
        versao={versaoSugestoes}
        setsCriados={setsCriados}
        onCriarTema={(sugestao) => {
          setMensagem(null);
          setJanelaTema({ tipo: "criar", sugestao });
        }}
      />

      {mensagem && <Alerta tom="sucesso">{mensagem}</Alerta>}

      {organizando && (
        <div className="flex flex-col gap-2">
          <Alerta>{t("ajudaOrganizar")}</Alerta>
          <div>
            <Botao disabled={ocupado} onClick={() => abrir({ tipo: "grupo", grupoId: null })}>
              {t("novoGrupo")}
            </Botao>
          </div>
        </div>
      )}

      {aviso && <Alerta tom="aviso">{aviso}</Alerta>}
      {erro && <p className="text-sm text-danger">{erro}</p>}
      {erroLista && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-danger">
          <p>{erroLista}</p>
          <Botao tamanho="sm" onClick={recarregar}>
            {t("tentarDeNovo")}
          </Botao>
        </div>
      )}
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
                  <h2
                    id={`grupo-${chave}`}
                    className="max-w-full text-[length:var(--fs-title-2)] break-words text-strong"
                  >
                    {grupo ? grupo.nome : t("semGrupo")}
                  </h2>
                  {grupo?.serieRotulo && grupo.serieRotulo.trim().toLowerCase() !== grupo.nome.trim().toLowerCase() && (
                    <span className="max-w-full text-sm break-words text-muted">
                      {t("serie", { serie: grupo.serieRotulo })}
                    </span>
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
                      onClick={() => abrir({ tipo: "grupo", grupoId: grupo.id })}
                    >
                      {t("editarGrupo")}
                    </Botao>
                    <Botao
                      tamanho="xs"
                      variante="perigo"
                      className={classesBotaoLinha}
                      disabled={ocupado}
                      onClick={() => abrir({ tipo: "excluir", grupoId: grupo.id })}
                    >
                      {t("excluirGrupo")}
                    </Botao>
                    {grupo.serieId && (
                      <>
                        <Botao
                          tamanho="xs"
                          className={classesBotaoLinha}
                          disabled={ocupado}
                          onClick={() => abrir({ tipo: "faltantes", grupoId: grupo.id })}
                        >
                          {t("criarFaltantes")}
                        </Botao>
                        <Botao
                          tamanho="xs"
                          className={classesBotaoLinha}
                          disabled={ocupado}
                          onClick={() => abrir({ tipo: "existentes", grupoId: grupo.id })}
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
                const tema = temaDaColecao(c);
                const descricao = (
                  <div className="min-w-0">
                    <div className="font-medium break-words">{c.nome}</div>
                    <div className="text-sm text-muted">
                      {t.has(`tipo.${c.tipo}`) ? t(`tipo.${c.tipo}`) : c.tipo}
                      {tema ? t("temaDaColecao", { tema: rotuloDoTema(tema.tipo, tema.valor, c.temaRotulo) }) : ""}
                      {c.idiomaExigido ? t("idiomaExigido", { idioma: c.idiomaExigido }) : ""}
                    </div>
                  </div>
                );
                const resumo = (
                  <div className="flex shrink-0 items-center gap-3 text-sm">
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
                        <label className="flex max-w-full min-w-0 items-center gap-2 text-sm text-muted">
                          <span className="shrink-0">{t("campoGrupo")}</span>
                          <select
                            className={`${classesEntrada} min-w-0 max-w-full flex-1 md:w-56 md:flex-none`}
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
      {itens.length === 0 && !comGrupos && !carregando && !erroLista && (
        <ul>
          <EstadoVazio as="li" className="py-6">
            {t("vazio")}
          </EstadoVazio>
        </ul>
      )}

      {janelaTema?.tipo === "criar" && (
        <ModalTema
          sugestao={janelaTema.sugestao}
          grupos={grupos}
          onFechar={() => setJanelaTema(null)}
          onCriada={temaCriado}
          onAtualizar={recarregar}
        />
      )}
      {janelaTema?.tipo === "cartas" && (
        <ModalCartasDoTema
          colecaoId={janelaTema.colecaoId}
          nomeColecao={janelaTema.nome}
          onFechar={() => setJanelaTema(null)}
          onAlocadas={cartasAlocadas}
        />
      )}

      {janela?.tipo === "grupo" && (janela.grupoId === null || grupoDaJanela) && (
        <ModalGrupo
          key={janela.grupoId ?? "novo"}
          grupo={grupoDaJanela ?? null}
          onFechar={() => setJanela(null)}
          onSalvo={fecharEAtualizar}
        />
      )}
      {janela?.tipo === "excluir" && grupoDaJanela && (
        <ModalExcluirGrupo grupo={grupoDaJanela} onFechar={() => setJanela(null)} onExcluido={fecharEAtualizar} />
      )}
      {janela?.tipo === "faltantes" && grupoDaJanela && (
        <ModalFaltantes
          grupo={grupoDaJanela}
          onFechar={() => setJanela(null)}
          onCriadas={setsCriadosEmLote}
          onAtualizar={recarregar}
        />
      )}
      {janela?.tipo === "existentes" && grupoDaJanela && (
        <ModalExistentes
          grupo={grupoDaJanela}
          onFechar={() => setJanela(null)}
          onTrazidas={fecharEAtualizar}
          onAtualizar={recarregar}
        />
      )}
    </main>
  );
}
