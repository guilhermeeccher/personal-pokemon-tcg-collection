"use client";

/**
 * A tabela de preços da fonte ativa, uma carta por linha. As duas fontes têm a
 * mesma linha — a carta, o set, o número, a raridade, três preços e o dia da
 * consulta —, com Mínimo | Médio | Máximo na Liga e Mínimo | Tendência | Média
 * no Cardmarket. É uma lista (`<ul>`) com colunas de grade a partir de 768 px
 * e um cartão por carta abaixo disso: **uma árvore só**, com a mesma
 * marcação nos dois arranjos (AGENTS.md, "Mobile layout", "One tree, not two").
 *
 * Os valores estão em reais. Na Liga é o real que o site anuncia, sem conversão
 * nenhuma; no Cardmarket (a única exceção a "No currency conversion") vêm
 * convertidos pela PTAX de fechamento do dia da consulta — por isso a linha
 * traz o euro original embaixo do valor, e o dia do câmbio quando ele não é o
 * que a tela anuncia. As duas fontes nunca aparecem juntas nem se comparam.
 *
 * A coluna do Cardmarket continua chamada "Tendência" e mostra o **valor
 * guardado** da carta (`valor`): quase sempre a própria tendência. Quando não
 * é (a trava da média de 30 dias, ou nenhuma tendência), a linha diz, com uma
 * etiqueta à vista e a explicação que abre por toque e teclado.
 */

import { useLocale, useTranslations } from "next-intl";

import {
  type CartaDaTabelaDTO,
  type CotacaoDTO,
  type ItemPrecoCardmarketDTO,
  type ItemPrecoLigaDTO,
  criterioForaDaTendencia,
  dataCivil,
  diaDoCambioDaLinha,
} from "@/lib/dominio/precos-v2";
import { LIMITE_TENDENCIA_SOBRE_MEDIA30 } from "@/lib/dominio/preco-cardmarket";

import { CartaQueAbre } from "../../visao-geral/_componentes/detalhe-de-copia";

import { Explicacao } from "./explicacao";
import estilos from "./precos.module.css";
import type { PedidoDetalhe } from "./use-detalhe-da-carta";

export type LinhaDaTabela =
  | { fonte: "liga"; item: ItemPrecoLigaDTO }
  | { fonte: "cardmarket"; item: ItemPrecoCardmarketDTO };

const moeda = (valor: number, locale: string, codigo: "BRL" | "EUR") =>
  valor.toLocaleString(locale, { style: "currency", currency: codigo });

export interface PropsTabelaPrecos {
  linhas: readonly LinhaDaTabela[];
  fonte: "liga" | "cardmarket";
  cotacao: CotacaoDTO | null;
  /** A foto e a cópia de cada carta da página; ainda não lidas, a carta fica sem foto. */
  cartas: ReadonlyMap<string, CartaDaTabelaDTO>;
  /** Texto da raridade, já rotulado no idioma da interface. */
  rotuloRaridade: (raridade: string | null) => string;
  abertaCartaId: string | null;
  alvoCartaId: string | null;
  aoAbrir: (pedido: PedidoDetalhe) => void;
}

export function TabelaPrecos({
  linhas,
  fonte,
  cotacao,
  cartas,
  rotuloRaridade,
  abertaCartaId,
  alvoCartaId,
  aoAbrir,
}: PropsTabelaPrecos) {
  const t = useTranslations("v2Precos");
  const cardmarket = fonte === "cardmarket";
  return (
    <div className={estilos.tabela}>
      <div className={estilos.cabecalhoTabela} aria-hidden>
        <span />
        <span>{t("colunaCarta")}</span>
        <span>{t("colunaSet")}</span>
        <span>{t("colunaNumero")}</span>
        <span>{t("colunaRaridade")}</span>
        <span className={estilos.precosCab}>
          <span>{t("colunaMinimo")}</span>
          <span>{cardmarket ? t("cardmarket.colunaTendencia") : t("colunaMedio")}</span>
          <span>{cardmarket ? t("cardmarket.colunaMedia") : t("colunaMaximo")}</span>
        </span>
        <span>{t("colunaConsultado")}</span>
      </div>
      <ul className={estilos.linhas} aria-label={t("lista")} data-lista-precos tabIndex={-1}>
        {linhas.map((l) => (
          <LinhaDePreco
            key={l.item.cartaId}
            linha={l}
            cotacao={cotacao}
            info={cartas.get(l.item.cartaId) ?? null}
            rotuloRaridade={rotuloRaridade}
            aberta={abertaCartaId === l.item.cartaId}
            noParAtivo={alvoCartaId === l.item.cartaId}
            aoAbrir={aoAbrir}
          />
        ))}
      </ul>
    </div>
  );
}

