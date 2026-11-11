"use client";

/**
 * Novo cadastro — o que está indo ao HOME, escolhido na grade das caixas.
 *
 * O Cadastrar grava no jogo, linha a linha e com quantidade; para chegar ao
 * HOME é um segundo passo. O uso real é o contrário: mandar um lote do GO e
 * registrar o que chegou. Aqui a grade é a das Caixas (mesmos números,
 * grupos e molduras), o que falta já aparece apagado e um toque marca. Cada
 * vaga já diz o destino, então quem escolhe por ela já sabe onde guardar.
 *
 * Duas etapas na mesma rota, com o estado no cliente:
 *
 * 1. **Grade.** Marca vagas em falta ou no jogo, nas duas trilhas. A seleção
 *    é um conjunto de vaga + trilha e não depende do que está na tela: busca,
 *    "só caixas com faltantes" e trilha só mudam a vista, e a contagem separa
 *    normal de shiny para o que ficou na outra trilha não passar batido.
 * 2. **Saída e envio.** O jogo de onde saíram (ou o próprio HOME), a lista do
 *    lote na ordem das caixas, com o destino e as marcas do Cadastrar, e o
 *    envio. "Voltar" mantém a seleção.
 *
 * O jogo escolhido é o **local de onde sai**, não a origem histórica: se já
 * há registro daquela vaga nesse jogo, a rota o move (e ele continua "do
 * Sword"); senão, cria um nascido ali. A tela só avisa; quem decide é a
 * rota, que confere tudo de novo, porque a tela não é a única porta.
 *
 * ## Celular (abaixo de 768px)
 *
 * - Vaga com no mínimo 44 × 44 e 8px entre vagas: 6 × 44 + 5 × 8 = 304px.
 *   Com o painel a 8px de recuo lateral cabe de 354px de largura para cima;
 *   abaixo (320px) a caixa rola na horizontal dentro do próprio painel, e a
 *   página nunca.
 * - Sem hover, a barra de ação diz o último toque ("Raichu (Alola) · Caixa
 *   52 · 3 — marcado"): o número da Pokédex sozinho não distingue formas da
 *   mesma espécie.
 * - A barra de ação desce para a base, fixa, como a do Cadastrar; o `pb` da
 *   `main` reserva a altura dela. No desktop ela fica grudada no topo da
 *   área que rola, perto de onde se marca.
 *
 * ~1.300 vagas por trilha: a vaga é memorizada e só redesenha quando muda o
 * que ela mostra — um toque redesenha uma vaga, não a grade.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from "react";

import { Alerta } from "@/app/_componentes/alerta";
import { Botao, classesBotao } from "@/app/_componentes/botao";
import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { classesEntrada } from "@/app/_componentes/campo";
import { Distintivo } from "@/app/_componentes/distintivo";
import { EstadoVazio } from "@/app/_componentes/estado-vazio";
import { Icone } from "@/app/_componentes/icone";
import { Modal } from "@/app/_componentes/modal";
import { Painel } from "@/app/_componentes/painel";
import { textoDaRecusa, textosDasRecusas } from "@/app/_componentes/recusa";
import { useEhMobile } from "@/app/_componentes/use-eh-mobile";
import {
  GRUPOS_CAIXA,
  montarCaixasDex,
  posicoesNasCaixas,
  VAGAS_POR_CAIXA,
  type GrupoCaixa,
  type MotivoBuraco,
  type PosicaoNaCaixa,
} from "@/lib/dominio/dex-caixas";
import { catalogoDoJogo, naoTransferiveis } from "@/lib/dominio/dex-disponibilidade";
import { estadoDaVaga, mapearEstadosDex, type EstadoVagaDex } from "@/lib/dominio/dex-estado";
import { filtrarFormasDex, type TrilhaDex } from "@/lib/dominio/dex-grade";
import { jogoDex, ORIGEM_HOME } from "@/lib/dominio/dex-jogos";
import type { SecoesContadas } from "@/lib/dominio/dex-secoes";
import { especiesTrancadas, type IdiomaTrofeu } from "@/lib/dominio/dex-trofeus";
import type { FormaDexDTO, JogoPossuidoDTO, RegistroDexDTO, TrofeuDexDTO } from "@/lib/dominio/tipos-cliente";
import { urlSpriteDex } from "@/lib/imagens";

import { useCartaoPokemon, type DadosCartaoPokemon } from "../_componentes/cartao-pokemon";
import { SpriteDex } from "../_componentes/sprite-dex";
import { useNomeCaixa } from "../_componentes/use-nome-caixa";
import { useRotuloForma } from "../_componentes/use-rotulo-forma";

/* No celular a pílula chega a 44px de altura e largura, com mais respiro
   lateral; o intervalo de 8px vem do `gap-2` do grupo. Mesma classe do
   Cadastrar. */
