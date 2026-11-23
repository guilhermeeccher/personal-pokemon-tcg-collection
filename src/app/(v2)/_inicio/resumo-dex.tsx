"use client";

import { Medal, Trophy } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { JOGO_HOME } from "@/lib/dominio/dex-trofeus";
import type { ResumoDexInicioDTO } from "@/lib/dominio/tipos-cliente";

import { IconeNav } from "../_componentes/casca/icones";
import type { NomeIconeNav } from "../_componentes/casca/mapa-navegacao";
import { Painel } from "../_componentes/primitivos/painel";
import { Anel } from "./anel";
import estilos from "./inicio.module.css";
import { percentualDoAnel } from "./rotulo-divisao";
import { Barra } from "./suas-colecoes";

const ATALHOS_DEX: readonly { href: string; chave: string; icone: NomeIconeNav }[] = [
  { href: "/dex/planos", chave: "planos", icone: "planos" },
  { href: "/dex/trofeus", chave: "trofeus", icone: "trofeus" },
  { href: "/dex/pokedex", chave: "pokedex", icone: "pokedex" },
];

/** As cores dos níveis de troféu: só realce, o nível também está escrito. */
const COR_NIVEL = { platina: "#d9e4f5", ouro: "#ffd27a", prata: "#c9ced8", bronze: "#d59a6a" } as const;

/**
 * O resumo da Living Dex no início, só com o módulo ligado (quem decide é a
 * página, no servidor). Os números são os de `resumoDexInicio`, as mesmas
 * funções de domínio da visão geral da Dex e da página inicial da v1.
 *
 * Tudo aqui é link: a visão geral, os atalhos, as pendências (recebidos para
 * guardar, Pokémon para levar ao HOME), os planos ativos, os troféus do HOME
 * (calculados, nunca marcados) e os jogos. Nada é escrito daqui.
 */
