"use client";

/**
 * `/dex/novo-cadastro` na v2 (pacote 5d): o que está indo ao HOME, escolhido
 * na grade das caixas, depois o jogo de onde sai. Porte da v1
 * (`(v1)/v1/dex/novo-cadastro/novo-cadastro.tsx`), com as mesmas leituras,
 * a mesma rota e as mesmas regras; as regras saíram do componente para
 * módulos puros e testados (`lote-envio.ts`, `fluxo-envio.ts`).
 *
 * Duas etapas na mesma rota, com o estado no cliente:
 *
 * 1. **Grade.** As caixas do HOME como `/dex/caixas` as monta
 *    (`montarCaixasDex`: mesmos números, grupos, buracos de seção desligada
 *    e de forma sem shiny), na `GradeVirtual` acima do limiar (regra 13).
 *    Um toque marca uma vaga em falta ou num jogo, nas duas trilhas; a vaga
 *    no HOME e o buraco só se identificam na barra. Busca, "só caixas com
 *    faltantes" e trilha só mudam a vista: a seleção é vaga + trilha e
 *    sobrevive a eles.
 * 2. **Saída e envio.** O jogo de onde saem (ou o próprio HOME), lembrado
 *    no aparelho; o lote com o destino de cada item e as marcas do
 *    Cadastrar; o envio (`POST /api/dex/registros/enviar`). "Voltar" mantém
 *    a seleção.
 *
 * **O jogo escolhido é o local de onde sai, não a origem histórica**: a rota
 * move o registro que já está nesse jogo (o mais antigo primeiro, mantendo
 * origem, data e notas) ou cria um nascido ali; do HOME sempre cria. A tela
 * só avisa; quem decide é a rota, que confere tudo de novo.
 *
 * **A saída sem volta nunca é confirmada sozinha**: o 409
 * `dexConfirmarSemVolta` (uma vez por lote) abre o diálogo de confirmação da
 * v2 com a frase da rota; só "Transferir" reenvia o mesmo pedido com
 * `confirmarSemVolta: true`, e "Cancelar" e Esc não enviam nada.
 *
 * **Uma recusa relê a página** (`router.refresh` numa transição): outra aba
 * pode ter mandado a mesma vaga — a rota serializa os envios e a segunda
 * recebe `dexVagaJaNoHome` —, e o lote só mostra "Já no HOME" com os
 * registros de agora. Enviar fica desligado até a releitura chegar.
 */

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";

import { naoTransferiveis, catalogoDoJogo } from "@/lib/dominio/dex-disponibilidade";
import { useNomeCaixa } from "@/app/_comum/dex/use-nome-caixa";
import { useRotuloForma } from "@/app/_comum/dex/use-rotulo-forma";
import { recusasLegiveis } from "@/app/_comum/dex/recusas-legiveis";
import { textoDaRecusa, textosDasRecusas } from "@/app/_comum/recusa";
import { GRUPOS_CAIXA, montarCaixasDex, posicoesNasCaixas, type CaixaDex } from "@/lib/dominio/dex-caixas";
import { chaveVagaTrilha, MAX_ITENS_ENVIO_HOME } from "@/lib/dominio/dex-envio-home";
import { estadoDaVaga, mapearEstadosDex, type EstadoVagaDex } from "@/lib/dominio/dex-estado";
import { filtrarFormasDex, paresDeGenero, type LadoGenero, type TrilhaDex } from "@/lib/dominio/dex-grade";
import { jogoDex, ORIGEM_HOME } from "@/lib/dominio/dex-jogos";
import { categoriaConta, type SecoesContadas } from "@/lib/dominio/dex-secoes";
import { especiesTrancadas, type IdiomaTrofeu } from "@/lib/dominio/dex-trofeus";
import type { FormaDexDTO, JogoPossuidoDTO, RegistroDexDTO, TrofeuDexDTO } from "@/lib/dominio/tipos-cliente";

import { ATRIBUTO_CELULA, type ControleGradeVirtual, GradeVirtual } from "../../../_componentes/grade/grade-virtual";
import { Botao, BotaoLink } from "../../../_componentes/primitivos/botao";
import { Campo } from "../../../_componentes/primitivos/campo";
import { DialogoConfirmacao } from "../../../_componentes/primitivos/dialogo-confirmacao";
import { AvisoEmLinha } from "../../../_componentes/primitivos/painel";
import { Segmentado } from "../../../_componentes/primitivos/segmentado";
import { useCartaoFlutuante } from "../../_componentes/cartao-pokemon";
import { SpriteDex } from "../../_componentes/sprite-dex";
import { ALTURA_EXTRA_CAIXA, LIMIAR_CAIXAS, MIN_CAIXA, PROPORCAO_CAIXA } from "../../caixas/_componentes/geometria-caixa";

