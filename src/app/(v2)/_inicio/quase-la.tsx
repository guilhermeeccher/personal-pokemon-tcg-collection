"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import type { QuaseLaInicioDTO } from "@/lib/dominio/tipos-cliente";

import { Anel } from "./anel";
import estilos from "./inicio.module.css";
import { percentualDoAnel, useRotuloDivisao } from "./rotulo-divisao";

/**
 * "Quase lá": as divisões mais perto de fechar (`selecionarQuaseLa`, entre
 * todas as coleções; empate na ordem de `listarColecoes`), cada uma um link
 * para a coleção. As miniaturas são as primeiras vagas vazias (regra 6): na
 * Pokédex a silhueta da espécie — a vaga não sabe qual carta vai entrar
 * (regra 3) —, no set a carta esperada, apagada, ou o número quando não há
 * imagem. São decorativas: a informação está no texto da linha.
 *
 * No celular os cartões correm na horizontal com encaixe (rolagem nativa,
 * nenhum gesto nosso); a partir de 768 px, grade.
 */
export function QuaseLa({ itens }: { itens: QuaseLaInicioDTO[] }) {
  const t = useTranslations("v2Inicio.quaseLa");
  const rotulo = useRotuloDivisao();
  return (
    <section className={estilos.secao} aria-labelledby="inicio-quase-la">
      <div className={estilos.secaoCab}>
        <h2 id="inicio-quase-la" className={estilos.secaoTitulo}>
          {t("titulo")}
        </h2>
        <Link href="/colecoes" className={estilos.link}>
          {t("todas")}
        </Link>
      </div>
      <ul className={estilos.trilho}>
        {itens.map((q) => {
          const nome = rotulo(q.divisao);
          const percentual = percentualDoAnel(q.divisao.preenchidas, q.divisao.total);
          const pokedex = q.divisao.tipo === "regiao";
          const alem = q.faltam - q.miniaturas.length;
          return (
            <li key={`${q.colecaoId}|${q.divisao.id}`}>
              <Link
                href={`/colecoes/${q.colecaoId}`}
                className={`v2-painel ${estilos.quase}`}
                aria-label={`${q.colecaoNome}: ${t("progresso", { percentual, divisao: nome, faltam: q.faltam })}`}
              >
                <span className={estilos.quaseTopo}>
                  <Anel percentual={percentual} />
                  <span className={estilos.quaseNomes}>
                    <span className={estilos.quaseNome}>{nome}</span>
                    <span className={estilos.quaseSub}>{q.colecaoNome}</span>
                  </span>
                </span>
                <span className={estilos.quaseRodape}>
                  <span className={estilos.faltam}>{t("faltam", { total: q.faltam })}</span>
                  <span className={estilos.sombras} aria-hidden>
                    {q.miniaturas.map((m, i) => (
                      <span key={i} className={estilos.sombra}>
                        {m.url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- sprite ou miniatura `low`, sem otimizador (regra de imagens da v2); decorativa.
                          <img src={m.url} alt="" loading="lazy" className={pokedex ? estilos.sombraSprite : estilos.sombraCarta} />
                        ) : (
                          <span className="v2-num">{m.rotulo}</span>
                        )}
                      </span>
                    ))}
                    {alem > 0 && <span className={`${estilos.sombraMais} v2-num`}>+{alem}</span>}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
