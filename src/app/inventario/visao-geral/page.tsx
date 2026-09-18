"use client";

/**
 * Item 1 — Visão geral do inventário. Responde "quanto eu tenho e como
 * está distribuído" de relance: totais, distribuições (expansão,
 * raridade, idioma, condição, variante) e progresso consolidado das
 * coleções — tudo vindo já agregado de `GET /api/inventario/resumo`
 * (`lib/db/consultas.ts` faz a soma em SQL; aqui só formata % para
 * exibição, sobre um array já pequeno — nunca soma cópia por cópia).
 *
 * Cada linha de distribuição e os totais "Alocadas"/"Livres" linkam para
 * `/inventario` com a MESMA querystring que a tela de inventário já lê
 * (filtros existentes, nenhum sistema de filtro novo).
 */

import Link from "next/link";
import { useEffect, useState } from "react";

import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { BarraProgresso } from "@/app/_componentes/ds/barra-progresso";
import { BlocoContagem } from "@/app/_componentes/ds/bloco-contagem";
import { corCondicao } from "@/app/_componentes/ds/chip-condicao";
import { corVariante } from "@/app/_componentes/ds/chip-variante";
import { formatarPercentual, LinhaDistribuicao } from "@/app/_componentes/ds/linha-distribuicao";
import { corRaridade, MarcaRaridade } from "@/app/_componentes/ds/marca-raridade";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { Painel } from "@/app/_componentes/painel";
import type {
  DistribuicaoCondicaoDTO,
  DistribuicaoExpansaoDTO,
  DistribuicaoIdiomaDTO,
  DistribuicaoRaridadeDTO,
  DistribuicaoVarianteDTO,
  ResumoInventarioDTO,
} from "@/lib/dominio/tipos-cliente";

const ROTULO_TIPO_COLECAO: Record<string, string> = {
  pokedex: "Pokédex",
  set: "Set",
  customizada: "Customizada",
};

export default function VisaoGeralPage() {
  const [dados, setDados] = useState<ResumoInventarioDTO | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/inventario/resumo")
      .then((r) => r.json())
      .then((d: ResumoInventarioDTO) => setDados(d))
      .catch(() => setErro("Falha ao carregar a visão geral."))
      .finally(() => setCarregando(false));
  }, []);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-8">
      <CabecalhoPagina
        titulo="Visão geral"
        descricao="Quanto você tem e como está distribuído. Clique em qualquer recorte para abrir o inventário já filtrado."
      />

      {erro && <p className="text-sm text-danger">{erro}</p>}
      {carregando && <p className="text-sm text-muted">Carregando…</p>}

      {dados && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* As quatro contagens em quatro cores do sistema — a mesma
                leitura de relance que o design system propõe. */}
            <BlocoContagem
              rotulo="Cartas distintas"
              valor={dados.totais.cartasDistintas}
              tom="var(--berry-4)"
              href="/inventario"
            />
            <BlocoContagem
              rotulo="Unidades totais"
              valor={dados.totais.totalUnidades}
              tom="var(--sky-4)"
              href="/inventario"
            />
            <BlocoContagem
              rotulo="Alocadas"
              valor={dados.totais.unidadesAlocadas}
              tom="var(--grape-2)"
              href="/inventario?alocacao=alocada"
            />
            <BlocoContagem
              rotulo="Livres"
              valor={dados.totais.unidadesLivres}
              tom="var(--leaf-4)"
              href="/inventario?alocacao=livre"
            />
          </div>

          <Painel as="section" className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[length:var(--fs-title-2)] text-strong">Progresso das coleções</h2>
              <Link href="/colecoes" className="text-sm text-accent hover:underline">
                Ver todas →
              </Link>
            </div>
            <ul className="flex flex-col divide-y divide-hairline">
              {dados.colecoes.map((c) => {
                const customizada = c.tipo === "customizada";
                return (
                  <li key={c.id}>
                    <Link
                      href={`/colecoes/${c.id}`}
                      className="flex flex-col gap-1.5 py-2.5 hover:bg-surface-hover"
                    >
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span>
                          {c.nome}{" "}
                          <span className="text-muted">({ROTULO_TIPO_COLECAO[c.tipo] ?? c.tipo})</span>
                        </span>
                        {/* Coleção customizada não tem total: ela não é
                            "quanto falta fechar", é uma seleção a dedo. Sem
                            denominador não há percentual a mostrar. */}
                        <span className="shrink-0 font-mono tabular-nums whitespace-nowrap text-muted">
                          {customizada
                            ? `${c.vagasPreenchidas} carta(s)`
                            : `${c.vagasPreenchidas}/${c.totalVagas} · ${formatarPercentual(
                                c.totalVagas > 0 ? (c.vagasPreenchidas / c.totalVagas) * 100 : 0,
                              )}`}
                        </span>
                      </div>
                      {!customizada && (
                        <BarraProgresso valor={c.vagasPreenchidas} maximo={c.totalVagas} />
                      )}
                    </Link>
                  </li>
                );
              })}
              {dados.colecoes.length === 0 && <EstadoVazio as="li" className="py-6">Nenhuma coleção ainda.</EstadoVazio>}
            </ul>
          </Painel>

          <div className="grid gap-4 lg:grid-cols-2">
            <SecaoExpansao itens={dados.distribuicoes.porExpansao} totalUnidades={dados.totais.totalUnidades} />
            <SecaoRaridade itens={dados.distribuicoes.porRaridade} totalUnidades={dados.totais.totalUnidades} />
            <SecaoIdioma itens={dados.distribuicoes.porIdioma} totalUnidades={dados.totais.totalUnidades} />
            <SecaoCondicao itens={dados.distribuicoes.porCondicao} totalUnidades={dados.totais.totalUnidades} />
            <SecaoVariante itens={dados.distribuicoes.porVariante} totalUnidades={dados.totais.totalUnidades} />
          </div>

          <Painel as={Link} href="/inventario/repetidas" className="transition-colors hover:border-accent/40">
            <h2 className="text-[length:var(--fs-title-2)] text-strong">Repetidas</h2>
            <p className="mt-1 text-sm text-muted">O que sobra para troca — total, alocadas e livres por carta →</p>
          </Painel>
        </>
      )}
    </main>
  );
}