import {
  ATRIBUTO_VAGA,
  CaixaEscolha,
  chaveDaCaixa,
  SIMBOLO_GENERO,
  type AcaoVaga,
  type AlvoVaga,
  type TextosCaixaEscolha,
} from "./caixa-escolha";
import { criarFluxoEnvio, type EstadoFluxoEnvio, type PedidoEnvio } from "./fluxo-envio";
import {
  alternarVaga,
  contarSelecao,
  linhasDoLote,
  motivoDoBloqueio,
  registrosQueSeriamMovidos,
  saidaValida,
  tirarDaSelecao,
  trilhaDoItem,
  type EventoToque,
  type MarcaLote,
  type Selecao,
} from "./lote-envio";
import estilos from "./novo-cadastro.module.css";

const ESTADOS_LEGENDA: readonly EstadoVagaDex[] = ["falta", "no_jogo", "no_home"];
const VAO_GRADE = 16;
/** Quantos itens do lote a etapa 2 monta por vez (sprite, marcas e botão cada um; o lote vai até 500). */
const ITENS_POR_VEZ = 60;

/* `jogo:forma` que o HOME não recebe daquele jogo: a lista que a rota confere. */
const NAO_VAI_AO_HOME = naoTransferiveis();

/*
 * A última saída usada, lembrada neste aparelho (regra 19: chave com `v2-`,
 * todo acesso em `try/catch`, lida depois da hidratação). É conveniência: o
 * armazenamento pode vir vazio ou recusar (janela anônima), e a tela
 * funciona igual, só sem a pílula pré-marcada.
 */
const CHAVE_SAIDA = "v2-dex-novo-cadastro-saida";
function assinarArmazenamento(aviso: () => void) {
  window.addEventListener("storage", aviso);
  return () => window.removeEventListener("storage", aviso);
}
function lerSaidaSalva(): string | null {
  try {
    return window.localStorage.getItem(CHAVE_SAIDA);
  } catch {
    return null;
  }
}
function salvarSaida(id: string) {
  try {
    window.localStorage.setItem(CHAVE_SAIDA, id);
  } catch {
    // Sem armazenamento a próxima visita só não vem com a pílula marcada.
  }
}

async function postEnviar(corpo: string) {
  const r = await fetch("/api/dex/registros/enviar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: corpo,
  });
  return { status: r.status, corpo: (await r.json().catch(() => null)) as unknown };
}

/** O que a barra conta da última vaga tocada; "identificou" escreve o estado de agora, não uma ação. */
type UltimoToque = AlvoVaga & { evento: EventoToque | "identificou" };

type Resultado = { tom: "sucesso"; texto: string } | { tom: "perigo"; textos: string[] };

