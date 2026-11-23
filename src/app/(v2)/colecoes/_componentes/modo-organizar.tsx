"use client";

import { ArrowDown, ArrowUp, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  type ColecaoListaV2DTO,
  type GrupoListaV2DTO,
  type ListaColecoesV2DTO,
  serieDistintaDoNome,
} from "@/lib/dominio/lista-colecoes-v2";

import { Botao } from "../../_componentes/primitivos/botao";
import { Selecao } from "../../_componentes/primitivos/campo";
import { Painel } from "../../_componentes/primitivos/painel";
import colecoes from "./colecoes.module.css";
import estilos from "./organizar.module.css";

export interface AcoesOrganizar {
  moverGrupo: (grupo: GrupoListaV2DTO, direcao: -1 | 1) => void;
  moverColecao: (colecao: ColecaoListaV2DTO, secao: { grupoId: string | null; ids: string[] }, direcao: -1 | 1) => void;
  mudarDeGrupo: (colecao: ColecaoListaV2DTO, grupoId: string | null) => void;
  novoGrupo: () => void;
  editarGrupo: (grupo: GrupoListaV2DTO) => void;
  excluirGrupo: (grupo: GrupoListaV2DTO) => void;
  criarFaltantes: (grupo: GrupoListaV2DTO) => void;
  trazerExistentes: (grupo: GrupoListaV2DTO) => void;
}

/**
 * O modo "Organizar" de `/colecoes` (COL-07 a COL-13; as ações em lote abrem
 * as janelas de COL-14 e COL-15). A mesma lista, nas mesmas seções e na
 * mesma ordem da leitura — **nunca reordenada aqui** —, com os controles no
 * lugar dos links.
 *
 * - **Subir e descer por botões, nunca arrastando** (arrastar briga com a
 *   rolagem da página no celular). Cada clique manda a lista inteira na
 *   ordem nova; uma lista velha volta 409 e a página relê.
 * - **Mudar de grupo** é um seletor por coleção, só quando existe grupo.
 * - **As ações em lote só aparecem no grupo ligado a uma série.**
 * - `bloqueado` desliga tudo enquanto uma escrita está no ar **ou** a lista
 *   ainda não voltou dela: o próximo clique sempre parte da ordem que o
 *   servidor tem.
 */
