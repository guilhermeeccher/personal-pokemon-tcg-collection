"use client";

/**
 * Preços das cartas especiais — o que as cartas holo, as secretas e as
 * clássicas de 30 Anos valem (`lib/dominio/precos-cartas-especiais.ts`), por
 * uma de duas fontes, escolhida por instalação (`PRECO_FONTE`) e informada pelo
 * servidor em `dados.fonte`:
 *
 * - **Liga** (o padrão, e também quando a resposta não diz a fonte): o preço
 *   anunciado na LigaPokemon, em reais, como o site o dá.
 * - **Cardmarket**: a tendência do Cardmarket que a TCGdex entrega, convertida
 *   em reais pela PTAX de fechamento — referência internacional, comparável ao
 *   **menor** preço da Liga, não ao médio. A cotação e o dia dela ficam
 *   escritos à vista, e as duas fontes nunca aparecem juntas.
 *
 * A tela lê **sempre o snapshot** de `GET /api/inventario/precos`; quem fala
 * com o site da Liga ou com a TCGdex é a rodada que o botão dispara
 * (`POST /api/inventario/precos`), no ritmo que o servidor decide. Enquanto há
 * uma rodada viva a tela relê o snapshot no período `clamp(intervalo × 250 ms,
 * 5 s, 60 s)` (`periodoDeAtualizacaoMs`), nunca num número fixo; a leitura é
 * ao nosso banco, nunca ao site deles, e nada nesta tela pode aumentar o
 * ritmo da rodada. Uma recusa do servidor — inclusive a da Liga bloqueando a
 * rodada, que chega como o `erro` dela — aparece como a v1 a mostra, e **o
 * bloqueio nunca é contornado** por esta tela.
 *
 * Tocar numa carta abre o `<DetalheCarta>` em modo cópia (`use-detalhe-da-carta`);
 * a foto e a cópia de cada carta da página vêm de uma leitura própria
 * (`GET /api/inventario/precos/cartas`), pedida só quando as cartas da página
 * mudam.
 */

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";
import { formatarDuracao } from "@/lib/dominio/estimativa-varredura";
import { VALIDADE_CONSULTA_HORAS } from "@/lib/dominio/frescor-consulta";
import type { FontePreco } from "@/lib/dominio/fonte-preco";
import {
  type CartaDaTabelaDTO,
  type RespostaPrecosDTO,
  type RodadaListadaDTO,
  batidaDeveReler,
  fonteDaResposta,
  idsParaPedir,
  paginar,
  periodoDeAtualizacaoMs,
  textoDaCotacao,
} from "@/lib/dominio/precos-v2";

import { Botao } from "../../../_componentes/primitivos/botao";
import { useConfirmacao } from "../../../_componentes/primitivos/dialogo-confirmacao";
import { AvisoEmLinha, Painel, type TomPainel } from "../../../_componentes/primitivos/painel";
import { rotuloDaRaridade } from "../../visao-geral/_componentes/rotulos";

import { GraficoValorTotal } from "./grafico-valor-total";
import estilos from "./precos.module.css";
import { Rodadas } from "./rodadas";
import { type LinhaDaTabela, TabelaPrecos } from "./tabela-precos";
import { useDetalheDaCarta } from "./use-detalhe-da-carta";

/** O que o `POST` devolve quando a rodada saiu (202). */
interface DisparoDTO {
  cartasParaConsultar: number;
  cartasPuladas: number;
  estimativaSegundos: number;
  previsaoTermino: string;
}

function ehDisparo(corpo: unknown): corpo is DisparoDTO {
  if (typeof corpo !== "object" || corpo === null) return false;
  const c = corpo as Record<string, unknown>;
  return (
    typeof c.cartasParaConsultar === "number" &&
    typeof c.cartasPuladas === "number" &&
    typeof c.estimativaSegundos === "number" &&
    typeof c.previsaoTermino === "string"
  );
}

