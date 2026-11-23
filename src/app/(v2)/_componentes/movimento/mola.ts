/**
 * Física da inclinação das cartas da v2: uma mola amortecida por eixo, em
 * passos discretos. Módulo puro — sem DOM, sem `requestAnimationFrame` —
 * para a convergência e o assentamento serem testados no Vitest. O laço de
 * quadros que chama isto mora em `laco-mola.ts`.
 *
 * ## Por que passos fixos de 1/60 s
 *
 * A fórmula de referência (a do protótipo de 2026-11-22) é por quadro:
 * `v = (v + (alvo − x) · k) · amortecimento; x += v`. Rodada uma vez por
 * quadro, ela anda na metade da velocidade quando o iPhone limita o
 * `requestAnimationFrame` a 30 fps (modo de baixo consumo) e o dobro numa
 * tela de 120 Hz. Por isso o passo é sempre o de 60 Hz: um quadro longo
 * roda vários passos, e um quadro curto pode não rodar nenhum — o tempo
 * que sobra ou falta fica guardado no estado (`restoMs`) e entra na conta
 * do quadro seguinte (`subpassosDoQuadro`). Assim o tempo até a carta
 * assentar é o mesmo a 30, 60, 120 ou 144 Hz; numa tela de 120 Hz a carta
 * muda de posição a cada dois quadros, que é a cadência da referência.
 * O teto de subpassos impede que um quadro muito atrasado (aba que voltou
 * do fundo) vire uma rajada de cálculo — nesse caso a mola só anda menos,
 * o que não se vê, e o resto é descartado.
 *
 * ## Por que a carta "assenta" e o laço para
 *
 * Uma mola amortecida chega perto do alvo para sempre, sem chegar. Abaixo
 * de um limiar de velocidade e de distância (`assentou`), a carta é posta
 * exatamente no alvo (`assentar`) e sai do laço. Isso garante duas coisas:
 * o laço de quadros não roda à toa com a carta parada, e o estado final é
 * idêntico ao de quem nunca viu movimento (movimento reduzido): a mesma
 * carta reta, sem resto de inclinação de 0,01°.
 */

export interface ParametrosMola {
  /** Fração da distância ao alvo somada à velocidade a cada passo (0–1). */
  rigidez: number;
  /** Fração da velocidade que sobrevive a cada passo (0–1, exclusivo). */
  amortecimento: number;
}

/**
 * Os valores do protótipo, conferidos no olho em 2026-11-22: a carta segue
 * o ponteiro com um pequeno passo além do alvo e volta sem tremer. Com
 * rigidez 0,075 e amortecimento 0,78 o sistema é subamortecido mas estável
 * (o teste fixa que a ultrapassagem fica abaixo de 20% do caminho e que assenta em
 * menos de 1,5 s).
 */
export const MOLA_CARTA: ParametrosMola = { rigidez: 0.075, amortecimento: 0.78 };

/** Duração de um passo da fórmula de referência (60 Hz). */
export const PASSO_REFERENCIA_MS = 1000 / 60;

/** Um quadro de até ~66 ms (15 fps) ainda anda o tempo inteiro. */
const MAX_SUBPASSOS = 4;

/* Limiares do assentamento, os do protótipo: somados nos três eixos. Abaixo
   deles a diferença não chega a um décimo de grau nem a um ponto de brilho. */
const LIMIAR_VELOCIDADE = 0.0004;
const LIMIAR_DISTANCIA = 0.002;

export interface Eixo {
  posicao: number;
  velocidade: number;
}

/** Um passo de 1/60 s num eixo. */
export function passoEixo(eixo: Eixo, alvo: number, parametros: ParametrosMola = MOLA_CARTA): Eixo {
  const velocidade = (eixo.velocidade + (alvo - eixo.posicao) * parametros.rigidez) * parametros.amortecimento;
  return { posicao: eixo.posicao + velocidade, velocidade };
}

/**
 * O estado da carta: onde o "ponteiro virtual" está (x, y em 0–1 sobre a
 * carta, 0,5 é o centro) e quanto o brilho acende (`intensidade`, 0–1).
 * Os três andam pela mesma mola, então a luz e a inclinação chegam juntas.
 */
export interface EstadoInclinacao {
  x: Eixo;
  y: Eixo;
  intensidade: Eixo;
  /** Tempo já vivido que ainda não virou passo (pode ser negativo, até meio passo). */
  restoMs: number;
}

export interface AlvoInclinacao {
  x: number;
  y: number;
  intensidade: number;
}

/** A carta reta, apagada: o estado de repouso e o de movimento reduzido. */
export const REPOUSO: AlvoInclinacao = Object.freeze({ x: 0.5, y: 0.5, intensidade: 0 });

/** Estado parado exatamente sobre um alvo (por padrão, o repouso). */
export function assentar(alvo: AlvoInclinacao = REPOUSO): EstadoInclinacao {
  return {
    x: { posicao: alvo.x, velocidade: 0 },
    y: { posicao: alvo.y, velocidade: 0 },
    intensidade: { posicao: alvo.intensidade, velocidade: 0 },
    restoMs: 0,
  };
}

