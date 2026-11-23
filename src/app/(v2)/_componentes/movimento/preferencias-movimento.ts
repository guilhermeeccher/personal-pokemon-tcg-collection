/**
 * Quanto movimento e quanto efeito a v2 mostra: a decisão pura, sem
 * `window`. A leitura dos sinais (media query, `localStorage`, medição de
 * quadros) e a reação a mudanças moram em `use-movimento.ts`.
 *
 * ## Duas chaves independentes
 *
 * 1. **Movimento reduzido** (`prefers-reduced-motion: reduce`), escolha do
 *    sistema. Desliga a mola, a inclinação, o brilho que segue o ponteiro,
 *    as View Transitions e toda animação contínua. Vale **sempre**, seja qual
 *    for o modo: nem o interruptor manual em "completo" o liga de volta —
 *    quem pediu menos movimento ao sistema não deve ter de pedir de novo ao
 *    app.
 * 2. **Modo leve**, escolha de desempenho (decisão de 2026-11-22: automático
 *    por heurística, com um interruptor que sempre vence). Desliga a mola, a
 *    inclinação e a animação contínua — os efeitos ficam estáticos —, mas
 *    **mantém as View Transitions**: são curtas, uma por vez, rodam no
 *    compositor e são o que dá continuidade à carta que sai da grade para o
 *    detalhe. O custo que o modo leve corta é o de todo quadro (laço de
 *    mola, camadas misturadas repintando), não o de uma troca de tela.
 *
 * Em todos os casos o estado final da tela é o mesmo: o que se desliga é o
 * caminho, nunca o destino.
 *
 * ## O sinal do modo leve
 *
 * O alvo é o iPhone, e o iOS não expõe bateria nem "Economia de energia":
 * a Battery Status API não existe no Safari, e no Chrome só existe em
 * contexto seguro — a instalação padrão abre por HTTP na rede local, onde
 * ela também some. `navigator.deviceMemory` e `prefers-reduced-data` têm o
 * mesmo problema (só Chromium, ou só atrás de flag). O único sinal que
 * existe nos dois motores e por HTTP é **o ritmo de quadros**: a mediana do
 * intervalo entre `requestAnimationFrame` medida por ~1 s (mais, se o
 * aparelho for lento demais para juntar a amostra nisso). O iOS limita o
 * rAF a 30 fps no modo de baixo consumo (intervalo ~33 ms), e um aparelho
 * que não aguenta 60 fps com a página parada também passa do limiar.
 * Limiar de 24 ms: entre os 16,7 ms de 60 Hz e os 33,3 ms de 30 Hz, com
 * folga para o ruído das duas pontas.
 *
 * **Sem sinal, modo completo.** Amostra curta demais (aba no fundo, medição
 * interrompida) não é prova de aparelho lento.
 */

export const ESCOLHAS_MODO = ["auto", "completo", "leve"] as const;
/** O interruptor manual: `auto` deixa a heurística decidir. */
export type EscolhaModo = (typeof ESCOLHAS_MODO)[number];

export type ModoEfeitos = "completo" | "leve";

/** Chave do interruptor manual no `localStorage` do navegador. */
export const CHAVE_ESCOLHA_MODO = "v2:modo-efeitos";

/** Mediana acima disto ⇒ modo leve (ver o cabeçalho). */
export const LIMIAR_QUADRO_LENTO_MS = 24;
/** Menos amostras válidas do que isto ⇒ sem sinal. ~0,5 s a 60 Hz. */
export const MIN_AMOSTRAS_QUADRO = 30;
/**
 * Intervalo acima disto não é quadro, é pausa (aba no fundo, alerta do
 * sistema, depurador): fica fora da mediana em vez de puxá-la.
 */
export const MAX_INTERVALO_VALIDO_MS = 250;

/** A medição dura pelo menos isto (o "~1 s" do cabeçalho)... */
export const DURACAO_MIN_MEDICAO_MS = 1000;
/**
 * ...e se estende até juntar `MIN_AMOSTRAS_QUADRO` quadros válidos, até
 * este teto. Parar em 1 s cego deixava sem sinal justamente o aparelho mais
 * lento: a 25 fps um segundo tem ~24 intervalos, abaixo do mínimo, e ele
 * ficava no modo completo. Com o teto de 3 s, até ~10 fps ainda há amostra;
 * abaixo disso a aba provavelmente nem estava em primeiro plano.
 */
