"use client";

/**
 * Preços das cartas especiais — o que as cartas holo, as secretas e as
 * clássicas de 30 Anos valem na LigaPokemon (`lib/dominio/precos-cartas-especiais.ts`).
 *
 * A tela lê **sempre o snapshot** de `GET /api/inventario/precos`; quem fala
 * com o site deles é a rodada que o botão dispara, no ritmo do `robots.txt`
 * (ou do `LIGA_INTERVALO_SEGUNDOS`). Enquanto a rodada vive, a tela se
 * atualiza num período amarrado ao ritmo, `clamp(intervalo × 250 ms, 5 s,
 * 60 s)` — o mesmo da tela de opções de compra, e não um número fixo: com
 * intervalo longo, perguntar de 5 em 5 s seria consulta ao banco sem novidade.
 */

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Botao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Distintivo } from "@/app/_componentes/distintivo";
import { MarcaRaridade } from "@/app/_componentes/ds/marca-raridade";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { textoDaRecusa } from "@/app/_componentes/recusa";
import { classesCelulaCabecalho, classesLinha, classesLinhaCabecalho, Tabela } from "@/app/_componentes/tabela";
import { Painel } from "@/app/_componentes/painel";
import { formatarDuracao } from "@/lib/dominio/estimativa-varredura";
import { VALIDADE_CONSULTA_HORAS } from "@/lib/dominio/frescor-consulta";
import type { PontoDaSerie } from "@/lib/dominio/historico-precos";

import { GraficoValorTotal } from "./grafico-valor-total";

interface RitmoDTO {
  intervaloSegundos: number;
  origem: "env" | "robots" | "conservador";
}

interface RodadaDTO {
  id: string;
  totalCartas: number;
  cartasConsultadas: number;
  cartasComFalha: number;
  requisicoes: number;
  concluidaEm: string | null;
  erro: string | null;
  criadoEm: string;
  emAndamento: boolean;
  segundosRestantes: number | null;
  previsaoTermino: string | null;
}

interface ItemPrecoDTO {
  cartaId: string;
  nome: string;
  setNome: string;
  localId: string;
  raridade: string | null;
  encontrada: boolean;
  preco: number | null;
  precoMedio: number | null;
  precoMaximo: number | null;
  consultadoEm: string;
}

interface RespostaDTO {
  ritmo: RitmoDTO;
  cartasEspeciais: number;
  ultimaAtualizacao: string | null;
  varredura: RodadaDTO | null;
  resumo: { cartasComPreco: number; naoEncontradas: number; somaMedios: number };
  serie: PontoDaSerie[];
  itens: ItemPrecoDTO[];
}

/* Só a pontuação do número muda com o idioma da interface; a moeda é sempre
   o real (AGENTS.md: nenhuma conversão de moeda). */
const brl = (valor: number, locale: string) =>
  valor.toLocaleString(locale, { style: "currency", currency: "BRL" });

