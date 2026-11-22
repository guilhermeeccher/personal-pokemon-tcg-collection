"use client";

/**
 * "Trazer as que já existem" para um grupo ligado a uma série: a prévia de
 * `GET /api/grupos-colecao/:id/existentes` e a confirmação em
 * `POST /api/grupos-colecao/:id/existentes`. Regras em
 * `lib/dominio/grupos-colecao.ts`; aqui só a tela.
 *
 * Só vêm marcadas as coleções que não estão em grupo nenhum: tirar uma de
 * outro grupo é escolha do usuário, e a janela diz de onde ela sai.
 */

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Botao } from "@/app/_componentes/botao";
import { Modal } from "@/app/_componentes/modal";
import { textoDaRecusa } from "@/app/_componentes/recusa";
import type { ExistentesDoGrupoDTO, GrupoColecaoDTO } from "@/lib/dominio/tipos-cliente";

import { chamarApi } from "./chamar-api";

export function ModalExistentes({
  grupo,
  onFechar,
  onTrazidas,
}: {
  grupo: GrupoColecaoDTO;
  onFechar: () => void;
  onTrazidas: () => void;
}) {
  const t = useTranslations("colecoes.existentes");
  const tr = useTranslations("recusas");
  const [previa, setPrevia] = useState<ExistentesDoGrupoDTO | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/grupos-colecao/${grupo.id}/existentes`)
      .then(async (resp) => ({ ok: resp.ok, dados: await resp.json() }))
      .then(({ ok, dados }) => {
        if (!vivo) return;
        if (!ok) {
          setErro(textoDaRecusa(tr, dados, t("erroCarregar")));
          return;
        }
        const lida = dados as ExistentesDoGrupoDTO;
        setPrevia(lida);
        setMarcados(new Set(lida.colecoes.filter((c) => c.marcadoPorPadrao).map((c) => c.id)));
      })
      .catch(() => vivo && setErro(t("erroRede")))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [grupo.id, t, tr]);

  const colecoes = previa?.colecoes ?? [];

  function alternar(id: string, valor: boolean) {
    setMarcados((atuais) => {
      const proximo = new Set(atuais);
      if (valor) proximo.add(id);
      else proximo.delete(id);
      return proximo;
    });
  }

  async function trazer() {
    setErro(null);
    setEnviando(true);
    try {
      // Na ordem da prévia, que é a da lista: elas entram no fim do grupo assim.
      const ids = colecoes.filter((c) => marcados.has(c.id)).map((c) => c.id);
      const r = await chamarApi(`/api/grupos-colecao/${grupo.id}/existentes`, "POST", { ids });
      if (!r.ok) {
        setErro(textoDaRecusa(tr, r.corpo, t("erroTrazer")));
        return;
      }
      onTrazidas();
    } catch {
      setErro(t("erroRede"));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      className="md:max-w-2xl"
      onFechar={enviando ? undefined : onFechar}
      rodape={
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <Botao type="button" onClick={onFechar} disabled={enviando}>
            {t("cancelar")}
          </Botao>
          <Botao
            type="button"
            variante="primario"
            onClick={() => void trazer()}
            disabled={enviando || marcados.size === 0}
          >
            {enviando ? t("trazendo") : t("trazer", { total: marcados.size })}
          </Botao>
        </div>
      }
    >
      <h2 className="font-medium text-foreground">{t("titulo", { grupo: grupo.nome })}</h2>
      <p className="text-muted">{t("descricao", { serie: grupo.serieRotulo ?? "" })}</p>
      {carregando && <p className="text-muted">{t("carregando")}</p>}
      {previa && colecoes.length === 0 && <p className="text-muted">{t("nenhuma")}</p>}
      <ul className="flex flex-col divide-y divide-hairline">
        {colecoes.map((c) => (
          <li key={c.id}>
            <label className="flex items-start gap-2 py-3 max-md:min-h-11">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 max-md:mt-0 max-md:size-5"
                checked={marcados.has(c.id)}
                disabled={enviando}
                onChange={(e) => alternar(c.id, e.target.checked)}
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium break-words text-foreground">{c.nome}</span>
                <span className="text-xs text-muted">
                  {c.grupoAtual ? t("saiDe", { grupo: c.grupoAtual.nome }) : t("semGrupo")}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {erro && <p className="text-sm text-danger">{erro}</p>}
    </Modal>
  );
}