function CartaoSecao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Painel as="section" className="flex flex-col gap-1">
      <h2 className="mb-1 text-[length:var(--fs-title-2)] text-strong">{titulo}</h2>
      {children}
    </Painel>
  );
}

function SecaoExpansao({ itens, totalUnidades }: { itens: DistribuicaoExpansaoDTO[]; totalUnidades: number }) {
  return (
    <CartaoSecao titulo="Por expansão">
      {itens.map((i) => (
        <LinhaDistribuicao
          key={i.setId}
          rotulo={i.setNome}
          contagem={i.unidades}
          total={totalUnidades}
          href={`/inventario?set=${encodeURIComponent(i.setId)}`}
        />
      ))}
      {itens.length === 0 && <EstadoVazio className="text-left">Nenhuma cópia cadastrada ainda.</EstadoVazio>}
    </CartaoSecao>
  );
}

function SecaoRaridade({ itens, totalUnidades }: { itens: DistribuicaoRaridadeDTO[]; totalUnidades: number }) {
  return (
    <CartaoSecao titulo="Por raridade">
      {itens.map((i) => (
        <LinhaDistribuicao
          key={i.raridade ?? "sem-raridade"}
          rotulo={<MarcaRaridade raridade={i.raridade} />}
          contagem={i.unidades}
          total={totalUnidades}
          cor={corRaridade(i.raridade)}
          href={i.raridade ? `/inventario?raridade=${encodeURIComponent(i.raridade)}` : undefined}
        />
      ))}
      {itens.length === 0 && <EstadoVazio className="text-left">Nenhuma cópia cadastrada ainda.</EstadoVazio>}
    </CartaoSecao>
  );
}

function SecaoIdioma({ itens, totalUnidades }: { itens: DistribuicaoIdiomaDTO[]; totalUnidades: number }) {
  return (
    <CartaoSecao titulo="Por idioma (físico)">
      {itens.map((i) => (
        <LinhaDistribuicao
          key={i.idioma}
          rotulo={i.idioma}
          contagem={i.unidades}
          total={totalUnidades}
          cor="var(--caramel-3)"
          href={`/inventario?idioma=${i.idioma}`}
        />
      ))}
      {itens.length === 0 && <EstadoVazio className="text-left">Nenhuma cópia cadastrada ainda.</EstadoVazio>}
    </CartaoSecao>
  );
}

function SecaoCondicao({ itens, totalUnidades }: { itens: DistribuicaoCondicaoDTO[]; totalUnidades: number }) {
  return (
    <CartaoSecao titulo="Por condição">
      {itens.map((i) => (
        <LinhaDistribuicao
          key={i.condicao}
          rotulo={i.condicao}
          contagem={i.unidades}
          total={totalUnidades}
          cor={corCondicao(i.condicao)}
          href={`/inventario?condicao=${i.condicao}`}
        />
      ))}
      {itens.length === 0 && <EstadoVazio className="text-left">Nenhuma cópia cadastrada ainda.</EstadoVazio>}
    </CartaoSecao>
  );
}

function SecaoVariante({ itens, totalUnidades }: { itens: DistribuicaoVarianteDTO[]; totalUnidades: number }) {
  return (
    <CartaoSecao titulo="Por variante">
      {itens.map((i) => (
        <LinhaDistribuicao
          key={i.variante}
          rotulo={i.variante}
          contagem={i.unidades}
          total={totalUnidades}
          cor={corVariante(i.variante)}
          href={`/inventario?variante=${i.variante}`}
        />
      ))}
      {itens.length === 0 && <EstadoVazio className="text-left">Nenhuma cópia cadastrada ainda.</EstadoVazio>}
    </CartaoSecao>
  );
}
