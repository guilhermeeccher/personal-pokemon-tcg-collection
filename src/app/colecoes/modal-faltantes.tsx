"use client";

/**
 * "Criar coleções que faltam" de um grupo ligado a uma série: a prévia de
 * `GET /api/grupos-colecao/:id/faltantes` e a confirmação em
 * `POST /api/grupos-colecao/:id/faltantes`. Regras em
 * `lib/dominio/grupos-colecao.ts`; aqui só a tela.
 *
 * - **Quem marca é o usuário.** Vêm marcados só os sets que o servidor manda
 *   (`marcadoPorPadrao`); promo e energia aparecem desmarcados, com o motivo.
 * - **Set que já tem coleção não é selecionável**: aparece apagado, com o
 *   nome da coleção que o tem.
 * - **O nome é editável** antes de criar; vem o sugerido (`AAAA - SIGLA - Nome`).
 * - **Tudo ou nada**: uma recusa do servidor não grava nenhuma. Quando é
 *   por lista velha (409), a prévia recarrega mantendo o que o usuário
 *   digitou e marcou.
 */

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { Botao } from "@/app/_componentes/botao";
import { classesEntrada } from "@/app/_componentes/campo";
import { Distintivo } from "@/app/_componentes/distintivo";
import { Modal } from "@/app/_componentes/modal";
import { textoDaRecusa } from "@/app/_componentes/recusa";
import { MAXIMO_SETS_POR_CRIACAO } from "@/lib/dominio/grupos-colecao";
import type {
  CriarFaltantesDTO,
  FaltantesDoGrupoDTO,
  GrupoColecaoDTO,
} from "@/lib/dominio/tipos-cliente";

import { chamarApi } from "./chamar-api";

