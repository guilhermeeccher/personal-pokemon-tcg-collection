"use client";

/**
 * Caixas do HOME — a Living Dex arrumada como as caixas do HOME: 30 vagas
 * por caixa (6 × 5), cada região começando numa caixa nova e as cosméticas
 * em caixas próprias no fim, uma sequência por trilha (`dex-caixas.ts`). Cada vaga mostra o estado na trilha e leva ao
 * cadastro, como na Pokédex. As seções se ligam na Pokédex; aqui só se lê.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { Painel } from "@/app/_componentes/painel";
import { COLUNAS_CAIXA, montarCaixasDex, VAGAS_POR_CAIXA } from "@/lib/dominio/dex-caixas";
import { estadoDaVaga, mapearEstadosDex, type EstadoVagaDex } from "@/lib/dominio/dex-estado";
import type { TrilhaDex } from "@/lib/dominio/dex-grade";
import type { SecoesContadas } from "@/lib/dominio/dex-secoes";
import { NOME_REGIAO, REGIOES } from "@/lib/dominio/escopo-pokedex";
import type { FormaDexDTO, RegistroDexDTO } from "@/lib/dominio/tipos-cliente";
import { urlSpriteDex } from "@/lib/imagens";

import { useCartaoPokemon } from "../_componentes/cartao-pokemon";
import { useRotuloForma } from "../_componentes/use-rotulo-forma";

const classesOpcao = (ativa: boolean) =>
  `rounded-pill border px-3 py-1 text-xs font-semibold [transition:var(--transition-control)] ${
    ativa ? "border-accent bg-accent text-accent-fg" : "border-line text-muted hover:bg-surface-hover"
  }`;

/* Mesma leitura de cor da Pokédex: no HOME, sucesso; no jogo, aviso; em falta, apagado. */
const MOLDURA: Record<EstadoVagaDex, string> = {
  falta: "border-hairline",
  no_jogo: "border-warning/70",
  no_home: "border-success/70 bg-success-soft",
};

const numero4 = (n: number) => String(n).padStart(4, "0");

export function CaixasHome({
  formas,
  secoes,
  registros,
}: {
  formas: FormaDexDTO[];
  secoes: SecoesContadas;
  registros: RegistroDexDTO[];
}) {
  const t = useTranslations("dex");
  const rotulo = useRotuloForma(formas);
  const { abrir, fechar, cartao } = useCartaoPokemon();
  const [trilha, setTrilha] = useState<TrilhaDex>("normal");

  const estados = useMemo(() => mapearEstadosDex(registros), [registros]);
  const caixas = useMemo(() => montarCaixasDex(formas, trilha, secoes), [formas, trilha, secoes]);
  const totalVagas = caixas.reduce((s, c) => s + c.vagas.length, 0);
  const primeiraCosmetica = caixas.find((c) => c.vista === "cosmeticas");

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-8">
      <CabecalhoPagina titulo={t("caixas.titulo")} />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("pokedex.trilha")}>
          {(["normal", "shiny"] as const).map((opcao) => (
            <button
              key={opcao}
              type="button"
              aria-pressed={trilha === opcao}
              onClick={() => setTrilha(opcao)}
              className={classesOpcao(trilha === opcao)}
            >
              {t(`trilha.${opcao}`)}
            </button>
          ))}
          <span className="text-xs text-muted sm:ml-auto">
            {t("caixas.contagem", { caixas: String(caixas.length), vagas: String(totalVagas) })}
          </span>
        </div>
        <nav className="flex flex-wrap items-center gap-1.5" aria-label={t("caixas.irPara")}>
          {REGIOES.map((regiao) => {
            const primeira = caixas.find((c) => c.regiao === regiao);
            return primeira ? (
              <a key={regiao} href={`#caixa-${primeira.numero}`} className={classesOpcao(false)}>
                {NOME_REGIAO[regiao]}
              </a>
            ) : null;
          })}
          {primeiraCosmetica && (
            <a href={`#caixa-${primeiraCosmetica.numero}`} className={classesOpcao(false)}>
              {t("vista.cosmeticas")}
            </a>
          )}
        </nav>
      </div>

      {caixas.length === 0 ? (
        <EstadoVazio>{t("caixas.vazio")}</EstadoVazio>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {caixas.map((caixa) => (
            <Painel key={caixa.numero} as="section" padding="sm" id={`caixa-${caixa.numero}`} className="scroll-mt-4">
              <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 px-1">
                <h2 className="text-sm font-semibold text-strong">
                  {t("caixas.caixaN", { numero: String(caixa.numero) })}
                  <span className="ml-2 font-normal text-muted">
                    {t("caixas.nomeCaixa", {
                      grupo: caixa.regiao ? NOME_REGIAO[caixa.regiao] : t("vista.cosmeticas"),
                      indice: String(caixa.indice),
                    })}
                  </span>
                </h2>
                <span className="font-mono text-xs tabular-nums text-muted">
                  {t("caixas.faixa", {
                    inicio: numero4(caixa.vagas[0].numero),
                    fim: numero4(caixa.vagas[caixa.vagas.length - 1].numero),
                  })}
                </span>
              </header>
              <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${COLUNAS_CAIXA}, minmax(0, 1fr))` }}>
                {caixa.vagas.map((f, i) => {
                  const estado = estadoDaVaga(estados, f.id, trilha);
                  const nome = rotulo.nome(f);
                  return (
                    <li key={f.id} className={`aspect-square rounded-md border ${MOLDURA[estado]}`}>
                      <Link
                        href={`/dex/cadastrar?busca=${f.numero}`}
                        aria-label={`${i + 1}. ${nome} — ${t(`estado.${estado}`)}`}
                        className="group flex h-full w-full items-center justify-center"
                        onMouseEnter={abrir({
                          sprite: f.sprite,
                          shiny: trilha === "shiny",
                          nome,
                          linhas: [
                            t(`estado.${estado}`),
                            t("pokedex.posicaoNaCaixa", { caixa: String(caixa.numero), posicao: String(i + 1) }),
                          ],
                        })}
                        onMouseLeave={fechar}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- sprite externo pequeno (PokeAPI, ~0,6 KB), 30 por caixa; mesma convenção da Pokédex. */}
                        <img
                          src={urlSpriteDex(f.sprite, trilha === "shiny")}
                          alt={nome}
                          width={56}
                          height={56}
                          loading="lazy"
                          className={`h-full w-full object-contain [transition:transform_200ms,filter_200ms,opacity_200ms] group-hover:scale-125 ${estado === "falta" ? "opacity-40 grayscale group-hover:opacity-100 group-hover:grayscale-0" : ""}`}
                          style={{ imageRendering: "pixelated" }}
                        />
                      </Link>
                    </li>
                  );
                })}
                {Array.from({ length: VAGAS_POR_CAIXA - caixa.vagas.length }, (_, i) => (
                  <li key={`vazia-${i}`} aria-hidden className="aspect-square rounded-md border border-dashed border-hairline" />
                ))}
              </ol>
            </Painel>
          ))}
        </div>
      )}
      {cartao}
    </main>
  );
}
