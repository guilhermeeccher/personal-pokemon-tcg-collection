"use client";

/**
 * Caixas do HOME — a Living Dex arrumada como as caixas do HOME: 30 vagas
 * por caixa (6 × 5), em grupos que começam em caixas fixas e só crescem no
 * fim (`dex-caixas.ts`). Cada vaga mostra o estado na trilha e leva ao
 * cadastro, como na Pokédex. As seções se ligam na Pokédex; aqui só se lê.
 *
 * A numeração tem lacunas de propósito: as caixas de folga entre os grupos
 * não aparecem, e grupo de seção desligada some sem renumerar os outros. As
 * duas trilhas têm o mesmo mapa; na shiny, a forma sem shiny é um buraco
 * marcado, sem link para o cadastro — não há shiny para guardar ali.
 *
 * O único ajuste daqui é "Caixas antes da Nacional 1" (D9): quem usa a
 * primeira caixa do HOME para Recebidos põe 1, e a numeração passa a bater
 * com a do HOME — aqui, na Pokédex e em Recebidos.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { classesEntrada } from "@/app/_componentes/campo";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { Distintivo } from "@/app/_componentes/distintivo";
import { classesBotao } from "@/app/_componentes/botao";
import { Modal } from "@/app/_componentes/modal";
import { useEhMobile } from "@/app/_componentes/use-eh-mobile";
import { Painel } from "@/app/_componentes/painel";
import {
  COLUNAS_CAIXA,
  ehCaixasReservadas,
  GRUPOS_CAIXA,
  MAX_CAIXAS_RESERVADAS,
  montarCaixasDex,
  vagasNaCaixa,
  VAGAS_POR_CAIXA,
  type GrupoCaixa,
} from "@/lib/dominio/dex-caixas";
import { estadoDaVaga, mapearEstadosDex, type EstadoVagaDex } from "@/lib/dominio/dex-estado";
import type { TrilhaDex } from "@/lib/dominio/dex-grade";
import type { SecoesContadas } from "@/lib/dominio/dex-secoes";
import type { FormaDexDTO, RegistroDexDTO } from "@/lib/dominio/tipos-cliente";
import { urlSpriteDex } from "@/lib/imagens";

import { useCartaoPokemon } from "../_componentes/cartao-pokemon";
import { useNomeCaixa } from "../_componentes/use-nome-caixa";
import { useRotuloForma } from "../_componentes/use-rotulo-forma";

/* No celular a pílula chega a 44 de altura e largura (`max-md:`); o intervalo de 8px
   entre elas vem do `gap` dos grupos. De 768px para cima nada muda. */
const classesOpcao = (ativa: boolean) =>
  `rounded-pill border px-3 py-1 text-xs font-semibold [transition:var(--transition-control)] max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center max-md:px-4 ${
    ativa ? "border-accent bg-accent text-accent-fg" : "border-line text-muted hover:bg-surface-hover"
  }`;

/* Mesma leitura de cor da Pokédex: no HOME, sucesso; no jogo, aviso; em falta, apagado. */
const MOLDURA: Record<EstadoVagaDex, string> = {
  falta: "border-hairline",
  no_jogo: "border-warning/70",
  no_home: "border-success/70 bg-success-soft",
};

const ESTADOS_LEGENDA: readonly EstadoVagaDex[] = ["falta", "no_jogo", "no_home"];

const numero4 = (n: number) => String(n).padStart(4, "0");

/* A faixa "#0001–#0030" só diz algo nos grupos ordenados pelo número; os outros vão por lançamento. */
const GRUPO_POR_NUMERO: ReadonlySet<GrupoCaixa> = new Set(["nacional", "genero"]);

/** "Caixas antes da Nacional 1": grava a cada mudança válida e redesenha a página. */
function CampoReservadas({ valor }: { valor: number }) {
  const t = useTranslations("dex");
  const router = useRouter();
  const [texto, setTexto] = useState(String(valor));
  const [salvando, setSalvando] = useState(false);

  async function salvar(novo: string) {
    setTexto(novo);
    const n = Number(novo);
    if (novo === "" || !ehCaixasReservadas(n) || n === valor) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/dex/preferencias", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caixasReservadas: n }),
      });
      if (r.ok) router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      {t("caixas.reservadas")}
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_CAIXAS_RESERVADAS}
        disabled={salvando}
        className={`${classesEntrada} w-16 text-right tabular-nums`}
        value={texto}
        onChange={(e) => salvar(e.target.value)}
      />
    </label>
  );
}

