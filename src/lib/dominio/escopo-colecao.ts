/**
 * Edição de escopo de uma coleção `pokedex` (item 1 do incremento sobre a
 * Fase 2): adicionar região (gera vaga nova) e remover região (apaga
 * vaga vazia daquela faixa; recusa se alguma estiver preenchida).
 *
 * Mesmo espírito de `alternarSecretasDaColecao` (consultas.ts) — a única
 * outra exceção estrutural: aqui, em vez de ligar/desligar uma flag
 * booleana, o "novo estado" é um `ParametroPokedex` inteiro (nacional ou
 * uma lista de regiões), e o diff contra o estado atual decide o que
 * entra e o que sai. Nacional é só o caso onde o novo universo é
 * 1..1025 — não precisa de tratamento especial além disso.
 *
 * Módulo puro, sem I/O — quem chama (lib/db/consultas.ts) resolve o
 * "quais vagas estão preenchidas" contra o banco e usa este módulo só
 * para o cálculo determinístico do que muda.
 */

import {
  REGIOES,
  type Regiao,
  regiaoDoNumero,
  resolverEscopoNacional,
  resolverEscopoRegioes,
} from "./escopo-pokedex";
import type { ParametroPokedex } from "./parametro-colecao";

function resolverNumeros(parametro: ParametroPokedex): number[] {
  return parametro.escopo === "nacional"
    ? resolverEscopoNacional()
    : resolverEscopoRegioes(parametro.regioes);
}

export interface DiffEscopoPokedex {
  /** Chaves de vaga (número como texto) a materializar — nunca toca vaga existente. */
  chavesParaAdicionar: string[];
  /** Chaves de vaga a apagar — só permitido se nenhuma estiver preenchida. */
  chavesParaRemover: string[];
}

/**
 * Compara o universo do escopo atual com o do escopo alvo e devolve o
 * que precisa ser adicionado e removido. Não decide se a remoção é
 * permitida — isso depende de quais vagas estão preenchidas, que só o
 * banco sabe (`alterarEscopoDaColecaoPokedex`, lib/db/consultas.ts).
 */
export function calcularDiffEscopoPokedex(
  atual: ParametroPokedex,
  alvo: ParametroPokedex,
): DiffEscopoPokedex {
  const numerosAtuais = new Set(resolverNumeros(atual));
  const numerosAlvo = new Set(resolverNumeros(alvo));

  const chavesParaAdicionar = [...numerosAlvo]
    .filter((n) => !numerosAtuais.has(n))
    .sort((a, b) => a - b)
    .map(String);
  const chavesParaRemover = [...numerosAtuais]
    .filter((n) => !numerosAlvo.has(n))
    .sort((a, b) => a - b)
    .map(String);

  return { chavesParaAdicionar, chavesParaRemover };
}

export interface ContagemPorRegiao {
  regiao: Regiao;
  quantidade: number;
}

/**
 * Agrupa uma lista de chaves de vaga (números de Pokédex, como texto)
 * por região, na ordem canônica de `REGIOES` (Kanto → Paldea) — usada
 * para compor a mensagem de recusa ao remover região com vaga
 * preenchida ("3 vaga(s) preenchida(s): Johto (2), Kanto (1)").
 */
export function agruparChavesPorRegiao(chaves: readonly string[]): ContagemPorRegiao[] {
  const contagem = new Map<Regiao, number>();
  for (const chave of chaves) {
    const n = Number(chave);
    if (!Number.isInteger(n)) continue; // defensivo: só chaves de pokedex chegam aqui
    const regiao = regiaoDoNumero(n);
    contagem.set(regiao, (contagem.get(regiao) ?? 0) + 1);
  }
  return REGIOES.filter((r) => contagem.has(r)).map((r) => ({
    regiao: r,
    quantidade: contagem.get(r)!,
  }));
}

/** Formata a mensagem de recusa ("Johto (2), Kanto (1)") — sem I/O. */
export function formatarContagemPorRegiao(contagens: readonly ContagemPorRegiao[]): string {
  return contagens.map((c) => `${c.regiao} (${c.quantidade})`).join(", ");
}
