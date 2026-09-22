"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { classesBotao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Distintivo } from "@/app/_componentes/distintivo";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import type { ColecaoListaDTO } from "@/lib/dominio/tipos-cliente";

interface ContagemElegiveis {
  prontas: number;
  foraDePadrao: number;
}

export default function ColecoesPage() {
  const t = useTranslations("colecoes");
  const [itens, setItens] = useState<ColecaoListaDTO[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [elegiveis, setElegiveis] = useState<ContagemElegiveis | null>(null);

  const carregar = useCallback(() => {
    fetch("/api/colecoes")
      .then((r) => r.json())
      .then((d) => setItens(d.itens ?? []))
      .catch(() => setErro(t("erroCarregar")))
      .finally(() => setCarregando(false));
  }, [t]);

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

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-8">
      <CabecalhoPagina
        titulo={t("titulo")}
        descricao={t("contagem", { total: itens.length })}
        acoes={
          <>
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

      {erro && <p className="text-sm text-danger">{erro}</p>}
      {carregando && <p className="text-sm text-muted">{t("carregando")}</p>}

      <ul className="flex flex-col divide-y divide-hairline">
        {itens.map((c) => {
          const customizada = c.tipo === "customizada";
          return (
            <li key={c.id}>
              <Link
                href={`/colecoes/${c.id}`}
                className="flex items-center justify-between gap-3 py-3 hover:bg-surface-hover"
              >
                <div>
                  <div className="font-medium">{c.nome}</div>
                  <div className="text-sm text-muted">
                    {t.has(`tipo.${c.tipo}`) ? t(`tipo.${c.tipo}`) : c.tipo}
                    {c.idiomaExigido ? t("idiomaExigido", { idioma: c.idiomaExigido }) : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {c.avisoCatalogoIncompleto && (
                    <Distintivo tom="aviso">{t("catalogoIncompleto")}</Distintivo>
                  )}
                  {c.avisoSemNumeracaoOficial && (
                    <Distintivo tom="aviso">{t("semNumeracaoOficial")}</Distintivo>
                  )}
                  <span className="tabular-nums text-muted">
                    {customizada
                      ? t("cartas", { total: c.vagasPreenchidas })
                      : `${c.vagasPreenchidas}/${c.totalVagas}`}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
        {itens.length === 0 && !carregando && (
          <EstadoVazio as="li" className="py-6">
            {t("vazio")}
          </EstadoVazio>
        )}
      </ul>
    </main>
  );
}
