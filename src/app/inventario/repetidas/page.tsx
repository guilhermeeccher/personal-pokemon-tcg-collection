"use client";

/**
 * Item 2 — Repetidas / o que sobra para troca.
 *
 * Definição fechada (não reinterpretar): para cada carta (agrupada por
 * `carta_id` ATRAVÉS dos idiomas de catálogo — a mesma regra já usada
 * pela alocação e pelo aviso de repetida no cadastro), `total` = soma de
 * `quantidade` de todas as cópias; `alocadas` = quantas unidades ocupam
 * vaga; `livres` = `total - alocadas`. É repetida quem tem `total >= 2`.
 * Ordenada por `livres` decrescente (servidor); filtro opcional para só
 * quem tem `livres >= 1`.
 *
 * O idioma FÍSICO de cada cópia é informação relevante para a troca —
 * mostrado por carta, mesmo agrupando pelo `carta_id` comum.
 */

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { Botao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { MarcaRaridade } from "@/app/_componentes/ds/marca-raridade";
import { Distintivo } from "@/app/_componentes/distintivo";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import {
  classesCabecalhoEmpilhado,
  classesCelulaCabecalho,
  classesCelulaEmpilhada,
  classesLinha,
  classesLinhaCabecalho,
  classesTabelaEmpilhada,
  Tabela,
} from "@/app/_componentes/tabela";
import { ImagemCartaComZoom } from "@/app/_componentes/imagem-carta-zoom";
import type { CartaRepetidaDTO } from "@/lib/dominio/tipos-cliente";

const TAMANHO_PAGINA = 50;

/* ------------------------------------------------------------------------
   Linha de repetida no celular (só abaixo de 768px)

   A mesma `<tr>` vira um cartão: à esquerda, a miniatura (calha de 44px, a
   largura da área de toque do zoom); à direita, nome, set, raridade, os três
   números (total, alocadas, livres) e os idiomas físicos.

   Flex com quebra, e não a grade de `classesLinhaEmpilhada`: os três números
   são três células e na grade cada uma ocuparia uma trilha — virariam três
   linhas de um número só, e 50 cartas por página ficariam compridas demais.
   Lado a lado, com o rótulo da coluna na frente (o cabeçalho some no
   celular), leem-se de uma vez. A calha é `absolute` para o texto começar no
   topo, ao lado da miniatura, e não embaixo dela. `min-h` garante que um
   cartão curto ainda contém a miniatura de 44px mais o respiro de cima e de
   baixo.
   ------------------------------------------------------------------------ */
const classesLinhaCartao =
  "max-md:relative max-md:flex max-md:min-h-[4.75rem] max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-1.5 max-md:p-3 max-md:pl-[4.75rem]";

/** Rótulo da coluna que o cabeçalho escondido deixou de mostrar; só no celular. */
const classesRotuloCampo = "font-sans text-xs text-muted md:hidden";

export default function RepetidasPage() {
  const t = useTranslations("repetidas");
  const [itens, setItens] = useState<CartaRepetidaDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [soLivres, setSoLivres] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    if (soLivres) params.set("soLivres", "true");
    params.set("pagina", String(pagina));
    params.set("tamanhoPagina", String(TAMANHO_PAGINA));
    fetch(`/api/inventario/repetidas?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setItens(d.itens ?? []);
        setTotal(d.total ?? 0);
        setErro(null);
      })
      .catch(() => setErro(t("erroCarregar")))
      .finally(() => setCarregando(false));
  }, [soLivres, pagina, t]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function alternarSoLivres(valor: boolean) {
    setCarregando(true);
    setSoLivres(valor);
    setPagina(1);
  }

  function irParaPagina(nova: number) {
    setCarregando(true);
    setPagina(nova);
  }

  const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-8 md:h-full">
      <CabecalhoPagina
        titulo={t("titulo")}
        descricao={t("descricao", { total })}
      />

      {/* No celular o `label` inteiro é a área de toque (44 de altura, largura
          toda); a caixa continua a mesma. */}
      <label className="flex w-fit items-center gap-2 text-sm max-md:min-h-11 max-md:w-full">
        <input type="checkbox" checked={soLivres} onChange={(e) => alternarSoLivres(e.target.checked)} />
        {t("soLivres")}
      </label>

      {erro && <p className="text-sm text-danger">{erro}</p>}
      {carregando && <p className="text-sm text-muted">{t("carregando")}</p>}

      <Tabela rolagemPropria className={classesTabelaEmpilhada}>
        <thead className={classesCabecalhoEmpilhado}>
          <tr className={classesLinhaCabecalho}>
            <th className={classesCelulaCabecalho}></th>
            <th className={classesCelulaCabecalho}>{t("colunaCarta")}</th>
            <th className={classesCelulaCabecalho}>{t("colunaSet")}</th>
            <th className={classesCelulaCabecalho}>{t("colunaRaridade")}</th>
            <th className={classesCelulaCabecalho}>{t("colunaTotal")}</th>
            <th className={classesCelulaCabecalho}>{t("colunaAlocadas")}</th>
            <th className={classesCelulaCabecalho}>{t("colunaLivres")}</th>
            <th className={classesCelulaCabecalho}>{t("colunaIdiomas")}</th>
          </tr>
        </thead>
        <tbody className={classesTabelaEmpilhada}>
          {itens.map((c) => (
            <tr key={c.cartaId} className={`${classesLinha} ${classesLinhaCartao}`}>
              <td className="p-2 max-md:absolute max-md:top-3 max-md:left-3 max-md:flex max-md:w-11 max-md:justify-center max-md:p-0">
                <ImagemCartaComZoom
                  imagemUrl={c.imagemUrl}
                  origem={c.imagemOrigem}
                  alt={c.cartaNome}
                  width={32}
                  height={44}
                  className="rounded-tcg"
                />
              </td>
              <td className={`p-2 ${classesCelulaEmpilhada} max-md:basis-full`}>
                {c.cartaNome} <span className="text-muted">#{c.cartaLocalId}</span>
              </td>
              <td className={`p-2 text-muted ${classesCelulaEmpilhada} max-md:basis-full max-md:text-xs`}>
                {c.setNome}
              </td>
              <td className={`p-2 ${classesCelulaEmpilhada} max-md:basis-full`}>
                <MarcaRaridade raridade={c.raridade} />
              </td>
              {/* Os três números correm numa linha só; o rótulo da coluna
                  entra na frente de cada um, só no celular. */}
              <td className={`p-2 font-mono tabular-nums ${classesCelulaEmpilhada}`}>
                <span className={classesRotuloCampo}>{t("colunaTotal")} </span>
                {c.total}
              </td>
              <td className={`p-2 font-mono tabular-nums text-muted ${classesCelulaEmpilhada}`}>
                <span className={classesRotuloCampo}>{t("colunaAlocadas")} </span>
                {c.alocadas}
              </td>
              <td className={`p-2 font-mono font-semibold tabular-nums ${classesCelulaEmpilhada}`}>
                <span className={`${classesRotuloCampo} font-normal`}>{t("colunaLivres")} </span>
                {c.livres}
              </td>
              <td className={`p-2 ${classesCelulaEmpilhada} max-md:basis-full`}>
                <div className="flex flex-wrap gap-1 max-md:gap-1.5">
                  {c.idiomas.map((i) => (
                    <Distintivo
                      key={i.idioma}
                      tom={i.livres > 0 ? "sucesso" : "neutro"}
                      title={t("idiomaTitulo", {
                        quantidade: i.quantidade,
                        idioma: i.idioma,
                        livres: i.livres,
                      })}
                    >
                      {t("idiomaChip", {
                        idioma: i.idioma,
                        livres: i.livres,
                        quantidade: i.quantidade,
                      })}
                    </Distintivo>
                  ))}
                </div>
              </td>
            </tr>
          ))}
          {itens.length === 0 && !carregando && (
            <tr className="max-md:block">
              <td colSpan={8} className="p-4 max-md:block">
                <EstadoVazio>
                  {soLivres ? t("vazioSoLivres") : t("vazio")}
                </EstadoVazio>
              </td>
            </tr>
          )}
        </tbody>
      </Tabela>

      <div className="flex items-center justify-between text-sm max-md:gap-2">
        <Botao variante="secundario" disabled={pagina <= 1} onClick={() => irParaPagina(pagina - 1)}>
          {t("anterior")}
        </Botao>
        <span className="max-md:text-center">{t("paginacao", { pagina, totalPaginas })}</span>
        <Botao variante="secundario" disabled={pagina >= totalPaginas} onClick={() => irParaPagina(pagina + 1)}>
          {t("proxima")}
        </Botao>
      </div>
    </main>
  );
}
