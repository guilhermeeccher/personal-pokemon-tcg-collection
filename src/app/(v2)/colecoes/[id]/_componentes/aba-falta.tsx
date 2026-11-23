"use client";

/**
 * A aba "O que falta" da coleção — **pacote 1e**. A estrutura (a aba, a
 * contagem, o encaixe) é do pacote 1d; o corpo é este componente, e a página
 * não muda: ela renderiza `<AbaFalta {...}/>` quando a aba é "falta" e passa
 * `secaoCompraDoDetalhe` ao `<DetalheCarta>` como `secaoCompra` (regra 29 de
 * `docs/design-v2/rules.md`).
 *
 * ## O que a aba faz
 *
 * - **Mostra toda vaga vazia** (regra 6), na grade virtual da página, com o
 *   que a leitura `GET /api/colecoes/:id/falta` (pacote 1a) diz de cada uma:
 *   se está na lista de compras, o preço com a fonte, se há cópia livre.
 * - **Marca compra pela rota da v1** (`PATCH …/opcoes-compra/selecao`),
 *   conforme a decisão 2: no set o toque marca a carta da vaga, e o arrasto
 *   horizontal marca várias; na Pokédex o toque abre as opções da vaga. O
 *   que cada toque faz, o arrasto e as marcas otimistas são puros e testados
 *   (`compra-falta.ts`, `arrasto-compra.ts`).
 * - **"Marcar a melhor de cada vaga"** é um atalho explícito: uma janela
 *   mostra o critério e a carta de cada vaga antes de enviar.
 * - **A lista para colar** na Compra por Lista da Liga, em abas de até 110
 *   cartas (`lista.abasLiga`, montadas no servidor pela mesma função da tela
 *   de opções e do arquivo), e "Copiar" que funciona por HTTP na rede local.
 * - **Fonte Liga (decisão 3):** desde 2026-11-11 a Liga barra as consultas
 *   automáticas. O que funciona sem rede fica — marcar sobre as opções das
 *   varreduras salvas, desmarcar, copiar — e a tela diz que consulta nova
 *   não há. Nada aqui dispara varredura nem contorna o bloqueio.
 *
 * Buscar preços, o teto e a ordem, o "sem estoque" colado, os downloads e o
 * resto da tela de opções de compra são do pacote 4a: até lá, "Fazer na v1".
 */

