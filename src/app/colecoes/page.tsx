"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { classesBotao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Distintivo } from "@/app/_componentes/distintivo";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import type { ColecaoListaDTO } from "@/lib/dominio/tipos-cliente";

const ROTULO_TIPO: Record<string, string> = {
  pokedex: "Pokédex",
  set: "Set",
  customizada: "Customizada",
};

interface ContagemElegiveis {
  prontas: number;
  foraDePadrao: number;
}

export default function ColecoesPage() {
  const [itens, setItens] = useState<ColecaoListaDTO[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [elegiveis, setElegiveis] = useState<ContagemElegiveis | null>(null);

  const carregar = useCallback(() => {
    fetch("/api/colecoes")
      .then((r) => r.json())
      .then((d) => setItens(d.itens ?? []))
      .catch(() => setErro("Falha ao carregar as coleções."))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Item 3: "você tem cartas que preenchem vagas vazias" — só conta e
  // avisa, com link para agir (regra 5 do AGENTS.md: o sistema nunca
  // aloca sozinho). Falha aqui não deve travar a tela de coleções.
  useEffect(() => {
    fetch("/api/copias/elegiveis-vagas-vazias")
      .then((r) => r.json())
      .then((d) => setElegiveis(d))
      .catch(() => {});
  }, []);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-8">
      <CabecalhoPagina
        titulo="Coleções"
        descricao={`${itens.length} coleção(ões).`}
        acoes={
          <>
            <Link href="/colecoes/falta" className={classesBotao("secundario")}>
              O que falta
            </Link>
            <Link href="/colecoes/nova" className={classesBotao("primario")}>
              Nova coleção
            </Link>
          </>
        }
      />

      {elegiveis && (elegiveis.prontas > 0 || elegiveis.foraDePadrao > 0) && (
        <Link
          href="/colecoes/falta"
          className="rounded border border-success/30 bg-success-soft p-3 text-sm text-success-fg hover:bg-success/10"
        >
          {elegiveis.prontas > 0 && (
            <>
              Você tem <strong>{elegiveis.prontas}</strong> cópia(s) livre(s) no inventário que
              preenchem vaga(s) vazia(s) de alguma coleção.{" "}
            </>
          )}
          {elegiveis.foraDePadrao > 0 && (
            <>
              Mais <strong>{elegiveis.foraDePadrao}</strong> cópia(s) elegível(is) só fora do
              idioma exigido (precisam de confirmação explícita).{" "}
            </>
          )}
          Ver o que falta →
        </Link>
      )}

      {erro && <p className="text-sm text-danger">{erro}</p>}
      {carregando && <p className="text-sm text-muted">Carregando…</p>}

      <ul className="flex flex-col divide-y divide-hairline">
        {itens.map((c) => {
          const customizada = c.tipo === "customizada";
          return (
            <li key={c.id}>
              <Link
                href={`/colecoes/${c.id}`}
                className="flex items-center justify-between gap-3 py-3 hover:bg-surface-hover"
              >
                <div>
                  <div className="font-medium">{c.nome}</div>
                  <div className="text-sm text-muted">
                    {ROTULO_TIPO[c.tipo] ?? c.tipo}
                    {c.idiomaExigido ? ` · idioma exigido: ${c.idiomaExigido}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {c.avisoCatalogoIncompleto && <Distintivo tom="aviso">catálogo incompleto</Distintivo>}
                  {c.avisoSemNumeracaoOficial && <Distintivo tom="aviso">sem numeração oficial</Distintivo>}
                  <span className="tabular-nums text-muted">
                    {customizada ? `${c.vagasPreenchidas} carta(s)` : `${c.vagasPreenchidas}/${c.totalVagas}`}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
        {itens.length === 0 && !carregando && (
          <EstadoVazio as="li" className="py-6">
            Nenhuma coleção ainda.
          </EstadoVazio>
        )}
      </ul>
    </main>
  );
}
