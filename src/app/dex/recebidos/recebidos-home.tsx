"use client";

/**
 * Recebidos — a rodada que chegou ao HOME, separada pela caixa onde cada
 * Pokémon vai (`dex-recebidos.ts`, D9). Cada caixa mostra a grade 6 × 5 com
 * as posições a preencher acesas e os vizinhos já guardados apagados, para
 * achar o lugar de olho; embaixo, a lista "posição · nome" para quem está
 * no celular, sem cartão de passar o mouse.
 *
 * "Guardei" tira a caixa da lista; "Guardei tudo" limpa a rodada, inclusive
 * o que não tem lugar (cópia extra, fora das caixas).
 */

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Alerta } from "@/app/_componentes/alerta";
import { Botao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Distintivo } from "@/app/_componentes/distintivo";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { Painel } from "@/app/_componentes/painel";
import { COLUNAS_CAIXA, VAGAS_POR_CAIXA } from "@/lib/dominio/dex-caixas";
import { montarRecebidos } from "@/lib/dominio/dex-recebidos";
import type { SecoesContadas } from "@/lib/dominio/dex-secoes";
import { NOME_REGIAO } from "@/lib/dominio/escopo-pokedex";
import type { FormaDexDTO, RegistroDexDTO } from "@/lib/dominio/tipos-cliente";
import { urlSpriteDex } from "@/lib/imagens";

import { useRotuloForma } from "../_componentes/use-rotulo-forma";

function Sprite({ forma, shiny, nome, className = "" }: { forma: FormaDexDTO; shiny: boolean; nome: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- sprite externo pequeno (PokeAPI, ~0,6 KB); mesma convenção das Caixas.
    <img
      src={urlSpriteDex(forma.sprite, shiny)}
      alt={nome}
      width={56}
      height={56}
      loading="lazy"
      className={`h-full w-full object-contain ${className}`}
      style={{ imageRendering: "pixelated" }}
    />
  );
}