interface Recado {
  texto: string;
  tom: TomPainel;
}

export function Precos({ fonte: fonteDoServidor }: { fonte?: FontePreco }) {
  const t = useTranslations("v2Precos");
  const tr = useTranslations("recusas");
  const tRaridades = useTranslations("raridadesCarta");
  const tComum = useTranslations("componentes");
  const locale = useLocale();
  const { confirmar, dialogo } = useConfirmacao();

  const [dados, setDados] = useState<RespostaPrecosDTO | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falhaDeLeitura, setFalhaDeLeitura] = useState(false);
  const [disparando, setDisparando] = useState(false);
  const [erro, setErro] = useState<Recado | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [cartas, setCartas] = useState<ReadonlyMap<string, CartaDaTabelaDTO>>(new Map());
  // Sobe a cada escrita do detalhe, e a cada "tentar de novo" da leitura das cartas:
  // a cópia que cada carta abre pode ter mudado.
  const [versaoDasCartas, setVersaoDasCartas] = useState(0);
  const [falhaDasCartas, setFalhaDasCartas] = useState(false);

  // Quem decide é a resposta do GET, e uma resposta sem `fonte` é a Liga. Antes
  // de ela chegar vale a que o invólucro de servidor passou: sem isso, numa
  // instalação Cardmarket o texto e o botão piscariam com os da Liga.
  const fonte: FontePreco = dados ? fonteDaResposta(dados) : (fonteDoServidor ?? "liga");
  const cardmarket = fonte === "cardmarket";

  // Uma leitura por vez: cada nova (o polling, uma ação, "tentar de novo")
  // cancela a anterior pelo `cleanup` do efeito, para uma resposta atrasada
  // nunca sobrescrever uma mais nova. Reler é subir `versaoDaLeitura`.
  const [versaoDaLeitura, setVersaoDaLeitura] = useState(0);
  const recarregar = useCallback(() => setVersaoDaLeitura((v) => v + 1), []);
  // Há leitura em voo: o relógio não a cancela (`batidaDeveReler`).
  const leituraEmCurso = useRef(false);
  useEffect(() => {
    const controle = new AbortController();
    leituraEmCurso.current = true;
    fetch("/api/inventario/precos", { signal: controle.signal, cache: "no-store" })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error(String(resposta.status));
        const corpo = (await resposta.json()) as RespostaPrecosDTO;
        if (controle.signal.aborted) return;
        leituraEmCurso.current = false;
        setDados(corpo);
        setFalhaDeLeitura(false);
        setCarregando(false);
      })
      .catch(() => {
        if (controle.signal.aborted) return;
        leituraEmCurso.current = false;
        setFalhaDeLeitura(true);
        setCarregando(false);
      });
    return () => controle.abort();
  }, [versaoDaLeitura]);

  const rodada = dados?.varredura ?? null;
  const rodando = rodada?.emAndamento ?? false;
  const intervaloSegundos = dados?.ritmo?.intervaloSegundos ?? null;
  useEffect(() => {
    if (!rodando) return;
    const periodo = periodoDeAtualizacaoMs(intervaloSegundos === null ? null : { intervaloSegundos });
    const relogio = setInterval(() => {
      // Aba escondida não precisa do andamento; ao voltar, a próxima batida lê.
      // E uma leitura ainda em voo termina antes de outra começar.
      if (batidaDeveReler({ leituraEmCurso: leituraEmCurso.current, abaVisivel: document.visibilityState !== "hidden" })) {
        recarregar();
      }
    }, periodo);
    return () => clearInterval(relogio);
  }, [rodando, intervaloSegundos, recarregar]);

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
    let resposta: Response;
    let corpo: unknown;
    try {
      resposta = await fetch("/api/inventario/precos", { method: "POST" });
      corpo = await resposta.json().catch(() => ({}));
    } catch {
      setDisparando(false);
      setErro({ texto: t("erroIniciar"), tom: "perigo" });
      return;
    }
    setDisparando(false);
    if (!resposta.ok || !ehDisparo(corpo)) {
      // Toda recusa (rodada viva, nada a consultar, cotação fora do ar, Liga
      // barrando…) sai com o texto dela. Rodada viva: relê, para mostrá-la.
      setErro({ texto: textoDaRecusa(tr, corpo, t("erroIniciar")), tom: resposta.ok ? "perigo" : "alerta" });
      if (resposta.status === 409) recarregar();
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
    recarregar();
  }

  async function excluirRodada(r: RodadaListadaDTO) {
    const data = new Date(r.criadoEm).toLocaleString(locale);
    const confirmado = await confirmar({
      titulo: t("rodadas.confirmarTitulo", { data }),
      descricao: t("rodadas.confirmarTexto"),
      rotuloConfirmar: t("rodadas.confirmarBotao"),
      perigoso: true,
    });
    if (!confirmado) return;
    setExcluindo(r.id);
    setErro(null);
    try {
      const resposta = await fetch(`/api/inventario/precos/rodadas/${r.id}`, { method: "DELETE" });
      if (!resposta.ok) {
        const corpo: unknown = await resposta.json().catch(() => ({}));
        setErro({ texto: textoDaRecusa(tr, corpo, t("rodadas.erroExcluir")), tom: "alerta" });
        // Sumiu (404) ou está viva (409): a lista na tela estava velha.
        if (resposta.status === 404 || resposta.status === 409) recarregar();
        return;
      }
      recarregar();
    } catch {
      setErro({ texto: t("rodadas.erroExcluir"), tom: "perigo" });
    } finally {
      setExcluindo(null);
    }
  }

  // Uma lista por fonte, e só uma delas tem itens: cada linha é escrita com o
  // tipo da sua fonte.
  const linhas = useMemo<LinhaDaTabela[]>(() => {
    if (!dados) return [];
    return dados.fonte === "cardmarket"
      ? dados.itens.map((item) => ({ fonte: "cardmarket" as const, item }))
      : dados.itens.map((item) => ({ fonte: "liga" as const, item }));
  }, [dados]);
  const { itens: linhasDaPagina, pagina: paginaVisivel, totalPaginas } = paginar(linhas, pagina);
  const idsDaPagina = idsParaPedir(linhasDaPagina.map((l) => l.item.cartaId)).join("\n");

  // A foto e a cópia das cartas da página. Pedida de novo só quando as cartas
  // mudam (outra página, a ordem trocou numa rodada) ou depois de uma escrita
  // do detalhe; o que já se sabe fica enquanto a resposta nova não chega.
  useEffect(() => {
    if (idsDaPagina === "") return;
    const controle = new AbortController();
    const busca = idsDaPagina
      .split("\n")
      .map((id) => `id=${encodeURIComponent(id)}`)
      .join("&");
    fetch(`/api/inventario/precos/cartas?${busca}`, { signal: controle.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((corpo: { cartas: CartaDaTabelaDTO[] }) => {
        if (controle.signal.aborted) return;
        setFalhaDasCartas(false);
        setCartas((antes) => new Map([...antes, ...corpo.cartas.map((c) => [c.cartaId, c] as const)]));
      })
      // Sem a foto a linha continua lendo bem, mas a carta não abre: diz isso e
      // deixa repetir a leitura, que os próximos relógios não repetem (os ids
      // da página não mudaram).
      .catch(() => {
        if (!controle.signal.aborted) setFalhaDasCartas(true);
      });
    return () => controle.abort();
  }, [idsDaPagina, versaoDasCartas]);

  const { abrir, detalhe, abertaCartaId, alvoCartaId } = useDetalheDaCarta(
    useCallback(() => {
      recarregar();
      setVersaoDasCartas((v) => v + 1);
    }, [recarregar]),
  );

  const cotacao = dados?.fonte === "cardmarket" ? dados.cotacao : null;
  const textoCotacao = cotacao ? t("cardmarket.cotacaoUsada", textoDaCotacao(cotacao, locale)) : null;

  const ritmo = dados?.ritmo ?? null;
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

  const brl = (v: number) => v.toLocaleString(locale, { style: "currency", currency: "BRL" });
  const rotuloRaridade = (raridade: string | null) =>
    rotuloDaRaridade(tRaridades, tComum("semRaridade"), raridade);
  const percentual =
    rodada && rodada.totalCartas > 0
      ? Math.min(100, Math.round((rodada.cartasConsultadas / rodada.totalCartas) * 100))
      : 0;

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecalho}>
        <h1 className={estilos.titulo}>{t("titulo")}</h1>
        <p className={estilos.subtituloPagina}>{t(cardmarket ? "cardmarket.descricao" : "descricao")}</p>
      </header>

      <Painel as="section" className={estilos.controle}>
        <div className={estilos.controleLinha}>
          <Botao variante="primario" onClick={disparar} carregando={disparando} disabled={rodando} className={estilos.botaoAtualizar}>
            {disparando
              ? t("iniciando")
              : rodando
                ? t("emAndamentoBotao")
                : t(cardmarket ? "cardmarket.atualizar" : "atualizar")}
          </Botao>
          <span className={estilos.ultima}>
            {dados?.ultimaAtualizacao
              ? t("ultimaAtualizacao", { data: new Date(dados.ultimaAtualizacao).toLocaleString(locale) })
              : dados
                ? t("nuncaAtualizado")
                : ""}
          </span>
        </div>
        {cardmarket ? (
          <>
            {/* A cotação fica à vista, e não numa dica: é o que diz que o valor
                foi convertido, por qual taxa e de que dia. */}
            {textoCotacao && <p className={estilos.cotacao}>{textoCotacao}</p>}
            <p className={estilos.aviso}>{t("cardmarket.explicacaoRitmo", { horas: VALIDADE_CONSULTA_HORAS })}</p>
          </>
        ) : (
          <p className={estilos.aviso}>
            {textoRitmo} {t("explicacaoRitmo", { horas: VALIDADE_CONSULTA_HORAS })}
          </p>
        )}
      </Painel>

      {erro && (
        <AvisoEmLinha tom={erro.tom} papel="alert">
          {erro.texto}
        </AvisoEmLinha>
      )}
      {aviso && <AvisoEmLinha papel="status">{aviso}</AvisoEmLinha>}
      {falhaDeLeitura && (
        <AvisoEmLinha
          tom="perigo"
          papel="alert"
          titulo={t("erroCarregar")}
          acao={
            <Botao pequeno onClick={recarregar}>
              {t("tentarDeNovo")}
            </Botao>
          }
        >
          {dados ? t("erroCarregarTexto") : null}
        </AvisoEmLinha>
      )}
      {carregando && !dados && (
        <p className={estilos.aviso} role="status">
          {t("carregando")}
        </p>
      )}

      {rodada && (
        <Painel as="section" compacto className={estilos.rodadaViva} aria-label={t("rodada.rotulo")}>
          <div className={estilos.rodadaVivaTopo}>
            <span className={estilos.selo} data-tom={rodada.emAndamento ? "aviso" : rodada.erro ? "perigo" : "neutro"}>
              {rodada.emAndamento ? t("rodada.emAndamento") : rodada.erro ? t("rodada.interrompida") : t("rodada.concluida")}
            </span>
            <span className={estilos.aviso}>
              {t("rodada.andamento", {
                feitas: rodada.cartasConsultadas,
                total: rodada.totalCartas,
                requisicoes: rodada.requisicoes,
              })}
              {rodada.cartasComFalha > 0 && ` · ${t("rodada.falhas", { total: rodada.cartasComFalha })}`}
              {" · "}
              {new Date(rodada.criadoEm).toLocaleString(locale)}
            </span>
          </div>
          <div
            className={estilos.progresso}
            role="progressbar"
            aria-label={t("rodada.progresso")}
            aria-valuemin={0}
            aria-valuemax={rodada.totalCartas}
            aria-valuenow={rodada.cartasConsultadas}
          >
            <span className={estilos.progressoBarra} style={{ width: `${percentual}%` }} />
          </div>
          {rodando && rodada.segundosRestantes !== null && (
            <p className={estilos.aviso}>
              {t("rodada.faltam", {
                duracao: formatarDuracao(rodada.segundosRestantes),
                termino:
                  rodada.previsaoTermino !== null
                    ? t("rodada.terminoPrevisto", { quando: horaLegivel(rodada.previsaoTermino) })
                    : "",
              })}
            </p>
          )}
          {rodando && <p className={estilos.aviso}>{t("rodada.telaSeAtualiza")}</p>}
          {/* O motivo de a rodada parar — um bloqueio da Liga, por exemplo — sai
              como o servidor o escreveu. A tela não tem o que fazer a respeito
              além de dizê-lo: o bloqueio nunca é contornado. */}
          {rodada.erro && !rodando && (
            <p className={estilos.erroRodada} role="alert">
              {t("rodada.paradaAntes", { erro: rodada.erro })}
            </p>
          )}
        </Painel>
      )}

      {dados && <GraficoValorTotal serie={dados.serie} fonte={fonte} />}

      {/* No Cardmarket o `somaMedios` do servidor é a soma dos valores
          guardados — as tendências, salvo a trava (`comoPrecoDeCarta`): a conta
          é a mesma, só o nome muda. */}
      {dados && dados.itens.length > 0 && (
        <p className={estilos.resumo}>
          {t(cardmarket ? "cardmarket.resumo" : "resumo", {
            comPreco: dados.resumo.cartasComPreco,
            selecionadas: dados.cartasEspeciais,
            soma: brl(dados.resumo.somaMedios),
          })}
          {dados.resumo.naoEncontradas > 0 &&
            t(cardmarket ? "cardmarket.semPrecoResumo" : "naoEncontradasResumo", {
              total: dados.resumo.naoEncontradas,
            })}
        </p>
      )}

      {dados && dados.itens.length === 0 && <Painel className={estilos.vazio}>{t("vazio")}</Painel>}
      {dados && dados.itens.length > 0 && (
        <TabelaPrecos
          linhas={linhasDaPagina}
          fonte={fonte}
          cotacao={cotacao}
          cartas={cartas}
          rotuloRaridade={rotuloRaridade}
          abertaCartaId={abertaCartaId}
          alvoCartaId={alvoCartaId}
          aoAbrir={abrir}
        />
      )}

      {falhaDasCartas && dados && dados.itens.length > 0 && (
        <AvisoEmLinha
          tom="alerta"
          papel="alert"
          titulo={t("erroCartas")}
          acao={
            <Botao pequeno onClick={() => setVersaoDasCartas((v) => v + 1)}>
              {t("tentarDeNovo")}
            </Botao>
          }
        >
          {t("erroCartasTexto")}
        </AvisoEmLinha>
      )}

      {totalPaginas > 1 && (
        <nav className={estilos.paginacao} aria-label={t("paginacao.rotulo")}>
          <Botao disabled={paginaVisivel <= 1} onClick={() => setPagina(paginaVisivel - 1)}>
            {t("paginacao.anterior")}
          </Botao>
          <span>{t("paginacao.pagina", { pagina: paginaVisivel, totalPaginas })}</span>
          <Botao disabled={paginaVisivel >= totalPaginas} onClick={() => setPagina(paginaVisivel + 1)}>
            {t("paginacao.proxima")}
          </Botao>
        </nav>
      )}

      {dados && <Rodadas rodadas={dados.rodadas} excluindo={excluindo} aoExcluir={excluirRodada} />}

      {detalhe}
      {dialogo}
    </div>
  );
}
