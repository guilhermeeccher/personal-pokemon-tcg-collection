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
import { Dica } from "@/app/_componentes/dica";
import { Distintivo } from "@/app/_componentes/distintivo";
import { MarcaRaridade } from "@/app/_componentes/ds/marca-raridade";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { textoDaRecusa } from "@/app/_componentes/recusa";
import {
  classesCabecalhoEmpilhado,
  classesCelulaCabecalho,
  classesCelulaEmpilhada,
  classesLinha,
  classesLinhaCabecalho,
  classesTabelaEmpilhada,
  Tabela,
} from "@/app/_componentes/tabela";
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

interface RodadaListadaDTO {
  id: string;
  criadoEm: string;
  concluidaEm: string | null;
  totalCartas: number;
  cartasConsultadas: number;
  cartasComFalha: number;
  requisicoes: number;
  erro: string | null;
  somaMedios: number | null;
  noGrafico: boolean;
}

interface RespostaDTO {
  ritmo: RitmoDTO;
  cartasEspeciais: number;
  ultimaAtualizacao: string | null;
  varredura: RodadaDTO | null;
  resumo: { cartasComPreco: number; naoEncontradas: number; somaMedios: number };
  serie: PontoDaSerie[];
  rodadas: RodadaListadaDTO[];
  itens: ItemPrecoDTO[];
}

/** Cartas por página na tabela de preços — pedido do usuário, 2026-10-11. */
const CARTAS_POR_PAGINA = 50;

/* ------------------------------------------------------------------------
   Tabelas no celular (só abaixo de 768px): empilhadas, pela mesma marcação

   Escolha: empilhar, e não rolar de lado com a primeira coluna fixa. A tabela
   de preços é uma lista de cartas — cada linha é uma carta com um punhado de
   atributos —, não uma matriz para comparar coluna a coluna. Rolar de lado
   esconderia justamente o que importa (o preço médio é a 6ª de 8 colunas) e
   tiraria da tela, no iPhone, a metade dos números. Cartão por carta é o
   padrão de mercado para esse formato (listas de cartas e de ativos em apps
   de coleção e de corretora): o nome em cima, o contexto (set, número,
   raridade) embaixo e os três preços lado a lado, com o rótulo na frente de
   cada um, já que o cabeçalho some. O mesmo vale para a tabela de rodadas.

   Flex com quebra, como o inventário: os três preços correm numa linha e
   quebram sozinhos se um valor de quatro dígitos não couber, em vez de a
   grade de três trilhas fixas cortá-lo a 320px.
   ------------------------------------------------------------------------ */
const classesLinhaCartao =
  "max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-1.5 max-md:p-3";

/** Rótulo da coluna que o cabeçalho escondido deixou de mostrar; só no celular. */
const classesRotuloCampo = "font-sans text-xs text-muted md:hidden";