export function ModoOrganizar({
  lista,
  bloqueado,
  acoes,
}: {
  lista: ListaColecoesV2DTO;
  bloqueado: boolean;
  acoes: AcoesOrganizar;
}) {
  const t = useTranslations("v2Organizar");
  const tLista = useTranslations("v2Colecoes");
  const grupos = lista.secoes.flatMap((s) => (s.grupo ? [s.grupo] : []));
  const comGrupos = grupos.length > 0;

  return (
    <>
      <Painel compacto className={estilos.cabecalhoGrupo}>
        <p className={estilos.ajudaOrganizar}>{t("ajuda")}</p>
        <div className={estilos.barra}>
          <Botao pequeno icone={<FolderPlus aria-hidden />} disabled={bloqueado} onClick={acoes.novoGrupo}>
            {t("novoGrupo")}
          </Botao>
        </div>
      </Painel>

      {lista.secoes.map((secao) => {
        const grupo = secao.grupo;
        const chave = grupo?.id ?? "sem-grupo";
        const ids = secao.colecoes.map((c) => c.id);
        const posicao = grupo ? grupos.findIndex((g) => g.id === grupo.id) : -1;
        const serie = grupo ? serieDistintaDoNome(grupo) : null;
        return (
          <section key={chave} className={colecoes.secao} aria-labelledby={comGrupos ? `org-${chave}` : undefined}>
            {comGrupos && (
              <div className={estilos.cabecalhoGrupo}>
                <h2 id={`org-${chave}`} className={colecoes.tituloGrupo}>
                  {grupo ? grupo.nome : t("semGrupo")}
                  {serie && <span className={colecoes.serie}>{tLista("serie", { serie })}</span>}
                </h2>
                {grupo && (
                  <div className={estilos.barra}>
                    <Botao
                      soIcone
                      icone={<ArrowUp aria-hidden />}
                      aria-label={t("subirGrupo", { grupo: grupo.nome })}
                      disabled={bloqueado || posicao <= 0}
                      onClick={() => acoes.moverGrupo(grupo, -1)}
                    />
                    <Botao
                      soIcone
                      icone={<ArrowDown aria-hidden />}
                      aria-label={t("descerGrupo", { grupo: grupo.nome })}
                      disabled={bloqueado || posicao === grupos.length - 1}
                      onClick={() => acoes.moverGrupo(grupo, 1)}
                    />
                    <Botao
                      pequeno
                      icone={<Pencil aria-hidden />}
                      aria-label={t("editarGrupoRotulo", { grupo: grupo.nome })}
                      disabled={bloqueado}
                      onClick={() => acoes.editarGrupo(grupo)}
                    >
                      {t("editarGrupo")}
                    </Botao>
                    <Botao
                      pequeno
                      variante="perigo"
                      icone={<Trash2 aria-hidden />}
                      aria-label={t("excluirGrupoRotulo", { grupo: grupo.nome })}
                      disabled={bloqueado}
                      onClick={() => acoes.excluirGrupo(grupo)}
                    >
                      {t("excluirGrupo")}
                    </Botao>
                    {grupo.serieId !== null && (
                      <>
                        <Botao pequeno disabled={bloqueado} onClick={() => acoes.criarFaltantes(grupo)}>
                          {t("criarFaltantes")}
                        </Botao>
                        <Botao pequeno disabled={bloqueado} onClick={() => acoes.trazerExistentes(grupo)}>
                          {t("trazerExistentes")}
                        </Botao>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {secao.colecoes.length === 0 ? (
              <p className={colecoes.vazioGrupo}>{t("grupoVazio")}</p>
            ) : (
              <ul className={estilos.linhas}>
                {secao.colecoes.map((c, i) => (
                  <li key={c.id}>
                    <Painel compacto className={estilos.linha}>
                      <div className={estilos.linhaTexto}>
                        <h3 className={estilos.linhaNome}>{c.nome}</h3>
                        <p className={estilos.mudo}>
                          <ResumoColecao colecao={c} />
                        </p>
                      </div>
                      <div className={estilos.linhaControles}>
                        <Botao
                          soIcone
                          icone={<ArrowUp aria-hidden />}
                          aria-label={t("subirColecao", { colecao: c.nome })}
                          disabled={bloqueado || i === 0}
                          onClick={() => acoes.moverColecao(c, { grupoId: grupo?.id ?? null, ids }, -1)}
                        />
                        <Botao
                          soIcone
                          icone={<ArrowDown aria-hidden />}
                          aria-label={t("descerColecao", { colecao: c.nome })}
                          disabled={bloqueado || i === secao.colecoes.length - 1}
                          onClick={() => acoes.moverColecao(c, { grupoId: grupo?.id ?? null, ids }, 1)}
                        />
                        {comGrupos && (
                          <div className={estilos.seletorGrupo}>
                            <Selecao
                              aria-label={t("grupoDaColecao", { colecao: c.nome })}
                              value={grupo?.id ?? ""}
                              disabled={bloqueado}
                              onChange={(e) => acoes.mudarDeGrupo(c, e.target.value || null)}
                            >
                              <option value="">{t("semGrupo")}</option>
                              {grupos.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.nome}
                                </option>
                              ))}
                            </Selecao>
                          </div>
                        )}
                      </div>
                    </Painel>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}

/** "Set · 12/165", "Customizada · 4 cartas" — o bastante para reconhecer a coleção na hora de mover. */
function ResumoColecao({ colecao }: { colecao: ColecaoListaV2DTO }) {
  const t = useTranslations("v2Colecoes");
  const tipo = t.has(`tipo.${colecao.tipo}`) ? t(`tipo.${colecao.tipo}`) : colecao.tipo;
  const contagem =
    colecao.tipo === "customizada"
      ? t("cartas", { total: colecao.vagasPreenchidas })
      : `${colecao.vagasPreenchidas}/${colecao.totalVagas}`;
  return (
    <>
      {tipo} · <span className="v2-num">{contagem}</span>
    </>
  );
}