export const DURACAO_MAX_MEDICAO_MS = 3000;

const ehIntervaloValido = (v: number) => Number.isFinite(v) && v > 0 && v <= MAX_INTERVALO_VALIDO_MS;

/** Valor guardado → escolha. Qualquer coisa desconhecida é `auto`. */
export function lerEscolhaModo(bruto: string | null | undefined): EscolhaModo {
  return (ESCOLHAS_MODO as readonly string[]).includes(bruto ?? "") ? (bruto as EscolhaModo) : "auto";
}

/** Mediana dos intervalos válidos, ou `null` se não houver nenhum. */
export function medianaIntervalos(intervalos: readonly number[]): number | null {
  const validos = intervalos.filter(ehIntervaloValido).sort((a, b) => a - b);
  if (validos.length === 0) return null;
  const meio = Math.floor(validos.length / 2);
  return validos.length % 2 ? validos[meio] : (validos[meio - 1] + validos[meio]) / 2;
}

/**
 * O que a medição de quadros diz: `leve`, `completo`, ou `null` quando não
 * diz nada (poucas amostras válidas). Recebe os intervalos já medidos.
 */
export function modoPelosQuadros(intervalos: readonly number[]): ModoEfeitos | null {
  const validos = intervalos.filter(ehIntervaloValido);
  if (validos.length < MIN_AMOSTRAS_QUADRO) return null;
  const mediana = medianaIntervalos(validos);
  if (mediana === null) return null;
  return mediana > LIMIAR_QUADRO_LENTO_MS ? "leve" : "completo";
}

/**
 * A medição pode parar? Depois do mínimo de tempo, quando já há amostra
 * suficiente; e sempre no teto, com ou sem amostra (aí `modoPelosQuadros`
 * diz "sem sinal").
 */
export function medicaoTerminou(decorridoMs: number, intervalos: readonly number[]): boolean {
  if (decorridoMs >= DURACAO_MAX_MEDICAO_MS) return true;
  if (decorridoMs < DURACAO_MIN_MEDICAO_MS) return false;
  return intervalos.filter(ehIntervaloValido).length >= MIN_AMOSTRAS_QUADRO;
}

export interface SinaisMovimento {
  /** `prefers-reduced-motion: reduce` agora. */
  reduzido: boolean;
  /** O interruptor manual (do `localStorage`). */
  escolha: EscolhaModo;
  /** O último resultado da medição de quadros, ou `null` sem sinal. */
  heuristica: ModoEfeitos | null;
}

export interface DecisaoMovimento {
  modo: ModoEfeitos;
  /** De onde veio o modo, para a tela de Ajustes explicar o estado. */
  origemModo: "manual" | "heuristica" | "padrao";
  reduzido: boolean;
  /** Mola, inclinação e brilho que segue o ponteiro. */
  mola: boolean;
  /** Animação sem fim (o passeio da carta em vitrine, o leque). */
  animacaoContinua: boolean;
  /** View Transitions (`<TransicaoVista>`). */
  transicoes: boolean;
}

/**
 * A decisão. Precedência do modo: interruptor manual > heurística >
 * completo. O movimento reduzido não entra nessa disputa: ele corta o
 * movimento por cima de qualquer modo.
 */
export function decidirMovimento({ reduzido, escolha, heuristica }: SinaisMovimento): DecisaoMovimento {
  const [modo, origemModo]: [ModoEfeitos, DecisaoMovimento["origemModo"]] =
    escolha !== "auto" ? [escolha, "manual"] : heuristica ? [heuristica, "heuristica"] : ["completo", "padrao"];
  const completo = modo === "completo";
  return {
    modo,
    origemModo,
    reduzido,
    mola: completo && !reduzido,
    animacaoContinua: completo && !reduzido,
    transicoes: !reduzido,
  };
}

/** A decisão do servidor e do primeiro quadro, antes de ler o navegador. */
export const DECISAO_PADRAO: DecisaoMovimento = Object.freeze(
  decidirMovimento({ reduzido: false, escolha: "auto", heuristica: null }),
);
