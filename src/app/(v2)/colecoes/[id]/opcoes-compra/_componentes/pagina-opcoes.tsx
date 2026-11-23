"use client";

/**
 * Opções de compra das vagas vazias de uma coleção na v2 — **pacote 4a**, a
 * mesma URL da v1 (`/colecoes/[id]/opcoes-compra`), aberta da aba "O que
 * falta". Tudo pelas rotas da v1, sem mudança:
 *
 * - `GET /api/colecoes/:id/opcoes-compra` — o snapshot: as vagas vazias (regra
 *   6) com as opções, os preços, as escolhas, a fonte e a última rodada, e a
 *   lista para colar já montada no servidor (`abasLiga`).
 * - `POST` na mesma rota — dispara a varredura da Liga ou, com
 *   `PRECO_FONTE=cardmarket`, a busca de preços das candidatas (uma rodada no
 *   app inteiro). A resposta sai na hora; a rodada segue no servidor, e a tela
 *   relê o snapshot enquanto ela vive, no período que sai do intervalo
 *   (`periodoDeLeituraMs`). **Nada nesta tela fala com a Liga ou com a
 *   TCGdex**, nem acelera a rodada: ela só pergunta ao nosso banco. Um
 *   bloqueio da Liga chega como o `erro` da rodada e é mostrado como está —
 *   **um bloqueio nunca é contornado**.
 * - `PATCH …/selecao` — marcar e desmarcar, pela **fila única de escritas da
 *   coleção** do pacote 1e (`envio-selecao.ts`), a mesma da aba e do detalhe:
 *   o servidor vê os gestos na ordem. A marca aparece na hora (pendência por
 *   opção) e só cai com uma leitura pedida depois de o pedido terminar.
 * - `…/sem-estoque` e `…/exportar` — a colagem do aviso da Liga e os arquivos,
 *   que saem das mesmas funções da v1 (o mesmo arquivo para a mesma coleção).
 *
 * As decisões puras (filtro, ordem, grupos, corpos, plano do atalho,
 * pendências, período) estão em `opcoes-compra.ts`, testadas sem banco.
 */

