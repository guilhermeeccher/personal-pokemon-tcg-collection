"use client";

/**
 * As duas janelas simples de um grupo: criar/editar (nome + série opcional) e
 * excluir. Regras em `lib/dominio/grupos-colecao.ts`; aqui só a tela.
 *
 * - **A série é opcional e só ocidental.** A lista vem de
 *   `GET /api/grupos-colecao/series`, na ordem do seletor de expansão. Sem
 *   série o grupo é livre (um tema); com série ele oferece "Criar coleções
 *   que faltam" e "Trazer as que já existem".
 * - **Editar manda só o que mudou**, com o nome aparado. Reenviar a série
 *   que a janela leu ao abrir restauraria, em silêncio, uma ligação que outra
 *   aba acabou de desfazer; e "Salvar" só liga com uma mudança válida.
 * - **Excluir um grupo nunca exclui coleção**: as dele voltam para "sem
 *   grupo". A janela diz isso antes do botão.
 * - O erro fica dentro da janela, perto do botão que o causou.
 */

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Botao } from "@/app/_componentes/botao";
import { Campo, classesEntrada } from "@/app/_componentes/campo";
import { Modal } from "@/app/_componentes/modal";
import { textoDaRecusa } from "@/app/_componentes/recusa";
import { TAMANHO_MAXIMO_NOME_GRUPO } from "@/lib/dominio/grupos-colecao";
import type { GrupoColecaoDTO, SeriesParaGrupoDTO } from "@/lib/dominio/tipos-cliente";

import { chamarApi } from "./chamar-api";

export function ModalGrupo({
  grupo,
  onFechar,
  onSalvo,
}: {
  /** `null` = grupo novo. */
  grupo: GrupoColecaoDTO | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const t = useTranslations("colecoes.grupo");
  const tr = useTranslations("recusas");
  const [nome, setNome] = useState(grupo?.nome ?? "");
  const [serieId, setSerieId] = useState(grupo?.serieId ?? "");
  const [series, setSeries] = useState<SeriesParaGrupoDTO["series"] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch("/api/grupos-colecao/series")
      .then((r) => r.json())
      .then((d: SeriesParaGrupoDTO) => vivo && setSeries(d.series ?? []))
      .catch(() => vivo && setErro(t("erroSeries")));
    return () => {
      vivo = false;
    };
  }, [t]);

  // Série que o grupo já tinha e saiu do catálogo ocidental: continua
  // aparecendo (pelo rótulo guardado), para a edição não a desligar sem o
  // usuário pedir.
  const serieAtualForaDaLista =
    grupo?.serieId && series !== null && !series.some((s) => s.serieId === grupo.serieId);

  const nomeAparado = nome.trim();
  const serieEscolhida = serieId || null;
  const mudouNome = grupo ? nomeAparado !== grupo.nome : true;
  const mudouSerie = grupo ? serieEscolhida !== grupo.serieId : serieEscolhida !== null;
  const podeSalvar =
    !enviando &&
    nomeAparado !== "" &&
    nomeAparado.length <= TAMANHO_MAXIMO_NOME_GRUPO &&
    (grupo === null || mudouNome || mudouSerie);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeSalvar) return;
    setErro(null);
    setEnviando(true);
    try {
      const corpo: { nome?: string; serieId?: string | null } = {};
      if (mudouNome) corpo.nome = nomeAparado;
      if (mudouSerie) corpo.serieId = serieEscolhida;
      const r = grupo
        ? await chamarApi(`/api/grupos-colecao/${grupo.id}`, "PATCH", corpo)
        : await chamarApi("/api/grupos-colecao", "POST", corpo);
      if (!r.ok) {
        setErro(textoDaRecusa(tr, r.corpo, t("erroSalvar")));
        return;
      }
      onSalvo();
    } catch {
      setErro(t("erroRede"));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      as="form"
      onSubmit={enviar}
      onFechar={enviando ? undefined : onFechar}
      rodape={
        <div className="flex justify-end gap-2 pt-2">
          <Botao type="button" onClick={onFechar} disabled={enviando}>
            {t("cancelar")}
          </Botao>
          <Botao type="submit" variante="primario" disabled={!podeSalvar}>
            {grupo ? t("salvar") : t("criar")}
          </Botao>
        </div>
      }
    >
      <h2 className="font-medium text-foreground">{grupo ? t("tituloEditar") : t("tituloNovo")}</h2>
      <Campo rotulo={t("campoNome")}>
        <input
          className={classesEntrada}
          value={nome}
          required
          maxLength={TAMANHO_MAXIMO_NOME_GRUPO}
          onChange={(e) => setNome(e.target.value)}
        />
      </Campo>
      <Campo rotulo={t("campoSerie")} ajuda={t("ajudaSerie")}>
        <select
          className={classesEntrada}
          value={serieId}
          disabled={series === null}
          onChange={(e) => setSerieId(e.target.value)}
        >
          <option value="">{t("semSerie")}</option>
          {serieAtualForaDaLista && grupo && (
            <option value={grupo.serieId ?? ""}>{grupo.serieRotulo ?? grupo.serieId}</option>
          )}
          {(series ?? []).map((s) => (
            <option key={s.serieId} value={s.serieId}>
              {t("opcaoSerie", { serie: s.rotulo, sets: s.sets })}
            </option>
          ))}
        </select>
      </Campo>
      {erro && <p className="text-sm text-danger">{erro}</p>}
    </Modal>
  );
}

export function ModalExcluirGrupo({
  grupo,
  onFechar,
  onExcluido,
}: {
  grupo: GrupoColecaoDTO;
  onFechar: () => void;
  onExcluido: () => void;
}) {
  const t = useTranslations("colecoes.grupo");
  const tr = useTranslations("recusas");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function excluir() {
    setErro(null);
    setEnviando(true);
    try {
      const r = await chamarApi(`/api/grupos-colecao/${grupo.id}`, "DELETE");
      if (!r.ok) {
        setErro(textoDaRecusa(tr, r.corpo, t("erroExcluir")));
        return;
      }
      onExcluido();
    } catch {
      setErro(t("erroRede"));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      onFechar={enviando ? undefined : onFechar}
      rodape={
        <div className="flex justify-end gap-2 pt-2">
          <Botao type="button" onClick={onFechar} disabled={enviando}>
            {t("cancelar")}
          </Botao>
          <Botao type="button" variante="perigo" onClick={() => void excluir()} disabled={enviando}>
            {t("confirmarExcluir")}
          </Botao>
        </div>
      }
    >
      <h2 className="font-medium break-words text-foreground">{t("tituloExcluir", { grupo: grupo.nome })}</h2>
      <p className="text-muted">{t("textoExcluir")}</p>
      {erro && <p className="text-sm text-danger">{erro}</p>}
    </Modal>
  );
}
