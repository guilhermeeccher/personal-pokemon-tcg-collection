"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Distintivo } from "@/app/_componentes/distintivo";
import { ImagemVagaVazia } from "@/app/_componentes/imagem-vaga-vazia";
import { Painel } from "@/app/_componentes/painel";
import { rotuloAlocacao } from "@/lib/dominio/alocacao-disponivel";
import type { OrigemImagem } from "@/lib/dominio/origem-imagem";
import type { ColecaoComVagasDTO, ColecaoListaDTO } from "@/lib/dominio/tipos-cliente";

interface ItemFalta {
  chave: string;
  nome: string | null;
  /** Só populada para coleção `set` (carta esperada) — ver `ImagemVagaVazia`. */
  imagemUrl: string | null;
  imagemOrigem: OrigemImagem | null;
  /**
   * Cópias livres do inventário que já cabem nesta vaga. Vem pronta do
   * `GET /api/colecoes/:id` (a mesma contagem que habilita o botão
   * "Alocar" na tela da coleção) — nada é recalculado aqui.
   */
  candidatosDisponiveis: number;
}

interface GrupoFalta {
  colecao: ColecaoListaDTO;
  itens: ItemFalta[];
}

/**
 * Visão consolidada de "o que falta" (spec §5 Fase 2, item 4; AGENTS.md
 * regra 6) — todas as coleções tipo pokedex/set com vaga vazia, cada uma
 * com sua lista. A visão POR coleção (a mesma informação, isolada) vive
 * na própria tela da coleção, atrás do filtro "Mostrar só vagas vazias".
 * Usa o MESMO critério de imagem por tipo que a tela da coleção
 * (`ImagemVagaVazia`, decisão de 2026-08-25) — nunca diverge
 * entre as duas telas: carta esperada esmaecida em coleção `set`,
 * sprite do Pokémon em `pokedex`.
 *
 * Reaproveita `GET /api/colecoes` (lista + progresso) e
 * `GET /api/colecoes/:id` (vagas já com nome/imagem resolvidos, Parte 1
 * desta tarefa) — sem endpoint novo.
 *
 * **Desde 2026-09-05 a tela também diz o que dá para alocar AGORA**
 * (pedido de uso): a vaga cuja espécie/carta já existe livre no inventário
 * vem marcada, a contagem aparece no cabeçalho de cada coleção e o filtro
 * isola só essas. Antes disso, descobrir isso exigia entrar em cada
 * coleção e varrer a grade atrás de botão "Alocar" habilitado. A ação de
 * alocar continua na tela da coleção, por decisão — aqui é leitura. `customizada` nunca tem vaga vazia
 * (nasce preenchida, spec §3.3) e por isso não entra aqui.
 */
export default function OQueFaltaPage() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [grupos, setGrupos] = useState<GrupoFalta[]>([]);
  const [somenteAlocaveis, setSomenteAlocaveis] = useState(false);

  useEffect(() => {
    async function carregar() {
      try {
        const respLista = await fetch("/api/colecoes");
        const dadosLista = await respLista.json();
        const todas: ColecaoListaDTO[] = dadosLista.itens ?? [];
        const pendentes = todas.filter(
          (c) => c.tipo !== "customizada" && c.vagasPreenchidas < c.totalVagas,
        );

        const detalhes = await Promise.all(
          pendentes.map((c) =>
            fetch(`/api/colecoes/${c.id}`).then((r) => r.json() as Promise<ColecaoComVagasDTO>),
          ),
        );

        setGrupos(
          pendentes.map((c, i) => ({
            colecao: c,
            itens: detalhes[i].vagas
              .filter((v) => v.copiaId === null)
              .map((v) => ({
                chave: v.chave,
                nome: v.cartaNome ?? v.nomeEspecie,
                imagemUrl: v.imagemUrl,
                imagemOrigem: v.imagemOrigem,
                candidatosDisponiveis: v.candidatosDisponiveis,
              })),
          })),
        );
      } catch {
        setErro("Falha ao carregar o que falta.");
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, []);

  const totalFaltando = grupos.reduce((soma, g) => soma + g.itens.length, 0);
  const totalAlocavel = grupos.reduce(
    (soma, g) => soma + g.itens.filter((i) => i.candidatosDisponiveis > 0).length,
    0,
  );

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-8">
      <Link href="/colecoes" className="text-sm text-accent hover:underline">
        ← Coleções
      </Link>
      <CabecalhoPagina
        titulo="O que falta"
        descricao={
          carregando
            ? "Carregando…"
            : `${totalFaltando} vaga(s) vazia(s) em ${grupos.length} coleção(ões).`
        }
      />

      {erro && <p className="text-sm text-danger">{erro}</p>}

      {/* Só aparece quando existe alguma: filtro que sempre dá zero é
          ruído fixo na tela. */}
      {totalAlocavel > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={somenteAlocaveis}
            onChange={(e) => setSomenteAlocaveis(e.target.checked)}
          />
          Mostrar só o que já posso alocar ({totalAlocavel}) — cópia sua livre serve na vaga
        </label>
      )}

      {!carregando && grupos.length === 0 && !erro && (
        <p className="text-sm text-muted">
          Nada falta — todas as coleções Pokédex e Set estão completas (ou nenhuma foi criada
          ainda).
        </p>
      )}

      {grupos.map(({ colecao, itens }) => {
        const alocaveis = itens.filter((i) => i.candidatosDisponiveis > 0).length;
        const exibidos = somenteAlocaveis
          ? itens.filter((i) => i.candidatosDisponiveis > 0)
          : itens;
        if (exibidos.length === 0) return null;
        return (
          <Painel key={colecao.id} padding="sm" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/colecoes/${colecao.id}`}
                className="text-[length:var(--fs-title-2)] text-strong hover:underline"
              >
                {colecao.nome}
              </Link>
              <span className="flex items-center gap-2">
                {alocaveis > 0 && (
                  <Distintivo tom="sucesso">{alocaveis} já dá para alocar</Distintivo>
                )}
                <span className="font-mono text-sm tabular-nums text-muted">
                  {itens.length} faltando
                </span>
              </span>
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 md:grid-cols-4">
              {exibidos.map((item) => {
                const alocavel = item.candidatosDisponiveis > 0;
                return (
                  <li
                    key={item.chave}
                    title={alocavel ? rotuloAlocacao(item.candidatosDisponiveis) : undefined}
                    /* A vaga com cópia disponível ganha moldura sólida e
                       cor de sucesso: na grade toda tracejada do "falta",
                       ela é a única que exige ação diferente de comprar. */
                    className={`flex items-center gap-2 rounded-slot p-1.5 ${
                      alocavel
                        ? "border-2 border-solid border-success-fg/40 bg-success-soft/30 text-foreground"
                        : "border-2 border-dashed border-line text-muted"
                    }`}
                  >
                    <ImagemVagaVazia
                      tipo={colecao.tipo}
                      imagemUrl={item.imagemUrl}
                      imagemOrigem={item.imagemOrigem}
                      chave={item.chave}
                      alt={item.nome ?? item.chave}
                    />
                    <span className="text-xs leading-tight">
                      <span className="font-mono">#{item.chave}</span>
                      {item.nome ? ` — ${item.nome}` : ""}
                      {alocavel && (
                        <span className="mt-0.5 block font-medium text-success-fg">
                          {item.candidatosDisponiveis} cópia(s) sua(s)
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Painel>
        );
      })}
    </main>
  );
}