const classesOpcao = (ativa: boolean) =>
  `rounded-pill border px-3 py-1 text-xs font-semibold [transition:var(--transition-control)] max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center max-md:px-4 max-md:text-sm ${
    ativa ? "border-accent bg-accent text-accent-fg" : "border-line text-muted hover:bg-surface-hover"
  }`;

/* As molduras das Caixas: no HOME, sucesso; no jogo, aviso; em falta, apagado. */
const MOLDURA: Record<EstadoVagaDex, string> = {
  falta: "border-hairline",
  no_jogo: "border-warning/70",
  no_home: "border-success/70 bg-success-soft",
};

/* Marcada: anel por dentro da borda (`ring-inset`). Por fora ele seria
   cortado pela rolagem horizontal da caixa no celular. */
const ANEL_MARCADA = "bg-accent-soft ring-2 ring-inset ring-accent";

const ESTADOS_LEGENDA: readonly EstadoVagaDex[] = ["falta", "no_jogo", "no_home"];

/* A faixa "#0001–#0030" só diz algo nos grupos ordenados pelo número; os outros vão por lançamento. */
const GRUPO_POR_NUMERO: ReadonlySet<GrupoCaixa> = new Set(["nacional", "genero"]);

/* `jogo:forma` que o HOME não recebe daquele jogo. É a lista que a rota
   confere, e não o `transferivel` do catálogo do jogo: aquele só existe para
   a forma que o catálogo diz que sai do jogo. */
const NAO_VAI_AO_HOME = naoTransferiveis();

const CHAVE_SAIDA = "dex:novo-cadastro:saida";

const numero4 = (n: number) => String(n).padStart(4, "0");
const chaveDaVaga = (formaId: string, trilha: TrilhaDex) => `${formaId}:${trilha}`;
const idDaVaga = (formaId: string, trilha: TrilhaDex) => `vaga-${formaId}-${trilha}`;

/*
 * A última saída usada, lembrada neste navegador. É conveniência: o
 * armazenamento pode vir vazio ou recusar (janela anônima), e a tela
 * funciona igual, só sem a pílula pré-marcada. Lida por
 * `useSyncExternalStore` para o servidor e a hidratação verem `null` e o
 * valor só entrar depois — o mesmo HTML dos dois lados.
 */
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

/** A chave da recusa única de uma resposta (`{ recusa: { chave } }`), ou nulo. */
function chaveDaRecusa(corpo: unknown): string | null {
  if (typeof corpo !== "object" || corpo === null) return null;
  const recusa = (corpo as { recusa?: unknown }).recusa;
  if (typeof recusa !== "object" || recusa === null) return null;
  const chave = (recusa as { chave?: unknown }).chave;
  return typeof chave === "string" ? chave : null;
}

/** `{ criados, movidos }` do 201; sem eles, conta o lote inteiro como criado. */
function lerResultado(corpo: unknown, total: number): { criados: number; movidos: number } {
  if (typeof corpo === "object" && corpo !== null) {
    const { criados, movidos } = corpo as { criados?: unknown; movidos?: unknown };
    if (typeof criados === "number" && typeof movidos === "number") return { criados, movidos };
  }
  return { criados: total, movidos: 0 };
}

interface ItemSelecao {
  formaId: string;
  shiny: boolean;
}

/** Vaga + trilha → item. Um Pokémon por vaga e trilha, como a rota pede. */
type Selecao = ReadonlyMap<string, ItemSelecao>;

interface AlvoToque {
  formaId: string;
  trilha: TrilhaDex;
  nome: string;
  caixa: number;
  posicao: number;
}

type UltimoToque = AlvoToque & { marcado: boolean };

interface ItemLote {
  chave: string;
  forma: FormaDexDTO;
  shiny: boolean;
  /** Caixa e posição com as reservadas de agora; nulo se a vaga saiu das caixas (seção desligada em outra aba). */
  destino: PosicaoNaCaixa | null;
}

interface PedidoEnvio {
  jogoOrigem: string;
  itens: ItemSelecao[];
}

/** Na ordem das caixas do HOME; o que ficou sem lugar vai para o fim. */
function compararDestino(a: ItemLote, b: ItemLote): number {
  if (!a.destino || !b.destino) return (a.destino ? 0 : 1) - (b.destino ? 0 : 1);
  return a.destino.caixa - b.destino.caixa || a.destino.posicao - b.destino.posicao || Number(a.shiny) - Number(b.shiny);
}

