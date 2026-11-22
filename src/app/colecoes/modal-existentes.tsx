"use client";

/**
 * "Trazer as que já existem" para um grupo ligado a uma série: a prévia de
 * `GET /api/grupos-colecao/:id/existentes` e a confirmação em
 * `POST /api/grupos-colecao/:id/existentes`. Regras em
 * `lib/dominio/grupos-colecao.ts`; aqui só a tela.
 *
 * Só vêm marcadas as coleções que não estão em grupo nenhum: tirar uma de
 * outro grupo é escolha do usuário, e a janela diz de onde ela sai.
 *
 * - **A confirmação manda o que a prévia mostrou**: a série que ela traz e, de cada
 *   coleção, o grupo de que ela sai (`grupoOrigemId`). Se um dos dois mudou
 *   em outra aba, o servidor recusa com 409 e nada é movido.
 * - **A janela não mostra o nome da série**: o rótulo que a página tem pode
 *   ser de uma série que outra aba já trocou, e a prévia já listaria as
 *   coleções da nova sob um cabeçalho da antiga. O texto fala só "da série
 *   ligada a este grupo", que é o que a prévia lida representa.
 * - **Depois de uma recusa, ou de uma falha sem resposta (o servidor pode ter
 *   gravado), a prévia é relida e o botão fica desligado até uma leitura
 *   válida chegar.** Uma releitura que falha não religa a prévia velha. Das
 *   marcas, ficam as das coleções que seguem na lista e cujo grupo de
 *   origem não mudou; as demais voltam ao padrão. Se a leitura falha, a
 *   janela oferece "Tentar de novo" ali mesmo, mantendo essas marcas.
 * - **Acima de `MAXIMO_COLECOES_POR_TRAZER` o botão fica desligado**, com
 *   uma frase, em vez de deixar a API recusar.
 */

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Botao } from "@/app/_componentes/botao";
import { Modal } from "@/app/_componentes/modal";
import { textoDaRecusa } from "@/app/_componentes/recusa";
import { MAXIMO_COLECOES_POR_TRAZER } from "@/lib/dominio/grupos-colecao";
import type { ExistentesDoGrupoDTO, GrupoColecaoDTO, TrazerExistentesDTO } from "@/lib/dominio/tipos-cliente";

import { chamarApi } from "./chamar-api";