export default function PrecosPage() {
  const t = useTranslations("precos");
  const tr = useTranslations("recusas");
  const locale = useLocale();

  const [dados, setDados] = useState<RespostaDTO | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [disparando, setDisparando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const montado = useRef(true);

  const carregar = useCallback(() => {
    fetch("/api/inventario/precos")
      .then((r) => r.json())
      .then((d: RespostaDTO) => {
        if (montado.current) setDados(d);
      })
      .catch(() => {
        if (montado.current) setErro(t("erroCarregar"));
      })
      .finally(() => {
        if (montado.current) setCarregando(false);
      });
  }, [t]);

  useEffect(() => {
    montado.current = true;
    carregar();
    return () => {
      montado.current = false;
    };
  }, [carregar]);

  const rodando = dados?.varredura?.emAndamento ?? false;
  const periodoAtualizacao = Math.min(
    60_000,
    Math.max(5_000, (dados?.ritmo?.intervaloSegundos ?? 3) * 250),
  );
  useEffect(() => {
    if (!rodando) return;
    const timer = setInterval(carregar, periodoAtualizacao);
    return () => clearInterval(timer);
  }, [rodando, carregar, periodoAtualizacao]);

  const horaLegivel = useCallback(
    (iso: string | null): string => {
      if (iso === null) return "—";
      const quando = new Date(iso);
      const hora = quando.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
      if (new Date().toDateString() === quando.toDateString()) return hora;
      return `${quando.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })} ${hora}`;
    },
    [locale],
  );

  async function disparar() {
    setDisparando(true);
    setErro(null);
    setAviso(null);
    const resposta = await fetch("/api/inventario/precos", { method: "POST" });
    const corpo = await resposta.json();
    setDisparando(false);
    if (!resposta.ok) {
      setErro(textoDaRecusa(tr, corpo, t("erroIniciar")));
      return;
    }
    setAviso(
      t("iniciada", {
        cartas: corpo.cartasParaConsultar,
        estimativa: formatarDuracao(corpo.estimativaSegundos),
        previsao: horaLegivel(corpo.previsaoTermino),
      }) +
        (corpo.cartasPuladas > 0
          ? t("puladas", { total: corpo.cartasPuladas, horas: VALIDADE_CONSULTA_HORAS })
          : "") +
        t("podeSair"),
    );
    carregar();
  }

  const ritmo = dados?.ritmo;
  const intervalo = ritmo
    ? ritmo.intervaloSegundos >= 60
      ? `${Math.round(ritmo.intervaloSegundos / 60)} min`
      : `${ritmo.intervaloSegundos} s`
    : "";
  const textoRitmo = !ritmo
    ? ""
    : ritmo.origem === "env"
      ? t("ritmoEnv", { intervalo })
      : ritmo.origem === "robots"
        ? t("ritmoRobots", { intervalo })
        : t("ritmoConservador", { intervalo });

  const rodada = dados?.varredura ?? null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-8">
      <CabecalhoPagina titulo={t("titulo")} descricao={t("descricao")} />

      <Painel as="section" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Botao type="button" variante="primario" onClick={disparar} disabled={disparando || rodando}>
            {disparando ? t("iniciando") : rodando ? t("emAndamentoBotao") : t("atualizar")}
          </Botao>
          <span className="text-sm text-muted">
            {dados?.ultimaAtualizacao
              ? t("ultimaAtualizacao", {
                  data: new Date(dados.ultimaAtualizacao).toLocaleString(locale),
                })
              : dados
                ? t("nuncaAtualizado")
                : ""}
          </span>
        </div>
        <p className="text-xs text-muted">
          {textoRitmo} {t("explicacaoRitmo", { horas: VALIDADE_CONSULTA_HORAS })}
        </p>
      </Painel>

      {erro && <p className="text-sm text-danger">{erro}</p>}
      {aviso && <p className="text-sm text-muted">{aviso}</p>}
      {carregando && <p className="text-sm text-muted">{t("carregando")}</p>}

      {rodada && (
        <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-hairline bg-surface p-3 text-sm shadow-1">
          <Distintivo tom={rodada.emAndamento ? "aviso" : "neutro"}>
            {rodada.emAndamento ? t("emAndamento") : t("concluida")}
          </Distintivo>
          <span className="text-muted">
            {t("andamento", {
              feitas: rodada.cartasConsultadas,
              total: rodada.totalCartas,
              requisicoes: rodada.requisicoes,
            })}
            {rodada.cartasComFalha > 0 && ` · ${t("falhas", { total: rodada.cartasComFalha })}`}
            {" · "}
            {new Date(rodada.criadoEm).toLocaleString(locale)}
          </span>
          {rodando && rodada.segundosRestantes !== null && (
            <span className="text-muted">
              {t("faltam", {
                duracao: formatarDuracao(rodada.segundosRestantes),
                termino:
                  rodada.previsaoTermino !== null
                    ? t("terminoPrevisto", { quando: horaLegivel(rodada.previsaoTermino) })
                    : "",
              })}
            </span>
          )}
          {rodando && <span className="text-muted">{t("telaSeAtualiza")}</span>}
          {rodada.erro && !rodando && (
            <span className="basis-full text-danger">{t("interrompida", { erro: rodada.erro })}</span>
          )}
        </section>
      )}

      {dados && dados.itens.length > 0 && (
        <p className="text-sm text-muted">
          {t("resumo", {
            comPreco: dados.resumo.cartasComPreco,
            selecionadas: dados.cartasEspeciais,
            soma: brl(dados.resumo.somaMedios, locale),
          })}
          {dados.resumo.naoEncontradas > 0 &&
            t("naoEncontradasResumo", { total: dados.resumo.naoEncontradas })}
        </p>
      )}

      <Tabela>
        <thead>
          <tr className={classesLinhaCabecalho}>
            <th className={classesCelulaCabecalho}>{t("colunaCarta")}</th>
            <th className={classesCelulaCabecalho}>{t("colunaSet")}</th>
            <th className={classesCelulaCabecalho}>{t("colunaNumero")}</th>
            <th className={classesCelulaCabecalho}>{t("colunaRaridade")}</th>
            <th className={`${classesCelulaCabecalho} text-right`}>{t("colunaMinimo")}</th>
            <th className={`${classesCelulaCabecalho} text-right`}>{t("colunaMedio")}</th>
            <th className={`${classesCelulaCabecalho} text-right`}>{t("colunaMaximo")}</th>
            <th className={classesCelulaCabecalho}>{t("colunaConsultado")}</th>
          </tr>
        </thead>
        <tbody>
          {(dados?.itens ?? []).map((i) => (
            <tr key={i.cartaId} className={classesLinha}>
              <td className="p-2 font-semibold text-strong">{i.nome}</td>
              <td className="p-2 text-muted">{i.setNome}</td>
              <td className="p-2 font-mono tabular-nums text-muted">{i.localId}</td>
              <td className="p-2">
                <MarcaRaridade raridade={i.raridade} />
              </td>
              {i.encontrada ? (
                <>
                  <td className="p-2 text-right font-mono tabular-nums">
                    {i.preco !== null ? brl(i.preco, locale) : "—"}
                  </td>
                  <td className="p-2 text-right font-mono font-semibold tabular-nums">
                    {i.precoMedio !== null ? brl(i.precoMedio, locale) : "—"}
                  </td>
                  <td className="p-2 text-right font-mono tabular-nums">
                    {i.precoMaximo !== null ? brl(i.precoMaximo, locale) : "—"}
                  </td>
                </>
              ) : (
                <td colSpan={3} className="p-2 text-right text-muted" title={t("naoEncontradaTitulo")}>
                  {t("naoEncontrada")}
                </td>
              )}
              <td className="p-2 whitespace-nowrap text-muted">
                {new Date(i.consultadoEm).toLocaleDateString(locale)}
              </td>
            </tr>
          ))}
          {dados && dados.itens.length === 0 && (
            <tr>
              <td colSpan={8} className="p-4">
                <EstadoVazio>{t("vazio")}</EstadoVazio>
              </td>
            </tr>
          )}
        </tbody>
      </Tabela>

      {dados && <GraficoValorTotal serie={dados.serie} />}
    </main>
  );
}
