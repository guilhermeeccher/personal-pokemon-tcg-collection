"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import type { ColecaoInicioDTO } from "@/lib/dominio/tipos-cliente";

import { Painel } from "../_componentes/primitivos/painel";
import estilos from "./inicio.module.css";
import { percentualDoAnel } from "./rotulo-divisao";

/**
 * "Suas coleções": as quatro primeiras na ordem de `listarColecoes` — a ordem
 * que o usuário escolheu, com os grupos; nunca reordenada aqui. A customizada
 * não tem denominador: só a contagem, sem barra.
 */
export function SuasColecoes({ colecoes, total }: { colecoes: ColecaoInicioDTO[]; total: number }) {
  const t = useTranslations("v2Inicio.colecoes");
  return (
    <Painel as="section" className={estilos.bloco} aria-labelledby="inicio-colecoes">
      <div className={estilos.secaoCab}>
        <h2 id="inicio-colecoes" className={estilos.blocoTitulo}>
          {t("titulo")}
        </h2>
        {total > colecoes.length && (
          <Link href="/colecoes" className={estilos.link}>
            {t("verTodas", { total })}
          </Link>
        )}
      </div>
      {colecoes.length === 0 ? (
        <div className={estilos.vazioBloco}>
          <p className={estilos.vazio}>{t("vazio")}</p>
          <Link href="/colecoes" className={estilos.link}>
            {t("criarPrimeira")}
          </Link>
        </div>
      ) : (
        <ul className={estilos.linhas}>
          {colecoes.map((c) => {
            const customizada = c.tipo === "customizada";
            const percentual = percentualDoAnel(c.vagasPreenchidas, c.totalVagas);
            const completa = !customizada && c.totalVagas > 0 && c.vagasPreenchidas >= c.totalVagas;
            return (
              <li key={c.id}>
                <Link href={`/colecoes/${c.id}`} className={estilos.linha}>
                  <span className={estilos.linhaTopo}>
                    <span className={estilos.linhaNome}>{c.nome}</span>
                    <span className={`${estilos.linhaValor} v2-num`}>
                      {customizada ? (
                        t("cartas", { total: c.vagasPreenchidas })
                      ) : (
                        <>
                          <b className={completa ? estilos.completa : undefined}>{percentual}%</b>{" "}
                          {t("progresso", { preenchidas: c.vagasPreenchidas, total: c.totalVagas })}
                        </>
                      )}
                    </span>
                  </span>
                  {!customizada && <Barra percentual={c.totalVagas > 0 ? (c.vagasPreenchidas / c.totalVagas) * 100 : 0} completa={completa} />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Painel>
  );
}

/** Barra de progresso decorativa: o número está em texto ao lado. */
export function Barra({ percentual, completa = false, cor }: { percentual: number; completa?: boolean; cor?: string }) {
  return (
    <span className={estilos.barra} aria-hidden>
      <span
        className={[estilos.barraCheia, completa ? estilos.barraCompleta : null].filter(Boolean).join(" ")}
        style={{ width: `${Math.min(Math.max(percentual, 0), 100)}%`, background: cor }}
      />
    </span>
  );
}