export function ResumoDex({ dex }: { dex: ResumoDexInicioDTO }) {
  const t = useTranslations("v2Inicio.dex");
  const td = useTranslations("dex");
  const proximo = dex.proximoTrofeu;

  return (
    <Painel as="section" className={estilos.bloco} aria-labelledby="inicio-dex">
      <div className={estilos.secaoCab}>
        <h2 id="inicio-dex" className={estilos.blocoTitulo}>
          {t("titulo")}
        </h2>
        <Link href="/dex" className={estilos.link}>
          {t("visaoGeral")}
        </Link>
      </div>

      <nav aria-label={t("atalhos")}>
        <ul className={estilos.atalhos}>
          {ATALHOS_DEX.map((a) => (
            <li key={a.href}>
              <Link href={a.href} className={estilos.atalho}>
                <IconeNav nome={a.icone} className={estilos.atalhoIcone} />
                {t(`atalho.${a.chave}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className={estilos.trilhas}>
        {(["normal", "shiny"] as const).map((trilha) => {
          const p = dex.progresso[trilha];
          const percentual = percentualDoAnel(p.noHome, p.contam);
          return (
            <Link key={trilha} href="/dex" className={estilos.trilha}>
              <Anel percentual={percentual} completo={p.contam > 0 && p.noHome >= p.contam} tamanho={48} />
              <span className={estilos.trilhaTexto}>
                <b>{td(`trilha.${trilha}`)}</b>
                <span className="v2-num">{t("noHome", { noHome: p.noHome, contam: p.contam })}</span>
              </span>
            </Link>
          );
        })}
      </div>

      {(dex.recebidos > 0 || dex.levarAoHome > 0) && (
        <ul className={estilos.linhas}>
          {dex.recebidos > 0 && (
            <li>
              <Link href="/dex/recebidos" className={estilos.pendencia}>
                <span className={estilos.ponto} aria-hidden />
                {t("recebidos", { total: dex.recebidos })}
              </Link>
            </li>
          )}
          {dex.levarAoHome > 0 && (
            <li>
              <Link href="/dex/pokedex" className={estilos.pendencia}>
                <span className={estilos.ponto} aria-hidden />
                {t("levarAoHome", { total: dex.levarAoHome })}
              </Link>
            </li>
          )}
        </ul>
      )}

      <div className={estilos.subbloco}>
        <h3 className={estilos.subTitulo}>{t("planosAtivos")}</h3>
        {dex.planos.length === 0 ? (
          <div className={estilos.vazioBloco}>
            <p className={estilos.vazio}>{t("semPlano")}</p>
            <Link href="/dex/planos" className={estilos.link}>
              {t("abrirPlanos")}
            </Link>
          </div>
        ) : (
          <ul className={estilos.linhas}>
            {dex.planos.map((p) => (
              <li key={p.id} className={estilos.plano}>
                <Link href="/dex/planos" className={estilos.linha}>
                  <span className={estilos.linhaTopo}>
                    <span className={estilos.linhaNome}>{p.titulo}</span>
                    <span className={`${estilos.linhaValor} v2-num`}>{t("tarefas", { feitas: p.feitas, total: p.total })}</span>
                  </span>
                  <Barra percentual={p.total > 0 ? (p.feitas / p.total) * 100 : 0} />
                </Link>
                {p.tarefas.length > 0 && (
                  <ul className={estilos.tarefas}>
                    {p.tarefas.map((x) => (
                      <li key={x.id}>
                        <Link href="/dex/planos" className={estilos.tarefa}>
                          <span className={estilos.tarefaNome}>
                            {x.titulo}
                            {x.jogoNome && <span className={estilos.tarefaJogo}>{x.jogoNome}</span>}
                          </span>
                          {x.etapasTotal > 0 && (
                            <span className={`${estilos.linhaValor} v2-num`}>{t("etapas", { feitas: x.etapasFeitas, total: x.etapasTotal })}</span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {p.abertasAlem > 0 && <span className={estilos.mais}>{t("maisTarefas", { total: p.abertasAlem })}</span>}
              </li>
            ))}
            {dex.planosAlem > 0 && <li className={estilos.mais}>{t("maisPlanos", { total: dex.planosAlem })}</li>}
          </ul>
        )}
      </div>

      <div className={estilos.subbloco}>
        <h3 className={estilos.subTitulo}>{t("trofeus")}</h3>
        {/* A estante aparece sempre, mesmo zerada: soma os jogos dele e o HOME. */}
        <ul className={estilos.estante}>
          {(["platina", "ouro", "prata", "bronze"] as const).map((n) => (
            <li key={n}>
              <span style={{ color: dex.estante[n] > 0 ? COR_NIVEL[n] : "var(--v2-tinta-3)" }} aria-hidden>
                {n === "platina" ? <Trophy size={18} /> : <Medal size={18} />}
              </span>
              <b className="v2-num">{dex.estante[n]}</b>
              <span>{n === "platina" ? td("trofeus.platina") : td(`trofeus.nivel.${n}`)}</span>
            </li>
          ))}
        </ul>
        {proximo ? (
          <Link href={`/dex/trofeus?jogo=${JOGO_HOME}`} className={estilos.linha}>
            <span className={estilos.rotuloPequeno}>{t("proximoDoHome")}</span>
            <span className={estilos.linhaTopo}>
              <span className={estilos.linhaNome}>
                <Medal size={16} style={{ color: COR_NIVEL[proximo.nivel] }} aria-hidden />
                {proximo.titulo}
                <span className={estilos.selo}>{td(`trofeus.nivel.${proximo.nivel}`)}</span>
              </span>
              <span className={`${estilos.linhaValor} v2-num`}>
                {proximo.feito}/{proximo.alvo}
              </span>
            </span>
            <Barra percentual={proximo.alvo > 0 ? (proximo.feito / proximo.alvo) * 100 : 0} cor={COR_NIVEL[proximo.nivel]} />
          </Link>
        ) : (
          dex.todosDoHome && <p className={estilos.vazio}>{t("todosDoHome")}</p>
        )}
        {dex.semJogos && (
          <Link href="/dex/jogos" className={estilos.link}>
            {t("semJogos")}
          </Link>
        )}
      </div>
    </Painel>
  );
}
