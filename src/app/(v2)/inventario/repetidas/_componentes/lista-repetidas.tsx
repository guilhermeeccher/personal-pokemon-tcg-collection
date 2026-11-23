"use client";

/**
 * `/inventario/repetidas`: o que sobra para troca. Uma carta por cartão, com
 * o total, o que está alocado, o que está livre e os idiomas **físicos** das
 * cópias (regra 7: agrupa pelo `carta_id`, atravessando idiomas de catálogo e
 * físicos, mas o idioma de cada cópia continua escrito — é o que importa numa
 * troca). Abrir uma carta abre o detalhe do pacote 1b em modo cópia, onde se
 * edita, aloca ou apaga; cada escrita relê a página.
 *
 * O filtro e a página moram na URL (`soLivres=true`, `pagina=N`): sobrevivem a
 * recarregar e a voltar. Trocar o filtro é uma navegação, não um estado local.
 */

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { hrefRepetidas } from "@/lib/dominio/repetidas-v2";

import { Botao, BotaoLink } from "../../../_componentes/primitivos/botao";
import { Painel } from "../../../_componentes/primitivos/painel";
import { Segmentado } from "../../../_componentes/primitivos/segmentado";
import { CartaQueAbre, useDetalheDeCopia } from "../../visao-geral/_componentes/detalhe-de-copia";

import estilos from "./repetidas.module.css";

export interface RepetidaDaTela {
  cartaId: string;
  /** `null` se a leitura das cópias não trouxe nenhuma: o cartão aparece, sem abrir. */
  copiaId: string | null;
  nome: string;
  localId: string;
  setNome: string;
  /** Texto já rotulado, e a raridade crua (que o brilho da Carta lê). */
  raridade: string;
  raridadeCrua: string | null;
  imagemUrl: string | null;
  imagemOrigem: Parameters<typeof CartaQueAbre>[0]["imagemOrigem"];
  total: number;
  alocadas: number;
  livres: number;
  idiomas: { idioma: string; quantidade: number; livres: number }[];
}

export function ListaRepetidas({
  itens,
  total,
  soLivres,
  pagina,
  totalPaginas,
}: {
  itens: readonly RepetidaDaTela[];
  total: number;
  soLivres: boolean;
  pagina: number;
  totalPaginas: number;
}) {
  const t = useTranslations("v2Repetidas");
  const router = useRouter();
  const [trocando, iniciar] = useTransition();
  const { abrir, detalhe, abertaCopiaId, alvoCopiaId } = useDetalheDeCopia();

  function irPara(estado: { soLivres: boolean; pagina: number }) {
    iniciar(() => router.push(hrefRepetidas(estado)));
  }

  return (
    <div className={estilos.pagina} aria-busy={trocando || undefined}>
      <header className={estilos.cabecalho}>
        <div>
          <h1 className={estilos.titulo}>{t("titulo")}</h1>
          <p className={estilos.subtitulo}>
            {t("descricao", { total })}
          </p>
        </div>
        <div className={estilos.acoes}>
          <BotaoLink href="/inventario/visao-geral">{t("voltarVisaoGeral")}</BotaoLink>
          <BotaoLink href="/inventario">{t("abrirInventario")}</BotaoLink>
        </div>
      </header>

      <Segmentado
        rotulo={t("filtro.rotulo")}
        valor={soLivres ? "livres" : "todas"}
        aoMudar={(v) => irPara({ soLivres: v === "livres", pagina: 1 })}
        opcoes={[
          { valor: "todas", rotulo: t("filtro.todas") },
          { valor: "livres", rotulo: t("filtro.soLivres") },
        ]}
      />

      {itens.length === 0 ? (
        <Painel className={estilos.estado}>
          <p className={estilos.estadoTexto}>{soLivres ? t("vazioSoLivres") : t("vazio")}</p>
          {soLivres && <Botao onClick={() => irPara({ soLivres: false, pagina: 1 })}>{t("mostrarTodas")}</Botao>}
        </Painel>
      ) : (
        <ul className={estilos.grade}>
          {itens.map((c) => {
            const pedido = c.copiaId
              ? {
                  cartaId: c.cartaId,
                  copiaId: c.copiaId,
                  previa: { nome: c.nome, imagemUrl: c.imagemUrl, imagemOrigem: c.imagemOrigem, raridade: c.raridadeCrua },
                }
              : null;
            const aoAbrir = pedido ? () => abrir(pedido) : undefined;
            return (
              <li key={c.cartaId} className={`v2-painel ${estilos.cartao}`}>
                <div className={estilos.miniatura}>
                  {c.copiaId && aoAbrir ? (
                    <CartaQueAbre
                      copiaId={c.copiaId}
                      nome={c.nome}
                      imagemUrl={c.imagemUrl}
                      imagemOrigem={c.imagemOrigem}
                      raridade={c.raridadeCrua}
                      rotulo={t("abrirCarta", { nome: c.nome })}
                      aberta={abertaCopiaId === c.copiaId}
                      noParAtivo={alvoCopiaId === c.copiaId}
                      aoAbrir={aoAbrir}
                      soPonteiro
                    />
                  ) : (
                    <span className={estilos.semAbrir} aria-hidden />
                  )}
                </div>
                <div className={estilos.corpo}>
                  <h2 className={estilos.nome}>
                    {c.nome} <span className={`${estilos.numero} v2-num`}>#{c.localId}</span>
                  </h2>
                  <p className={estilos.sub}>
                    {c.setNome} · {c.raridade}
                  </p>
                  <dl className={estilos.numeros}>
                    <div>
                      <dt>{t("total")}</dt>
                      <dd className="v2-num">{c.total}</dd>
                    </div>
                    <div>
                      <dt>{t("alocadas")}</dt>
                      <dd className="v2-num">{c.alocadas}</dd>
                    </div>
                    <div className={c.livres > 0 ? estilos.livres : undefined}>
                      <dt>{t("livres")}</dt>
                      <dd className="v2-num">{c.livres}</dd>
                    </div>
                  </dl>
                  <ul className={estilos.idiomas} aria-label={t("idiomasFisicos")}>
                    {c.idiomas.map((i) => (
                      <li
                        key={i.idioma}
                        className={`${estilos.idioma} ${i.livres > 0 ? estilos.idiomaLivre : ""} v2-num`}
                      >
                        {t("idiomaChip", { idioma: i.idioma, livres: i.livres, quantidade: i.quantidade })}
                      </li>
                    ))}
                  </ul>
                  {aoAbrir && (
                    <Botao pequeno onClick={aoAbrir} className={estilos.abrir}>
                      {t("abrir")}
                    </Botao>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <nav className={estilos.paginacao} aria-label={t("paginacaoRotulo")}>
        {pagina > 1 ? (
          <BotaoLink href={hrefRepetidas({ soLivres, pagina: pagina - 1 })}>{t("anterior")}</BotaoLink>
        ) : (
          <Botao disabled>{t("anterior")}</Botao>
        )}
        <span className="v2-num">{t("paginacao", { pagina, totalPaginas })}</span>
        {pagina < totalPaginas ? (
          <BotaoLink href={hrefRepetidas({ soLivres, pagina: pagina + 1 })}>{t("proxima")}</BotaoLink>
        ) : (
          <Botao disabled>{t("proxima")}</Botao>
        )}
      </nav>

      {detalhe}
    </div>
  );
}