/**
 * Quantos passos de 1/60 s cabem num quadro de `dtMs`, somado o resto do
 * quadro anterior, e o novo resto. Arredonda em vez de truncar: a 60 Hz o
 * `dt` real oscila em volta de 16,67 ms (16,6, 16,7…), e truncar daria
 * quadros de zero e de dois passos alternados. O resto com sinal devolve a
 * diferença no quadro seguinte. Quadro inválido ou nulo não anda; o
 * primeiro quadro de um laço, que não tem anterior, deve passar
 * `PASSO_REFERENCIA_MS`.
 */
export function subpassosDoQuadro(dtMs: number, restoMs = 0): { passos: number; restoMs: number } {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return { passos: 0, restoMs };
  const total = restoMs + dtMs;
  const passos = Math.max(0, Math.round(total / PASSO_REFERENCIA_MS));
  if (passos > MAX_SUBPASSOS) return { passos: MAX_SUBPASSOS, restoMs: 0 };
  return { passos, restoMs: total - passos * PASSO_REFERENCIA_MS };
}

/** Avança a mola pelo tempo de um quadro. */
export function avancarMola(
  estado: EstadoInclinacao,
  alvo: AlvoInclinacao,
  dtMs: number,
  parametros: ParametrosMola = MOLA_CARTA,
): EstadoInclinacao {
  let { x, y, intensidade } = estado;
  const { passos, restoMs } = subpassosDoQuadro(dtMs, estado.restoMs);
  for (let i = passos; i > 0; i--) {
    x = passoEixo(x, alvo.x, parametros);
    y = passoEixo(y, alvo.y, parametros);
    intensidade = passoEixo(intensidade, alvo.intensidade, parametros);
  }
  return { x, y, intensidade, restoMs };
}

/** A carta chegou ao alvo e pode sair do laço de quadros. */
export function assentou(estado: EstadoInclinacao, alvo: AlvoInclinacao): boolean {
  const velocidade =
    Math.abs(estado.x.velocidade) + Math.abs(estado.y.velocidade) + Math.abs(estado.intensidade.velocidade);
  const distancia =
    Math.abs(alvo.x - estado.x.posicao) +
    Math.abs(alvo.y - estado.y.posicao) +
    Math.abs(alvo.intensidade - estado.intensidade.posicao);
  return velocidade < LIMIAR_VELOCIDADE && distancia < LIMIAR_DISTANCIA;
}

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * O alvo que o ponteiro pede: a posição dele sobre a carta, de 0 a 1 em
 * cada eixo (fora da carta é a borda), com o brilho aceso. Recebe números,
 * não o evento, para ficar puro.
 */
export function alvoDoPonteiro(
  clienteX: number,
  clienteY: number,
  caixa: { left: number; top: number; width: number; height: number },
): AlvoInclinacao {
  const x = caixa.width > 0 ? (clienteX - caixa.left) / caixa.width : 0.5;
  const y = caixa.height > 0 ? (clienteY - caixa.top) / caixa.height : 0.5;
  return { x: limitar(x, 0, 1), y: limitar(y, 0, 1), intensidade: 1 };
}

/**
 * O passeio da carta em modo vitrine, sem ninguém tocando: uma curva de
 * Lissajous lenta (períodos de ~10,7 s e ~14,5 s, que não se repetem
 * juntos), com o brilho a meia-luz. `fase` desencontra cartas vizinhas.
 * É animação contínua: só roda quando o movimento e o modo deixam
 * (`DecisaoMovimento.animacaoContinua`) e a carta está na tela.
 */
export function alvoAutomatico(tempoMs: number, fase: number): AlvoInclinacao {
  return {
    x: 0.5 + 0.32 * Math.cos(tempoMs / 1700 + fase),
    y: 0.5 + 0.26 * Math.sin(tempoMs / 2300 + fase),
    intensidade: 0.7,
  };
}

/** O que o laço escreve na carta a cada quadro. */
export interface EstiloInclinacao {
  transform: string;
  /** Posição do ponteiro virtual, 0–1, sem unidade (o CSS converte). */
  px: string;
  py: string;
  /** Intensidade do brilho, 0–1. */
  intensidade: string;
}

/**
 * Converte o estado em estilo. Só `transform` roda no compositor; das
 * propriedades de brilho sobram duas de posição e uma de intensidade — o
 * protótipo escrevia sete por quadro, e cada uma que um gradiente lê
 * repinta. As posições de fundo derivadas (o deslocamento do arco-íris)
 * saem dessas duas no próprio CSS.
 *
 * `inclinacaoMaxGraus` é o ângulo na borda da carta; o centro é 0°.
 */
export function estiloDaInclinacao(estado: EstadoInclinacao, inclinacaoMaxGraus: number): EstiloInclinacao {
  const x = estado.x.posicao;
  const y = estado.y.posicao;
  const rotX = (0.5 - y) * inclinacaoMaxGraus * 2;
  const rotY = (x - 0.5) * inclinacaoMaxGraus * 2;
  return {
    transform: `perspective(900px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`,
    px: limitar(x, 0, 1).toFixed(3),
    py: limitar(y, 0, 1).toFixed(3),
    intensidade: limitar(estado.intensidade.posicao, 0, 1).toFixed(3),
  };
}