/** Um dos três preços: rótulo em cima do valor, alinhados à esquerda no cartão. */
const classesCampoPreco = "max-md:flex max-md:flex-auto max-md:flex-col max-md:text-left max-md:text-sm";

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
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
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
    setPagina(1);
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

  async function excluirRodada(r: RodadaListadaDTO) {
    const confirmado = window.confirm(
      t("rodadas.confirmarExcluir", { data: new Date(r.criadoEm).toLocaleString(locale) }),
    );
    if (!confirmado) return;
    setExcluindo(r.id);
    setErro(null);
    try {
      const resposta = await fetch(`/api/inventario/precos/rodadas/${r.id}`, { method: "DELETE" });
      if (!resposta.ok) {
        const corpo: unknown = await resposta.json().catch(() => ({}));
        setErro(textoDaRecusa(tr, corpo, t("rodadas.erroExcluir")));
        return;
      }
      carregar();
    } catch {
      setErro(t("rodadas.erroExcluir"));
    } finally {
      setExcluindo(null);
    }
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

  const itens = dados?.itens ?? [];
  const totalPaginas = Math.max(1, Math.ceil(itens.length / CARTAS_POR_PAGINA));
  // Presa ao total: a lista pode encolher entre uma leitura e outra.
  const paginaVisivel = Math.min(pagina, totalPaginas);
  const itensDaPagina = itens.slice(
    (paginaVisivel - 1) * CARTAS_POR_PAGINA,
    paginaVisivel * CARTAS_POR_PAGINA,
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-8">
      <CabecalhoPagina titulo={t("titulo")} descricao={t("descricao")} />

      <Painel as="section" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* O rótulo é longo e o botão não quebra linha: no celular ele ocupa a
              largura toda e quebra, em vez de estourar a tela a 320px. */}
          <Botao
            type="button"
            variante="primario"
            onClick={disparar}
            disabled={disparando || rodando}
            className="max-md:w-full max-md:whitespace-normal"
          >
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

      {dados && <GraficoValorTotal serie={dados.serie} />}

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

      <Tabela className={classesTabelaEmpilhada}>
        <thead className={classesCabecalhoEmpilhado}>
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
        <tbody className={classesTabelaEmpilhada}>
          {itensDaPagina.map((i) => (
            <tr key={i.cartaId} className={`${classesLinha} ${classesLinhaCartao}`}>
              <td className={`p-2 font-semibold text-strong ${classesCelulaEmpilhada} max-md:basis-full`}>{i.nome}</td>
              <td className={`p-2 text-muted ${classesCelulaEmpilhada} max-md:text-xs`}>{i.setNome}</td>
              <td className={`p-2 font-mono tabular-nums text-muted ${classesCelulaEmpilhada} max-md:text-xs`}>
                <span className={classesRotuloCampo}>{t("colunaNumero")} </span>
                {i.localId}
              </td>
              <td className={`p-2 ${classesCelulaEmpilhada} max-md:basis-full`}>
                <MarcaRaridade raridade={i.raridade} />
              </td>
              {i.encontrada ? (
                <>
                  <td className={`p-2 text-right font-mono tabular-nums ${classesCelulaEmpilhada} ${classesCampoPreco}`}>
                    <span className={classesRotuloCampo}>{t("colunaMinimo")}</span>
                    {i.preco !== null ? brl(i.preco, locale) : "—"}
                  </td>
                  <td
                    className={`p-2 text-right font-mono font-semibold tabular-nums ${classesCelulaEmpilhada} ${classesCampoPreco}`}
                  >
                    <span className={`${classesRotuloCampo} font-normal`}>{t("colunaMedio")}</span>
                    {i.precoMedio !== null ? brl(i.precoMedio, locale) : "—"}
                  </td>
                  <td className={`p-2 text-right font-mono tabular-nums ${classesCelulaEmpilhada} ${classesCampoPreco}`}>
                    <span className={classesRotuloCampo}>{t("colunaMaximo")}</span>
                    {i.precoMaximo !== null ? brl(i.precoMaximo, locale) : "—"}
                  </td>
                </>
              ) : (
                <td
                  colSpan={3}
                  className={`p-2 text-right text-muted ${classesCelulaEmpilhada} max-md:basis-full max-md:text-left`}
                  title={t("naoEncontradaTitulo")}
                >
                  {/* O `title` não existe no toque: a explicação vira um toggletip. */}
                  <Dica texto={t("naoEncontradaTitulo")}>
                    <span>{t("naoEncontrada")}</span>
                  </Dica>
                </td>
              )}
              <td className={`p-2 whitespace-nowrap text-muted ${classesCelulaEmpilhada} max-md:basis-full max-md:text-xs`}>
                <span className={classesRotuloCampo}>{t("colunaConsultado")}: </span>
                {new Date(i.consultadoEm).toLocaleDateString(locale)}
              </td>
            </tr>
          ))}
          {dados && dados.itens.length === 0 && (
            <tr className="max-md:block">
              <td colSpan={8} className="p-4 max-md:block">
                <EstadoVazio>{t("vazio")}</EstadoVazio>
              </td>
            </tr>
          )}
        </tbody>
      </Tabela>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between text-sm max-md:gap-2">
          <Botao
            variante="secundario"
            disabled={paginaVisivel <= 1}
            onClick={() => setPagina(paginaVisivel - 1)}
          >
            {t("anterior")}
          </Botao>
          <span className="max-md:text-center">{t("paginacao", { pagina: paginaVisivel, totalPaginas })}</span>
          <Botao
            variante="secundario"
            disabled={paginaVisivel >= totalPaginas}
            onClick={() => setPagina(paginaVisivel + 1)}
          >
            {t("proxima")}
          </Botao>
        </div>
      )}

      {dados && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-strong">{t("rodadas.titulo")}</h2>
          <p className="text-xs text-muted">{t("rodadas.explicacao")}</p>
          <Tabela className={classesTabelaEmpilhada}>
            <thead className={classesCabecalhoEmpilhado}>
              <tr className={classesLinhaCabecalho}>
                <th className={classesCelulaCabecalho}>{t("rodadas.colunaData")}</th>
                <th className={classesCelulaCabecalho}>{t("rodadas.colunaSituacao")}</th>
                <th className={`${classesCelulaCabecalho} hidden text-right sm:table-cell`}>
                  {t("rodadas.colunaCartas")}
                </th>
                <th className={`${classesCelulaCabecalho} hidden text-right sm:table-cell`}>
                  {t("rodadas.colunaRequisicoes")}
                </th>
                <th className={`${classesCelulaCabecalho} text-right`}>{t("rodadas.colunaTotal")}</th>
                <th className={classesCelulaCabecalho}>
                  <span className="sr-only">{t("rodadas.excluir")}</span>
                </th>
              </tr>
            </thead>
            <tbody className={classesTabelaEmpilhada}>
              {dados.rodadas.map((r) => {
                const viva = r.concluidaEm === null;
                const situacao = (
                  <Distintivo tom={viva ? "aviso" : r.erro ? "perigo" : "neutro"}>
                    {viva
                      ? t("rodadas.emAndamento")
                      : r.erro
                        ? t("rodadas.interrompida")
                        : t("rodadas.concluida")}
                  </Distintivo>
                );
                return (
                  <tr key={r.id} className={`${classesLinha} ${classesLinhaCartao}`}>
                    <td className={`p-2 sm:whitespace-nowrap ${classesCelulaEmpilhada} max-md:flex-1 max-md:whitespace-nowrap`}>
                      {new Date(r.criadoEm).toLocaleString(locale, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    {/* O motivo da interrupção é uma frase longa: vai no title, não na célula. */}
                    <td className={`p-2 ${classesCelulaEmpilhada}`} title={r.erro ?? undefined}>
                      {/* O motivo da interrupção vai no `title` da célula; no toque
                          ele vira um toggletip ao lado do selo. */}
                      {r.erro ? <Dica texto={r.erro}>{situacao}</Dica> : situacao}
                    </td>
                    {/* "Cartas", escondida até o `sm` na tabela, ganha linha própria no
                        cartão: sem o cabeçalho, o rótulo vem na frente. */}
                    <td
                      className={`hidden p-2 text-right font-mono whitespace-nowrap tabular-nums md:table-cell ${classesCelulaEmpilhada} max-md:basis-full max-md:text-left max-md:text-xs`}
                    >
                      <span className={classesRotuloCampo}>{t("rodadas.colunaCartas")} </span>
                      {t("rodadas.cartas", { feitas: r.cartasConsultadas, total: r.totalCartas })}
                    </td>
                    {/* Requisições: continua escondida no celular, como já era até o `sm`
                        (é o custo da rodada, não o que o usuário veio ver); no cartão a
                        linha seguinte é o total com o "Excluir", e os três não cabem a 320px. */}
                    <td className="hidden p-2 text-right font-mono tabular-nums md:table-cell">{r.requisicoes}</td>
                    <td
                      className={`p-2 text-right font-mono whitespace-nowrap tabular-nums ${classesCelulaEmpilhada} max-md:flex max-md:flex-1 max-md:flex-col max-md:text-left`}
                    >
                      {/* Rótulo em cima do valor: lado a lado, o total de quatro dígitos
                          e o "Excluir" disputavam a mesma linha a 320px. */}
                      <span className={classesRotuloCampo}>{t("rodadas.colunaTotal")}</span>
                      {r.somaMedios === null ? (
                        t("rodadas.semPonto")
                      ) : r.noGrafico ? (
                        brl(r.somaMedios, locale)
                      ) : (
                        <span className="flex flex-col items-end text-muted max-md:items-start">
                          {brl(r.somaMedios, locale)}
                          <span className="font-sans text-xs">{t("rodadas.foraDoGrafico")}</span>
                        </span>
                      )}
                    </td>
                    <td className={`p-2 text-right ${classesCelulaEmpilhada} max-md:ml-auto`}>
                      <Botao
                        type="button"
                        variante="perigo"
                        tamanho="xs"
                        onClick={() => excluirRodada(r)}
                        disabled={viva || excluindo !== null}
                      >
                        {excluindo === r.id ? t("rodadas.excluindo") : t("rodadas.excluir")}
                      </Botao>
                    </td>
                  </tr>
                );
              })}
              {dados.rodadas.length === 0 && (
                <tr className="max-md:block">
                  <td colSpan={6} className="p-4 max-md:block">
                    <EstadoVazio>{t("rodadas.vazio")}</EstadoVazio>
                  </td>
                </tr>
              )}
            </tbody>
          </Tabela>
        </section>
      )}
    </main>
  );
}
