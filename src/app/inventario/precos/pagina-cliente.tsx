"use client";

/**
 * Preços das cartas especiais — o que as cartas holo, as secretas e as
 * clássicas de 30 Anos valem (`lib/dominio/precos-cartas-especiais.ts`), por
 * uma de duas fontes, escolhida por instalação (`PRECO_FONTE`) e informada
 * pelo servidor em `dados.fonte`:
 *
 * - **Liga** (o padrão, e também quando a resposta não diz a fonte): o preço
 *   anunciado na LigaPokemon, em reais. A tela é a de sempre.
 * - **Cardmarket**: a tendência do Cardmarket que a TCGdex entrega, convertida
 *   em reais pela PTAX de fechamento. É referência internacional, comparável ao
 *   **menor** preço da Liga, não ao médio — por isso a descrição diz isso, a
 *   coluna em destaque é a tendência, com o valor em euro embaixo, e a cotação
 *   usada fica escrita com a data.
 *
 * A tela lê **sempre o snapshot** de `GET /api/inventario/precos`; quem fala
 * com o site deles é a rodada que o botão dispara. Na Liga, no ritmo do
 * `robots.txt` (ou do `LIGA_INTERVALO_SEGUNDOS`), e enquanto a rodada vive a
 * tela se atualiza num período amarrado a esse ritmo, `clamp(intervalo ×
 * 250 ms, 5 s, 60 s)` — o mesmo da tela de opções de compra, e não um número
 * fixo: com intervalo longo, perguntar de 5 em 5 s seria consulta ao banco sem
 * novidade. No Cardmarket o período é 5 s fixos: a rodada consulta uma carta
 * por vez na TCGdex e dura minutos, não horas, e o que a tela pergunta é ao
 * nosso banco, nunca à TCGdex.
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

/** A fonte de preço da instalação, decidida no servidor por `PRECO_FONTE`. */
type FontePrecoDTO = "liga" | "cardmarket";

/** PTAX de fechamento (venda) do euro: reais por € 1, e o dia do boletim. */
interface CotacaoDTO {
  valor: number;
  /** `YYYY-MM-DD`, dia do calendário, sem hora. */
  data: string;
}

/**
 * Uma carta na fonte Cardmarket. Os valores sem sufixo estão em reais, já
 * convertidos pela `cotacao` da própria linha; `tendenciaEur` é o original.
 * `foil` diz que só havia os preços da versão foil e os três são dela.
 */
interface ItemPrecoCardmarketDTO {
  cartaId: string;
  nome: string;
  setNome: string;
  localId: string;
  raridade: string | null;
  encontrada: boolean;
  minimo: number | null;
  tendencia: number | null;
  media: number | null;
  tendenciaEur: number | null;
  foil: boolean;
  cotacao: number | null;
  cotacaoData: string | null;
  consultadoEm: string;
}

/** O que as duas fontes respondem igual. Rodadas, fotos e série chegam já
 *  filtradas pela fonte ativa: as duas séries nunca se misturam. */
interface RespostaComumDTO {
  cartasEspeciais: number;
  ultimaAtualizacao: string | null;
  varredura: RodadaDTO | null;
  resumo: { cartasComPreco: number; naoEncontradas: number; somaMedios: number };
  serie: PontoDaSerie[];
  rodadas: RodadaListadaDTO[];
}

interface RespostaLigaDTO extends RespostaComumDTO {
  /* Opcional de propósito: uma resposta sem a fonte é a da Liga, a de antes
     de existir a escolha. */
  fonte?: "liga";
  ritmo: RitmoDTO;
  itens: ItemPrecoDTO[];
}

interface RespostaCardmarketDTO extends RespostaComumDTO {
  fonte: "cardmarket";
  /* Sem ritmo de robots.txt a mostrar: a rodada é uma carta por vez na TCGdex. */
  ritmo: null;
  /** Da linha encontrada consultada mais recentemente; `null` antes da primeira. */
  cotacao: CotacaoDTO | null;
  /** Ordenados por valor (tendência, senão média), depois nome e `cartaId`. */
  itens: ItemPrecoCardmarketDTO[];
}