export function RecebidosHome({
  formas,
  secoes,
  registros,
  caixasReservadas,
}: {
  formas: FormaDexDTO[];
  secoes: SecoesContadas;
  registros: RegistroDexDTO[];
  caixasReservadas: number;
}) {
  const t = useTranslations("dex");
  const router = useRouter();
  const rotulo = useRotuloForma(formas);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(false);

  const formaPorId = useMemo(() => new Map(formas.map((f) => [f.id, f])), [formas]);
  const recebidos = useMemo(
    () => montarRecebidos(formas, registros, secoes, caixasReservadas),
    [formas, registros, secoes, caixasReservadas],
  );

  async function guardar(ids: string[]) {
    setOcupado(true);
    setErro(false);
    try {
      const r = await fetch("/api/dex/registros/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!r.ok) setErro(true);
      else router.refresh();
    } catch {
      setErro(true);
    } finally {
      setOcupado(false);
    }
  }

  const total = recebidos.ids.length;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-8">
      <CabecalhoPagina titulo={t("recebidos.titulo")} />

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted">{t("recebidos.aGuardar", { quantidade: String(total) })}</span>
        {total > 0 && (
          <Botao variante="primario" tamanho="sm" className="ml-auto" disabled={ocupado} onClick={() => guardar(recebidos.ids)}>
            {t("recebidos.guardeiTudo")}
          </Botao>
        )}
      </div>
      {erro && <Alerta tom="perigo">{t("recebidos.erro")}</Alerta>}

      {total === 0 ? (
        <EstadoVazio>{t("recebidos.vazio")}</EstadoVazio>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {recebidos.caixas.map(({ trilha, caixa, itens, jaGuardadas }) => {
            const shiny = trilha === "shiny";
            const naPosicao = new Map(itens.map((i) => [i.posicao, i]));
            return (
              <Painel key={`${trilha}-${caixa.numero}`} as="section" padding="sm">
                <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
                  <h2 className="text-sm font-semibold text-strong">
                    {t("caixas.caixaN", { numero: String(caixa.numero) })}
                    <span className="ml-2 font-normal text-muted">
                      {t("caixas.nomeCaixa", {
                        grupo: caixa.regiao ? NOME_REGIAO[caixa.regiao] : t("vista.cosmeticas"),
                        indice: String(caixa.indice),
                      })}
                    </span>
                  </h2>
                  {shiny && <Distintivo tom="acento">{t("trilha.shiny")}</Distintivo>}
                  <span className="text-xs text-muted">{t("recebidos.nestaCaixa", { quantidade: String(itens.length) })}</span>
                  <Botao
                    tamanho="xs"
                    className="ml-auto"
                    disabled={ocupado}
                    onClick={() => guardar(itens.map((i) => i.registro.id))}
                  >
                    {t("recebidos.guardei")}
                  </Botao>
                </header>
                <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${COLUNAS_CAIXA}, minmax(0, 1fr))` }}>
                  {caixa.vagas.map((f, i) => {
                    const item = naPosicao.get(i + 1);
                    const nome = rotulo.nome(f);
                    if (item) {
                      return (
                        <li
                          key={f.id}
                          className="relative aspect-square rounded-md border-2 border-accent bg-accent-soft"
                          aria-label={`${i + 1}. ${nome}`}
                        >
                          <Sprite forma={f} shiny={shiny} nome={nome} />
                          <span className="absolute top-0.5 left-1 font-mono text-[10px] font-semibold text-accent">{i + 1}</span>
                        </li>
                      );
                    }
                    return (
                      <li key={f.id} aria-hidden className="aspect-square rounded-md border border-hairline">
                        {jaGuardadas.has(f.id) && <Sprite forma={f} shiny={shiny} nome="" className="opacity-35 grayscale" />}
                      </li>
                    );
                  })}
                  {Array.from({ length: VAGAS_POR_CAIXA - caixa.vagas.length }, (_, i) => (
                    <li key={`vazia-${i}`} aria-hidden className="aspect-square rounded-md border border-dashed border-hairline" />
                  ))}
                </ol>
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs">
                  {itens.map(({ registro, posicao }) => {
                    const f = formaPorId.get(registro.formaId);
                    return (
                      <li key={registro.id}>
                        <span className="font-mono font-semibold text-accent">{posicao}</span>{" "}
                        <span className="text-strong">{f ? rotulo.nome(f) : registro.formaId}</span>
                      </li>
                    );
                  })}
                </ul>
              </Painel>
            );
          })}

          {recebidos.semLugar.length > 0 && (
            <Painel as="section" padding="sm">
              <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
                <h2 className="text-sm font-semibold text-strong">{t("recebidos.semLugar")}</h2>
                <Botao
                  tamanho="xs"
                  className="ml-auto"
                  disabled={ocupado}
                  onClick={() => guardar(recebidos.semLugar.map((s) => s.registro.id))}
                >
                  {t("recebidos.guardei")}
                </Botao>
              </header>
              <ul className="flex flex-col gap-1">
                {recebidos.semLugar.map(({ registro, motivo }) => {
                  const f = formaPorId.get(registro.formaId);
                  const nome = f ? rotulo.nome(f) : registro.formaId;
                  return (
                    <li key={registro.id} className="flex items-center gap-2 px-1 text-sm">
                      <span className="h-8 w-8 shrink-0">{f && <Sprite forma={f} shiny={registro.shiny} nome={nome} />}</span>
                      <span className="text-strong">{nome}</span>
                      {registro.shiny && <Distintivo tom="acento">{t("trilha.shiny")}</Distintivo>}
                      <Distintivo>{t(`recebidos.motivo.${motivo}`)}</Distintivo>
                    </li>
                  );
                })}
              </ul>
            </Painel>
          )}
        </div>
      )}
    </main>
  );
}