export function ModalFaltantes({
  grupo,
  onFechar,
  onCriadas,
}: {
  grupo: GrupoColecaoDTO;
  onFechar: () => void;
  onCriadas: () => void;
}) {
  const t = useTranslations("colecoes.faltantes");
  const tr = useTranslations("recusas");
  const [previa, setPrevia] = useState<FaltantesDoGrupoDTO | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Primeira leitura: as marcas padrão do servidor. Releituras (lista velha):
  // a marca e o nome do usuário ficam, salvo o set que deixou de ser
  // selecionável (ganhou coleção em outra aba).
  const carregar = useCallback(
    (primeira: boolean) =>
      fetch(`/api/grupos-colecao/${grupo.id}/faltantes`)
        .then(async (resp) => ({ ok: resp.ok, dados: await resp.json() }))
        .then(({ ok, dados }) => {
          if (!ok) {
            setErro(textoDaRecusa(tr, dados, t("erroCarregar")));
            return;
          }
          const nova = dados as FaltantesDoGrupoDTO;
          setPrevia(nova);
          const selecionaveis = new Set(
            nova.sets.filter((s) => s.colecoesExistentes.length === 0).map((s) => s.setId),
          );
          setMarcados((atuais) =>
            primeira
              ? new Set(nova.sets.filter((s) => s.marcadoPorPadrao).map((s) => s.setId))
              : new Set([...atuais].filter((id) => selecionaveis.has(id))),
          );
          setNomes((atuais) => {
            const mapa: Record<string, string> = {};
            for (const s of nova.sets) mapa[s.setId] = atuais[s.setId] ?? s.nomeSugerido;
            return mapa;
          });
        })
        .catch(() => setErro(t("erroRede")))
        .finally(() => setCarregando(false)),
    [grupo.id, t, tr],
  );

  useEffect(() => {
    carregar(true);
  }, [carregar]);

  const sets = previa?.sets ?? [];
  const escolhidos = sets.filter((s) => marcados.has(s.setId));
  const nomeVazio = escolhidos.some((s) => !(nomes[s.setId] ?? "").trim());
  const podeCriar =
    escolhidos.length > 0 && escolhidos.length <= MAXIMO_SETS_POR_CRIACAO && !nomeVazio && !enviando;

  function alternar(setId: string, valor: boolean) {
    setMarcados((atuais) => {
      const proximo = new Set(atuais);
      if (valor) proximo.add(setId);
      else proximo.delete(setId);
      return proximo;
    });
  }

  async function criar() {
    setErro(null);
    setEnviando(true);
    try {
      // Na ordem da prévia (lançamento): o servidor também a mantém, e a
      // lista que ele recebe é a que o usuário viu.
      const corpo: CriarFaltantesDTO = {
        sets: escolhidos.map((s) => ({ setId: s.setId, nome: (nomes[s.setId] ?? "").trim() })),
      };
      const r = await chamarApi(`/api/grupos-colecao/${grupo.id}/faltantes`, "POST", corpo);
      if (!r.ok) {
        setErro(textoDaRecusa(tr, r.corpo, t("erroCriar")));
        if (r.status === 409) await carregar(false);
        return;
      }
      onCriadas();
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
          <Botao type="button" variante="primario" onClick={() => void criar()} disabled={!podeCriar}>
            {enviando ? t("criando") : t("criar", { total: escolhidos.length })}
          </Botao>
        </div>
      }
    >
      <h2 className="font-medium text-foreground">{t("titulo", { grupo: grupo.nome })}</h2>
      {previa && (
        <p className="text-muted">{t("descricao", { serie: previa.serieRotulo })}</p>
      )}
      {carregando && <p className="text-muted">{t("carregando")}</p>}
      {previa && sets.length === 0 && <p className="text-muted">{t("semSets")}</p>}
      <ul className="flex flex-col divide-y divide-hairline">
        {sets.map((s) => {
          const jaTem = s.colecoesExistentes.length > 0;
          const marcado = marcados.has(s.setId);
          const ano = s.lancamento ? s.lancamento.slice(0, 4) : null;
          const detalhes = [s.sigla, ano, t("cartasOficiais", { total: s.qtdOficial })]
            .filter((x): x is string => Boolean(x))
            .join(" · ");
          return (
            <li key={s.setId} className={`flex flex-col gap-2 py-3 ${jaTem ? "opacity-60" : ""}`}>
              <label className="flex items-start gap-2 max-md:min-h-11">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 max-md:mt-0 max-md:size-5"
                  checked={marcado}
                  disabled={jaTem || enviando}
                  onChange={(e) => alternar(s.setId, e.target.checked)}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium break-words text-foreground">{s.nome}</span>
                  <span className="text-xs text-muted">{detalhes}</span>
                </span>
              </label>
              {jaTem ? (
                <p className="pl-6 text-xs text-muted max-md:pl-7">
                  {t("jaTem", { colecoes: s.colecoesExistentes.map((c) => c.nome).join(", ") })}
                </p>
              ) : (
                <>
                  {!marcado && s.motivoDesmarcado && (
                    <div className="pl-6 max-md:pl-7">
                      <Distintivo tom="aviso">{t(`motivo.${s.motivoDesmarcado}`)}</Distintivo>
                    </div>
                  )}
                  {marcado && (
                    <div className="pl-6 max-md:pl-7">
                      <input
                        className={`w-full ${classesEntrada}`}
                        aria-label={t("nomeDaColecao", { set: s.nome })}
                        value={nomes[s.setId] ?? ""}
                        disabled={enviando}
                        onChange={(e) => setNomes((atuais) => ({ ...atuais, [s.setId]: e.target.value }))}
                      />
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {nomeVazio && <p className="text-sm text-warning-fg">{t("nomeVazio")}</p>}
      {escolhidos.length > MAXIMO_SETS_POR_CRIACAO && (
        <p className="text-sm text-warning-fg">{t("demais", { maximo: MAXIMO_SETS_POR_CRIACAO })}</p>
      )}
      {erro && <p className="text-sm text-danger">{erro}</p>}
    </Modal>
  );
}