import { ArrowLeft, CircleAlert, Download, ShoppingCart, WandSparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { textoDaRecusa } from "@/app/_comum/recusa";
import { FAIXA_REGIAO, NOME_REGIAO } from "@/lib/dominio/escopo-pokedex";
import { formatarDuracao } from "@/lib/dominio/estimativa-varredura";
import type { FontePreco } from "@/lib/dominio/fonte-preco";
import { VALIDADE_CONSULTA_HORAS } from "@/lib/dominio/frescor-consulta";
import type { Ordenacao } from "@/lib/dominio/liga-opcoes";
import { batidaDeveReler } from "@/lib/dominio/precos-v2";

import { Carta } from "../../../../_componentes/carta/carta";
import { useFormatos } from "../../../../_componentes/detalhe/formatos";
import { useAviso } from "../../../../_componentes/primitivos/aviso-flutuante";
import { Botao, BotaoLink } from "../../../../_componentes/primitivos/botao";
import { Campo } from "../../../../_componentes/primitivos/campo";
import { Modal } from "../../../../_componentes/primitivos/modal";
import { AvisoEmLinha, Painel } from "../../../../_componentes/primitivos/painel";
import { Segmentado } from "../../../../_componentes/primitivos/segmentado";
import { type CorpoSelecao, type DesfechoDaSelecao, juntarCorpos } from "../../_componentes/compra-falta";
import { enviarSelecao, enviosConcluidos, useEnvios } from "../../_componentes/envio-selecao";

import { AtalhoOpcoes } from "./atalho-opcoes";
import { ListaParaColar, baixar, urlExportar } from "./lista-para-colar";
import {
  type OpcaoDTO,
  type OrdemVagasSet,
  type PendenciaOpcao,
  type PlanoMelhor,
  type RespostaOpcoesDTO,
  type VagaDTO,
  VAGAS_POR_VEZ,
  agruparVagas,
  chaveRecolhidas,
  comPendencias,
  corpoDaBuscaDePrecos,
  corpoDaMarcacao,
  corpoDaVarredura,
  cortarGrupos,
  estaRecolhida,
  filtrosIniciais,
  fonteDasOpcoes,
  lerRecolhidas,
  lerTeto,
  periodoDeLeituraMs,
  planoMelhor,
  podarPendencias,
  resumoComPendencias,
  rodadaViva,
  semSeqs,
  vagasDaTela,
  vagasVisiveis,
} from "./opcoes-compra";
import estilos from "./opcoes.module.css";
import { PainelSemEstoque } from "./painel-sem-estoque";
import { VagaOpcoes, numeracao } from "./vaga-opcoes";

/** Quanto esperar, depois do último pedido, para reler: uma rajada de toques vira uma leitura só. */
const ESPERA_RELEITURA_MS = 700;

type EstadoLeitura = "carregando" | "ok" | "erro" | "sumiu";

const semAssinatura = () => () => {};

function lerGuardadas(colecaoId: string): string | null {
  try {
    return window.localStorage.getItem(chaveRecolhidas(colecaoId));
  } catch {
    return null;
  }
}

function guardar(colecaoId: string, valor: Record<string, boolean>) {
  try {
    window.localStorage.setItem(chaveRecolhidas(colecaoId), JSON.stringify(valor));
  } catch {
    // Sem armazenamento a arrumação vale só até recarregar — nada quebra.
  }
}

interface RespostaInicio {
  vagasParaConsultar?: number;
  vagasPuladas?: number;
  cartasParaConsultar?: number;
  cartasPuladas?: number;
  estimativaSegundos?: number;
  previsaoTermino?: string;
}

export function OpcoesCompra({ id, fonte: fonteDoServidor }: { id: string; fonte: FontePreco }) {
  const t = useTranslations("v2OpcoesCompra");
  const tr = useTranslations("recusas");
  const locale = useLocale();
  const formatos = useFormatos();
  const avisar = useAviso();

  /* ---------- A leitura ---------- */

  const [dados, setDados] = useState<RespostaOpcoesDTO | null>(null);
  const [leitura, setLeitura] = useState<EstadoLeitura>("carregando");
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  const leituraEmCurso = useRef(false);

  // Parâmetros. O padrão do set é outro (sem teto, por preço), e o tipo só se
  // sabe na primeira resposta: aplicado nela, uma vez, nunca por cima do que
  // o usuário já mexeu.
  const [tetoTexto, setTetoTexto] = useState(String(filtrosIniciais("pokedex").tetoPreco ?? ""));
  const [ordenacao, setOrdenacao] = useState<Ordenacao>(filtrosIniciais("pokedex").ordenacao);
  const [incluirFora, setIncluirFora] = useState(filtrosIniciais("pokedex").incluirForaDoCatalogo);
  // Escape do pulo por frescor: sem ele, quem buscou hoje só receberia "já
  // consultadas" ao clicar, sem caminho para pedir preço novo.
  const [reconsultarTudo, setReconsultarTudo] = useState(false);
  const [soComOpcao, setSoComOpcao] = useState(false);
  const [ordemVagas, setOrdemVagas] = useState<OrdemVagasSet>("numero");
  const padraoAplicado = useRef(false);

  // Pendências: o estado de verdade mora na ref (dois toques podem chegar
  // antes de um render), e o estado só desenha.
  const pendenciasRef = useRef<Map<string, PendenciaOpcao>>(new Map());
  const [pendencias, setPendenciasEstado] = useState<ReadonlyMap<string, PendenciaOpcao>>(() => new Map());
  const definirPendencias = useCallback((f: (atual: Map<string, PendenciaOpcao>) => Map<string, PendenciaOpcao>) => {
    pendenciasRef.current = f(pendenciasRef.current);
    setPendenciasEstado(pendenciasRef.current);
  }, []);
  const seq = useRef(0);
  /** O maior gesto cujo pedido já terminou: uma leitura pedida agora o reflete. */
  const confirmadasAte = useRef(0);

  const envios = useEnvios(id);
  /**
   * Quantos pedidos da coleção tinham terminado quando saiu a última leitura
   * que deu certo. Um pedido que termina depois (daqui, da aba ou do detalhe)
   * deixa a lista velha até uma leitura iniciada depois dele chegar.
   */
  const [concluidosLidos, setConcluidosLidos] = useState<number | null>(null);

  useEffect(() => {
    const controle = new AbortController();
    const reflete = confirmadasAte.current;
    const concluidosNaLeitura = enviosConcluidos(id);
    leituraEmCurso.current = true;
    fetch(`/api/colecoes/${id}/opcoes-compra`, { cache: "no-store", signal: controle.signal })
      .then(async (r) => {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as RespostaOpcoesDTO;
      })
      .then((corpo) => {
        if (controle.signal.aborted) return;
        leituraEmCurso.current = false;
        if (corpo === null) {
          setLeitura("sumiu");
          return;
        }
        setDados(corpo);
        setLeitura("ok");
        setConcluidosLidos(concluidosNaLeitura);
        definirPendencias((p) => podarPendencias(p, reflete));
        if (!padraoAplicado.current) {
          padraoAplicado.current = true;
          const padrao = filtrosIniciais(corpo.tipo);
          setTetoTexto(String(padrao.tetoPreco ?? ""));
          setOrdenacao(padrao.ordenacao);
          setIncluirFora(padrao.incluirForaDoCatalogo);
        }
      })
      .catch(() => {
        if (controle.signal.aborted) return;
        leituraEmCurso.current = false;
        setLeitura("erro");
      });
    return () => {
      controle.abort();
      leituraEmCurso.current = false;
    };
  }, [id, versao, definirPendencias]);

  const fonte: FontePreco = dados ? fonteDasOpcoes(dados) : fonteDoServidor;
  const cardmarket = fonte === "cardmarket";
  const ehSet = dados?.tipo === "set";
  const viva = dados ? rodadaViva(dados) : false;
  const periodo = dados ? periodoDeLeituraMs(dados) : null;

  // Enquanto a rodada vive, a tela relê sozinha, no período que sai do
  // intervalo — nunca fixo. Uma batida não cancela a leitura em voo e pula a
  // aba escondida (`batidaDeveReler`).
  useEffect(() => {
    if (!viva || periodo === null) return;
    const relogio = setInterval(() => {
      if (batidaDeveReler({ leituraEmCurso: leituraEmCurso.current, abaVisivel: document.visibilityState !== "hidden" })) {
        recarregar();
      }
    }, periodo);
    return () => clearInterval(relogio);
  }, [viva, periodo, recarregar]);

  /* ---------- A grade da tela ---------- */

  const teto = lerTeto(tetoTexto);
  const vagasComMarcas = useMemo(() => comPendencias(dados?.vagas ?? [], pendencias), [dados, pendencias]);
  const vagasTela = useMemo(
    () => vagasDaTela(vagasComMarcas, { fonte, tipo: dados?.tipo ?? "pokedex", teto: teto.valor, ordenacao }),
    [vagasComMarcas, fonte, dados?.tipo, teto.valor, ordenacao],
  );
  const visiveis = useMemo(() => vagasVisiveis(vagasTela, { soComOpcao, ehSet, ordemVagas }), [vagasTela, soComOpcao, ehSet, ordemVagas]);
  const grupos = useMemo(() => agruparVagas(visiveis, ehSet), [visiveis, ehSet]);
  const [limite, setLimite] = useState(VAGAS_POR_VEZ);
  const gruposMontados = useMemo(() => cortarGrupos(grupos, limite), [grupos, limite]);

  /* ---------- Recolher (preferência do aparelho) ---------- */

  // Lida depois da hidratação: o servidor e o primeiro desenho veem "nada
  // guardado", e o valor do aparelho entra em seguida.
  const guardadasBruto = useSyncExternalStore(semAssinatura, () => lerGuardadas(id), () => null);
  const [mexidas, setMexidas] = useState<Record<string, boolean> | null>(null);
  const guardadas = useMemo(() => mexidas ?? lerRecolhidas(guardadasBruto), [mexidas, guardadasBruto]);
  const definirRecolhidas = useCallback(
    (vagas: readonly VagaDTO[], recolher: boolean) => {
      const novo = { ...guardadas, ...Object.fromEntries(vagas.map((v) => [v.chave, recolher])) };
      setMexidas(novo);
      guardar(id, novo);
    },
    [guardadas, id],
  );
  const recolherUma = useCallback((v: VagaDTO, recolher: boolean) => definirRecolhidas([v], recolher), [definirRecolhidas]);

  /* ---------- Marcar ---------- */

  const relogioReler = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emVoo = useRef(0);
  useEffect(
    () => () => {
      if (relogioReler.current) clearTimeout(relogioReler.current);
    },
    [],
  );
  const agendarReler = useCallback(() => {
    if (relogioReler.current) clearTimeout(relogioReler.current);
    relogioReler.current = setTimeout(() => {
      relogioReler.current = null;
      if (emVoo.current === 0) recarregar();
    }, ESPERA_RELEITURA_MS);
  }, [recarregar]);

  const textoDoDesfecho = useCallback(
    (d: Exclude<DesfechoDaSelecao, { tipo: "ok" }>) => (d.tipo === "parcial" ? t("recusa.parcial") : t(`recusa.${d.motivo}`)),
    [t],
  );

  const enfileirar = useCallback(
    (corpos: CorpoSelecao[], seqs: number[], sucesso?: string) => {
      emVoo.current++;
      void enviarSelecao(id, juntarCorpos(corpos)).then((desfecho) => {
        emVoo.current--;
        if (desfecho === null) {
          // Descartado na fila: uma recusa (daqui, da aba ou do detalhe)
          // entrou antes. Nada saiu; quem recusou já pediu a releitura.
          definirPendencias((p) => semSeqs(p, seqs));
          return;
        }
        confirmadasAte.current = Math.max(confirmadasAte.current, ...seqs);
        if (desfecho.tipo === "recusada") {
          // Tudo o que a tela mostrava por conta própria cai; a releitura diz
          // a verdade.
          definirPendencias(() => new Map());
          avisar(textoDoDesfecho(desfecho), { tom: "erro" });
          recarregar();
          return;
        }
        if (desfecho.tipo === "parcial") {
          avisar(textoDoDesfecho(desfecho), { tom: "erro" });
          recarregar();
          return;
        }
        if (sucesso) avisar(sucesso, { tom: "sucesso" });
        agendarReler();
      });
    },
    [id, definirPendencias, avisar, textoDoDesfecho, recarregar, agendarReler],
  );

  /**
   * Otimista, como na v1: marcar é gesto de lista, e esperar o servidor a
   * cada toque tornaria a triagem de dezenas de cartas insuportável. Tocar de
   * novo antes da releitura manda o pedido inverso, que entra na mesma fila.
   */
  const alternar = useCallback(
    (opcao: OpcaoDTO) => {
      const nova = !opcao.selecionada;
      const corpo = corpoDaMarcacao(opcao, fonte, nova);
      if (!corpo) return;
      const n = ++seq.current;
      definirPendencias((p) => new Map(p).set(opcao.id, { seq: n, selecionada: nova }));
      enfileirar([corpo], [n]);
    },
    [fonte, definirPendencias, enfileirar],
  );

  /* ---------- "Marcar a melhor de cada vaga" ---------- */

  const [atalho, setAtalho] = useState<{ plano: PlanoMelhor; base: RespostaOpcoesDTO; mudou: boolean } | null>(null);

  const criterio = useMemo(() => {
    const ordem = (o: Ordenacao) => (o === "preco" ? t("criterio.preco") : t("criterio.preferencia"));
    if (cardmarket) {
      return t("criterio.tela", {
        ordem: ordem(ehSet ? "preco" : ordenacao),
        teto: teto.valor === null ? t("criterio.semTeto") : t("criterio.teto", { valor: formatos.brl(teto.valor) }),
      });
    }
    const f = dados?.varredura?.filtros;
    if (!f) return t("criterio.semVarredura");
    return t("criterio.varredura", {
      ordem: ordem(f.ordenacao),
      teto: f.tetoPreco === null ? t("criterio.semTeto") : t("criterio.teto", { valor: formatos.brl(f.tetoPreco) }),
    });
  }, [cardmarket, ehSet, ordenacao, teto.valor, dados?.varredura?.filtros, formatos, t]);

  function abrirAtalho() {
    if (!dados) return;
    setAtalho({ plano: planoMelhor(vagasTela, fonte, pendenciasRef.current), base: dados, mudou: false });
  }

  function confirmarAtalho() {
    if (!atalho || !dados) return;
    // A leitura mudou com a janela aberta: o plano mostrado não vale mais.
    if (atalho.base !== dados) {
      setAtalho({ plano: planoMelhor(vagasTela, fonte, pendenciasRef.current), base: dados, mudou: true });
      return;
    }
    const { itens, corpos } = atalho.plano;
    setAtalho(null);
    if (corpos.length === 0) return;
    const seqs = itens.map(({ opcao }) => {
      const n = ++seq.current;
      definirPendencias((p) => new Map(p).set(opcao.id, { seq: n, selecionada: true }));
      return n;
    });
    enfileirar(corpos, seqs, t("atalho.feito", { total: itens.length }));
  }

  /* ---------- Disparar a rodada ---------- */

  const [disparando, setDisparando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const horaLegivel = useCallback(
    (iso: string | null | undefined): string => {
      if (!iso) return "—";
      const quando = new Date(iso);
      const hora = quando.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
      const mesmoDia = new Date().toDateString() === quando.toDateString();
      if (mesmoDia) return t("asHora", { hora });
      return t("dataHora", {
        data: quando.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }),
        hora,
      });
    },
    [locale, t],
  );

  async function disparar() {
    setErro(null);
    setAviso(null);
    let corpo: Record<string, unknown>;
    if (cardmarket) {
      corpo = corpoDaBuscaDePrecos(reconsultarTudo);
    } else {
      // O teto inválido para aqui, antes de qualquer pedido: a varredura não sai com ele.
      if (!teto.valido) {
        setErro(t("erroTeto"));
        return;
      }
      corpo = corpoDaVarredura({ teto: teto.valor, ordenacao, incluirFora, reconsultarTudo });
    }
    setDisparando(true);
    let resposta: Response;
    try {
      resposta = await fetch(`/api/colecoes/${id}/opcoes-compra`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
    } catch {
      setDisparando(false);
      setErro(t("erroRede"));
      return;
    }
    const resp = (await resposta.json().catch(() => null)) as RespostaInicio | null;
    setDisparando(false);
    // Toda resposta relê: a recusa "em andamento" mostra a rodada viva, e a
    // rodada que começou passa a ser acompanhada.
    recarregar();
    if (!resposta.ok) {
      setErro(textoDaRecusa(tr, resp, t("erroIniciar")));
      return;
    }
    const estimativa = formatarDuracao(resp?.estimativaSegundos ?? 0);
    const previsao = horaLegivel(resp?.previsaoTermino);
    setAviso(
      cardmarket
        ? [
            t("buscaIniciada", { cartas: resp?.cartasParaConsultar ?? 0, estimativa, previsao }),
            (resp?.cartasPuladas ?? 0) > 0 ? t("buscaPuladas", { total: resp?.cartasPuladas ?? 0 }) : null,
            t("podeSair"),
          ]
            .filter(Boolean)
            .join(" ")
        : [
            t("varreduraIniciada", { vagas: resp?.vagasParaConsultar ?? 0, estimativa, previsao }),
            (resp?.vagasPuladas ?? 0) > 0 ? t("varreduraPuladas", { total: resp?.vagasPuladas ?? 0 }) : null,
            t("podeSair"),
          ]
            .filter(Boolean)
            .join(" "),
    );
  }

  /* ---------- Zoom ---------- */

  const [zoom, setZoom] = useState<OpcaoDTO | null>(null);

  /* ---------- Desenho ---------- */

  const resumo = dados ? resumoComPendencias(dados, pendencias) : { cartas: 0, total: 0 };
  const listaVelha = concluidosLidos !== null && envios.concluidos !== concluidosLidos;
  const atualizando = pendencias.size > 0 || envios.emVoo > 0 || listaVelha || leitura === "carregando";
  const ritmo = dados?.ritmo ?? null;
  const intervalo = ritmo ? (ritmo.intervaloSegundos >= 60 ? `${Math.round(ritmo.intervaloSegundos / 60)} min` : `${ritmo.intervaloSegundos} s`) : "";
  const textoRitmo = !ritmo
    ? ""
    : ritmo.origem === "env"
      ? t("ritmo.env", { intervalo })
      : ritmo.origem === "robots"
        ? t("ritmo.robots", { intervalo })
        : t("ritmo.conservador", { intervalo });
  const semOpcao = vagasTela.filter((v) => v.opcoes.length === 0).length;
  const textoSemOpcao = cardmarket ? (ehSet ? t("vaga.semCandidataSet") : t("vaga.semCandidataPokedex")) : ehSet ? t("vaga.semOfertaSet") : t("vaga.semOpcaoPokedex");
  const varredura = dados?.varredura ?? null;
  const rodada = dados?.rodada ?? null;
  const voltar = `/colecoes/${id}?aba=falta`;

  if (leitura === "sumiu") {
    return (
      <div className={estilos.pagina}>
        <AvisoEmLinha tom="perigo" papel="alert" titulo={t("sumiu")} acao={<BotaoLink href="/colecoes">{t("irParaColecoes")}</BotaoLink>}>
          {t("sumiuTexto")}
        </AvisoEmLinha>
      </div>
    );
  }

  return (
    <div className={estilos.pagina}>
      <BotaoLink href={voltar} variante="fantasma" pequeno icone={<ArrowLeft aria-hidden />} className={estilos.voltar}>
        {t("voltar")}
      </BotaoLink>
      <header className={estilos.cabecalho}>
        <h1 className={estilos.titulo}>{t("titulo")}</h1>
        <p className={estilos.subtituloPagina}>
          {cardmarket ? (ehSet ? t("descricao.setCardmarket") : t("descricao.pokedexCardmarket")) : ehSet ? t("descricao.setLiga") : t("descricao.pokedexLiga")}
        </p>
      </header>

      {/* Decisão 3 do README da v2: na fonte Liga a tela diz que consulta nova
          provavelmente não sai, e o que continua funcionando — sem contornar
          nada. */}
      {!cardmarket ? (
        <AvisoEmLinha tom="alerta" icone={<CircleAlert aria-hidden />} titulo={t("liga.titulo")}>
          {t("liga.texto")}
        </AvisoEmLinha>
      ) : null}

      <Painel as="section" className={estilos.parametros} aria-labelledby="v2-opcoes-parametros">
        <h2 id="v2-opcoes-parametros" className={estilos.subtitulo}>
          {t("parametros.titulo")}
        </h2>
        <div className={estilos.campos}>
          <div className={estilos.campoTeto}>
            <Campo
              rotulo={t("parametros.teto")}
              value={tetoTexto}
              onChange={(e) => setTetoTexto(e.target.value)}
              placeholder={t("parametros.semTeto")}
              inputMode="decimal"
              erro={teto.valido ? undefined : t("erroTeto")}
            />
          </div>
          {ehSet ? (
            <div className={estilos.grupoOrdem}>
              <span className={estilos.rotuloGrupo} id="v2-opcoes-ordem-vagas">
                {t("parametros.ordenarLista")}
              </span>
              <Segmentado<OrdemVagasSet>
                rotulo={t("parametros.ordenarLista")}
                valor={ordemVagas}
                aoMudar={setOrdemVagas}
                pequeno
                opcoes={[
                  { valor: "numero", rotulo: t("parametros.ordemNumero") },
                  { valor: "preco", rotulo: t("parametros.ordemMaisBarata") },
                ]}
              />
            </div>
          ) : (
            <div className={estilos.grupoOrdem}>
              <span className={estilos.rotuloGrupo}>{t("parametros.ordenarPor")}</span>
              <Segmentado<Ordenacao>
                rotulo={t("parametros.ordenarPor")}
                valor={ordenacao}
                aoMudar={setOrdenacao}
                pequeno
                opcoes={[
                  { valor: "preferencia", rotulo: t("parametros.ordemPreferencia") },
                  { valor: "preco", rotulo: t("parametros.ordemMaisBarata") },
                ]}
              />
            </div>
          )}
          {/* No set toda opção é a carta do próprio set, no catálogo por
              construção; no Cardmarket, toda opção é do catálogo. */}
          {!ehSet && !cardmarket ? (
            <label className={estilos.marcavel}>
              <input type="checkbox" checked={incluirFora} onChange={(e) => setIncluirFora(e.target.checked)} />
              {t("parametros.incluirFora")}
            </label>
          ) : null}
          <label className={estilos.marcavel}>
            <input type="checkbox" checked={reconsultarTudo} onChange={(e) => setReconsultarTudo(e.target.checked)} />
            {cardmarket ? t("parametros.rebuscarTudo") : t("parametros.reconsultarTudo")}
          </label>
          <Botao
            variante="primario"
            className={estilos.acaoPrincipal}
            carregando={disparando}
            // Duas rodadas ao mesmo tempo dobram o ritmo: o servidor recusa,
            // e a tela nem oferece.
            disabled={!dados || viva}
            onClick={() => void disparar()}
          >
            {disparando
              ? t("parametros.iniciando")
              : viva
                ? cardmarket
                  ? t("parametros.buscando")
                  : t("parametros.varrendo")
                : cardmarket
                  ? t("parametros.buscarPrecos")
                  : t("parametros.verificar")}
          </Botao>
        </div>
        {cardmarket ? (
          <>
            {dados?.precosCandidatas ? (
              <p className={estilos.texto}>
                {t("cobertura", {
                  comPreco: dados.precosCandidatas.comPreco,
                  cartas: dados.precosCandidatas.cartas,
                  aBuscar: dados.precosCandidatas.aBuscar,
                })}
                {dados.precosCandidatas.semPrecoNoCardmarket > 0 ? t("coberturaSemPreco", { total: dados.precosCandidatas.semPrecoNoCardmarket }) : ""}
              </p>
            ) : null}
            <p className={estilos.sutil}>{t("explicacaoCardmarket", { dias: dados?.precosCandidatas?.validadeDias ?? 7 })}</p>
          </>
        ) : (
          <p className={estilos.sutil}>
            {t("parametros.paraProxima")} {textoRitmo} {t("explicacaoFrescor", { horas: VALIDADE_CONSULTA_HORAS })}
            {ehSet ? ` ${t("explicacaoSet")}` : ""}
          </p>
        )}
      </Painel>

      {erro ? (
        <AvisoEmLinha tom="perigo" papel="alert">
          {erro}
        </AvisoEmLinha>
      ) : null}
      {aviso ? <AvisoEmLinha papel="status">{aviso}</AvisoEmLinha> : null}
      {leitura === "erro" ? (
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
      ) : null}
      {leitura === "carregando" && !dados ? (
        <p className={estilos.texto} role="status">
          {t("carregando")}
        </p>
      ) : null}

      {rodada ? (
        <Painel as="section" compacto className={estilos.rodada} aria-label={t("rodada.rotuloBusca")}>
          <div className={estilos.rodadaTopo}>
            <span className={estilos.selo} data-tom={rodada.emAndamento ? "aviso" : rodada.erro ? "perigo" : "neutro"}>
              {rodada.emAndamento ? t("rodada.emAndamento") : rodada.erro ? t("rodada.interrompida") : t("rodada.concluida")}
            </span>
            <span className={estilos.sutil}>
              {t("rodada.resumoBusca", { consultadas: rodada.cartasConsultadas, total: rodada.totalCartas, requisicoes: rodada.requisicoes })}
              {rodada.cartasComFalha > 0 ? ` · ${t("rodada.falhas", { total: rodada.cartasComFalha })}` : ""}
              {" · "}
              {new Date(rodada.criadoEm).toLocaleString(locale, { timeZone: "America/Sao_Paulo" })}
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
            <span
              className={estilos.progressoBarra}
              style={{ width: `${rodada.totalCartas > 0 ? Math.min(100, Math.round((rodada.cartasConsultadas / rodada.totalCartas) * 100)) : 0}%` }}
            />
          </div>
          {rodada.emAndamento && rodada.segundosRestantes !== null ? (
            <p className={estilos.sutil}>{t("rodada.faltaTempo", { tempo: formatarDuracao(rodada.segundosRestantes) })}</p>
          ) : null}
          {rodada.emAndamento ? <p className={estilos.sutil}>{t("rodada.telaSeAtualiza")}</p> : null}
          {rodada.erro && !rodada.emAndamento ? (
            <p className={estilos.erroRodada} role="alert">
              {t("rodada.buscaComErro", { erro: rodada.erro })}
            </p>
          ) : null}
        </Painel>
      ) : null}

      {varredura ? (
        <Painel as="section" compacto className={estilos.rodada} aria-label={t("rodada.rotuloVarredura")}>
          <div className={estilos.rodadaTopo}>
            <span className={estilos.selo} data-tom={varredura.emAndamento ? "aviso" : varredura.erro ? "perigo" : "neutro"}>
              {varredura.emAndamento ? t("rodada.emAndamento") : varredura.erro ? t("rodada.interrompida") : t("rodada.concluida")}
            </span>
            <span className={estilos.sutil}>
              {t("rodada.resumoVarredura", { vagas: varredura.vagasConsultadas, requisicoes: varredura.requisicoes })}
              {" · "}
              {new Date(varredura.criadoEm).toLocaleString(locale, { timeZone: "America/Sao_Paulo" })}
              {varredura.filtros.tetoPreco !== null ? ` · ${t("rodada.tetoValor", { valor: formatos.brl(varredura.filtros.tetoPreco) })}` : ""}
            </span>
          </div>
          {/* Numa rodada de horas, "em andamento" sozinho não é informação: o
              que responde "posso fechar isto?" é quanto falta e até quando. */}
          {varredura.emAndamento && varredura.vagasRestantes !== null ? (
            <p className={estilos.sutil}>
              {t("rodada.faltamVagas", { total: varredura.vagasRestantes })}
              {varredura.segundosRestantes !== null ? ` · ~${formatarDuracao(varredura.segundosRestantes)}` : ""}
              {varredura.previsaoTermino !== null ? ` · ${t("rodada.termino", { quando: horaLegivel(varredura.previsaoTermino) })}` : ""}
            </p>
          ) : null}
          {varredura.emAndamento ? <p className={estilos.sutil}>{t("rodada.telaSeAtualiza")}</p> : null}
          {semOpcao > 0 ? (
            <p className={estilos.sutil}>
              {ehSet ? t("rodada.vagasSemOferta", { total: semOpcao }) : t("rodada.vagasSemOpcao", { total: semOpcao })}
              {varredura.filtros.tetoPreco !== null ? t("rodada.dentroDoTeto") : t("rodada.comEstoque")}
            </p>
          ) : null}
          {/* O motivo de a varredura parar — um bloqueio da Liga, por exemplo —
              sai como o servidor o escreveu. A tela não tem o que fazer além de
              dizê-lo: o bloqueio nunca é contornado. */}
          {varredura.erro && !varredura.emAndamento ? (
            <p className={estilos.erroRodada} role="alert">
              {t("rodada.varreduraInterrompida", { erro: varredura.erro })}
            </p>
          ) : null}
        </Painel>
      ) : null}

      {dados && vagasTela.some((v) => v.opcoes.length > 0) ? (
        <div className={estilos.linhaAcoes}>
          <Botao icone={<WandSparkles aria-hidden />} onClick={abrirAtalho}>
            {t("atalho.botao")}
          </Botao>
          <span className={estilos.sutil}>{cardmarket ? t("atalho.ajudaCardmarket") : t("atalho.ajudaLiga")}</span>
        </div>
      ) : null}

      {dados && dados.abasLiga.length > 0 ? (
        <ListaParaColar colecaoId={id} dados={dados} cardmarket={cardmarket} atualizando={atualizando} formatos={formatos} />
      ) : null}

      <PainelSemEstoque colecaoId={id} bloqueado={envios.emVoo > 0 || pendencias.size > 0} formatos={formatos} aoAlterar={recarregar} />

      {dados && !cardmarket && !varredura ? (
        <Painel className={estilos.parametros}>
          <p className={estilos.texto}>{dados.selecionadas > 0 ? t("vazio.comLista") : t("vazio.semVarredura")}</p>
        </Painel>
      ) : null}
      {dados && cardmarket && vagasTela.length === 0 ? (
        <Painel className={estilos.parametros}>
          <p className={estilos.texto}>{t("vazio.semCandidatas")}</p>
        </Painel>
      ) : null}

      {vagasTela.length > 0 ? (
        <section className={estilos.grupo} aria-labelledby="v2-opcoes-vagas">
          <h2 id="v2-opcoes-vagas" className={estilos.subtitulo}>
            {t("vagas.titulo", { total: visiveis.length })}
          </h2>
          <div className={estilos.ferramentas}>
            <label className={estilos.marcavel}>
              <input type="checkbox" checked={soComOpcao} onChange={(e) => setSoComOpcao(e.target.checked)} />
              {ehSet ? t("vagas.esconderSemOferta") : t("vagas.esconderSemOpcao")}
            </label>
            {visiveis.length > 0 ? (
              <>
                <Botao pequeno onClick={() => definirRecolhidas(visiveis, false)}>
                  {t("vagas.expandirTodas")}
                </Botao>
                <Botao pequeno onClick={() => definirRecolhidas(visiveis, true)}>
                  {t("vagas.recolherTodas")}
                </Botao>
              </>
            ) : null}
          </div>

          {gruposMontados.map((grupoMontado) => {
            // O grupo inteiro (não só o que está montado) é o que "recolher
            // região" alcança.
            const grupo = grupos.find((g) => g.id === grupoMontado.id) ?? grupoMontado;
            const comTitulo = !ehSet || grupo.setNome !== null;
            const nomeGrupo = grupo.setNome ?? (grupo.regiao ? NOME_REGIAO[grupo.regiao] : t("vagas.semRegiao"));
            return (
              <div key={grupo.id} className={estilos.grupo}>
                {comTitulo ? (
                  <header className={estilos.grupoTopo}>
                    <h3 className={estilos.grupoTitulo}>
                      {nomeGrupo}
                      {grupo.regiao ? (
                        <span className={estilos.grupoFaixa}>
                          {String(FAIXA_REGIAO[grupo.regiao].inicio).padStart(3, "0")}–{String(FAIXA_REGIAO[grupo.regiao].fim).padStart(3, "0")}
                        </span>
                      ) : null}
                    </h3>
                    <span className={estilos.sutil}>{t("vagas.naRegiao", { total: grupo.vagas.length })}</span>
                    <span className={estilos.grupoBotoes}>
                      <Botao pequeno variante="fantasma" aria-label={t("vagas.expandirGrupoDe", { grupo: nomeGrupo })} onClick={() => definirRecolhidas(grupo.vagas, false)}>
                        {t("vagas.expandirGrupo")}
                      </Botao>
                      <Botao pequeno variante="fantasma" aria-label={t("vagas.recolherGrupoDe", { grupo: nomeGrupo })} onClick={() => definirRecolhidas(grupo.vagas, true)}>
                        {t("vagas.recolherGrupo")}
                      </Botao>
                    </span>
                  </header>
                ) : null}
                {grupoMontado.vagas.map((v) => (
                  <VagaOpcoes
                    key={v.chave}
                    vaga={v}
                    recolhida={estaRecolhida(v, guardadas)}
                    fonte={fonte}
                    ehSet={ehSet}
                    formatos={formatos}
                    textoSemOpcao={textoSemOpcao}
                    aoRecolher={recolherUma}
                    aoAlternar={alternar}
                    aoZoom={setZoom}
                  />
                ))}
              </div>
            );
          })}

          {visiveis.length > limite ? (
            <Botao onClick={() => setLimite((l) => l + VAGAS_POR_VEZ)}>{t("vagas.mostrarMais", { total: visiveis.length - limite })}</Botao>
          ) : null}
        </section>
      ) : null}

      {/* A barra aparece quando há o que comprar (ou uma marca a caminho). */}
      {dados && (resumo.cartas > 0 || pendencias.size > 0 || dados.selecionadas > 0) ? (
        <div className={estilos.barra} role="region" aria-label={t("barra.rotulo")}>
          <p className={estilos.barraResumo} aria-live="polite">
            <b>{t("barra.cartas", { total: resumo.cartas })}</b>
            <span>
              {cardmarket ? t("barra.valorCardmarket", { valor: formatos.brl(resumo.total) }) : t("barra.valorLiga", { valor: formatos.brl(resumo.total) })}
              {atualizando ? ` · ${t("barra.atualizando")}` : ""}
            </span>
          </p>
          <div className={estilos.barraAcoes}>
            <Botao pequeno icone={<Download aria-hidden />} disabled={atualizando} onClick={() => baixar(urlExportar(id, "formato=csv"))}>
              {t("barra.baixarCsv")}
            </Botao>
            <Botao pequeno icone={<ShoppingCart aria-hidden />} disabled={atualizando} onClick={() => baixar(urlExportar(id, "formato=texto"))}>
              {t("barra.baixarTexto")}
            </Botao>
          </div>
        </div>
      ) : null}

      {atalho ? (
        <AtalhoOpcoes
          plano={atalho.plano}
          mudou={atalho.mudou}
          criterio={criterio}
          fonte={fonte}
          formatos={formatos}
          onFechar={() => setAtalho(null)}
          onConfirmar={confirmarAtalho}
        />
      ) : null}

      <Modal aberto={zoom !== null} onFechar={() => setZoom(null)} titulo={zoom ? zoom.nome : ""} descricao={zoom ? `${zoom.edicaoNome} (${numeracao(zoom)})` : undefined} largura={420}>
        {zoom ? (
          <div className={estilos.zoom}>
            <div className={estilos.zoomCarta}>
              <Carta imagemUrl={zoom.imagemUrl} origem={zoom.imagemOrigem} alt={`${zoom.nome} (${numeracao(zoom)})`} raridade={zoom.raridade} modo="palco" qualidade="high" />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
