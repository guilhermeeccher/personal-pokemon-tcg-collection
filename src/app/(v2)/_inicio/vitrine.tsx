"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { InicioV2DTO } from "@/lib/dominio/inicio-v2";

import { BotaoLink } from "../_componentes/primitivos/botao";
import { IconeNav } from "../_componentes/casca/icones";
import type { NomeIconeNav } from "../_componentes/casca/mapa-navegacao";
import { Painel } from "../_componentes/primitivos/painel";
import { CartaTocavel } from "./carta-tocavel";
import estilos from "./inicio.module.css";
import { useRotuloDivisao } from "./rotulo-divisao";
import type { CartasDoInicio } from "./tipos";

/** Os atalhos do TCG, com o ícone do mesmo item da navegação (`mapa-navegacao.ts`). */
const ATALHOS: readonly { href: string; chave: string; icone: NomeIconeNav }[] = [
  { href: "/colecoes", chave: "colecoes", icone: "colecoes" },
  { href: "/inventario", chave: "inventario", icone: "inventario" },
  { href: "/cadastro/set", chave: "cadastroSet", icone: "por-set" },
  { href: "/inventario/visao-geral", chave: "visaoGeral", icone: "visao-geral" },
];

/**
 * A vitrine do início: o texto (o que entrou na semana, a divisão mais perto
 * de fechar, os números e os atalhos) e o leque com as joias do inventário.
 *
 * - **O leque é a regra das joias da visão geral**, cortada em três: a mais
 *   valiosa no centro. Só a do centro carrega a imagem `high` (uma de cada vez,
 *   regra 8 de `rules.md`); as dos lados ficam na `low`. As três são `vitrine`:
 *   o leque é um dos poucos lugares em que a carta pode ficar ativa sem o dedo
 *   em cima (regra 5a).
 * - **Sem preço na legenda**: o protótipo mostra um valor, mas um preço do
 *   Cardmarket só pode aparecer com o euro, a cotação e a data, e um da Liga
 *   nunca ao lado de um do Cardmarket. O preço está no detalhe, que já diz
 *   tudo isso; aqui, nome, set e número.
 * - **Sem carta nenhuma**, o leque vira o estado vazio, com os dois caminhos
 *   de cadastro.
 */
export function Vitrine({ dados, cartas }: { dados: InicioV2DTO; cartas: CartasDoInicio }) {
  const t = useTranslations("v2Inicio");
  const tl = useTranslations("v2Inicio.lead");
  const rotuloDivisao = useRotuloDivisao();
  const negrito = (partes: ReactNode) => <b>{partes}</b>;

  const { totais, cadastradas, vitrine } = dados;
  const primeira = dados.quaseLa[0] ?? null;
  const semCartas = totais.totalUnidades === 0;

  // No leque, a primeira joia vai ao centro: ordem visual esquerda, centro, direita.
  const leque = [vitrine[1], vitrine[0], vitrine[2]].flatMap((c, i) =>
    c ? [{ carta: c, posicao: (["esquerda", "centro", "direita"] as const)[i] }] : [],
  );
  const destaque = vitrine[0] ?? null;

  return (
    <section className={estilos.vitrine} aria-labelledby="inicio-titulo">
      <div className={estilos.vitrineTexto}>
        <h1 id="inicio-titulo" className={estilos.titulo}>
          {t("titulo")}
        </h1>
        <p className={estilos.lead}>
          {semCartas
            ? tl("vazio")
            : cadastradas.copias > 0
              ? tl.rich("cadastradas", { cartas: cadastradas.cartas, b: negrito })
              : tl("nenhumaCadastrada")}{" "}
          {primeira && tl.rich("quaseLa", { divisao: rotuloDivisao(primeira.divisao), faltam: primeira.faltam, b: negrito })}
        </p>

        {primeira && (
          <div className={estilos.acoes}>
            <BotaoLink href={`/colecoes/${primeira.colecaoId}`} variante="primario">
              {t("abrirColecao", { nome: primeira.colecaoNome })}
            </BotaoLink>
          </div>
        )}

        <nav aria-label={t("atalhos")}>
          <ul className={estilos.atalhos}>
            {ATALHOS.map((a) => (
              <li key={a.href}>
                <Link href={a.href} className={estilos.atalho}>
                  <IconeNav nome={a.icone} className={estilos.atalhoIcone} />
                  {t(`atalho.${a.chave}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <ul className={estilos.numeros}>
          <Numero href="/inventario" valor={totais.cartasDistintas} rotulo={t("numeros.cartas", { total: totais.cartasDistintas })} />
          <Numero href="/inventario" valor={totais.totalUnidades} rotulo={t("numeros.unidades", { total: totais.totalUnidades })} />
          <Numero href="/colecoes" valor={dados.totalColecoes} rotulo={t("numeros.colecoes", { total: dados.totalColecoes })} />
        </ul>
      </div>

      {semCartas ? (
        <Painel className={estilos.vitrineVazia}>
          <h2 className={estilos.vazioTitulo}>{t("vitrine.vazioTitulo")}</h2>
          <p className={estilos.vazioTexto}>{t("vitrine.vazioTexto")}</p>
          <div className={estilos.acoes}>
            <BotaoLink href="/cadastro/set" variante="primario">
              {t("vitrine.cadastrarPorSet")}
            </BotaoLink>
            <BotaoLink href="/cadastro/busca">{t("vitrine.buscarCarta")}</BotaoLink>
          </div>
        </Painel>
      ) : (
        leque.length > 0 && (
          <div className={estilos.leque} role="group" aria-label={t("vitrine.rotulo")}>
            {leque.map(({ carta, posicao }) => (
              <CartaTocavel
                key={carta.copiaId}
                chave={`vitrine:${carta.copiaId}`}
                carta={carta}
                cartas={cartas}
                rotulo={t("vitrine.abrir", { nome: carta.nome })}
                modo="vitrine"
                // `high` só no centro, e só com o detalhe fechado: aberto, o
                // palco dele é a carta grande da vez (regra 8 de `rules.md`).
                qualidade={posicao === "centro" && cartas.aberta === null ? "high" : "low"}
                mostrarVariante
                className={`${estilos.lequeItem} ${estilos[posicao]}`}
              />
            ))}
            {destaque && (
              <p className={`v2-painel-flutuante ${estilos.legendaLeque}`} aria-hidden>
                <span className={estilos.ponto} />
                <b>{destaque.nome}</b>
                <span className="v2-num">{t("vitrine.legenda", { set: destaque.setNome, numero: destaque.localId })}</span>
              </p>
            )}
          </div>
        )
      )}
    </section>
  );
}

function Numero({ href, valor, rotulo }: { href: string; valor: number; rotulo: string }) {
  const formato = useFormatter();
  return (
    <li>
      <Link href={href} className={estilos.numero}>
        <b className="v2-num">{formato.number(valor)}</b>
        <span>{rotulo}</span>
      </Link>
    </li>
  );
}