type RespostaDTO = RespostaLigaDTO | RespostaCardmarketDTO;

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

/* Euro, foil e a data de outra cotação, embaixo do valor em reais: menores e
   apagados, porque o número que se compara é o de cima. Sem quebra, para o
   "€ 1.234,56 · foil" não partir no meio numa coluna estreita. */
const classesDetalhePreco = "block whitespace-nowrap font-sans text-xs font-normal text-muted";

/* Só a pontuação do número muda com o idioma da interface; a moeda vai
   escrita, sempre pelo `Intl`.

   Os valores da tela estão em reais. Na fonte Liga, é o real que o site
   anuncia, sem conversão nenhuma (AGENTS.md: "No currency conversion"). Na
   fonte Cardmarket mora a única exceção a essa regra: os preços vêm em euro e
   o servidor os converte pela PTAX de fechamento do dia da consulta. Por isso
   a tela os rotula sempre — a fonte na descrição, a cotação e a data embaixo
   do botão, o original em euro embaixo da tendência — e nunca os soma nem os
   compara com valores da Liga: as duas fontes não aparecem juntas. */
const moeda = (valor: number, locale: string, codigo: "BRL" | "EUR") =>
  valor.toLocaleString(locale, { style: "currency", currency: codigo });
const brl = (valor: number, locale: string) => moeda(valor, locale, "BRL");
const eur = (valor: number, locale: string) => moeda(valor, locale, "EUR");

/* A data da PTAX é um dia do calendário ("2026-11-11"), sem hora. `new Date`
   a lê como meia-noite UTC, que em São Paulo ainda é o dia anterior; formatar
   também em UTC devolve o mesmo dia que veio escrito. */
