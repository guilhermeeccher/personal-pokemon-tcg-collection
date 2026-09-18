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

import { useCallback, useEffect, useState } from "react";

import { Botao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { MarcaRaridade } from "@/app/_componentes/ds/marca-raridade";
import { Distintivo } from "@/app/_componentes/distintivo";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { classesCelulaCabecalho, classesLinha, classesLinhaCabecalho, Tabela } from "@/app/_componentes/tabela";
import { ImagemCartaComZoom } from "@/app/_componentes/imagem-carta-zoom";
import type { CartaRepetidaDTO } from "@/lib/dominio/tipos-cliente";

const TAMANHO_PAGINA = 50;

export default function RepetidasPage() {
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
      .catch(() => setErro("Falha ao carregar as repetidas."))
      .finally(() => setCarregando(false));
  }, [soLivres, pagina]);

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
        titulo="Repetidas"
        descricao={`${total} carta(s) com 2 ou mais unidades. Ordenado por unidades livres, decrescente.`}
      />

      <label className="flex w-fit items-center gap-2 text-sm">
        <input type="checkbox" checked={soLivres} onChange={(e) => alternarSoLivres(e.target.checked)} />
        Só com unidades livres (o que dá para trocar)
      </label>

      {erro && <p className="text-sm text-danger">{erro}</p>}
      {carregando && <p className="text-sm text-muted">Carregando…</p>}

      <Tabela rolagemPropria>
        <thead>
          <tr className={classesLinhaCabecalho}>
            <th className={classesCelulaCabecalho}></th>
            <th className={classesCelulaCabecalho}>Carta</th>
            <th className={classesCelulaCabecalho}>Set</th>
            <th className={classesCelulaCabecalho}>Raridade</th>
            <th className={classesCelulaCabecalho}>Total</th>
            <th className={classesCelulaCabecalho}>Alocadas</th>
            <th className={classesCelulaCabecalho}>Livres</th>
            <th className={classesCelulaCabecalho}>Idiomas (físico)</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((c) => (
            <tr key={c.cartaId} className={classesLinha}>
              <td className="p-2">
                <ImagemCartaComZoom
                  imagemUrl={c.imagemUrl}
                  origem={c.imagemOrigem}
                  alt={c.cartaNome}
                  width={32}
                  height={44}
                  className="rounded-tcg"
                />
              </td>
              <td className="p-2">
                {c.cartaNome} <span className="text-muted">#{c.cartaLocalId}</span>
              </td>
              <td className="p-2 text-muted">{c.setNome}</td>
              <td className="p-2">
                <MarcaRaridade raridade={c.raridade} />
              </td>
              <td className="p-2 font-mono tabular-nums">{c.total}</td>
              <td className="p-2 font-mono tabular-nums text-muted">{c.alocadas}</td>
              <td className="p-2 font-mono font-semibold tabular-nums">{c.livres}</td>
              <td className="p-2">
                <div className="flex flex-wrap gap-1">
                  {c.idiomas.map((i) => (
                    <Distintivo
                      key={i.idioma}
                      tom={i.livres > 0 ? "sucesso" : "neutro"}
                      title={`${i.quantidade} unidade(s) em ${i.idioma}, ${i.livres} livre(s)`}
                    >
                      {i.idioma} · {i.livres}/{i.quantidade} livre(s)
                    </Distintivo>
                  ))}
                </div>
              </td>
            </tr>
          ))}
          {itens.length === 0 && !carregando && (
            <tr>
              <td colSpan={8} className="p-4">
                <EstadoVazio>
                  {soLivres
                    ? "Nenhuma carta repetida com unidades livres no momento."
                    : "Nenhuma carta repetida (2+ unidades) no inventário."}
                </EstadoVazio>
              </td>
            </tr>
          )}
        </tbody>
      </Tabela>

      <div className="flex items-center justify-between text-sm">
        <Botao variante="secundario" disabled={pagina <= 1} onClick={() => irParaPagina(pagina - 1)}>
          Anterior
        </Botao>
        <span>
          Página {pagina} de {totalPaginas}
        </span>
        <Botao variante="secundario" disabled={pagina >= totalPaginas} onClick={() => irParaPagina(pagina + 1)}>
          Próxima
        </Botao>
      </div>
    </main>
  );
}