export function CaixasHome({
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
  const rotulo = useRotuloForma(formas);
  const nomeCaixa = useNomeCaixa();
  const ehMobile = useEhMobile();
  const { abrir, fechar, cartao } = useCartaoPokemon();
  const tm = useTranslations("componentes.mobile");
  const [trilha, setTrilha] = useState<TrilhaDex>("normal");
  // Celular: tocar numa vaga abre o detalhe dela (o que o cartão flutuante
  // mostra no desktop: nome com forma, estado e caixa · posição) com o botão
  // de registrar, em vez de navegar direto. A vaga é pequena demais para o
  // nome, e o número da Pokédex sozinho não distingue formas da mesma espécie.
  const [detalhe, setDetalhe] = useState<{
    nome: string;
    numero: number;
    sprite: string;
    estado: EstadoVagaDex;
    caixa: number;
    posicao: number;
  } | null>(null);
  // O detalhe só existe no celular: girar o aparelho para a largura de
  // desktop com ele aberto o descarta (lá o toque navega direto), e voltar ao
  // retrato não o traz de volta. Ajuste na renderização, sem efeito.
  if (!ehMobile && detalhe) setDetalhe(null);

  const estados = useMemo(() => mapearEstadosDex(registros), [registros]);
  const caixas = useMemo(
    () => montarCaixasDex(formas, trilha, secoes, caixasReservadas),
    [formas, trilha, secoes, caixasReservadas],
  );
  const totalVagas = caixas.reduce((s, c) => s + vagasNaCaixa(c), 0);

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
          <CampoReservadas valor={caixasReservadas} />
        </div>
        <nav className="flex flex-wrap items-center gap-1.5 max-md:gap-2" aria-label={t("caixas.irPara")}>
          {GRUPOS_CAIXA.map((grupo) => {
            const primeira = caixas.find((c) => c.grupo === grupo);
            return primeira ? (
              <a key={grupo} href={`#caixa-${primeira.numero}`} className={classesOpcao(false)}>
                {t(`caixas.grupo.${grupo}`)}
              </a>
            ) : null;
          })}
        </nav>
        <p className="text-xs text-muted">{t("caixas.folga")}</p>
        {/* O cartão flutuante (só com mouse) diz o estado de cada vaga; no celular a vaga só
            tem a cor da moldura e o sprite apagado, então a legenda escreve o que cada uma é.
            As molduras são as mesmas de `MOLDURA`. */}
        {ehMobile && (
          <ul className="flex flex-wrap items-center gap-2" aria-label={t("pokedex.filtroEstado")}>
            {ESTADOS_LEGENDA.map((e) => (
              <li key={e} className="flex items-center gap-1.5">
                <span aria-hidden className={`size-4 rounded-md border ${MOLDURA[e]}`} />
                <Distintivo>{t(`estado.${e}`)}</Distintivo>
              </li>
            ))}
          </ul>
        )}
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
                  <span className="ml-2 font-normal text-muted">{nomeCaixa.nome(caixa)}</span>
                </h2>
                {GRUPO_POR_NUMERO.has(caixa.grupo) && (
                  <span className="font-mono text-xs tabular-nums text-muted">
                    {t("caixas.faixa", {
                      inicio: numero4(caixa.lugares[0].forma.numero),
                      fim: numero4(caixa.lugares[caixa.lugares.length - 1].forma.numero),
                    })}
                  </span>
                )}
              </header>
              <ol className="grid gap-1 max-md:gap-2" style={{ gridTemplateColumns: `repeat(${COLUNAS_CAIXA}, minmax(0, 1fr))` }}>
                {caixa.lugares.map(({ forma: f, buraco }, i) => {
                  const nome = rotulo.nome(f);
                  if (buraco) {
                    /*
                     * Buraco: a posição é da forma, mas nada entra nela nesta
                     * trilha. Tracejado, sprite normal bem apagado e o motivo
                     * escrito; sem link, para não convidar a cadastrar ali.
                     */
                    const motivo = t(`caixas.buraco.${buraco}`);
                    return (
                      <li
                        key={f.id}
                        aria-label={`${i + 1}. ${nome} — ${motivo}`}
                        className="relative flex aspect-square items-center justify-center rounded-md border border-dashed border-line"
                        onMouseEnter={abrir({
                          sprite: f.sprite,
                          shiny: false,
                          nome,
                          linhas: [motivo, t("pokedex.posicaoNaCaixa", { caixa: String(caixa.numero), posicao: String(i + 1) })],
                        })}
                        onMouseLeave={fechar}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- sprite externo pequeno (PokeAPI, ~0,6 KB); mesma convenção da Pokédex. */}
                        <img
                          src={urlSpriteDex(f.sprite, false)}
                          alt=""
                          width={56}
                          height={56}
                          loading="lazy"
                          className="h-full w-full object-contain opacity-15 grayscale"
                          style={{ imageRendering: "pixelated" }}
                        />
                        <span className="absolute inset-x-0 bottom-0.5 text-center text-[9px] leading-tight font-semibold text-muted">
                          {motivo}
                        </span>
                      </li>
                    );
                  }
                  const estado = estadoDaVaga(estados, f.id, trilha);
                  return (
                    <li key={f.id} className={`aspect-square rounded-md border ${MOLDURA[estado]}`}>
                      <Link
                        href={`/dex/cadastrar?busca=${f.numero}`}
                        aria-label={`${i + 1}. ${nome} — ${t(`estado.${estado}`)}`}
                        className="group flex h-full w-full items-center justify-center max-md:relative"
                        onClick={(e) => {
                          if (!ehMobile) return;
                          e.preventDefault();
                          setDetalhe({ nome, numero: f.numero, sprite: f.sprite, estado, caixa: caixa.numero, posicao: i + 1 });
                        }}
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
                        {/* Nome e posição do cartão flutuante: a posição é o lugar na grade; o número da
                            Pokédex identifica a espécie sem depender do mouse. */}
                        {ehMobile && (
                          <span className="pointer-events-none absolute inset-x-0.5 bottom-0 rounded-sm bg-surface/80 text-center font-mono text-[9px] leading-tight font-semibold tabular-nums text-muted">
                            {numero4(f.numero)}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
                {Array.from({ length: VAGAS_POR_CAIXA - caixa.lugares.length }, (_, i) => (
                  <li key={`vazia-${i}`} aria-hidden className="aspect-square rounded-md border border-dashed border-hairline" />
                ))}
              </ol>
            </Painel>
          ))}
        </div>
      )}
      {cartao}
      {detalhe && ehMobile && (
        <Modal
          rotulo={detalhe.nome}
          onFechar={() => setDetalhe(null)}
          rodape={
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setDetalhe(null)} className={classesBotao("secundario")}>
                {tm("fechar")}
              </button>
              <Link href={`/dex/cadastrar?busca=${detalhe.numero}`} className={classesBotao("primario")}>
                {t("pokedex.registrarEsta")}
              </Link>
            </div>
          }
        >
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- sprite externo pequeno (PokeAPI), o mesmo da vaga, ampliado. */}
            <img
              src={urlSpriteDex(detalhe.sprite, trilha === "shiny")}
              alt=""
              width={96}
              height={96}
              className="h-24 w-24 shrink-0 object-contain"
              style={{ imageRendering: "pixelated" }}
            />
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="font-display text-base font-bold text-strong">{detalhe.nome}</h2>
              <span className="font-mono text-xs tabular-nums text-muted">#{numero4(detalhe.numero)}</span>
              <span className="text-sm text-foreground">{t(`estado.${detalhe.estado}`)}</span>
              <span className="text-sm text-muted">
                {t("pokedex.posicaoNaCaixa", { caixa: String(detalhe.caixa), posicao: String(detalhe.posicao) })}
              </span>
            </div>
          </div>
        </Modal>
      )}
    </main>
  );
}
