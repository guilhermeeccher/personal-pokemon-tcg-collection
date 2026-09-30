/**
 * O retorno "Cards sem estoque" da Compra por Lista deles, e o que o sistema
 * faz com ele — decisão de 2026-09-24.
 *
 * Módulo puro, sem I/O.
 *
 * ## O problema
 *
 * O preço que a varredura grava é o **menor da carta em qualquer condição**
 * (camada 1). A colagem é feita com Qualidade NM, e aí a Liga devolve as
 * cartas que não têm oferta nessa condição:
 *
 * ```
 * Cards sem estoque:
 * Remover aviso
 * 1 Blastoise (14/100) - [Qualidade = NM]
 * ```
 *
 * A varredura seguinte acha a mesma carta de novo, com preço — porque existe
 * oferta em outra condição —, e a tela a ofereceria outra vez. O usuário cola
 * esse retorno, o sistema guarda, e a opção deixa de aparecer.
 *
 * ## A chave é a carta como a Liga a vê: nome + número/total
 *
 * **Sem edição, de propósito.** A Liga recebeu `1 Blastoise (031/173)` — a
 * nossa linha da Compra por Lista, que não diz a edição (ver
 * `exportacao-lista-compra.ts`) — e devolve o mesmo texto. Ela também não sabe
 * de qual edição falava. Se duas edições tiverem carta de mesmo nome, número
 * e total, as duas saem juntas, que é coerente com o que a busca deles
 * consegue distinguir.
 *
 * Número e total sem zero à esquerda (`031` e `31` são a mesma carta, como em
 * `identidade-carta.ts`), nome sem diferença de caixa nem de espaço.
 *
 * ## Validade: 30 dias
 *
 * Loja repõe estoque. Um registro eterno esconderia para sempre a carta que
 * voltou; depois de 30 dias ela volta a ser oferecida sozinha. Colar de novo
 * renova o prazo.
 *
 * ## Qualidade: guardada, não usada
 *
 * Toda colagem de hoje é NM. A qualidade fica gravada para que, se um dia a
 * busca for feita em outra condição, o registro de NM não precise esconder a
 * carta — mas nenhuma decisão depende dela por enquanto.
 */

import { normalizarNumero } from "./identidade-carta";

export const VALIDADE_SEM_ESTOQUE_DIAS = 30;

export interface CartaSemEstoque {
  nome: string;
  numero: string;
  total: string | null;
  /** `NM`, como a Liga escreve. Vazio quando a linha não trouxe. */
  qualidade: string;
}

export interface LeituraSemEstoque {
  cartas: CartaSemEstoque[];
  /** Linhas que não são cabeçalho nem carta. Nunca somem em silêncio. */
  naoEntendidas: string[];
}

/** O que o texto deles traz em volta das cartas, e que não é carta. */
const LINHAS_DE_MOLDURA = ["cards sem estoque:", "cards sem estoque", "remover aviso"];

/**
 * `1 Blastoise (031/173) - [Qualidade = NM]`.
 *
 * O nome é guloso até o **último** parêntese, para que um nome com parêntese
 * (`Pikachu (Delta) (12/100)`) não seja cortado no primeiro. O sufixo de
 * qualidade é opcional: uma linha sem ele continua sendo carta.
 */
const PADRAO_LINHA =
  /^\d+\s+(.+)\s+\(([^()/]+)(?:\/([^()]+))?\)\s*(?:-\s*\[([^\]]*)\])?\s*$/;

function qualidadeDoColchete(bruto: string | undefined): string {
  if (!bruto) return "";
  const [, valor] = bruto.split("=");
  return (valor ?? bruto).trim().toUpperCase();
}

/** Lê o texto colado. Linha repetida (mesma carta e qualidade) vira uma só. */
export function lerRetornoSemEstoque(texto: string): LeituraSemEstoque {
  const cartas: CartaSemEstoque[] = [];
  const naoEntendidas: string[] = [];
  const vistas = new Set<string>();

  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (linha === "" || LINHAS_DE_MOLDURA.includes(linha.toLowerCase())) continue;

    const casou = PADRAO_LINHA.exec(linha);
    if (!casou) {
      naoEntendidas.push(linha);
      continue;
    }

    const carta: CartaSemEstoque = {
      nome: casou[1].trim(),
      numero: casou[2].trim(),
      total: casou[3]?.trim() || null,
      qualidade: qualidadeDoColchete(casou[4]),
    };
    const id = `${chaveSemEstoque(carta)}|${carta.qualidade}`;
    if (vistas.has(id)) continue;
    vistas.add(id);
    cartas.push(carta);
  }

  return { cartas, naoEntendidas };
}

/** A carta como a Liga a vê — ver o cabeçalho. É o que vai gravado e comparado. */
export function chaveSemEstoque(carta: {
  nome: string;
  numero: string;
  total: string | null;
}): string {
  const nome = carta.nome.trim().replace(/\s+/g, " ").toLowerCase();
  const numeracao =
    carta.total === null || carta.total.trim() === ""
      ? normalizarNumero(carta.numero)
      : `${normalizarNumero(carta.numero)}/${normalizarNumero(carta.total)}`;
  return `${nome}|${numeracao}`;
}

/** O instante a partir do qual um registro já venceu. */
export function corteSemEstoque(
  agora: Date,
  validadeDias: number = VALIDADE_SEM_ESTOQUE_DIAS,
): Date {
  return new Date(agora.getTime() - validadeDias * 24 * 60 * 60 * 1000);
}
