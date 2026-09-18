/**
 * Trata o caso degenerado de um set sem numeração oficial no upstream
 * (achado 2026-08-25: `mep` — MEP Black Star Promos — tem
 * `set_qtd_oficial = 0` e `set_qtd_total = 88`, com as 88 cartas
 * presentes no catálogo. Cortar as vagas em `qtdOficial`, como a regra 4
 * do AGENTS.md manda para todo set normal, produz coleção com ZERO
 * vagas — e a criação passava em silêncio, violando a regra 6 ("vaga
 * vazia é saída de primeira classe", que pressupõe universo > 0 pra
 * começo de conversa: uma coleção sem nenhuma vaga não tem o que expor).
 *
 * Esta é uma correção de DADO degenerado do upstream, não uma mudança
 * de regra: só entra em jogo quando `qtdOficial === 0` **e** existe ao
 * menos uma carta do set no catálogo local. Nesse caso — e só nesse —
 * o set é tratado como promocional sem numeração própria: o universo de
 * vagas vira `qtdTotal` (a flag "incluir secretas" deixa de fazer
 * sentido, porque não há separação oficial/secreta pra alternar; o
 * conjunto inteiro de cartas conhecidas É o universo). Todo set com
 * `qtdOficial > 0` (incluindo `sv03.5`, 165/207) passa direto pelo ramo
 * `else` — comportamento idêntico ao de antes desta mudança.
 *
 * Espelha o padrão de `catalogo-incompleto.ts`: aviso irmão, também
 * puro e sem I/O, também recalculado a cada leitura (nada persistido) —
 * quem chama decide onde expor.
 */

export interface AvisoSemNumeracaoOficial {
  /** Universo de vagas usado no lugar da numeração oficial ausente. */
  qtdTotal: number;
}

export interface EntradaUniversoVagasSet {
  /** `carta_catalogo.set_qtd_oficial` — 0 é o caso degenerado tratado aqui. */
  qtdOficial: number;
  /** `carta_catalogo.set_qtd_total`. */
  qtdTotal: number;
  incluirSecretas: boolean;
  /** Quantas cartas desse set (nesse idioma de catálogo) o catálogo local já conhece. */
  qtdCartasNoCatalogo: number;
}

export interface UniversoVagasSet {
  /** Quantidade de vagas a materializar/esperar para esta coleção de set. */
  vagasEsperadas: number;
  /** Presente só quando o set não tem numeração oficial no upstream. */
  avisoSemNumeracaoOficial: AvisoSemNumeracaoOficial | null;
}

/**
 * Resolve o universo de vagas de uma coleção de set, tratando o caso
 * sem numeração oficial. Não decide sozinho se deve recusar a criação
 * (`vagasEsperadas` pode vir 0 no caso pathológico de `qtdTotal` também
 * ser 0) — quem chama decide o que fazer com esse resultado.
 */
export function resolverUniversoVagasSet(
  entrada: EntradaUniversoVagasSet,
): UniversoVagasSet {
  const semNumeracaoOficial =
    entrada.qtdOficial === 0 && entrada.qtdCartasNoCatalogo > 0;

  if (semNumeracaoOficial) {
    return {
      vagasEsperadas: entrada.qtdTotal,
      avisoSemNumeracaoOficial: { qtdTotal: entrada.qtdTotal },
    };
  }

  return {
    vagasEsperadas: entrada.incluirSecretas ? entrada.qtdTotal : entrada.qtdOficial,
    avisoSemNumeracaoOficial: null,
  };
}
