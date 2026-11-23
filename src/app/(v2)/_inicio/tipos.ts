import type { CartaDoInicioV2 } from "@/lib/dominio/inicio-v2";

/** Abre o detalhe da cópia; `chave` identifica a carta tocada (bloco + cópia). */
export type AbrirCarta = (chave: string, carta: CartaDoInicioV2) => void;

/** O que cada bloco com cartas precisa saber de quem abre o detalhe. */
export interface CartasDoInicio {
  abrir: AbrirCarta;
  /** A chave da carta cujo detalhe está aberto: ela sai do lugar enquanto isso. */
  aberta: string | null;
  /** A chave do par ativo da transição, mesmo depois de fechar. */
  alvo: string | null;
}
