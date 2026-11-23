"use client";

/**
 * As joias: as cartas que mais valem no inventário (`listarJoias`: o preço
 * guardado na fonte ativa, e só nela; as sem preço seguem a vitrine). Cada
 * uma abre o detalhe em modo cópia.
 *
 * - **Uma grade que quebra linha, nunca uma faixa que rola na horizontal**:
 *   a carta da grade tem `touch-action: pan-y` (regra 2 de `rules.md`), e um
 *   rolador horizontal cheio de cartas não rolaria quando o dedo começasse
 *   sobre uma.
 * - **O preço sai com a fonte.** Liga: reais como o site dá, sem conversão.
 *   Cardmarket: o valor em reais, o euro de onde veio, a cotação (PTAX) e o
 *   dia dela, e a frase de que é referência internacional, não valor de
 *   mercado brasileiro (`AGENTS.md`, "International price reference"). Nada
 *   só no hover: tudo é texto na tela.
 * - Sem preço consultado, sem preço: "R$ 0" seria mentira.
 */

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import type { PrecoDaJoia } from "@/lib/dominio/visao-geral-v2";

import { useFormatos } from "../../../_componentes/detalhe/formatos";

import type { PreviaDaCarta } from "../../../_componentes/detalhe/detalhe-carta";

import { CartaQueAbre, useDetalheDeCopia } from "./detalhe-de-copia";
import estilos from "./visao-geral.module.css";

export interface JoiaDaTela {
  cartaId: string;
  /** `null` quando a leitura das cópias não trouxe nenhuma: a carta aparece, sem abrir. */
  copiaId: string | null;
  nome: string;
  setNome: string;
  localId: string;
  /** O texto já rotulado (`rotuloDaRaridade`). */
  raridade: string;
  raridadeCrua: string | null;
  imagemUrl: string;
  /** De onde veio a foto: governa o selo de foto emprestada (outro idioma, mypcards). */
  imagemOrigem: PreviaDaCarta["imagemOrigem"];
  preco: PrecoDaJoia | null;
}

export function Joias({ joias, fonte }: { joias: readonly JoiaDaTela[]; fonte: "liga" | "cardmarket" }) {
  const t = useTranslations("v2VisaoGeral.joias");
  const formatos = useFormatos();
  const { abrir, detalhe, abertaCartaId, alvoCartaId } = useDetalheDeCopia();

  return (
    <section className={estilos.secao} aria-labelledby="vg-joias">
      <div className={estilos.cabecaSecao}>
        <Sparkles className={estilos.iconeSecao} aria-hidden />
        <div>
          <h2 id="vg-joias" className={estilos.tituloSecao}>
            {t("titulo")}
          </h2>
          <p className={estilos.textoSecao}>{t("descricao")}</p>
          <p className={estilos.notaFonte}>{t(fonte === "cardmarket" ? "notaCardmarket" : "notaLiga")}</p>
        </div>
      </div>
      <ul className={estilos.joias}>
        {joias.map((j) => (
          <li key={j.cartaId} className={estilos.joia}>
            {j.copiaId ? (
              <CartaQueAbre
                cartaId={j.cartaId}
                nome={j.nome}
                imagemUrl={j.imagemUrl}
                imagemOrigem={j.imagemOrigem}
                raridade={j.raridadeCrua}
                rotulo={t("abrir", { nome: j.nome, set: j.setNome })}
                aberta={abertaCartaId === j.cartaId}
                noParAtivo={alvoCartaId === j.cartaId}
                aoAbrir={() =>
                  abrir({
                    cartaId: j.cartaId,
                    copiaId: j.copiaId as string,
                    previa: { nome: j.nome, imagemUrl: j.imagemUrl, imagemOrigem: j.imagemOrigem, raridade: j.raridadeCrua },
                  })
                }
              />
            ) : (
              <span className={estilos.semAbrir} aria-hidden />
            )}
            <div className={estilos.legenda}>
              <span className={estilos.joiaNome}>{j.nome}</span>
              <span className={estilos.joiaSet}>
                {j.setNome} · <span className="v2-num">{j.localId}</span>
              </span>
              <span className={estilos.joiaRaridade}>{j.raridade}</span>
              {j.preco && (
                <span className={estilos.preco}>
                  <span className={`${estilos.precoValor} v2-num`}>
                    {j.preco.fonte === "cardmarket"
                      ? t("precoCardmarket", { valor: formatos.brl(j.preco.valor) })
                      : t("precoLiga", { valor: formatos.brl(j.preco.valor) })}
                  </span>
                  {j.preco.fonte === "cardmarket" && j.preco.criterio && j.preco.criterio !== "tendencia" && (
                    <span className={estilos.precoOrigem}>{t(`criterio.${j.preco.criterio}`)}</span>
                  )}
                  {j.preco.fonte === "cardmarket" && j.preco.valorEur !== null && j.preco.cotacao !== null && (
                    <span className={`${estilos.precoOrigem} v2-num`}>
                      {t("origemCardmarket", {
                        eur: formatos.eur(j.preco.valorEur),
                        cotacao: formatos.cotacao(j.preco.cotacao),
                        data: j.preco.cotacaoData ? formatos.dia(j.preco.cotacaoData) : "—",
                      })}
                    </span>
                  )}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {detalhe}
    </section>
  );
}
