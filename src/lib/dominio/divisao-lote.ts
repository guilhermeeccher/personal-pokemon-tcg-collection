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
 * **A parte que se separa guarda a data de cadastro da original**
 * (`parteSeparadaDoLote`, decisão de 2026-11-22). Dividir um lote não é
 * cadastrar: a unidade que vai para a vaga entrou no inventário junto com as
 * outras, e o "Cadastradas nos últimos 7 dias" da página inicial conta por
 * `criado_em`. Antes desta regra a linha nova nascia com a hora da alocação, e
 * alocar uma carta antiga a fazia parecer recém-chegada. Vale daqui para a
 * frente: as divisões feitas antes guardam a data da divisão, e nenhuma é
 * corrigida por inferência (não há como saber, olhando a linha, de qual lote
 * ela saiu).
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

/**
 * Os campos que a parte separada herda da cópia original — todos, menos o
 * `id` (é outra linha), a `quantidade` (nasce com 1) e o `atualizado_em`
 * (a linha nova é escrita agora). O `criado_em` vem junto: ver o topo.
 */
export const CAMPOS_HERDADOS_NA_DIVISAO = [
  "cartaId",
  "idiomaCatalogo",
  "idioma",
  "variante",
  "condicao",
  "gradedEmpresa",
  "gradedNota",
  "gradedCertificado",
  "localizacao",
  "aquisicaoData",
  "aquisicaoOrigem",
  "aquisicaoPreco",
  "notas",
  "criadoEm",
] as const;

export type CampoHerdadoNaDivisao = (typeof CAMPOS_HERDADOS_NA_DIVISAO)[number];

/**
 * A linha da parte que se separa do lote, pronta para o INSERT. As duas vias
 * que dividem — a alocação numa vaga e a adição a uma customizada, em
 * `lib/db/consultas.ts` — montam a linha por aqui, para nenhuma das duas
 * esquecer um campo que a outra copia.
 */
export function parteSeparadaDoLote<C extends Record<CampoHerdadoNaDivisao, unknown>>(
  original: C,
): Pick<C, CampoHerdadoNaDivisao> & { quantidade: 1 } {
  return {
    cartaId: original.cartaId,
    idiomaCatalogo: original.idiomaCatalogo,
    idioma: original.idioma,
    variante: original.variante,
    condicao: original.condicao,
    gradedEmpresa: original.gradedEmpresa,
    gradedNota: original.gradedNota,
    gradedCertificado: original.gradedCertificado,
    localizacao: original.localizacao,
    aquisicaoData: original.aquisicaoData,
    aquisicaoOrigem: original.aquisicaoOrigem,
    aquisicaoPreco: original.aquisicaoPreco,
    notas: original.notas,
    criadoEm: original.criadoEm,
    quantidade: 1,
  };
}
