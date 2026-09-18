/**
 * Casamento entre uma linha da busca da LigaPokemon e a **vaga vazia de uma
 * coleção de set**. Módulo puro: não faz requisição, não toca banco.
 *
 * ## Por que a estratégia do set é outra
 *
 * Na Pokédex a vaga é uma *espécie*, e qualquer carta daquele Pokémon serve —
 * por isso uma busca por espécie devolve dezenas de opções legítimas
 * (`liga-busca.ts`). No set, a vaga é **uma carta específica**: a 010 do Fogo
 * Fantasmagórico só é preenchida pela 010 do Fogo Fantasmagórico. A busca
 * continua sendo por nome (é o único modo servidor-renderizado do site deles),
 * mas o que interessa da resposta é uma linha só — a da edição e do número
 * certos. Todo o resto é ruído da mesma carta em outras edições.
 *
 * ## O que foi medido em 2026-09-03, antes de escrever isto
 *
 * A saída barata seria listar a edição inteira de uma vez: 94 vagas em ~4
 * requisições em vez de ~94. **Não existe.** Qualquer filtro de edição no
 * termo (`edid=738`, `ed=PFL`, os dois juntos — exatamente como o próprio site
 * escreve o link) faz a página trocar para renderização por JavaScript: o HTML
 * volta com esqueletos e zero linha de carta. Só a busca por nome responde
 * HTML de verdade. Então é carta a carta, e a economia possível é parar de
 * paginar assim que a carta aparece (`deveBuscarProximaPaginaSet`).
 *
 * ## Duas chaves para a edição, pelo mesmo motivo de sempre
 *
 * A sigla resolve o ocidental (`PFL`, `PBL`); o japonês não tem sigla e usa o
 * próprio `set_id` como identificador impresso. Some-se a isso a `liga_edicao`,
 * que guarda o vínculo confirmado `edid` → nosso `set_id` e tem precedência
 * sobre o palpite pela sigla. Nada aqui inventa vínculo: edição que não casar
 * por nenhuma das três vias simplesmente não vira opção, e a vaga aparece
 * vazia na tela (regra 6).
 */

import type { LinhaBuscaLiga } from "./liga-busca";
import { LINHAS_POR_PAGINA } from "./liga-busca";

/** A vaga de um set, do jeito que o casamento precisa vê-la. */
export interface AlvoVagaSet {
  /** `local_id` da carta no nosso catálogo — a chave da vaga. */
  numero: string;
  /** O nosso `carta_catalogo.set_id`. */
  setId: string;
  /** Sigla oficial do set no nosso catálogo. Nula quando o upstream não tem. */
  setSigla: string | null;
}

/**
 * Numeração comparável entre os dois lados.
 *
 * A Liga escreve `77` onde o nosso catálogo escreve `077`, e o inverso também
 * acontece; sufixo de variante (`073p`, `203m`, `TG01`) é parte do número e
 * não pode ser descartado — só a caixa dele é normalizada.
 */
export function normalizarNumeroCarta(numero: string): string {
  return numero.trim().replace(/^0+(?=\d)/, "").toUpperCase();
}

/**
 * A edição desta linha é o nosso set?
 *
 * Ordem de decisão: vínculo confirmado (`liga_edicao.set_id`) → sigla oficial
 * → `set_id` como sigla (japonês). O vínculo vem primeiro justamente porque
 * ele existe para os casos em que a sigla deles não é a nossa.
 */
export function edicaoCasaComSet(
  linha: Pick<LinhaBuscaLiga, "edicaoSigla" | "edicaoId">,
  alvo: AlvoVagaSet,
  setPorEdid: ReadonlyMap<number, string> = new Map(),
): boolean {
  if (linha.edicaoId !== null) {
    const vinculado = setPorEdid.get(linha.edicaoId);
    // Vínculo confirmado é palavra final nos dois sentidos: se ele aponta para
    // outro set, a sigla não pode "salvar" a linha por coincidência.
    if (vinculado !== undefined) {
      return vinculado.toUpperCase() === alvo.setId.toUpperCase();
    }
  }

  const sigla = linha.edicaoSigla.trim().toUpperCase();
  if (sigla === "") return false;
  if (alvo.setSigla && sigla === alvo.setSigla.trim().toUpperCase()) return true;
  return sigla === alvo.setId.trim().toUpperCase();
}

/** A linha é exatamente a carta desta vaga: mesma edição e mesmo número. */
export function linhaCasaComVagaSet(
  linha: Pick<LinhaBuscaLiga, "edicaoSigla" | "edicaoId" | "numero">,
  alvo: AlvoVagaSet,
  setPorEdid: ReadonlyMap<number, string> = new Map(),
): boolean {
  if (normalizarNumeroCarta(linha.numero) !== normalizarNumeroCarta(alvo.numero)) {
    return false;
  }
  return edicaoCasaComSet(linha, alvo, setPorEdid);
}

/**
 * Continuar paginando a busca desta carta?
 *
 * Diferente da Pokédex, aqui não existe "já achei barato o bastante": o alvo é
 * uma carta só, e a ordenação por preço crescente pode deixá-la na última
 * página. Então a regra é: **achou, para**; não achou e a página veio cheia,
 * continua. Sem isso, uma carta cara do set ficaria invisível atrás de dezenas
 * de reimpressões baratas do mesmo nome.
 */
export function deveBuscarProximaPaginaSet(pagina: {
  blocos: number;
  achou: boolean;
}): boolean {
  if (pagina.achou) return false;
  return pagina.blocos >= LINHAS_POR_PAGINA;
}