const Vaga = memo(function Vaga({
  forma,
  nome,
  caixa,
  posicao,
  trilha,
  estado,
  buraco,
  apagada,
  marcada,
  ehMobile,
  aoAlternar,
  abrir,
  fechar,
}: {
  forma: FormaDexDTO;
  /** Nome com a forma (`useRotuloForma`), calculado uma vez por catálogo. */
  nome: string;
  caixa: number;
  posicao: number;
  trilha: TrilhaDex;
  estado: EstadoVagaDex;
  buraco: MotivoBuraco | null;
  /** Fora da busca: aparece, para a caixa não se desmontar, mas não se marca. */
  apagada: boolean;
  marcada: boolean;
  /** Vem de cima (um `useEhMobile()` só, não um por vaga). */
  ehMobile: boolean;
  aoAlternar: (alvo: AlvoToque, marcar: boolean) => void;
  abrir: (dados: DadosCartaoPokemon) => (e: MouseEvent<HTMLElement>) => void;
  fechar: () => void;
}) {
  const t = useTranslations("dex");
  const shiny = trilha === "shiny";
  const lugar = t("pokedex.posicaoNaCaixa", { caixa: String(caixa), posicao: String(posicao) });
  // O número da Pokédex no pé da vaga, só no celular, como nas Caixas.
  const numero = ehMobile && (
    <span className="pointer-events-none absolute inset-x-0.5 bottom-0 rounded-sm bg-surface/80 text-center font-mono text-[9px] leading-tight font-semibold tabular-nums text-muted">
      {numero4(forma.numero)}
    </span>
  );
  const visto = marcada && (
    <span
      aria-hidden
      className="pointer-events-none absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-accent text-accent-fg"
    >
      <Icone nome="check" tamanho={12} />
    </span>
  );

  if (buraco) {
    // Buraco das Caixas: a posição é da forma, mas nada entra nela nesta trilha.
    const motivo = t(`caixas.buraco.${buraco}`);
    return (
      <li
        aria-label={`${nome} — ${motivo} — ${lugar}`}
        className={`relative flex aspect-square items-center justify-center rounded-md border border-dashed border-line ${apagada ? "opacity-30" : ""}`}
        onMouseEnter={abrir({ sprite: forma.sprite, shiny: false, nome, linhas: [motivo, lugar] })}
        onMouseLeave={fechar}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- sprite externo pequeno (PokeAPI, ~0,6 KB); mesma convenção das Caixas. */}
        <img
          src={urlSpriteDex(forma.sprite, false)}
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

  const textoEstado = t(`estado.${estado}`);
  const rotulo = `${nome} — ${textoEstado} — ${lugar}`;
  const linhasCartao = marcada ? [textoEstado, lugar, t("novoCadastro.marcada")] : [textoEstado, lugar];

  // No HOME (já não falta) ou fora da busca: aparece, sem botão. Se estava
  // marcada antes (a vaga chegou ao HOME por outra aba), o anel continua: a
  // seleção é a mesma, e a etapa 2 diz por que ela não pode ir.
  if (estado === "no_home" || apagada) {
    return (
      <li
        aria-label={rotulo}
        className={`relative flex aspect-square items-center justify-center rounded-md border ${MOLDURA[estado]} ${marcada ? ANEL_MARCADA : ""} ${apagada ? "opacity-30" : ""}`}
        onMouseEnter={abrir({ sprite: forma.sprite, shiny, nome, linhas: linhasCartao })}
        onMouseLeave={fechar}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- sprite externo pequeno (PokeAPI), 30 por caixa; mesma convenção das Caixas. */}
        <img
          src={urlSpriteDex(forma.sprite, shiny)}
          alt=""
          width={56}
          height={56}
          loading="lazy"
          className={`h-full w-full object-contain ${estado === "falta" ? "opacity-40 grayscale" : ""}`}
          style={{ imageRendering: "pixelated" }}
        />
        {visto}
        {numero}
      </li>
    );
  }

  return (
    <li className={`aspect-square rounded-md border ${MOLDURA[estado]} ${marcada ? ANEL_MARCADA : ""}`}>
      <button
        type="button"
        id={idDaVaga(forma.id, trilha)}
        aria-pressed={marcada}
        aria-label={rotulo}
        // `scroll-mt`: o foco por Tab não para debaixo da barra grudada no topo (desktop).
        className="group relative flex h-full w-full items-center justify-center rounded-md md:scroll-mt-24"
        onClick={() => aoAlternar({ formaId: forma.id, trilha, nome, caixa, posicao }, !marcada)}
        onMouseEnter={abrir({ sprite: forma.sprite, shiny, nome, linhas: linhasCartao })}
        onMouseLeave={fechar}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- sprite externo pequeno (PokeAPI), 30 por caixa; mesma convenção das Caixas. */}
        <img
          src={urlSpriteDex(forma.sprite, shiny)}
          alt=""
          width={56}
          height={56}
          loading="lazy"
          className={`h-full w-full object-contain [transition:transform_200ms,filter_200ms,opacity_200ms] group-hover:scale-125 ${
            estado === "falta" && !marcada ? "opacity-40 grayscale group-hover:opacity-100 group-hover:grayscale-0" : ""
          }`}
          style={{ imageRendering: "pixelated" }}
        />
        {visto}
        {numero}
      </button>
    </li>
  );
});

/**
 * A barra das ações da etapa. Celular: fixa na base, na zona do polegar, com
 * a área segura do iPhone (a `main` reserva a altura). Desktop: grudada no
 * topo da área que rola, porque a grade tem dezenas de caixas e o botão no
 * começo da página ficaria longe do que se acabou de marcar.
 */