function LinhaDePreco({
  linha,
  cotacao,
  info,
  rotuloRaridade,
  aberta,
  noParAtivo,
  aoAbrir,
}: {
  linha: LinhaDaTabela;
  cotacao: CotacaoDTO | null;
  info: CartaDaTabelaDTO | null;
  rotuloRaridade: (raridade: string | null) => string;
  aberta: boolean;
  noParAtivo: boolean;
  aoAbrir: (pedido: PedidoDetalhe) => void;
}) {
  const t = useTranslations("v2Precos");
  const locale = useLocale();
  const i = linha.item;
  const raridade = rotuloRaridade(i.raridade);
  // Só abre com a cópia lida: antes disso (ou sem nenhuma cópia) o nome é texto.
  const pedido: PedidoDetalhe | null =
    info?.copiaId != null
      ? {
          cartaId: i.cartaId,
          copiaId: info.copiaId,
          previa: { nome: i.nome, imagemUrl: info.imagemUrl, imagemOrigem: info.imagemOrigem ?? undefined, raridade: i.raridade },
        }
      : null;
  const semCopia = info !== null && info.copiaId === null;

  return (
    <li className={`v2-painel ${estilos.linha}`} data-carta-id={i.cartaId}>
      <div className={estilos.foto}>
        {pedido ? (
          <CartaQueAbre
            cartaId={i.cartaId}
            nome={i.nome}
            imagemUrl={info?.imagemUrl ?? null}
            imagemOrigem={info?.imagemOrigem ?? undefined}
            raridade={i.raridade}
            rotulo={t("abrirCarta", { nome: i.nome })}
            aberta={aberta}
            noParAtivo={noParAtivo}
            aoAbrir={() => aoAbrir(pedido)}
            soPonteiro
          />
        ) : (
          <span className={estilos.semFoto} aria-hidden />
        )}
      </div>
      <div className={estilos.cartaCelula}>
        {pedido ? (
          <button type="button" className={estilos.nomeBotao} data-abre onClick={() => aoAbrir(pedido)}>
            {i.nome}
            <span className="v2-so-leitor"> — {t("abrirCarta", { nome: i.nome })}</span>
          </button>
        ) : (
          <span className={estilos.nome}>{i.nome}</span>
        )}
        {semCopia && (
          <Explicacao assunto={t("semCopia")} texto={t("semCopiaExplicacao")}>
            {t("semCopia")}
          </Explicacao>
        )}
      </div>
      <span className={estilos.set}>{i.setNome}</span>
      <span className={`${estilos.numero} v2-num`}>
        <span className={estilos.rotuloCampo}>{t("colunaNumero")} </span>
        {i.localId}
      </span>
      <span className={estilos.raridade}>{raridade}</span>

      {linha.fonte === "liga" ? (
        <PrecosLiga item={linha.item} locale={locale} />
      ) : (
        <PrecosCardmarket item={linha.item} cotacaoDaTela={cotacao} locale={locale} />
      )}

      <span className={estilos.consulta}>
        <span className={estilos.rotuloCampo}>{t("colunaConsultado")}: </span>
        {new Date(i.consultadoEm).toLocaleDateString(locale)}
      </span>
    </li>
  );
}

