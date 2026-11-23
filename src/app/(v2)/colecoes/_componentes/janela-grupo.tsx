"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";
import { TAMANHO_MAXIMO_NOME_GRUPO } from "@/lib/dominio/grupos-colecao";
import type { GrupoListaV2DTO } from "@/lib/dominio/lista-colecoes-v2";
import type { SeriesParaGrupoDTO } from "@/lib/dominio/tipos-cliente";

import { Botao } from "../../_componentes/primitivos/botao";
import { Campo, Selecao } from "../../_componentes/primitivos/campo";
import { Modal } from "../../_componentes/primitivos/modal";
import { AvisoEmLinha } from "../../_componentes/primitivos/painel";
import estilos from "./organizar.module.css";
import { chaveDaRecusa, pedidoDoGrupo } from "./organizar";
import { pedirApi } from "./pedir-api";

/**
 * Criar ou editar um grupo (COL-11, COL-12): nome e série opcional.
 *
 * - **A série é opcional e só ocidental.** A lista vem de
 *   `GET /api/grupos-colecao/series`, na ordem do seletor de expansão. Uma
 *   série que o grupo já tinha e saiu do catálogo continua aparecendo (pelo
 *   rótulo guardado), para a edição não a desligar sem o usuário pedir. Se a
 *   lista não carrega, o seletor fica desligado e a série, como está.
 * - **Editar manda só o que mudou** (`pedidoDoGrupo`), e "Salvar" só liga
 *   com uma mudança válida.
 * - **O grupo da janela é o da última lista lida**: uma série trocada em
 *   outra aba chega aqui pela releitura da página. Um 404 (o grupo foi
 *   excluído em outra aba) fecha a janela pela página, que diz por quê.
 * - O erro fica dentro da janela, perto do botão que o causou. Toda escrita
 *   relê a lista, dê certo ou não.
 */
export function JanelaGrupo({
  grupo,
  aoFechar,
  aoSalvo,
  aoSumir,
  aoReler,
}: {
  /** `null` = grupo novo. */
  grupo: GrupoListaV2DTO | null;
  aoFechar: () => void;
  aoSalvo: (nome: string) => void;
  /** O grupo não existe mais (404): a página fecha a janela com aviso. */
  aoSumir: () => void;
  /** A lista pode ter mudado por baixo (recusa, falta de resposta): relê. */
  aoReler: () => void;
}) {
  const t = useTranslations("v2Organizar.grupo");
  const tRecusas = useTranslations("recusas");
  const [nome, setNome] = useState(grupo?.nome ?? "");
  const [serieId, setSerieId] = useState(grupo?.serieId ?? "");
  const [series, setSeries] = useState<SeriesParaGrupoDTO["series"] | null>(null);
  const [erroSeries, setErroSeries] = useState(false);
  const [pedidoSeries, setPedidoSeries] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const controle = new AbortController();
    pedirApi("/api/grupos-colecao/series", "GET", undefined, controle.signal)
      .then((r) => {
        const lidas = (r.corpo as Partial<SeriesParaGrupoDTO> | null)?.series;
        if (r.ok && Array.isArray(lidas)) {
          setSeries(lidas);
          setErroSeries(false);
        } else setErroSeries(true);
      })
      .catch(() => {});
    return () => controle.abort();
  }, [pedidoSeries]);

  const tentarSeries = useCallback(() => {
    setErroSeries(false);
    setPedidoSeries((p) => p + 1);
  }, []);

  const serieForaDaLista =
    grupo?.serieId != null && series !== null && !series.some((s) => s.serieId === grupo.serieId);
  const original = grupo ? { nome: grupo.nome, serieId: grupo.serieId } : null;
  const pedido = pedidoDoGrupo(original, nome, serieId);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!pedido || enviando) return;
    setErro(null);
    setEnviando(true);
    const r = grupo
      ? await pedirApi(`/api/grupos-colecao/${grupo.id}`, "PATCH", pedido)
      : await pedirApi("/api/grupos-colecao", "POST", pedido);
    setEnviando(false);
    if (r.ok) {
      aoSalvo(pedido.nome ?? grupo?.nome ?? nome.trim());
      return;
    }
    if (chaveDaRecusa(r.corpo) === "grupoColecaoNaoEncontrado") {
      aoSumir();
      return;
    }
    setErro(r.status === null ? t("erroRede") : textoDaRecusa(tRecusas, r.corpo, t("erroSalvar")));
    // Sem resposta o servidor pode ter gravado; uma recusa diz que a tela estava atrás dele.
    aoReler();
  }

  return (
    <Modal
      aberto
      onFechar={enviando ? () => {} : aoFechar}
      titulo={grupo ? t("tituloEditar") : t("tituloNovo")}
      descricao={t("descricao")}
      fecharPeloVeu={false}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar} disabled={enviando}>
            {t("cancelar")}
          </Botao>
          <Botao variante="primario" type="submit" form="v2-form-grupo" carregando={enviando} disabled={!pedido}>
            {grupo ? t("salvar") : t("criar")}
          </Botao>
        </>
      }
    >
      <form id="v2-form-grupo" onSubmit={salvar} className={estilos.linhas}>
        <Campo
          rotulo={t("campoNome")}
          value={nome}
          required
          maxLength={TAMANHO_MAXIMO_NOME_GRUPO}
          autoComplete="off"
          disabled={enviando}
          onChange={(e) => setNome(e.target.value)}
        />
        <Selecao
          rotulo={t("campoSerie")}
          value={serieId}
          disabled={series === null || enviando}
          dica={series === null && !erroSeries ? t("carregandoSeries") : undefined}
          onChange={(e) => setSerieId(e.target.value)}
        >
          <option value="">{t("semSerie")}</option>
          {serieForaDaLista && grupo?.serieId && <option value={grupo.serieId}>{grupo.serieRotulo ?? grupo.serieId}</option>}
          {/* Antes de a lista chegar, a série atual fica escolhida (e o seletor, desligado). */}
          {series === null && grupo?.serieId && <option value={grupo.serieId}>{grupo.serieRotulo ?? grupo.serieId}</option>}
          {(series ?? []).map((s) => (
            <option key={s.serieId} value={s.serieId}>
              {t("opcaoSerie", { serie: s.rotulo, sets: s.sets })}
            </option>
          ))}
        </Selecao>
        {erroSeries && (
          <AvisoEmLinha
            tom="alerta"
            acao={
              <Botao pequeno onClick={tentarSeries}>
                {t("tentarDeNovo")}
              </Botao>
            }
          >
            {t("erroSeries")}
          </AvisoEmLinha>
        )}
        {erro && (
          <AvisoEmLinha tom="perigo" papel="alert">
            {erro}
          </AvisoEmLinha>
        )}
      </form>
    </Modal>
  );
}