export function NovoCadastro({
  formas,
  secoes,
  registros,
  caixasReservadas,
  jogos,
  checkpoints,
}: {
  formas: FormaDexDTO[];
  secoes: SecoesContadas;
  registros: RegistroDexDTO[];
  caixasReservadas: number;
  /** Só os ativos: jogo parado não manda nada (a rota recusa). */
  jogos: JogoPossuidoDTO[];
  /** Troféus-checkpoint ainda não conquistados. */
  checkpoints: TrofeuDexDTO[];
}) {
  const t = useTranslations("v2DexNovoCadastro");
  const td = useTranslations("dex");
  const tr = useTranslations("recusas");
  const router = useRouter();
  const idioma = useLocale() as IdiomaTrofeu;
  const rotulo = useRotuloForma(formas);
  const nomeCaixa = useNomeCaixa();
  const { abrir: previsao, fechar: fecharPrevisao, cartao } = useCartaoFlutuante();
  const grade = useRef<ControleGradeVirtual>(null);
  const avisoRef = useRef<HTMLDivElement>(null);
  const tituloSaidaRef = useRef<HTMLHeadingElement>(null);
  /** A vaga que recebe o foco ao voltar da etapa 2 (o último toque). */
  const voltarPara = useRef<AlvoVaga | null>(null);

  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [trilha, setTrilha] = useState<TrilhaDex>("normal");
  const [busca, setBusca] = useState("");
  // A busca apaga ou acende ~1.300 vagas: o campo responde primeiro, a grade depois.
  const buscaAdiada = useDeferredValue(busca);
  const [soFaltantes, setSoFaltantes] = useState(true);
  const [selecao, setSelecao] = useState<Selecao>(() => new Map());
  /* Espelho da seleção para os handlers: o teto é decidido no toque, e o toque
     recusado tem de chegar à barra — dentro de um atualizador isso seria
     efeito colateral. Toda escrita passa por `definirSelecao`. */
  const selecaoRef = useRef<Selecao>(selecao);
  const [ultimo, setUltimo] = useState<UltimoToque | null>(null);
  const [saidaEscolhida, setSaidaEscolhida] = useState<string | null>(null);
  const saidaSalva = useSyncExternalStore(assinarArmazenamento, lerSaidaSalva, () => null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [itensVisiveis, setItensVisiveis] = useState(ITENS_POR_VEZ);
  const [lendo, iniciarLeitura] = useTransition();
  const [estadoEnvio, setEstadoEnvio] = useState<EstadoFluxoEnvio>({ pendente: null, ocupado: false, falha: null });
  const [fluxo] = useState(() => criarFluxoEnvio({ post: postEnviar, aoMudar: setEstadoEnvio }));

  const definirSelecao = useCallback((proxima: Selecao) => {
    selecaoRef.current = proxima;
    setSelecao(proxima);
  }, []);

  /* ---- Etapa 1: a grade ------------------------------------------------ */

  const estados = useMemo(() => mapearEstadosDex(registros), [registros]);
  const formaPorId = useMemo(() => new Map(formas.map((f) => [f.id, f])), [formas]);
  const nomes = useMemo(() => new Map(formas.map((f) => [f.id, rotulo.nome(f)])), [formas, rotulo]);
  const caixasPorTrilha = useMemo(
    () => ({
      normal: montarCaixasDex(formas, "normal", secoes, caixasReservadas),
      shiny: montarCaixasDex(formas, "shiny", secoes, caixasReservadas),
    }),
    [formas, secoes, caixasReservadas],
  );
  const caixas = caixasPorTrilha[trilha];
  const posicoes = useMemo(
    () => ({ normal: posicoesNasCaixas(caixasPorTrilha.normal), shiny: posicoesNasCaixas(caixasPorTrilha.shiny) }),
    [caixasPorTrilha],
  );

  /* A mesma busca da Pokédex e do Cadastrar (nome, forma em inglês ou português, número). Sem texto, `null`. */
  const casam = useMemo(() => {
    if (!buscaAdiada.trim()) return null;
    return new Set(filtrarFormasDex(formas, { regiao: "todas", categoria: "todas", busca: buscaAdiada }).map((f) => f.id));
  }, [formas, buscaAdiada]);

  const caixasVisiveis = useMemo(
    () =>
      caixas.filter((c) => {
        if (casam && !c.lugares.some((l) => casam.has(l.forma.id))) return false;
        if (!soFaltantes) return true;
        return c.lugares.some(
          (l) => l.buraco === null && (!casam || casam.has(l.forma.id)) && estadoDaVaga(estados, l.forma.id, trilha) !== "no_home",
        );
      }),
    [caixas, casam, soFaltantes, estados, trilha],
  );

  /* Par de gênero: o macho no Nacional e a fêmea no Gênero, em caixas
     diferentes. Só quando as duas vagas têm lugar nas caixas da trilha (com
     Gênero desligado a fêmea não tem vaga; na shiny, um lado sem shiny é
     buraco). */
  const pares = useMemo(() => paresDeGenero(formas), [formas]);
  const generoConta = categoriaConta("genero", secoes);
  const parVisivel = useCallback(
    (formaId: string, trilhaDaVaga: TrilhaDex) => {
      if (!generoConta) return null;
      const p = pares.get(formaId);
      const lugares = posicoes[trilhaDaVaga];
      return p && lugares.has(formaId) && lugares.has(p.par) ? p : null;
    },
    [generoConta, pares, posicoes],
  );
  const generos = useMemo(() => {
    const r = new Map<string, LadoGenero>();
    for (const id of pares.keys()) {
      const p = parVisivel(id, trilha);
      if (p) r.set(id, p.lado);
    }
    return r;
  }, [pares, parVisivel, trilha]);

  const textos = useMemo<TextosCaixaEscolha>(
    () => ({
      caixaN: (numero) => td("caixas.caixaN", { numero: String(numero) }),
      nome: (c: CaixaDex<FormaDexDTO>) => nomeCaixa.nome(c),
      faixa: (inicio, fim) => td("caixas.faixa", { inicio: String(inicio).padStart(4, "0"), fim: String(fim).padStart(4, "0") }),
      forma: rotulo.nome,
      estado: (e) => td(`estado.${e}`),
      buraco: (m) => td(`caixas.buraco.${m}`),
      lugar: (caixa, posicao) => td("caixas.posicao", { caixa: String(caixa), posicao: String(posicao) }),
      marcada: td("novoCadastro.marcada"),
    }),
    [td, nomeCaixa, rotulo.nome],
  );

  const aoTocar = useCallback(
    (alvo: AlvoVaga, acao: AcaoVaga) => {
      setResultado((r) => (r?.tom === "sucesso" ? null : r));
      if (acao.tipo === "identificar") {
        setUltimo({ ...alvo, evento: "identificou" });
        return;
      }
      const r = alternarVaga(selecaoRef.current, { formaId: alvo.formaId, shiny: alvo.trilha === "shiny" }, acao.marcar, MAX_ITENS_ENVIO_HOME);
      if (r.selecao !== selecaoRef.current) definirSelecao(r.selecao);
      setUltimo({ ...alvo, evento: r.evento });
    },
    [definirSelecao],
  );

  /* "Ir para": monta a caixa, foca (o foco a mantém montada enquanto a rolagem chega) e a põe no alto. */
  async function irPara(chave: string) {
    const el = await grade.current?.elementoDe(chave);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "start", behavior: "instant" });
  }
  const saltos = useMemo(
    () =>
      GRUPOS_CAIXA.flatMap((grupo) => {
        const c = caixasVisiveis.find((x) => x.grupo === grupo);
        return c ? [{ grupo, chave: chaveDaCaixa(c) }] : [];
      }),
    [caixasVisiveis],
  );

  /* ---- Etapa 2: o lote ------------------------------------------------- */

  const opcoes = useMemo(
    () => [
      ...jogos.map((j) => ({ id: j.jogoId, nome: j.nome, soEnvio: j.conexaoHome === "so_envio" })),
      { id: ORIGEM_HOME, nome: td("cadastrar.home"), soEnvio: false },
    ],
    [jogos, td],
  );
  const saida = saidaValida(
    saidaEscolhida,
    saidaSalva,
    opcoes.map((o) => o.id),
  );
  const nomeDoJogo = useCallback((id: string) => (id === ORIGEM_HOME ? td("cadastrar.home") : (jogoDex(id)?.nome ?? id)), [td]);

  const catalogo = useMemo(() => (saida ? catalogoDoJogo(saida, formas) : null), [saida, formas]);
  const trancadas = useMemo(() => {
    const r = new Map<number, string>();
    if (!saida) return r;
    const titulo = new Map(checkpoints.map((c) => [c.id, c.textos[idioma]?.titulo ?? c.id]));
    for (const [n, ids] of especiesTrancadas(checkpoints, saida, new Set())) r.set(n, ids.map((id) => titulo.get(id)).join(" + "));
    return r;
  }, [checkpoints, saida, idioma]);
  const movidos = useMemo(() => registrosQueSeriamMovidos(registros, saida), [registros, saida]);
  const linhas = useMemo(
    () => linhasDoLote(selecao, { formaPorId, posicoes, estados, saida, catalogo, naoVaiAoHome: NAO_VAI_AO_HOME, movidos, trancadas }),
    [selecao, formaPorId, posicoes, estados, saida, catalogo, movidos, trancadas],
  );
  const contagem = contarSelecao(selecao);
  const textoContagem = td("novoCadastro.contagem", contagem);
  const impedidos = linhas.filter((l) => l.impede);
  const bloqueio = motivoDoBloqueio(linhas, saida, MAX_ITENS_ENVIO_HOME);
  const ocupado = estadoEnvio.ocupado || lendo;

  /* ---- Envio ----------------------------------------------------------- */

  const nomesDaTela = useMemo(
    () => ({ forma: (id: string) => nomes.get(id) ?? id, trilha: (x: TrilhaDex) => td(`trilha.${x}`) }),
    [nomes, td],
  );
  const erroPadrao = td("novoCadastro.erro");
  const frasesDaFalha = (falha: EstadoFluxoEnvio["falha"]): string[] =>
    falha === null
      ? []
      : falha === "rede"
        ? [erroPadrao]
        : textosDasRecusas(tr, recusasLegiveis(falha.corpo, nomesDaTela), erroPadrao);

  async function tratar(r: Awaited<ReturnType<typeof fluxo.enviar>>) {
    if (r.tipo === "ok") {
      salvarSaida(r.pedido.jogoOrigem);
      const total = r.criados + r.movidos;
      const texto = [
        td("novoCadastro.enviados", { quantidade: total, jogo: nomeDoJogo(r.pedido.jogoOrigem) }),
        r.movidos > 0 ? td("novoCadastro.movidos", { quantidade: r.movidos }) : null,
      ]
        .filter(Boolean)
        .join(" ");
      definirSelecao(new Map());
      setUltimo(null);
      voltarPara.current = null;
      setItensVisiveis(ITENS_POR_VEZ);
      setEtapa(1);
      setResultado({ tom: "sucesso", texto });
      iniciarLeitura(() => router.refresh());
    } else if (r.tipo === "recusa") {
      // A tela está velha (outra aba mandou a vaga, um jogo parou): relê, e o lote mostra o que impede.
      setResultado({ tom: "perigo", textos: frasesDaFalha(fluxo.estado().falha) });
      iniciarLeitura(() => router.refresh());
    } else if (r.tipo === "rede" && !fluxo.estado().pendente) {
      setResultado({ tom: "perigo", textos: [erroPadrao] });
    }
  }

  async function enviarLote() {
    if (!saida || bloqueio) return;
    setResultado(null);
    const pedido: PedidoEnvio = { jogoOrigem: saida, itens: linhas.map((l) => ({ formaId: l.forma.id, shiny: l.shiny })) };
    await tratar(await fluxo.enviar(pedido));
  }

  /* ---- Etapas e foco --------------------------------------------------- */

  function continuar() {
    fecharPrevisao();
    setResultado(null);
    setItensVisiveis(ITENS_POR_VEZ);
    voltarPara.current = ultimo && ultimo.trilha === trilha ? ultimo : null;
    setEtapa(2);
  }
  function voltar() {
    setResultado(null);
    setEtapa(1);
  }

  /* Trocar de etapa troca a página e o botão clicado sai dela: o foco iria
     para o `body`. Na etapa 2 vai para o título da saída, com a página no
     topo; ao voltar, para a vaga do último toque, montada de novo pela grade. */
  useEffect(() => {
    if (etapa === 2) {
      tituloSaidaRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    const alvo = voltarPara.current;
    voltarPara.current = null;
    if (!alvo) return;
    let vivo = true;
    void (async () => {
      const caixa = await grade.current?.elementoDe(alvo.chaveCaixa);
      if (!vivo || !caixa) return;
      const vaga = caixa.querySelector<HTMLElement>(`[${ATRIBUTO_VAGA}="${CSS.escape(`${alvo.formaId}:${alvo.trilha}`)}"]`);
      (vaga ?? caixa).focus({ preventScroll: true });
      (vaga ?? caixa).scrollIntoView({ block: "center", behavior: "instant" });
    })();
    return () => {
      vivo = false;
    };
  }, [etapa]);

  /* O resultado aparece no alto do conteúdo e o botão está na barra, embaixo:
     leva o aviso à vista; no sucesso a etapa trocou e o botão sumiu, então o
     foco vem junto. */
  useEffect(() => {
    if (!resultado) return;
    const aviso = avisoRef.current;
    if (!aviso) return;
    if (resultado.tom === "sucesso") aviso.focus({ preventScroll: true });
    aviso.scrollIntoView({ block: "nearest" });
  }, [resultado]);

  /* ---- A barra --------------------------------------------------------- */

  const fimDoUltimo = (u: UltimoToque): string => {
    if (u.evento === "marcou") return td("novoCadastro.marcado");
    if (u.evento === "desmarcou") return td("novoCadastro.desmarcado");
    if (u.evento === "teto") return td("novoCadastro.teto", { maximo: String(MAX_ITENS_ENVIO_HOME) });
    if (u.buraco) return td(`caixas.buraco.${u.buraco}`);
    return selecao.has(chaveVagaTrilha(u.formaId, u.trilha === "shiny"))
      ? td("novoCadastro.marcado")
      : td(`estado.${estadoDaVaga(estados, u.formaId, u.trilha)}`);
  };
  const textoUltimo = ultimo
    ? td("novoCadastro.ultimoToque", {
        nome: ultimo.nome,
        caixa: String(ultimo.caixa),
        posicao: String(ultimo.posicao),
        acao: fimDoUltimo(ultimo),
      })
    : td("novoCadastro.dica");
  /* Para o leitor de tela, só o que mudou a seleção (ou o toque barrado pelo
     teto): o foco já faz o botão dizer o nome. */
  const anuncio = ultimo && ultimo.evento !== "identificou" ? textoUltimo : "";

  /* O par de gênero da última vaga: onde está a outra, e um botão que a marca sem rolar até ela. */
  const parDoUltimo = (() => {
    if (!ultimo || ultimo.buraco) return null;
    const p = parVisivel(ultimo.formaId, ultimo.trilha);
    const lugar = p ? posicoes[ultimo.trilha].get(p.par) : undefined;
    if (!p || !lugar) return null;
    const lado: LadoGenero = p.lado === "macho" ? "femea" : "macho";
    const marcada = selecao.has(chaveVagaTrilha(p.par, ultimo.trilha === "shiny"));
    const noHome = estadoDaVaga(estados, p.par, ultimo.trilha) === "no_home";
    const nome = nomes.get(p.par) ?? p.par;
    const acao = marcada ? "desmarcar" : "marcar";
    const caixaDoPar = caixasPorTrilha[ultimo.trilha].find((c) => c.numero === lugar.caixa);
    return {
      alvo: {
        formaId: p.par,
        trilha: ultimo.trilha,
        nome,
        caixa: lugar.caixa,
        posicao: lugar.posicao,
        chaveCaixa: caixaDoPar ? chaveDaCaixa(caixaDoPar) : String(lugar.caixa),
        buraco: null,
      } satisfies AlvoVaga,
      marcada,
      alternavel: !noHome || marcada,
      texto: `${td("novoCadastro.parEm", { simbolo: SIMBOLO_GENERO[lado], caixa: String(lugar.caixa), posicao: String(lugar.posicao) })}${
        noHome ? ` — ${td("estado.no_home")}` : ""
      }`,
      textoLongo: `${nome} — ${td("pokedex.posicaoNaCaixa", { caixa: String(lugar.caixa), posicao: String(lugar.posicao) })}${
        noHome ? ` — ${td("estado.no_home")}` : ""
      }`,
      botao: td(`novoCadastro.${acao}Curto`, { simbolo: SIMBOLO_GENERO[lado] }),
      botaoRotulo: `${td(`novoCadastro.${acao}${lado === "macho" ? "Macho" : "Femea"}`)} — ${nome}`,
    };
  })();

  const textoBloqueio = (() => {
    if (!bloqueio) return textoContagem;
    switch (bloqueio.tipo) {
      case "loteVazio":
        return td("novoCadastro.loteVazio");
      case "acimaDoTeto":
        return td("novoCadastro.acimaDoTeto", { maximo: String(MAX_ITENS_ENVIO_HOME), excesso: String(bloqueio.excesso) });
      case "escolhaSaida":
        return td("novoCadastro.escolhaSaida");
      case "impedidos":
        return td("novoCadastro.tireImpedidos", { quantidade: bloqueio.quantidade });
    }
  })();

  const textoMarca = (m: MarcaLote): { texto: string; tom?: "aviso" | "acento" | "perigo" } => {
    switch (m.tipo) {
      case "foraDoJogo":
        return { texto: td("cadastrar.foraDoJogo") };
      case "como":
        return { texto: td(`cadastrar.como.${m.como}`), tom: "aviso" };
      case "trancada":
        return { texto: td("cadastrar.trancada", { checkpoint: m.checkpoint }) };
      case "moveDoJogo":
        return { texto: td("novoCadastro.moveDoJogo", { jogo: nomeDoJogo(m.jogo) }), tom: "acento" };
      case "nascidoEm":
        return { texto: td("novoCadastro.nascidoEm", { jogo: nomeDoJogo(m.jogo) }) };
      case "naoVaiAoHome":
        return { texto: td("cadastrar.naoVaiAoHome"), tom: "perigo" };
      case "jaNoHome":
        return { texto: td("novoCadastro.jaNoHome"), tom: "perigo" };
    }
  };

  const pendente = estadoEnvio.pendente;
  const fraseConfirmacao = pendente ? textoDaRecusa(tr, pendente.corpo, erroPadrao) : "";
  const erroNoDialogo = pendente ? frasesDaFalha(estadoEnvio.falha)[0] : undefined;

  /* ---- Tela ------------------------------------------------------------ */

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecalho}>
        <div>
          <p className={estilos.sobretitulo}>Living Dex</p>
          <h1 className={estilos.titulo}>{td("novoCadastro.titulo")}</h1>
          <p className={estilos.subtitulo}>{t("descricao")}</p>
        </div>
        <div className={estilos.acoes}>
          <BotaoLink href="/dex/recebidos" pequeno>
            {t("recebidos")}
          </BotaoLink>
          <BotaoLink href="/dex/caixas" pequeno>
            {t("caixas")}
          </BotaoLink>
        </div>
      </header>

      <p className={estilos.passo}>{etapa === 1 ? t("etapa1") : t("etapa2")}</p>

      <div ref={avisoRef} tabIndex={-1} className={estilos.aviso}>
        {resultado?.tom === "sucesso" && (
          <AvisoEmLinha
            tom="sucesso"
            papel="status"
            acao={
              <BotaoLink href="/dex/recebidos" pequeno>
                {td("novoCadastro.verRecebidos")}
              </BotaoLink>
            }
          >
            {resultado.texto}
          </AvisoEmLinha>
        )}
        {resultado?.tom === "perigo" && (
          <AvisoEmLinha tom="perigo" papel="alert" titulo={t("recusado")}>
            <ul className={estilos.erros}>
              {resultado.textos.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </AvisoEmLinha>
        )}
      </div>

      {etapa === 1 ? (
        <>
          <section className={estilos.controles} aria-label={t("filtros")}>
            <div className={estilos.linhaControles}>
              <Segmentado
                rotulo={td("pokedex.trilha")}
                opcoes={(["normal", "shiny"] as const).map((v) => ({ valor: v, rotulo: td(`trilha.${v}`) }))}
                valor={trilha}
                aoMudar={setTrilha}
              />
              <div className={estilos.busca}>
                <Campo
                  type="search"
                  aria-label={td("pokedex.buscar")}
                  placeholder={td("pokedex.placeholderBuscar")}
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              <button type="button" className={estilos.chip} aria-pressed={soFaltantes} onClick={() => setSoFaltantes((v) => !v)}>
                {td("novoCadastro.soFaltantes")}
              </button>
            </div>
            {saltos.length > 0 && (
              <nav className={estilos.chips} aria-label={td("caixas.irPara")}>
                {saltos.map(({ grupo, chave }) => (
                  <button key={grupo} type="button" className={estilos.chip} onClick={() => irPara(chave)}>
                    {td(`caixas.grupo.${grupo}`)}
                  </button>
                ))}
              </nav>
            )}
            {/* Nada só de cor nem só de mouse: a legenda escreve o que cada moldura é. */}
            <ul className={estilos.legenda} aria-label={t("legenda")}>
              {ESTADOS_LEGENDA.map((e) => (
                <li key={e} className={estilos.legendaItem}>
                  <span aria-hidden className={estilos.amostra} data-estado={e} />
                  {td(`estado.${e}`)}
                </li>
              ))}
              <li className={estilos.legendaItem}>
                <span aria-hidden className={estilos.amostra} data-estado="marcada" />
                {td("novoCadastro.marcada")}
              </li>
              <li className={estilos.legendaItem}>
                <span aria-hidden className={`${estilos.amostra} ${estilos.amostraBuraco}`} />
                <span>
                  <b>{t("legendaBuraco")}</b>: {t("legendaBuracoTexto")}
                </span>
              </li>
            </ul>
            <p className={estilos.nota}>{t("notaNoHome")}</p>
          </section>

          {formas.length === 0 ? (
            <AvisoEmLinha>{td("pokedex.catalogoVazio")}</AvisoEmLinha>
          ) : caixasVisiveis.length === 0 ? (
            <AvisoEmLinha>
              {casam
                ? td("novoCadastro.nadaNaBusca")
                : soFaltantes && caixas.length > 0
                  ? td("novoCadastro.nadaFaltando")
                  : td("caixas.vazio")}
            </AvisoEmLinha>
          ) : (
            <GradeVirtual
              ref={grade}
              itens={caixasVisiveis}
              chaveDe={chaveDaCaixa}
              minCelula={MIN_CAIXA}
              vaoX={VAO_GRADE}
              vaoY={VAO_GRADE}
              proporcao={PROPORCAO_CAIXA}
              alturaExtra={ALTURA_EXTRA_CAIXA}
              limiar={LIMIAR_CAIXAS}
              rotulo={t("grade")}
              renderizar={(caixa, celula) => (
                <CaixaEscolha
                  caixa={caixa}
                  tabIndex={celula.tabIndex}
                  indice={celula[ATRIBUTO_CELULA]}
                  trilha={trilha}
                  estados={estados}
                  textos={textos}
                  marcadas={caixa.lugares
                    .filter((l) => selecao.has(chaveVagaTrilha(l.forma.id, trilha === "shiny")))
                    .map((l) => l.forma.id)
                    .join("|")}
                  casam={casam}
                  generos={generos}
                  aoTocar={aoTocar}
                  previsao={previsao}
                  fecharPrevisao={fecharPrevisao}
                />
              )}
            />
          )}

          <div className={`${estilos.barra} v2-painel-flutuante`} role="region" aria-label={t("barra")}>
            <div className={estilos.barraTexto}>
              <span className={`${estilos.barraContagem} v2-num`}>{textoContagem}</span>
              <span className={estilos.barraLinha}>{textoUltimo}</span>
              {parDoUltimo && (
                <span className={estilos.barraPar}>
                  <span aria-hidden>{parDoUltimo.texto}</span>
                  <span className={estilos.soLeitor}>{parDoUltimo.textoLongo}</span>
                </span>
              )}
              <span className={estilos.soLeitor} aria-live="polite">
                {anuncio}
              </span>
            </div>
            <div className={estilos.barraAcoes}>
              {parDoUltimo?.alternavel && (
                <Botao pequeno aria-label={parDoUltimo.botaoRotulo} onClick={() => aoTocar(parDoUltimo.alvo, { tipo: "alternar", marcar: !parDoUltimo.marcada })}>
                  {parDoUltimo.botao}
                </Botao>
              )}
              {selecao.size > 0 && (
                <Botao
                  pequeno
                  variante="fantasma"
                  onClick={() => {
                    definirSelecao(new Map());
                    setUltimo(null);
                  }}
                >
                  {td("cadastrar.limpar")}
                </Botao>
              )}
              <Botao pequeno variante="primario" disabled={selecao.size === 0 || selecao.size > MAX_ITENS_ENVIO_HOME} onClick={continuar}>
                {td("novoCadastro.continuar", { quantidade: String(selecao.size) })}
              </Botao>
            </div>
          </div>
        </>
      ) : (
        <>
          <section className={estilos.secao} aria-labelledby="nc-saida">
            <h2 id="nc-saida" ref={tituloSaidaRef} tabIndex={-1} className={estilos.tituloSecao}>
              {td("novoCadastro.saida")}
            </h2>
            <div className={estilos.chips} role="group" aria-labelledby="nc-saida">
              {opcoes.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={estilos.chip}
                  aria-pressed={saida === o.id}
                  disabled={ocupado}
                  onClick={() => {
                    setResultado(null);
                    setSaidaEscolhida(o.id);
                  }}
                >
                  {o.nome}
                  {o.soEnvio && <span className={estilos.chipMarca}>{t("soEnvio")}</span>}
                </button>
              ))}
              <BotaoLink href="/dex/jogos" pequeno variante="fantasma">
                {td("cadastrar.irParaJogos")}
              </BotaoLink>
            </div>
            <p className={estilos.nota}>{t("notaSaida")}</p>
          </section>

          <section className={estilos.secao} aria-labelledby="nc-lote">
            <h2 id="nc-lote" className={estilos.tituloSecao}>
              {td("novoCadastro.lote")}
              <span className={`${estilos.contagemSecao} v2-num`}>{textoContagem}</span>
            </h2>
            {impedidos.length > 0 && (
              <div>
                <Botao
                  pequeno
                  variante="perigo"
                  disabled={ocupado}
                  onClick={() => definirSelecao(tirarDaSelecao(selecaoRef.current, impedidos.map((l) => l.chave)))}
                >
                  {t("tirarImpedidos", { quantidade: impedidos.length })}
                </Botao>
              </div>
            )}
            {linhas.length === 0 ? (
              <AvisoEmLinha>{td("novoCadastro.loteVazio")}</AvisoEmLinha>
            ) : (
              <ul className={estilos.lote}>
                {linhas.slice(0, itensVisiveis).map((l) => {
                  const nome = nomes.get(l.forma.id) ?? l.forma.especie;
                  const lado = parVisivel(l.forma.id, trilhaDoItem(l.shiny))?.lado;
                  return (
                    <li key={l.chave} className={estilos.item} data-impede={l.impede || undefined}>
                      <SpriteDex sprite={l.forma.sprite} shiny={l.shiny} tamanho={48} />
                      <div className={estilos.itemCorpo}>
                        <span className={estilos.itemNome}>
                          <span>
                            {nome}
                            {lado && <span aria-hidden> {SIMBOLO_GENERO[lado]}</span>}
                          </span>
                          {l.shiny && <span className={estilos.seloShiny}>{td("trilha.shiny")}</span>}
                        </span>
                        <span className={`${estilos.itemLugar} v2-num`}>
                          {l.destino
                            ? td("pokedex.posicaoNaCaixa", { caixa: String(l.destino.caixa), posicao: String(l.destino.posicao) })
                            : td("recebidos.semLugar")}
                        </span>
                        {l.marcas.length > 0 && (
                          <ul className={estilos.marcas}>
                            {l.marcas.map((m) => {
                              const { texto, tom } = textoMarca(m);
                              return (
                                <li key={m.tipo} className={estilos.marca} data-tom={tom}>
                                  {texto}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                      <Botao
                        soIcone
                        variante="fantasma"
                        aria-label={td("novoCadastro.tirar", { nome })}
                        disabled={ocupado}
                        icone={<span aria-hidden>✕</span>}
                        onClick={() => definirSelecao(tirarDaSelecao(selecaoRef.current, [l.chave]))}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
            {linhas.length > itensVisiveis && (
              <div>
                <Botao pequeno onClick={() => setItensVisiveis((n) => n + ITENS_POR_VEZ)}>
                  {t("mostrarMais", { restantes: linhas.length - itensVisiveis })}
                </Botao>
              </div>
            )}
          </section>

          <div className={`${estilos.barra} v2-painel-flutuante`} role="region" aria-label={t("barra")}>
            <div className={estilos.barraTexto}>
              <span className={estilos.barraLinha} aria-live="polite">
                {textoBloqueio}
              </span>
            </div>
            <div className={estilos.barraAcoes}>
              <Botao pequeno variante="fantasma" disabled={estadoEnvio.ocupado} onClick={voltar}>
                {td("novoCadastro.voltar")}
              </Botao>
              <Botao pequeno variante="primario" disabled={bloqueio !== null || ocupado} carregando={estadoEnvio.ocupado && !pendente} onClick={enviarLote}>
                {td("novoCadastro.enviar", { quantidade: String(linhas.length) })}
              </Botao>
            </div>
          </div>
        </>
      )}

      <DialogoConfirmacao
        aberto={pendente !== null}
        titulo={t("confirmacao.titulo")}
        descricao={
          pendente && (
            <>
              {fraseConfirmacao} {t("confirmacao.lote", { quantidade: pendente.itens.length })}
              {erroNoDialogo && (
                <span role="alert" className={estilos.erroDialogo}>
                  {erroNoDialogo}
                </span>
              )}
            </>
          )
        }
        rotuloConfirmar={t("confirmacao.confirmar")}
        perigoso
        ocupado={estadoEnvio.ocupado}
        aoConfirmar={async () => tratar(await fluxo.confirmar())}
        aoCancelar={fluxo.cancelar}
      />
      {cartao}
    </div>
  );
}
