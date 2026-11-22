/**
 * As regras da pilha de camadas da v2, puras: quem está no topo, quem prende
 * o foco, se a página precisa de trava de rolagem e para onde o foco volta
 * quando uma camada fecha. O estado vivo (a pilha da página, o ouvinte de
 * Esc, os estilos do `body`) mora em `use-camada.ts`.
 *
 * É o mecanismo do `use-camada.ts` da v1, portado — a v2 não importa nada de
 * `src/app/_componentes/` —, com as mesmas regras:
 *
 * - **Topo pelo nível, depois pela ordem de abertura.** Janela < detalhe <
 *   confirmação < balão. O z-index sai da mesma tabela (`Z_NIVEL`), para a
 *   camada que se vê por cima ser sempre a que recebe o Esc e o Tab; a
 *   confirmação tem nível próprio porque pode sair tanto de uma janela quanto
 *   do detalhe de carta, e tem de ficar acima dos dois. Dentro do mesmo
 *   nível, a última aberta. Nunca pela ordem em que os efeitos do React rodam: ao girar o aparelho, duas
 *   camadas podem se registrar de novo em qualquer ordem, e a de trás não pode
 *   passar a receber o Esc.
 * - **Esc fecha só a camada do topo**, seja ela modal ou não.
 * - **O foco preso é da camada MODAL mais alta.** Um balão não modal aberto
 *   dentro de uma janela recebe o Esc, mas quem continua prendendo o Tab é a
 *   janela.
 * - **Trava por contagem.** A página só volta a rolar quando a última camada
 *   que pediu trava fecha.
 *
 * E com duas diferenças, que são da v2 (`docs/design-v2/rules.md`, seção 1):
 *
 * 1. **Trava em qualquer largura.** Na v1 o desktop rola num painel interno,
 *    e a trava só existe abaixo de 768 px; na v2 quem rola é a janela em toda
 *    largura, e sem trava a página rolaria por baixo da janela no desktop.
 * 2. **O foco volta a um alvo que pode ter saído do DOM.** Numa grade
 *    virtual, a célula que abriu o detalhe pode ter sido desmontada enquanto
 *    ele estava aberto (a pessoa rolou, as colunas mudaram). Devolver o foco
 *    a um nó desconectado o joga no `body`, e o leitor de tela recomeça a
 *    página. Por isso a camada aceita, além do elemento que a abriu, um
 *    resolvedor chamado na hora de fechar, que acha (ou remonta) o alvo
 *    certo; e, se nada estiver no DOM, o foco vai para o conteúdo principal.
 */

export type NivelCamada = "janela" | "detalhe" | "confirmacao" | "balao";

export const PESO_NIVEL: Record<NivelCamada, number> = { janela: 1, detalhe: 2, confirmacao: 3, balao: 4 };
export const NIVEL_MODAL: Record<NivelCamada, boolean> = {
  janela: true,
  detalhe: true,
  confirmacao: true,
  balao: false,
};
/**
 * A base do z-index de cada nível, na mesma ordem do peso, com folga para a
 * ordem de abertura entrar como desempate (`zDaCamada`). Acima da casca
 * (trilho 30, abas 40); o aviso flutuante fica acima de todas
 * (`Z_AVISO_FLUTUANTE`), porque tem de aparecer sobre a janela que o
 * disparou.
 */
export const Z_NIVEL: Record<NivelCamada, number> = {
  janela: 100_000,
  detalhe: 200_000,
  confirmacao: 300_000,
  balao: 400_000,
};
export const Z_AVISO_FLUTUANTE = 500_000;

/**
 * O z-index de uma camada: o do nível mais a ordem de abertura. O desempate
 * não pode ficar com a ordem dos portais no `body`: duas janelas montadas no
 * mesmo commit (uma dentro da outra) entram com a de dentro ANTES da de fora,
 * e a de fora apareceria por cima de quem recebe o Esc. A ordem é o contador
 * de aberturas da página; passar de 100.000 aberturas sem recarregar não é um
 * caso real.
 */
export function zDaCamada(nivel: NivelCamada, ordem: number): number {
  return Z_NIVEL[nivel] + Math.min(Math.max(ordem, 0), 99_999);
}

export interface CamadaRegistrada {
  id: string;
  nivel: NivelCamada;
  /** Ordem de abertura: maior abriu depois. */
  ordem: number;
  travaRolagem: boolean;
}

/** A camada do topo (ou a mais alta entre as que passam no filtro). */
export function camadaDoTopo<C extends CamadaRegistrada>(
  pilha: readonly C[],
  filtro: (c: C) => boolean = () => true,
): C | undefined {
  let melhor: C | undefined;
  for (const c of pilha) {
    if (!filtro(c)) continue;
    if (
      !melhor ||
      PESO_NIVEL[c.nivel] > PESO_NIVEL[melhor.nivel] ||
      (PESO_NIVEL[c.nivel] === PESO_NIVEL[melhor.nivel] && c.ordem > melhor.ordem)
    ) {
      melhor = c;
    }
  }
  return melhor;
}

/** A camada modal mais alta: a que prende o foco. */
export function modalDoTopo<C extends CamadaRegistrada>(pilha: readonly C[]): C | undefined {
  return camadaDoTopo(pilha, (c) => NIVEL_MODAL[c.nivel]);
}

/** A página precisa de trava enquanto qualquer camada aberta a pedir. */
export function precisaTrava(pilha: readonly CamadaRegistrada[]): boolean {
  return pilha.some((c) => c.travaRolagem);
}

/** O mínimo que o retorno de foco precisa saber de um nó. */
export interface AlvoFoco {
  readonly isConnected: boolean;
}

/**
 * O primeiro candidato ainda no DOM, na ordem dada, ou `null`. Quem chama
 * passa, em ordem: o que o resolvedor devolveu, o elemento que abriu a
 * camada, e o conteúdo principal como último recurso.
 */
export function escolherAlvoDeFoco<T extends AlvoFoco>(candidatos: readonly (T | null | undefined)[]): T | null {
  for (const c of candidatos) {
    if (c && c.isConnected) return c;
  }
  return null;
}