function PrecosLiga({ item: i, locale }: { item: ItemPrecoLigaDTO; locale: string }) {
  const t = useTranslations("v2Precos");
  if (!i.encontrada) {
    return (
      <span className={estilos.precos}>
        <span className={estilos.semPreco}>
          <Explicacao assunto={t("naoEncontrada")} texto={t("naoEncontradaExplicacao")}>
            {t("naoEncontrada")}
          </Explicacao>
        </span>
      </span>
    );
  }
  const brl = (v: number | null) => (v !== null ? moeda(v, locale, "BRL") : "—");
  return (
    <span className={estilos.precos}>
      <span className={`${estilos.preco} v2-num`}>
        <span className={estilos.rotuloCampo}>{t("colunaMinimo")}</span>
        {brl(i.preco)}
      </span>
      <span className={`${estilos.preco} ${estilos.precoForte} v2-num`}>
        <span className={estilos.rotuloCampo}>{t("colunaMedio")}</span>
        {brl(i.precoMedio)}
      </span>
      <span className={`${estilos.preco} v2-num`}>
        <span className={estilos.rotuloCampo}>{t("colunaMaximo")}</span>
        {brl(i.precoMaximo)}
      </span>
    </span>
  );
}

function PrecosCardmarket({
  item: i,
  cotacaoDaTela,
  locale,
}: {
  item: ItemPrecoCardmarketDTO;
  cotacaoDaTela: CotacaoDTO | null;
  locale: string;
}) {
  const t = useTranslations("v2Precos");
  if (!i.encontrada) {
    return (
      <span className={estilos.precos}>
        <span className={estilos.semPreco}>
          <Explicacao assunto={t("cardmarket.semPreco")} texto={t("cardmarket.semPrecoExplicacao")}>
            {t("cardmarket.semPreco")}
          </Explicacao>
        </span>
      </span>
    );
  }
  const brl = (v: number | null) => (v !== null ? moeda(v, locale, "BRL") : "—");
  const eur = (v: number | null) => (v !== null ? moeda(v, locale, "EUR") : "—");
  const diaDoCambio = diaDoCambioDaLinha(i, cotacaoDaTela);
  const criterio = criterioForaDaTendencia(i.criterioValor);
  return (
    <span className={estilos.precos}>
      <span className={`${estilos.preco} v2-num`}>
        <span className={estilos.rotuloCampo}>{t("colunaMinimo")}</span>
        {brl(i.minimo)}
      </span>
      <span className={`${estilos.preco} ${estilos.precoForte} v2-num`}>
        <span className={estilos.rotuloCampo}>{t("cardmarket.colunaTendencia")}</span>
        {brl(i.valor)}
        {i.valorEur !== null && <span className={estilos.detalhePreco}>{eur(i.valorEur)}</span>}
        {/* As etiquetas (foil, critério) são botões de 44 px: moram juntas, com
            8 px entre elas, e não uma por linha de detalhe. */}
        {(i.foil || criterio !== null) && (
          <span className={estilos.etiquetas}>
            {i.foil && (
              <Explicacao assunto={t("cardmarket.foil")} texto={t("cardmarket.foilExplicacao")}>
                {t("cardmarket.foil")}
              </Explicacao>
            )}
            {criterio !== null && (
              <Explicacao
                assunto={criterio.tipo === "media30" ? t("cardmarket.criterioMedia30") : t("cardmarket.criterioMedia")}
                tom={criterio.tom === "aviso" ? "aviso" : "neutro"}
                texto={
                  criterio.tipo === "media30"
                    ? t("cardmarket.criterioMedia30Explicacao", {
                        tendencia: eur(i.tendenciaEur),
                        media30: eur(i.media30Eur),
                        // Texto, não número: o ICU formataria "3" pela localidade à toa.
                        limite: String(LIMITE_TENDENCIA_SOBRE_MEDIA30),
                      })
                    : t("cardmarket.criterioMediaExplicacao")
                }
              >
                {criterio.tipo === "media30" ? t("cardmarket.criterioMedia30") : t("cardmarket.criterioMedia")}
              </Explicacao>
            )}
          </span>
        )}
        {diaDoCambio !== null && (
          <span className={estilos.detalhePreco}>
            {t("cardmarket.cotacaoDaLinha", { data: dataCivil(diaDoCambio, locale) })}
          </span>
        )}
      </span>
      <span className={`${estilos.preco} v2-num`}>
        <span className={estilos.rotuloCampo}>{t("cardmarket.colunaMedia")}</span>
        {brl(i.media)}
      </span>
    </span>
  );
}
