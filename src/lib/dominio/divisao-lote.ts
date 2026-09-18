/**
 * Divisão de lote na alocação de cópia a vaga (spec §3.2, §5 Fase 2;
 * AGENTS.md regra 1). Alocar uma cópia com `quantidade > 1` divide o
 * lote: a cópia ORIGINAL mantém o `id` e fica com o restante — decisão
 * fechada, preserva o registro mais antigo — e nasce uma cópia NOVA com
 * `quantidade = 1`, que é a alocada à vaga. Todos os demais campos
 * (variante, idioma, condição, graded, localização, aquisição, notas)
 * são copiados para a nova — decisão de quem copia o quê fica em
 * `lib/db/consultas.ts`, que monta a linha de fato.
 *
 * Cópia com `quantidade = 1` é alocada direto, sem criar linha nova.
 *
 * Módulo puro, sem I/O — só decide o plano; quem chama executa o
 * INSERT/UPDATE dentro da mesma transação que preenche a vaga (ou tudo
 * acontece, ou nada).
 */

export interface PlanoAlocacaoLote {
  /** true = cria cópia nova com quantidade 1; a original fica com o restante. */
  dividir: boolean;
  /** Quantidade que sobra na cópia original quando `dividir` é true. */
  quantidadeRestanteNaOriginal: number;
}

/**
 * `quantidadeAtual` vem da cópia lida no banco — sempre inteiro >= 1
 * (regra de cadastro, spec §3.2). Um valor fora disso é estado inválido
 * que nunca deveria chegar aqui; lançar erro é a defesa correta — um
 * retorno silencioso poderia ser ignorado pela camada de consultas e
 * gravar uma quantidade negativa ou zerada.
 */
export function planejarAlocacaoDeLote(quantidadeAtual: number): PlanoAlocacaoLote {
  if (!Number.isInteger(quantidadeAtual) || quantidadeAtual < 1) {
    throw new Error(
      `quantidadeAtual inválida: ${quantidadeAtual} (esperado inteiro >= 1)`,
    );
  }
  if (quantidadeAtual === 1) {
    return { dividir: false, quantidadeRestanteNaOriginal: 0 };
  }
  return { dividir: true, quantidadeRestanteNaOriginal: quantidadeAtual - 1 };
}
