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
 *   balão, a ordem do z-index; dentro do mesmo nível, a última aberta. Nunca
 *   pela ordem em que os efeitos do React rodam: ao girar o aparelho, duas
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

export type NivelCamada = "janela" | "detalhe" | "balao";

export const PESO_NIVEL: Record<NivelCamada, number> = { janela: 1, detalhe: 2, balao: 3 };
export const NIVEL_MODAL: Record<NivelCamada, boolean> = { janela: true, detalhe: true, balao: false };

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