const dataCivil = (iso: string, locale: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC" });

export default function PrecosPage({ fonte: fonteDoServidor }: { fonte?: FontePrecoDTO }) {
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

  /* Quem decide é a resposta do GET, e uma resposta sem `fonte` é a Liga.
     Antes de ela chegar vale a que o invólucro de servidor passar: sem isso,
     numa instalação Cardmarket a descrição, o botão e a explicação do ritmo
     piscariam com os textos da Liga a cada abertura. Sem nenhuma das duas, é
     a Liga — a tela de sempre. */
  const fonte: FontePrecoDTO = dados
    ? dados.fonte === "cardmarket"
      ? "cardmarket"
      : "liga"
    : (fonteDoServidor ?? "liga");
  const cardmarket = fonte === "cardmarket";

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
  const periodoAtualizacao = cardmarket
    ? 5_000
    : Math.min(60_000, Math.max(5_000, (dados?.ritmo?.intervaloSegundos ?? 3) * 250));
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

  /* Uma lista por fonte, e só uma delas tem itens: assim cada linha é escrita
     com o tipo da sua fonte, e a da Liga continua exatamente a de antes. */
  const itens = dados && dados.fonte !== "cardmarket" ? dados.itens : [];
  const itensCardmarket = dados?.fonte === "cardmarket" ? dados.itens : [];
  const totalPaginas = Math.max(
    1,
    Math.ceil((itens.length + itensCardmarket.length) / CARTAS_POR_PAGINA),
  );
  // Presa ao total: a lista pode encolher entre uma leitura e outra.
  const paginaVisivel = Math.min(pagina, totalPaginas);
  const itensDaPagina = itens.slice(
    (paginaVisivel - 1) * CARTAS_POR_PAGINA,
    paginaVisivel * CARTAS_POR_PAGINA,
  );
  const itensCardmarketDaPagina = itensCardmarket.slice(
    (paginaVisivel - 1) * CARTAS_POR_PAGINA,
    paginaVisivel * CARTAS_POR_PAGINA,
  );

  const cotacao = dados?.fonte === "cardmarket" ? dados.cotacao : null;
  /* "€ 1 = R$ 6,1706": o euro sem casas, o real com as quatro da PTAX — com
     duas, a conta de quem confere à mão não fecharia. */
  const textoCotacao =
    cotacao &&
    t("cardmarket.cotacaoUsada", {
      euro: (1).toLocaleString(locale, {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
      real: cotacao.valor.toLocaleString(locale, {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      }),
      data: dataCivil(cotacao.data, locale),
    });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-8">
      <CabecalhoPagina titulo={t("titulo")} descricao={t(cardmarket ? "cardmarket.descricao" : "descricao")} />

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
            {disparando
              ? t("iniciando")
              : rodando
                ? t("emAndamentoBotao")
                : t(cardmarket ? "cardmarket.atualizar" : "atualizar")}
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
        {cardmarket ? (
          <>
            {/* A cotação fica à vista, e não numa dica: é o que diz que o valor
                foi convertido, por qual taxa e de que dia. */}
            {textoCotacao && <p className="text-sm text-muted">{textoCotacao}</p>}
            <p className="text-xs text-muted">
              {t("cardmarket.explicacaoRitmo", { horas: VALIDADE_CONSULTA_HORAS })}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted">
            {textoRitmo} {t("explicacaoRitmo", { horas: VALIDADE_CONSULTA_HORAS })}
          </p>
        )}
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

      {dados && <GraficoValorTotal serie={dados.serie} fonte={fonte} />}

      {/* No Cardmarket o `somaMedios` do servidor é a soma das tendências
          (`comoPrecoDeCarta`): a conta é a mesma, só o nome muda. */}
      {dados && dados.itens.length > 0 && (
        <p className="text-sm text-muted">
          {t(cardmarket ? "cardmarket.resumo" : "resumo", {
            comPreco: dados.resumo.cartasComPreco,
            selecionadas: dados.cartasEspeciais,
            soma: brl(dados.resumo.somaMedios, locale),
          })}
          {dados.resumo.naoEncontradas > 0 &&
            t(cardmarket ? "cardmarket.semPrecoResumo" : "naoEncontradasResumo", {
              total: dados.resumo.naoEncontradas,
            })}
        </p>
      )}

      <Tabela className={classesTabelaEmpilhada}>
        <thead className={classesCabecalhoEmpilhado}>
          <tr className={classesLinhaCabecalho}>
            <th className={classesCelulaCabecalho}>{t("colunaCarta")}</th>
            <th className={classesCelulaCabecalho}>{t("colunaSet")}</th>
            <th className={classesCelulaCabecalho}>{t("colunaNumero")}</th>
            <th className={classesCelulaCabecalho}>{t("colunaRaridade")}</th>
            {cardmarket ? (
              <>
                <th className={`${classesCelulaCabecalho} text-right`}>{t("colunaMinimo")}</th>
                <th className={`${classesCelulaCabecalho} text-right`}>{t("cardmarket.colunaTendencia")}</th>
                <th className={`${classesCelulaCabecalho} text-right`}>{t("cardmarket.colunaMedia")}</th>
              </>
            ) : (
              <>
                <th className={`${classesCelulaCabecalho} text-right`}>{t("colunaMinimo")}</th>
                <th className={`${classesCelulaCabecalho} text-right`}>{t("colunaMedio")}</th>
                <th className={`${classesCelulaCabecalho} text-right`}>{t("colunaMaximo")}</th>
              </>
            )}
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
          {itensCardmarketDaPagina.map((i) => (
            <LinhaPrecoCardmarket key={i.cartaId} item={i} cotacaoDaTela={cotacao} />
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

/**
 * Uma carta na fonte Cardmarket: a mesma linha da Liga — mesmas classes, o
 * mesmo cartão abaixo de 768px —, com Mínimo | Tendência | Média no lugar de
 * Mínimo | Médio | Máximo. A tendência vem em negrito, porque é o valor da
 * carta nesta fonte (e o que o resumo e o gráfico somam); embaixo dela, o
 * original em euro e, quando só havia a versão foil, a marca "foil".
 *
 * A cotação de cada linha é a do dia em que ela foi consultada. Quase sempre é
 * a que a tela anuncia embaixo do botão; quando não é (a carta foi pulada pelo
 * frescor, ou a última consulta não achou e o preço guardado é de antes), a
 * linha diz de que dia é o câmbio dela, para o "Cotação usada" não valer para
 * uma conta que não foi feita com ela.
 *
 * No celular os três preços alinham pelo topo (`self-start`): a tendência tem
 * uma linha a mais, e centralizados os rótulos sairiam em alturas diferentes.
 */
function LinhaPrecoCardmarket({
  item: i,
  cotacaoDaTela,
}: {
  item: ItemPrecoCardmarketDTO;
  cotacaoDaTela: CotacaoDTO | null;
}) {
  const t = useTranslations("precos");
  const locale = useLocale();
  const cotacaoDaLinha =
    i.cotacaoData !== null &&
    (cotacaoDaTela === null || i.cotacaoData !== cotacaoDaTela.data || i.cotacao !== cotacaoDaTela.valor)
      ? i.cotacaoData
      : null;
  return (
    <tr className={`${classesLinha} ${classesLinhaCartao}`}>
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
          <td
            className={`p-2 text-right font-mono tabular-nums ${classesCelulaEmpilhada} ${classesCampoPreco} max-md:self-start`}
          >
            <span className={classesRotuloCampo}>{t("colunaMinimo")}</span>
            {i.minimo !== null ? brl(i.minimo, locale) : "—"}
          </td>
          <td
            className={`p-2 text-right font-mono font-semibold tabular-nums ${classesCelulaEmpilhada} ${classesCampoPreco} max-md:self-start`}
          >
            <span className={`${classesRotuloCampo} font-normal`}>{t("cardmarket.colunaTendencia")}</span>
            {i.tendencia !== null ? brl(i.tendencia, locale) : "—"}
            {(i.tendenciaEur !== null || i.foil) && (
              <span className={classesDetalhePreco}>
                {i.tendenciaEur !== null && eur(i.tendenciaEur, locale)}
                {i.tendenciaEur !== null && i.foil && " · "}
                {i.foil && (
                  // No toque o `title` não existe: a explicação vira um toggletip.
                  <Dica texto={t("cardmarket.foilExplicacao")}>
                    <span title={t("cardmarket.foilExplicacao")}>{t("cardmarket.foil")}</span>
                  </Dica>
                )}
              </span>
            )}
            {cotacaoDaLinha !== null && (
              <span className={classesDetalhePreco}>
                {t("cardmarket.cotacaoDaLinha", { data: dataCivil(cotacaoDaLinha, locale) })}
              </span>
            )}
          </td>
          <td
            className={`p-2 text-right font-mono tabular-nums ${classesCelulaEmpilhada} ${classesCampoPreco} max-md:self-start`}
          >
            <span className={classesRotuloCampo}>{t("cardmarket.colunaMedia")}</span>
            {i.media !== null ? brl(i.media, locale) : "—"}
          </td>
        </>
      ) : (
        <td
          colSpan={3}
          className={`p-2 text-right text-muted ${classesCelulaEmpilhada} max-md:basis-full max-md:text-left`}
          title={t("cardmarket.semPrecoExplicacao")}
        >
          {/* O `title` não existe no toque: a explicação vira um toggletip. */}
          <Dica texto={t("cardmarket.semPrecoExplicacao")}>
            <span>{t("cardmarket.semPreco")}</span>
          </Dica>
        </td>
      )}
      <td className={`p-2 whitespace-nowrap text-muted ${classesCelulaEmpilhada} max-md:basis-full max-md:text-xs`}>
        <span className={classesRotuloCampo}>{t("colunaConsultado")}: </span>
        {new Date(i.consultadoEm).toLocaleDateString(locale)}
      </td>
    </tr>
  );
}