import { CircleAlert, ListChecks, ShoppingCart, WandSparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type MouseEvent,
  type PointerEvent,
  type Ref,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { FaltaColecaoV2DTO, GradeColecaoV2DTO, VagaGradeV2DTO } from "@/lib/dominio/tipos-cliente";

import type { PropsDetalheCarta } from "../../../_componentes/detalhe/detalhe-carta";
import { useFormatos } from "../../../_componentes/detalhe/formatos";
import { ATRIBUTO_CELULA, type ControleGradeVirtual, GradeVirtual } from "../../../_componentes/grade/grade-virtual";
import { useAviso } from "../../../_componentes/primitivos/aviso-flutuante";
import { Botao, BotaoLink } from "../../../_componentes/primitivos/botao";
import { Modal } from "../../../_componentes/primitivos/modal";
import { AvisoEmLinha } from "../../../_componentes/primitivos/painel";

import { type EstadoArrasto, iniciarArrasto, moverArrasto } from "./arrasto-compra";
import { AtalhoMelhor } from "./atalho-melhor";
import { ATRIBUTO_ALVO_COMPRA, CelulaFalta, alturaDaLegenda } from "./celula-falta";
import {
  type AcaoDoToque,
  type CorpoSelecao,
  type DesfechoDaSelecao,
  type Pendencia,
  type PlanoDoAtalho,
  acaoDoArrasto,
  acaoDoToque,
  comPendencia,
  corpoDoAlvo,
  juntarCorpos,
  naListaDaVaga,
  planoDoAtalho,
  podarPendencias,
  restaurarPendencias,
  resumoComPendencias,
} from "./compra-falta";
import { enviarSelecao } from "./envio-selecao";
import estilos from "./falta.module.css";
import { ListaLiga, useCopiarAba } from "./lista-liga";
import { textoDoCriterio } from "./preco-compra";
import { SecaoCompraVaga } from "./secao-compra-vaga";
import { type TamanhoInteiro, TAMANHOS_INTEIRO, densidadeDoTamanho, vaoDoTamanho } from "./vista-colecao";

/** O que a página entrega à aba. */
export interface ContextoAbaFalta {
  /** A grade inteira, como `GET /api/colecoes/:id/grade` a devolveu (Pokédex ou set; customizada não tem esta aba). */
  colecao: GradeColecaoV2DTO;
  /** As vagas vazias, na ordem da grade. */
  vazias: readonly VagaGradeV2DTO[];
  /** Muda a cada leitura nova da grade: o que a aba lê por conta própria (`GET .../falta`) relê junto. */
  versaoGrade: number;
  /** Abre o detalhe da vaga (com a transição e o retorno do foco da página). */
  abrirVaga: (vaga: VagaGradeV2DTO) => void;
  /** Relê a grade (depois de marcar ou desmarcar uma compra). */
  reler: () => void;
  /** A vaga aberta no detalhe e a do par ativo da transição. */
  abertaId: string | null;
  parAtivo: string | null;
  /** O tamanho das cartas da lista inteira (a preferência do aparelho). */
  tamanho: TamanhoInteiro;
  /** O controle da grade virtual: a página o usa para devolver o foco à vaga certa. */
  controle: Ref<ControleGradeVirtual>;
}

/**
 * O ponto de extensão de compra do detalhe na vaga vazia (regra 24): as
 * opções da vaga, o que dela está na lista e como tirar — o mesmo componente
 * que o toque numa vaga da Pokédex abre aqui. A customizada não tem vaga
 * vazia a comprar; lá o detalhe fica com o bloco dele.
 */
export const secaoCompraDoDetalhe: PropsDetalheCarta["secaoCompra"] = ({ colecao, vaga, aoMudar }) =>
  colecao.tipo === "customizada" ? undefined : <SecaoCompraVaga colecaoId={colecao.id} tipo={colecao.tipo} vaga={vaga} aoMudar={aoMudar} />;

/** Quanto esperar, depois do último pedido, para reler: uma rajada de toques vira uma leitura só. */
const ESPERA_RELEITURA_MS = 600;

type LeituraFalta =
  | { estado: "carregando" }
  | { estado: "ok"; dados: FaltaColecaoV2DTO }
  | { estado: "erro"; dados: FaltaColecaoV2DTO | null };

const chaveDaVaga = (v: VagaGradeV2DTO) => v.id;

export function AbaFalta({ colecao, vazias, versaoGrade, abrirVaga, reler, abertaId, parAtivo, tamanho, controle }: ContextoAbaFalta) {
  const t = useTranslations("v2Falta");
  const tCriterio = useTranslations("v2Falta.criterio");
  const formatos = useFormatos();
  const avisar = useAviso();

  /* ---------- A leitura da falta ---------- */

  const [leitura, setLeitura] = useState<LeituraFalta>({ estado: "carregando" });
  const [pedidoProprio, setPedidoProprio] = useState(0);

  // Pendências: o estado de verdade mora na ref (o arrasto decide carta a
  // carta, mais rápido que um render), e o estado só desenha.
  const pendenciasRef = useRef<Map<string, Pendencia>>(new Map());
  const [pendencias, setPendenciasEstado] = useState<ReadonlyMap<string, Pendencia>>(() => new Map());
  const definirPendencias = useCallback((f: (atual: Map<string, Pendencia>) => Map<string, Pendencia>) => {
    pendenciasRef.current = f(pendenciasRef.current);
    setPendenciasEstado(pendenciasRef.current);
  }, []);

  /**
   * Depois de uma recusa, o texto da lista é o de antes dela e não se copia
   * até uma leitura pedida depois da recusa chegar (mesmo que essa falhe:
   * continua velha).
   */
  const [listaVelha, setListaVelha] = useState(false);

  const seq = useRef(0);
  /** Sobe a cada recusa: o que estava na fila foi pensado sobre um estado que não existe mais. */
  const geracao = useRef(0);
  /** O maior gesto cujo pedido já terminou: uma leitura pedida agora o reflete. */
  const confirmadasAte = useRef(0);

  useEffect(() => {
    const controle = new AbortController();
    const reflete = confirmadasAte.current;
    const geracaoNaLeitura = geracao.current;
    fetch(`/api/colecoes/${colecao.id}/falta`, { cache: "no-store", signal: controle.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as FaltaColecaoV2DTO;
      })
      .then((dados) => {
        if (controle.signal.aborted) return;
        setLeitura({ estado: "ok", dados });
        definirPendencias((p) => podarPendencias(p, reflete));
        if (geracaoNaLeitura === geracao.current) setListaVelha(false);
      })
      .catch(() => {
        if (controle.signal.aborted) return;
        setLeitura((atual) => ({ estado: "erro", dados: atual.estado === "carregando" ? null : atual.dados }));
      });
    return () => controle.abort();
  }, [colecao.id, versaoGrade, pedidoProprio, definirPendencias]);

  const dados = leitura.estado === "carregando" ? null : leitura.dados;
  const faltaPorId = useMemo(() => new Map((dados?.vagas ?? []).map((v) => [v.vagaId, v] as const)), [dados]);
  const vagaPorId = useMemo(() => new Map(vazias.map((v) => [v.id, v] as const)), [vazias]);
  const fonte = dados?.fonte ?? null;

  /* ---------- Envio em fila ---------- */

  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emVoo = useRef(0);
  useEffect(() => () => {
    if (relogio.current) clearTimeout(relogio.current);
  }, []);

  const agendarReler = useCallback(() => {
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => {
      relogio.current = null;
      if (emVoo.current === 0) reler();
    }, ESPERA_RELEITURA_MS);
  }, [reler]);

  const textoDaRecusa = useCallback(
    (d: Exclude<DesfechoDaSelecao, { tipo: "ok" }>) => (d.tipo === "parcial" ? t("recusa.parcial") : t(`recusa.${d.motivo}`)),
    [t],
  );

  /**
   * Entra na fila da coleção no gesto (`enviarSelecao`, a mesma do detalhe):
   * a ordem dos pedidos é a dos gestos, venham daqui ou do detalhe.
   */
  const enfileirar = useCallback(
    (corpos: CorpoSelecao[], seqs: number[], sucesso?: string) => {
      const minhaGeracao = geracao.current;
      emVoo.current++;
      void enviarSelecao(colecao.id, juntarCorpos(corpos), () => geracao.current === minhaGeracao).then((desfecho) => {
        emVoo.current--;
        // Descartado: uma recusa anterior já limpou a tela e pediu a releitura.
        if (desfecho === null) return;
        confirmadasAte.current = Math.max(confirmadasAte.current, ...seqs);
        if (desfecho.tipo === "recusada") {
          // Tudo o que a tela mostrava por conta própria cai: a releitura diz a
          // verdade, e a lista para colar fica velha até ela chegar.
          geracao.current++;
          definirPendencias(() => new Map());
          setListaVelha(true);
          avisar(textoDaRecusa(desfecho), { tom: "erro" });
          reler();
          return;
        }
        if (desfecho.tipo === "parcial") {
          avisar(textoDaRecusa(desfecho), { tom: "erro" });
          reler();
          return;
        }
        if (sucesso) avisar(sucesso, { tom: "sucesso" });
        agendarReler();
      });
    },
    [colecao.id, definirPendencias, avisar, textoDaRecusa, reler, agendarReler],
  );

  /* ---------- O toque ---------- */

  /**
   * O que o toque faria na vaga, sobre um mapa de pendências: no desenho, o
   * do estado; nos eventos, o da ref, que o arrasto atualiza carta a carta
   * antes de o React desenhar de novo.
   */
  const acaoCom = useCallback(
    (v: VagaGradeV2DTO, mapa: ReadonlyMap<string, Pendencia>): AcaoDoToque =>
      fonte === null
        ? { tipo: "esperar" }
        : acaoDoToque({
            tipo: colecao.tipo,
            fonte,
            chave: v.chave,
            livres: v.livres ?? 0,
            cartaDaVaga: colecao.tipo === "set" ? (v.carta?.cartaId ?? null) : null,
            falta: faltaPorId.get(v.id),
            pendente: mapa.get(v.id),
          }),
    [colecao.tipo, fonte, faltaPorId],
  );
  const acaoDe = useCallback((v: VagaGradeV2DTO) => acaoCom(v, pendenciasRef.current), [acaoCom]);

  const naListaPelaLeitura = useCallback(
    (v: VagaGradeV2DTO) => naListaDaVaga(faltaPorId.get(v.id), v.escolhas?.length ?? 0, undefined),
    [faltaPorId],
  );

  /** Põe a marca otimista de um gesto e devolve o número dele. */
  const marcarNaTela = useCallback(
    (v: VagaGradeV2DTO, acao: Extract<AcaoDoToque, { corpo: CorpoSelecao }>): number => {
      const n = ++seq.current;
      definirPendencias((p) =>
        comPendencia(
          p,
          v.id,
          { seq: n, selecionada: acao.tipo === "marcar", corpo: acao.corpo, desfazer: acao.desfazer, preco: acao.preco },
          naListaPelaLeitura(v),
        ),
      );
      return n;
    },
    [definirPendencias, naListaPelaLeitura],
  );

  const [opcoesDe, setOpcoesDe] = useState<string | null>(null);

  const tocar = useCallback(
    (v: VagaGradeV2DTO) => {
      const acao = acaoDe(v);
      switch (acao.tipo) {
        case "esperar":
          return;
        case "abrirDetalhe":
          abrirVaga(v);
          return;
        case "abrirOpcoes":
          setOpcoesDe(v.id);
          return;
        default:
          enfileirar([acao.corpo], [marcarNaTela(v, acao)]);
      }
    },
    [acaoDe, abrirVaga, enfileirar, marcarNaTela],
  );

  /* ---------- O arrasto (só no set, onde o toque marca) ---------- */

  // A grade é a da página (`controle`, um `useRef` dela): a aba a lê nos
  // eventos, para o arrasto (`indiceNoPonto`) e o foco (`elementoDe`).
  const lerGrade = useCallback(
    (): ControleGradeVirtual | null => (controle && typeof controle === "object" ? controle.current : null),
    [controle],
  );

  const arrasto = useRef<{
    estado: EstadoArrasto;
    id: number;
    tocados: Set<number>;
    corpos: CorpoSelecao[];
    seqs: number[];
    /** A pendência de cada vaga antes do gesto: um cancelamento a devolve. */
    antes: Map<string, Pendencia | undefined>;
  } | null>(null);
  const engolirClique = useRef(false);

  function indiceDoAlvo(alvo: EventTarget | null): number | null {
    // Só a carta pinta: "Detalhes" tem o índice da célula (para o foco da
    // grade), mas um gesto que nasce nele não marca nada.
    const el = (alvo as Element | null)?.closest?.(`[${ATRIBUTO_ALVO_COMPRA}]`);
    if (!el) return null;
    const i = Number(el.getAttribute(ATRIBUTO_CELULA));
    return Number.isInteger(i) ? i : null;
  }

  function aoApertar(e: PointerEvent<HTMLDivElement>) {
    if (colecao.tipo !== "set" || !e.isPrimary || e.button !== 0) return;
    const i = indiceDoAlvo(e.target);
    const v = i === null ? undefined : vazias[i];
    if (i === null || !v) return;
    const acao = acaoDe(v);
    if (acao.tipo !== "marcar" && acao.tipo !== "desmarcar") return;
    const estado = iniciarArrasto(e.clientX, e.clientY, i, acao.tipo === "marcar");
    arrasto.current = estado ? { estado, id: e.pointerId, tocados: new Set(), corpos: [], seqs: [], antes: new Map() } : null;
  }

  function aoMover(e: PointerEvent<HTMLDivElement>) {
    const a = arrasto.current;
    const grade = lerGrade();
    if (!a || e.pointerId !== a.id || !grade) return;
    const eraPronto = a.estado.fase === "pronto";
    const { estado, novos } = moverArrasto(a.estado, e.clientX, e.clientY, grade.indiceNoPonto);
    a.estado = estado;
    if (estado.fase !== "pintando") return;
    // O mouse que sai da grade continua mandando eventos para ela.
    if (eraPronto && e.pointerType === "mouse") e.currentTarget.setPointerCapture(e.pointerId);
    for (const i of novos) {
      if (a.tocados.has(i)) continue;
      a.tocados.add(i);
      const v = vazias[i];
      if (!v) continue;
      const acao = acaoDoArrasto(estado.marcando, acaoDe(v));
      if (!acao) continue;
      a.antes.set(v.id, pendenciasRef.current.get(v.id));
      a.seqs.push(marcarNaTela(v, acao));
      a.corpos.push(acao.corpo);
    }
  }

  /** Depois de um arrasto, o clique que o navegador ainda manda não pode desfazer a última carta. */
  function engolirProximoClique() {
    engolirClique.current = true;
    setTimeout(() => {
      engolirClique.current = false;
    }, 0);
  }

  /**
   * O navegador interrompeu o gesto (`pointercancel`: um gesto do sistema, a
   * página que começou a rolar): nada foi confirmado pelo dedo, então nada
   * sai, e as marcas que o arrasto pôs na tela voltam ao que eram.
   */
  function aoCancelar(e: PointerEvent<HTMLDivElement>) {
    const a = arrasto.current;
    if (!a || e.pointerId !== a.id) return;
    arrasto.current = null;
    if (a.estado.fase !== "pintando") return;
    engolirProximoClique();
    definirPendencias((p) => restaurarPendencias(p, a.antes));
  }

  function aoSoltar(e: PointerEvent<HTMLDivElement>) {
    const a = arrasto.current;
    if (!a || e.pointerId !== a.id) return;
    arrasto.current = null;
    if (a.estado.fase !== "pintando") return;
    engolirProximoClique();
    if (a.corpos.length === 0) return;
    enfileirar(a.corpos, a.seqs);
    if (a.seqs.length > 1) {
      avisar(a.estado.marcando ? t("aba.arrastoMarcou", { total: a.seqs.length }) : t("aba.arrastoTirou", { total: a.seqs.length }));
    }
  }

  function aoCliqueCaptura(e: MouseEvent<HTMLDivElement>) {
    if (!engolirClique.current) return;
    e.stopPropagation();
    e.preventDefault();
  }

  /* ---------- Atalho, lista e opções ---------- */

  /**
   * A prévia do atalho, congelada com a leitura de que saiu: confirmar envia
   * exatamente `plano.corpos`. Se a leitura mudou enquanto a janela estava
   * aberta, confirmar não envia — troca a prévia pela nova e pede outra
   * conferência (`mudou`).
   */
  const [plano, setPlano] = useState<{ plano: PlanoDoAtalho; dados: FaltaColecaoV2DTO; mudou: boolean } | null>(null);
  const [listaAberta, setListaAberta] = useState(false);
  const { copiar, copiada } = useCopiarAba();

  function abrirAtalho() {
    if (!dados) return;
    setPlano({ plano: planoDoAtalho(dados.vagas, pendenciasRef.current), dados, mudou: false });
  }

  function confirmarAtalho() {
    if (!plano || !dados) return;
    if (plano.dados !== dados) {
      setPlano({ plano: planoDoAtalho(dados.vagas, pendenciasRef.current), dados, mudou: true });
      return;
    }
    const { itens, corpos } = plano.plano;
    const seqs: number[] = [];
    for (const { vagaId, opcao } of itens) {
      const v = vagaPorId.get(vagaId);
      const corpo = corpoDoAlvo(opcao.alvo, true);
      // A marca na tela é só desenho; o que sai é o plano inteiro, como foi mostrado.
      if (v && corpo) seqs.push(marcarNaTela(v, { tipo: "marcar", corpo, desfazer: corpoDoAlvo(opcao.alvo, false), preco: opcao.preco?.valor ?? null }));
    }
    setPlano(null);
    if (corpos.length > 0) enfileirar(corpos, seqs, t("atalho.feito", { total: itens.length }));
  }

  const vagaDasOpcoes = opcoesDe ? (vagaPorId.get(opcoesDe) ?? null) : null;
  // A vaga preenchida em outra parte da tela sai da aba: a folha dela fecha
  // (no próprio desenho, para não reabrir se a vaga voltar a ficar vazia).
  if (opcoesDe && !vagaDasOpcoes) setOpcoesDe(null);

  const focoNaVaga = useCallback((id: string) => async () => (await lerGrade()?.elementoDe(id)) ?? null, [lerGrade]);

  /* ---------- Desenho ---------- */

  const densidade = densidadeDoTamanho(tamanho);
  const vao = vaoDoTamanho(tamanho);
  const manter = [abertaId, parAtivo, opcoesDe].filter((x): x is string => x !== null);
  const resumo = resumoComPendencias(dados?.lista ?? null, pendencias);
  const atualizando = resumo.pendentes > 0 || listaVelha || leitura.estado === "carregando";
  const lista = dados?.lista ?? null;
  const umaAba = lista && lista.abasLiga.length === 1 ? lista.abasLiga[0] : null;
  const estado = dados?.estado ?? null;
  const cardmarket = fonte === "cardmarket";
  const linkOpcoes = `/v1/colecoes/${colecao.id}/opcoes-compra`;

  if (vazias.length === 0) {
    return (
      <div className={estilos.aba}>
        <AvisoEmLinha tom="sucesso" titulo={t("aba.nada")}>
          {t("aba.nadaTexto")}
        </AvisoEmLinha>
      </div>
    );
  }

  return (
    <div className={estilos.aba}>
      {leitura.estado === "erro" ? (
        <AvisoEmLinha
          tom="alerta"
          papel="alert"
          titulo={t("aba.erro")}
          acao={
            <Botao pequeno onClick={() => setPedidoProprio((p) => p + 1)}>
              {t("aba.tentarDeNovo")}
            </Botao>
          }
        >
          {t("aba.erroTexto")}
        </AvisoEmLinha>
      ) : null}

      {estado?.fonte === "liga" ? (
        <AvisoEmLinha tom="alerta" icone={<CircleAlert aria-hidden />} titulo={t("fonte.ligaTitulo")}>
          {t("fonte.ligaTexto")}{" "}
          {estado.varredura
            ? t("fonte.ligaVarredura", { data: formatos.instante(estado.varredura.concluidaEm ?? estado.varredura.criadoEm) })
            : t("fonte.ligaSemVarredura")}
        </AvisoEmLinha>
      ) : null}
      {estado?.fonte === "cardmarket" ? (
        <AvisoEmLinha icone={<ShoppingCart aria-hidden />} titulo={t("fonte.cardmarketTitulo")}>
          {t("fonte.cardmarketTexto", {
            comPreco: estado.precosCandidatas.comPreco,
            cartas: estado.precosCandidatas.cartas,
            aBuscar: estado.precosCandidatas.aBuscar,
            dias: estado.precosCandidatas.validadeDias,
          })}
          {estado.precosCandidatas.comPreco === 0 ? ` ${t("fonte.semPrecoNenhum")}` : ""}
        </AvisoEmLinha>
      ) : null}

      <div className={`${estilos.painelCompra} v2-painel`}>
        <div className={estilos.painelTexto}>
          <p className={estilos.instrucao}>
            {colecao.tipo === "set" ? t("aba.instrucaoSet") : t("aba.instrucaoPokedex")} {t("aba.instrucaoLivre")}
          </p>
          {dados?.criterio ? <p className={estilos.criterio}>{textoDoCriterio(tCriterio, dados.criterio, formatos)}</p> : null}
        </div>
        <div className={estilos.painelAcoes}>
          <Botao icone={<WandSparkles aria-hidden />} disabled={!dados} onClick={abrirAtalho}>
            {t("atalho.botao")}
          </Botao>
          <BotaoLink href={linkOpcoes}>{t("aba.opcoesNaV1")}</BotaoLink>
        </div>
      </div>

      <div
        className={estilos.areaGrade}
        data-pinta={colecao.tipo === "set" ? "" : undefined}
        onPointerDown={aoApertar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoCancelar}
        onClickCapture={aoCliqueCaptura}
      >
        <GradeVirtual
          ref={controle}
          itens={vazias}
          chaveDe={chaveDaVaga}
          minCelula={TAMANHOS_INTEIRO[tamanho]}
          vaoX={vao.x}
          vaoY={vao.y}
          alturaExtra={alturaDaLegenda(densidade)}
          manterMontadas={manter}
          rotulo={t("aba.rotuloLista", { total: vazias.length })}
          renderizar={(v, celula) => {
            const falta = faltaPorId.get(v.id);
            const pendente = pendencias.get(v.id);
            return (
              <CelulaFalta
                vaga={v}
                tipo={colecao.tipo}
                densidade={densidade}
                falta={falta}
                naLista={naListaDaVaga(falta, v.escolhas?.length ?? 0, pendente)}
                pendente={pendente !== undefined}
                acao={acaoCom(v, pendencias).tipo}
                aberta={abertaId === v.id}
                noParAtivo={parAtivo === v.id}
                celula={celula}
                formatos={formatos}
                aoTocar={() => tocar(v)}
                aoDetalhes={() => abrirVaga(v)}
              />
            );
          }}
        />
      </div>

      {/* A barra aparece quando há o que copiar (ou uma marca a caminho): vazia, só tiraria espaço da grade. */}
      {lista && (resumo.cartas > 0 || resumo.pendentes > 0 || lista.selecionadas > 0) ? (
        <div className={estilos.barraCompra} role="region" aria-label={t("barra.rotulo")}>
          <p className={estilos.barraResumo} aria-live="polite">
            <b>{t("barra.cartas", { total: resumo.cartas })}</b>
            <span>
              {resumo.cartas > 0 ? (cardmarket ? t("barra.valorCardmarket", { valor: formatos.brl(resumo.total) }) : t("barra.valorLiga", { valor: formatos.brl(resumo.total) })) : null}
              {atualizando ? ` · ${t("barra.atualizando")}` : ""}
            </span>
          </p>
          <div className={estilos.barraAcoes}>
            <Botao variante="secundario" icone={<ListChecks aria-hidden />} onClick={() => setListaAberta(true)}>
              {t("barra.verLista")}
            </Botao>
            {umaAba ? (
              <Botao variante="primario" disabled={atualizando} onClick={() => void copiar(umaAba)}>
                {copiada === umaAba.id ? t("lista.copiado") : t("barra.copiar")}
              </Botao>
            ) : null}
          </div>
        </div>
      ) : null}

      {lista ? <ListaLiga aberto={listaAberta} lista={lista} atualizando={atualizando} onFechar={() => setListaAberta(false)} /> : null}

      {plano ? (
        <AtalhoMelhor
          aberto
          plano={plano.plano}
          mudou={plano.mudou}
          criterio={plano.dados.criterio}
          vagasPorId={vagaPorId}
          onFechar={() => setPlano(null)}
          onConfirmar={confirmarAtalho}
        />
      ) : null}

      <Modal
        aberto={vagaDasOpcoes !== null}
        onFechar={() => setOpcoesDe(null)}
        titulo={vagaDasOpcoes ? t("opcoes.tituloVaga", { numero: vagaDasOpcoes.numero, alvo: vagaDasOpcoes.especie ?? vagaDasOpcoes.cartaNome ?? "" }) : ""}
        largura={600}
        devolverFocoPara={opcoesDe ? focoNaVaga(opcoesDe) : undefined}
        rodape={
          vagaDasOpcoes ? (
            <Botao
              variante="secundario"
              onClick={() => {
                const v = vagaDasOpcoes;
                setOpcoesDe(null);
                abrirVaga(v);
              }}
            >
              {t("opcoes.abrirVaga")}
            </Botao>
          ) : undefined
        }
      >
        {vagaDasOpcoes ? <SecaoCompraVaga colecaoId={colecao.id} tipo={colecao.tipo} vaga={vagaDasOpcoes} aoMudar={reler} /> : null}
      </Modal>
    </div>
  );
}