function BarraAcao({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:sticky md:top-0 md:z-10 md:border-b md:border-hairline md:bg-background md:py-3 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:border-t max-md:border-line max-md:bg-surface max-md:px-4 max-md:pt-3 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}

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
  /** Só os ativos. */
  jogos: JogoPossuidoDTO[];
  /** Troféus-checkpoint ainda não conquistados. */
  checkpoints: TrofeuDexDTO[];
}) {
  const t = useTranslations("dex");
  const tr = useTranslations("recusas");
  const router = useRouter();
  const idioma = useLocale() as IdiomaTrofeu;
  const rotulo = useRotuloForma(formas);
  const nomeCaixa = useNomeCaixa();
  const ehMobile = useEhMobile();
  const { abrir, fechar, cartao } = useCartaoPokemon();

  const mainRef = useRef<HTMLElement>(null);
  const avisoRef = useRef<HTMLDivElement>(null);
  const tituloSaidaRef = useRef<HTMLHeadingElement>(null);
  /** Vaga que recebe o foco ao voltar da etapa 2 (o último toque). */
  const voltarParaRef = useRef<string | null>(null);
  const idSaida = useId();
  const idModal = useId();

  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [trilha, setTrilha] = useState<TrilhaDex>("normal");
  const [busca, setBusca] = useState("");
  // A busca apaga ou acende ~1.300 vagas: o campo responde primeiro, a grade depois.
  const buscaAdiada = useDeferredValue(busca);
  const [soFaltantes, setSoFaltantes] = useState(true);
  const [selecao, setSelecao] = useState<Selecao>(() => new Map());
  const [ultimo, setUltimo] = useState<UltimoToque | null>(null);
  const [saidaEscolhida, setSaidaEscolhida] = useState<string | null>(null);
  const saidaSalva = useSyncExternalStore(assinarArmazenamento, lerSaidaSalva, () => null);
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [sucesso, setSucesso] = useState<{ texto: string; movidos: string | null } | null>(null);
  const [pendente, setPendente] = useState<(PedidoEnvio & { frase: string }) | null>(null);

  /* ---- Etapa 1: a grade ------------------------------------------------ */

  const estados = useMemo(() => mapearEstadosDex(registros), [registros]);
  const nomes = useMemo(() => new Map(formas.map((f) => [f.id, rotulo.nome(f)])), [formas, rotulo]);
  const caixas = useMemo(
    () => montarCaixasDex(formas, trilha, secoes, caixasReservadas),
    [formas, trilha, secoes, caixasReservadas],
  );
  /* Mesma regra de busca da Pokédex e do Cadastrar (nome, forma em inglês ou
     português, número). Sem texto, `null`: tudo casa. */
  const casam = useMemo(() => {
    if (!buscaAdiada.trim()) return null;
    return new Set(
      filtrarFormasDex(formas, { regiao: "todas", categoria: "todas", busca: buscaAdiada }).map((f) => f.id),
    );
  }, [formas, buscaAdiada]);

  const caixasVisiveis = useMemo(
    () =>
      caixas.filter((c) => {
        if (casam && !c.lugares.some((l) => casam.has(l.forma.id))) return false;
        if (!soFaltantes) return true;
        return c.lugares.some(
          (l) =>
            l.buraco === null &&
            (!casam || casam.has(l.forma.id)) &&
            estadoDaVaga(estados, l.forma.id, trilha) !== "no_home",
        );
      }),
    [caixas, casam, soFaltantes, estados, trilha],
  );

  const aoAlternar = useCallback((alvo: AlvoToque, marcar: boolean) => {
    const chave = chaveDaVaga(alvo.formaId, alvo.trilha);
    setSelecao((atual) => {
      if (atual.has(chave) === marcar) return atual;
      const proxima = new Map(atual);
      if (marcar) proxima.set(chave, { formaId: alvo.formaId, shiny: alvo.trilha === "shiny" });
      else proxima.delete(chave);
      return proxima;
    });
    setUltimo({ ...alvo, marcado: marcar });
    setSucesso(null);
  }, []);

  const tirar = useCallback((chave: string) => {
    setSelecao((atual) => {
      if (!atual.has(chave)) return atual;
      const proxima = new Map(atual);
      proxima.delete(chave);
      return proxima;
    });
  }, []);

  function limpar() {
    setSelecao(new Map());
    setUltimo(null);
  }

  /* ---- Etapa 2: o lote ------------------------------------------------- */

  const formaPorId = useMemo(() => new Map(formas.map((f) => [f.id, f])), [formas]);
  /* O destino é derivado na hora, das caixas de cada trilha com as reservadas
     de agora; a seleção não guarda posição nenhuma. */
  const posicoes = useMemo(
    () => ({
      normal: posicoesNasCaixas(montarCaixasDex(formas, "normal", secoes, caixasReservadas)),
      shiny: posicoesNasCaixas(montarCaixasDex(formas, "shiny", secoes, caixasReservadas)),
    }),
    [formas, secoes, caixasReservadas],
  );
  const lote = useMemo(() => {
    const itens: ItemLote[] = [];
    for (const [chave, item] of selecao) {
      const forma = formaPorId.get(item.formaId);
      // Forma que saiu do catálogo (seed novo) não tem o que enviar.
      if (!forma) continue;
      itens.push({ chave, forma, shiny: item.shiny, destino: posicoes[item.shiny ? "shiny" : "normal"].get(forma.id) ?? null });
    }
    return itens.sort(compararDestino);
  }, [selecao, formaPorId, posicoes]);
  const totalShiny = lote.filter((i) => i.shiny).length;
  const contagem = t("novoCadastro.contagem", { normal: lote.length - totalShiny, shiny: totalShiny });

  const opcoes = useMemo(
    () => [...jogos.map((j) => ({ id: j.jogoId, nome: j.nome })), { id: ORIGEM_HOME, nome: t("cadastrar.home") }],
    [jogos, t],
  );
  // A escolhida nesta visita vence a lembrada; as duas só valem se ainda forem opção (jogo parado sai da lista).
  const candidata = saidaEscolhida ?? saidaSalva;
  const saida = candidata !== null && opcoes.some((o) => o.id === candidata) ? candidata : null;
  const nomeDoJogo = useCallback(
    (id: string) => (id === ORIGEM_HOME ? t("cadastrar.home") : (jogoDex(id)?.nome ?? id)),
    [t],
  );

  const catalogo = useMemo(() => (saida ? catalogoDoJogo(saida, formas) : null), [saida, formas]);
  const trancadas = useMemo(() => {
    const r = new Map<number, string>();
    if (!saida) return r;
    const titulo = new Map(checkpoints.map((c) => [c.id, c.textos[idioma]?.titulo ?? c.id]));
    for (const [n, ids] of especiesTrancadas(checkpoints, saida, new Set())) {
      r.set(n, ids.map((id) => titulo.get(id)).join(" + "));
    }
    return r;
  }, [checkpoints, saida, idioma]);
  /* O registro que a rota moveria: o primeiro com aquela vaga e trilha no jogo
     de saída. Os registros chegam em `criado_em, id`, a mesma ordem em que a
     rota escolhe. Saída pelo HOME sempre cria. */
  const noJogoDeSaida = useMemo(() => {
    const r = new Map<string, RegistroDexDTO>();
    if (!saida || saida === ORIGEM_HOME) return r;
    for (const reg of registros) {
      if (reg.local !== saida) continue;
      const chave = chaveDaVaga(reg.formaId, reg.shiny ? "shiny" : "normal");
      if (!r.has(chave)) r.set(chave, reg);
    }
    return r;
  }, [registros, saida]);

  /* Só avisam (fora do jogo, troca, evento, trancada, o que será movido) ou
     impedem (não vai ao HOME, já no HOME): o que impede tem de sair do lote. */
  const linhasLote = lote.map((item) => {
    const trilhaItem: TrilhaDex = item.shiny ? "shiny" : "normal";
    const disponibilidade = catalogo?.get(item.forma.id);
    const naoVai = saida !== null && NAO_VAI_AO_HOME.has(`${saida}:${item.forma.id}`);
    const jaNoHome = estadoDaVaga(estados, item.forma.id, trilhaItem) === "no_home";
    const movido = noJogoDeSaida.get(item.chave);
    const trancadaPor = trancadas.get(item.forma.numero);
    const marcas: ReactNode[] = [];
    if (catalogo && !disponibilidade) marcas.push(<Distintivo key="fora">{t("cadastrar.foraDoJogo")}</Distintivo>);
    if (disponibilidade && disponibilidade.como !== "livre") {
      marcas.push(
        <Distintivo key="como" tom="aviso">
          {t(`cadastrar.como.${disponibilidade.como}`)}
        </Distintivo>,
      );
    }
    if (trancadaPor) {
      marcas.push(
        <Distintivo key="trancada" className="whitespace-normal!">
          {t("cadastrar.trancada", { checkpoint: trancadaPor })}
        </Distintivo>,
      );
    }
    if (movido && saida) {
      marcas.push(
        <Distintivo key="move" tom="acento" className="whitespace-normal!">
          {t("novoCadastro.moveDoJogo", { jogo: nomeDoJogo(saida) })}
        </Distintivo>,
      );
      if (movido.jogoOrigem !== saida) {
        marcas.push(
          <Distintivo key="nascido" className="whitespace-normal!">
            {t("novoCadastro.nascidoEm", { jogo: nomeDoJogo(movido.jogoOrigem) })}
          </Distintivo>,
        );
      }
    }
    if (naoVai) {
      marcas.push(
        <Distintivo key="nao-vai" tom="perigo">
          {t("cadastrar.naoVaiAoHome")}
        </Distintivo>,
      );
    }
    if (jaNoHome) {
      marcas.push(
        <Distintivo key="ja-no-home" tom="perigo">
          {t("novoCadastro.jaNoHome")}
        </Distintivo>,
      );
    }
    return { item, marcas, impede: naoVai || jaNoHome };
  });
  const impedidos = linhasLote.filter((l) => l.impede).length;
  const podeEnviar = saida !== null && lote.length > 0 && impedidos === 0 && !enviando;

  /* ---- Envio ----------------------------------------------------------- */

  async function enviar(pedido: PedidoEnvio, confirmarSemVolta: boolean) {
    setEnviando(true);
    setErros([]);
    setSucesso(null);
    try {
      const r = await fetch("/api/dex/registros/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jogoOrigem: pedido.jogoOrigem, itens: pedido.itens, confirmarSemVolta }),
      });
      const corpo: unknown = await r.json().catch(() => null);
      // Saída só de envio (GO, FireRed): a confirmação é do usuário, nunca automática.
      if (r.status === 409 && chaveDaRecusa(corpo) === "dexConfirmarSemVolta") {
        setPendente({ ...pedido, frase: textoDaRecusa(tr, corpo, t("novoCadastro.erro")) });
        return;
      }
      setPendente(null);
      if (!r.ok) {
        setErros(textosDasRecusas(tr, corpo, t("novoCadastro.erro")));
        return;
      }
      const { criados, movidos } = lerResultado(corpo, pedido.itens.length);
      salvarSaida(pedido.jogoOrigem);
      setSucesso({
        texto: t("novoCadastro.enviados", { quantidade: criados + movidos, jogo: nomeDoJogo(pedido.jogoOrigem) }),
        movidos: movidos > 0 ? t("novoCadastro.movidos", { quantidade: movidos }) : null,
      });
      setSelecao(new Map());
      setUltimo(null);
      setEtapa(1);
      router.refresh();
    } catch {
      setPendente(null);
      setErros([t("novoCadastro.erro")]);
    } finally {
      setEnviando(false);
    }
  }

  async function enviarLote() {
    if (!saida) return;
    await enviar({ jogoOrigem: saida, itens: lote.map((i) => ({ formaId: i.forma.id, shiny: i.shiny })) }, false);
  }

  function continuar() {
    fechar();
    setErros([]);
    setSucesso(null);
    setEtapa(2);
  }

  function voltar() {
    setErros([]);
    voltarParaRef.current = ultimo ? idDaVaga(ultimo.formaId, ultimo.trilha) : null;
    setEtapa(1);
  }

  /* Trocar de etapa troca a página inteira, e o botão clicado sai dela: o
     foco iria para o `body`. Na etapa 2 ele vai para o título da saída, com a
     página no topo; ao voltar, para a vaga do último toque, no meio da tela.
     Na volta pelo sucesso não há vaga: quem rola é o efeito do aviso. */
  useEffect(() => {
    if (etapa === 2) {
      tituloSaidaRef.current?.focus({ preventScroll: true });
      mainRef.current?.scrollIntoView({ block: "start" });
      return;
    }
    const id = voltarParaRef.current;
    voltarParaRef.current = null;
    const alvo = id ? document.getElementById(id) : null;
    if (!alvo) return;
    alvo.focus({ preventScroll: true });
    alvo.scrollIntoView({ block: "center" });
  }, [etapa]);

  /* O botão está na barra (no celular, fixa na base) e o resultado aparece
     no topo do conteúdo, possivelmente fora da tela: leva o aviso à vista.
     No sucesso a etapa troca e o botão clicado sai da página, então o foco
     vem junto para o aviso. Só rola e foca; não mexe em estado. */
  useEffect(() => {
    if (erros.length === 0 && !sucesso) return;
    const aviso = avisoRef.current;
    if (!aviso) return;
    if (sucesso) aviso.focus({ preventScroll: true });
    aviso.scrollIntoView({ block: "nearest" });
  }, [erros, sucesso]);

  /* ---- Tela ------------------------------------------------------------ */

  const textoUltimo = ultimo
    ? t("novoCadastro.ultimoToque", {
        nome: ultimo.nome,
        caixa: String(ultimo.caixa),
        posicao: String(ultimo.posicao),
        acao: t(ultimo.marcado ? "novoCadastro.marcado" : "novoCadastro.desmarcado"),
      })
    : t("novoCadastro.dica");

  const motivoBloqueio =
    lote.length === 0
      ? t("novoCadastro.loteVazio")
      : saida === null
        ? t("novoCadastro.escolhaSaida")
        : impedidos > 0
          ? t("novoCadastro.tireImpedidos", { quantidade: impedidos })
          : contagem;

  return (
    <main
      ref={mainRef}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-8 max-md:pb-[calc(7rem+env(safe-area-inset-bottom))]!"
    >
      <CabecalhoPagina titulo={t("novoCadastro.titulo")} />

      {etapa === 1 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-1.5 max-md:gap-2" role="group" aria-label={t("pokedex.trilha")}>
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
            </div>
            <input
              aria-label={t("pokedex.buscar")}
              className={`${classesEntrada} w-56 max-md:w-full`}
              value={busca}
              placeholder={t("pokedex.placeholderBuscar")}
              onChange={(e) => setBusca(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm max-md:min-h-11">
              <input type="checkbox" checked={soFaltantes} onChange={(e) => setSoFaltantes(e.target.checked)} />
              {t("novoCadastro.soFaltantes")}
            </label>
          </div>
          <nav className="flex flex-wrap items-center gap-1.5 max-md:gap-2" aria-label={t("caixas.irPara")}>
            {GRUPOS_CAIXA.map((grupo) => {
              const primeira = caixasVisiveis.find((c) => c.grupo === grupo);
              return primeira ? (
                <a key={grupo} href={`#caixa-${primeira.numero}`} className={classesOpcao(false)}>
                  {t(`caixas.grupo.${grupo}`)}
                </a>
              ) : null;
            })}
          </nav>
          {/* Sem o cartão flutuante (só com mouse), a legenda diz o que cada moldura é. */}
          {ehMobile && (
            <ul className="flex flex-wrap items-center gap-2" aria-label={t("pokedex.filtroEstado")}>
              {ESTADOS_LEGENDA.map((e) => (
                <li key={e} className="flex items-center gap-1.5">
                  <span aria-hidden className={`size-4 rounded-md border ${MOLDURA[e]}`} />
                  <Distintivo>{t(`estado.${e}`)}</Distintivo>
                </li>
              ))}
              <li className="flex items-center gap-1.5">
                <span aria-hidden className={`size-4 rounded-md border border-hairline ${ANEL_MARCADA}`} />
                <Distintivo>{t("novoCadastro.marcada")}</Distintivo>
              </li>
            </ul>
          )}
        </div>
      ) : null}

      {etapa === 1 ? (
        <BarraAcao>
          <span className="text-xs tabular-nums text-muted max-md:min-w-0 max-md:flex-1">{contagem}</span>
          {/* No celular é a única identificação da vaga tocada; dois níveis de
              linha, para o "marcado/desmarcado" do fim não ser cortado. */}
          <p aria-live="polite" className="min-w-0 text-xs text-foreground md:flex-1 max-md:order-first max-md:line-clamp-2 max-md:w-full">
            {textoUltimo}
          </p>
          {selecao.size > 0 && (
            <Botao tamanho="sm" onClick={limpar}>
              {t("cadastrar.limpar")}
            </Botao>
          )}
          <Botao variante="primario" tamanho="sm" onClick={continuar} disabled={lote.length === 0}>
            {t("novoCadastro.continuar", { quantidade: String(lote.length) })}
          </Botao>
        </BarraAcao>
      ) : (
        <BarraAcao>
          <Botao tamanho="sm" onClick={voltar} disabled={enviando}>
            {t("novoCadastro.voltar")}
          </Botao>
          <p className="min-w-0 text-xs text-muted md:flex-1 max-md:order-first max-md:w-full">{motivoBloqueio}</p>
          <Botao
            variante="primario"
            tamanho="sm"
            className="max-md:flex-1"
            disabled={!podeEnviar}
            onClick={enviarLote}
          >
            {t("novoCadastro.enviar", { quantidade: String(lote.length) })}
          </Botao>
        </BarraAcao>
      )}

      <div ref={avisoRef} tabIndex={-1} className="flex scroll-mt-4 scroll-mb-32 flex-col gap-3 empty:hidden md:scroll-mt-24 md:scroll-mb-4">
        {erros.length > 0 && (
          <div role="alert">
            <Alerta tom="perigo">
              <ul>
                {erros.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Alerta>
          </div>
        )}
        {sucesso && (
          <div role="status">
            <Alerta tom="sucesso" className="flex flex-wrap items-center gap-x-3">
              <span>
                {sucesso.texto}
                {sucesso.movidos && ` ${sucesso.movidos}`}
              </span>
              <Link
                href="/dex/recebidos"
                className="font-semibold underline underline-offset-2 max-md:inline-flex max-md:min-h-11 max-md:items-center"
              >
                {t("novoCadastro.verRecebidos")}
              </Link>
            </Alerta>
          </div>
        )}
      </div>

      {etapa === 1 ? (
        caixasVisiveis.length === 0 ? (
          <EstadoVazio>
            {casam ? t("novoCadastro.nadaNaBusca") : soFaltantes && caixas.length > 0 ? t("novoCadastro.nadaFaltando") : t("caixas.vazio")}
          </EstadoVazio>
        ) : (
          /* `grid-cols-1` (e `min-w-0` no painel): sem teto, a caixa de 304px do
             celular alargaria a coluna e a página rolaria de lado. */
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {caixasVisiveis.map((caixa) => (
              <Painel
                key={caixa.numero}
                as="section"
                padding="sm"
                id={`caixa-${caixa.numero}`}
                className="min-w-0 scroll-mt-4 md:scroll-mt-24 max-md:px-2"
              >
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
                {/* Celular: 6 colunas de 44px no mínimo, 8px entre elas. Onde não
                    cabe, só esta caixa rola de lado; o recuo de 4px dá lugar ao
                    anel de foco das vagas da borda. Desktop: as 6 colunas
                    (`COLUNAS_CAIXA`) e o `gap-1` das Caixas. */}
                <div className="max-md:-m-1 max-md:overflow-x-auto max-md:p-1">
                  <ol className="grid grid-cols-6 gap-1 max-md:min-w-[19rem] max-md:grid-cols-[repeat(6,minmax(2.75rem,1fr))] max-md:gap-2">
                    {caixa.lugares.map(({ forma: f, buraco }, i) => (
                      <Vaga
                        key={f.id}
                        forma={f}
                        nome={nomes.get(f.id) ?? f.especie}
                        caixa={caixa.numero}
                        posicao={i + 1}
                        trilha={trilha}
                        estado={estadoDaVaga(estados, f.id, trilha)}
                        buraco={buraco}
                        apagada={casam !== null && !casam.has(f.id)}
                        marcada={selecao.has(chaveDaVaga(f.id, trilha))}
                        ehMobile={ehMobile}
                        aoAlternar={aoAlternar}
                        abrir={abrir}
                        fechar={fechar}
                      />
                    ))}
                    {Array.from({ length: VAGAS_POR_CAIXA - caixa.lugares.length }, (_, i) => (
                      <li key={`vazia-${i}`} aria-hidden className="aspect-square rounded-md border border-dashed border-hairline" />
                    ))}
                  </ol>
                </div>
              </Painel>
            ))}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <h2 ref={tituloSaidaRef} id={idSaida} tabIndex={-1} className="text-sm font-semibold text-strong">
              {t("novoCadastro.saida")}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 max-md:gap-2" role="group" aria-labelledby={idSaida}>
              {opcoes.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={saida === o.id}
                  onClick={() => setSaidaEscolhida(o.id)}
                  className={classesOpcao(saida === o.id)}
                >
                  {o.nome}
                </button>
              ))}
              {jogos.length === 0 && (
                <Link href="/dex/jogos" className={classesBotao("secundario", "sm", "ml-2")}>
                  {t("cadastrar.irParaJogos")}
                </Link>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-strong">
              {t("novoCadastro.lote")}
              <span className="ml-2 font-normal text-muted tabular-nums">{contagem}</span>
            </h2>
            {lote.length === 0 ? (
              <EstadoVazio>{t("novoCadastro.loteVazio")}</EstadoVazio>
            ) : (
              <Painel padding="sm">
                <ul className="divide-y divide-hairline">
                  {linhasLote.map(({ item, marcas }) => {
                    const nome = nomes.get(item.forma.id) ?? item.forma.especie;
                    return (
                      <li key={item.chave} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                        <span className="shrink-0">
                          <SpriteDex sprite={item.forma.sprite} shiny={item.shiny} tamanho={40} />
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-semibold text-strong">{nome}</span>
                            {item.shiny && <Distintivo tom="acento">★ {t("trilha.shiny")}</Distintivo>}
                          </div>
                          <span className="font-mono text-xs tabular-nums text-muted">
                            {item.destino
                              ? t("pokedex.posicaoNaCaixa", {
                                  caixa: String(item.destino.caixa),
                                  posicao: String(item.destino.posicao),
                                })
                              : t("recebidos.semLugar")}
                          </span>
                          {marcas.length > 0 && <div className="flex flex-wrap gap-1.5">{marcas}</div>}
                        </div>
                        <Botao
                          tamanho="sm"
                          className="shrink-0"
                          aria-label={t("novoCadastro.tirar", { nome })}
                          onClick={() => tirar(item.chave)}
                          disabled={enviando}
                        >
                          <Icone nome="x" />
                        </Botao>
                      </li>
                    );
                  })}
                </ul>
              </Painel>
            )}
          </section>
        </div>
      )}

      {cartao}
      {pendente && (
        // O Esc e "Cancelar" fecham sem enviar: só o clique em "Transferir" reenvia com a confirmação.
        <Modal
          rotuloId={idModal}
          onFechar={() => setPendente(null)}
          rodape={
            <div className="flex justify-end gap-2">
              <Botao onClick={() => setPendente(null)}>{t("transferencia.cancelar")}</Botao>
              <Botao variante="primario" disabled={enviando} onClick={() => enviar(pendente, true)}>
                {t("transferencia.confirmar")}
              </Botao>
            </div>
          }
        >
          <h3 id={idModal} className="text-base font-bold text-strong">
            {t("transferencia.titulo")}
          </h3>
          <p>{pendente.frase}</p>
        </Modal>
      )}
    </main>
  );
}