export function ModalExistentes({
  grupo,
  onFechar,
  onTrazidas,
  onAtualizar,
}: {
  grupo: GrupoColecaoDTO;
  onFechar: () => void;
  onTrazidas: () => void;
  /** A lista da página pode ter mudado (recusa, ou falha sem resposta): relê. */
  onAtualizar: () => void;
}) {
  const t = useTranslations("colecoes.existentes");
  const tr = useTranslations("recusas");
  const tc = useTranslations("colecoes");
  // `null` = não há prévia válida (ainda não leu, ou a última leitura falhou).
  const [previa, setPrevia] = useState<ExistentesDoGrupoDTO | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);
  // Dois erros à parte: o da leitura da prévia some quando uma leitura válida
  // chega; o da confirmação (a recusa ou o "resultado incerto") fica na tela
  // depois da releitura, que é justamente o que o explica.
  const [erro, setErro] = useState<string | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const sequencia = useRef(0);
  const origens = useRef<Map<string, string | null> | null>(null);

  const carregar = useCallback(
    () => {
      const minha = ++sequencia.current;
      return fetch(`/api/grupos-colecao/${grupo.id}/existentes`)
        .then(async (resp) => ({ ok: resp.ok, dados: await resp.json().catch(() => null) }))
        .then(({ ok, dados }) => {
          if (minha !== sequencia.current) return;
          if (!ok || !dados || !Array.isArray((dados as ExistentesDoGrupoDTO).colecoes)) {
            setPrevia(null);
            setErroLeitura(textoDaRecusa(tr, dados, t("erroCarregar")));
            return;
          }
          const lida = dados as ExistentesDoGrupoDTO;
          const anteriores = origens.current;
          const novas = new Map(lida.colecoes.map((c) => [c.id, c.grupoAtual?.id ?? null] as const));
          origens.current = novas;
          setPrevia(lida);
          setMarcados((atuais) =>
            new Set(
              lida.colecoes
                .filter((c) =>
                  anteriores && anteriores.has(c.id) && anteriores.get(c.id) === novas.get(c.id)
                    ? atuais.has(c.id)
                    : c.marcadoPorPadrao,
                )
                .map((c) => c.id),
            ),
          );
          setErroLeitura(null);
        })
        .catch(() => {
          if (minha !== sequencia.current) return;
          setPrevia(null);
          setErroLeitura(t("erroCarregar"));
        })
        .finally(() => {
          if (minha === sequencia.current) setCarregando(false);
        });
    },
    [grupo.id, t, tr],
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  const valida = previa !== null;
  const colecoes = previa?.colecoes ?? [];
  const escolhidas = colecoes.filter((c) => marcados.has(c.id));

  const demais = escolhidas.length > MAXIMO_COLECOES_POR_TRAZER;

  /** "Tentar de novo" de uma leitura que falhou: as marcas de agora ficam onde ainda valem. */
  function reler() {
    setErroLeitura(null);
    setCarregando(true);
    void carregar();
  }

  function alternar(id: string, valor: boolean) {
    setMarcados((atuais) => {
      const proximo = new Set(atuais);
      if (valor) proximo.add(id);
      else proximo.delete(id);
      return proximo;
    });
  }

  async function trazer() {
    if (previa === null || escolhidas.length === 0 || demais) return;
    setErro(null);
    setEnviando(true);
    let relido = false;
    try {
      // Na ordem da prévia, que é a da lista: elas entram no fim do grupo assim.
      const corpo: TrazerExistentesDTO = {
        serieId: previa.serieId,
        itens: escolhidas.map((c) => ({ id: c.id, grupoOrigemId: c.grupoAtual?.id ?? null })),
      };
      const r = await chamarApi(`/api/grupos-colecao/${grupo.id}/existentes`, "POST", corpo);
      if (r.ok) {
        onTrazidas();
        return;
      }
      setErro(textoDaRecusa(tr, r.corpo, t("erroTrazer")));
      relido = true;
    } catch {
      // Sem resposta: o servidor pode ter movido tudo, parte ou nada.
      setErro(t("erroRede"));
      relido = true;
    } finally {
      setEnviando(false);
    }
    if (relido) {
      setPrevia(null);
      setCarregando(true);
      onAtualizar();
      void carregar();
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
            disabled={enviando || !valida || escolhidas.length === 0 || demais}
          >
            {enviando ? t("trazendo") : t("trazer", { total: escolhidas.length })}
          </Botao>
        </div>
      }
    >
      <h2 className="font-medium break-words text-foreground">{t("titulo", { grupo: grupo.nome })}</h2>
      <p className="break-words text-muted">{t("descricao")}</p>
      {carregando && <p className="text-muted">{t("carregando")}</p>}
      {valida && colecoes.length === 0 && <p className="text-muted">{t("nenhuma")}</p>}
      {/* Abaixo de md os rótulos têm 44px de altura e ficam 8px um do outro. */}
      <ul className="flex flex-col divide-y divide-hairline max-md:gap-2">
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
                <span className="text-xs break-words text-muted">
                  {c.grupoAtual ? t("saiDe", { grupo: c.grupoAtual.nome }) : t("semGrupo")}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {demais && <p className="text-sm text-warning-fg">{t("demais", { maximo: MAXIMO_COLECOES_POR_TRAZER })}</p>}
      {erroLeitura && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-danger">
          <p>{erroLeitura}</p>
          <Botao type="button" tamanho="sm" onClick={reler} disabled={enviando || carregando}>
            {tc("tentarDeNovo")}
          </Botao>
        </div>
      )}
      {erro && <p className="text-sm text-danger">{erro}</p>}
    </Modal>
  );
}
