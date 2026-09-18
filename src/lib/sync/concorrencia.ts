/**
 * Executa `tarefa` para cada item de `itens`, no máximo `limite` em paralelo.
 * Preserva a ordem do resultado. Módulo puro, sem dependência do sync em si.
 *
 * **Para tudo no primeiro erro.** Se uma tarefa rejeitar, os demais
 * trabalhadores não pegam item novo e a função rejeita com aquele erro. Sem
 * isso, um sync abortado por bloqueio de IP continuaria disparando as
 * requisições dos outros trabalhadores até a fila esvaziar — exatamente o
 * comportamento que renovaria o bloqueio (incidente de 2026-08-25, ver
 * `lib/dominio/bloqueio-upstream.ts`).
 *
 * Quem quiser tolerar falha item a item captura dentro da própria `tarefa`,
 * como o sync de catálogo faz para set e carta individuais.
 */
export async function mapComConcorrencia<T, R>(
  itens: readonly T[],
  limite: number,
  tarefa: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados: R[] = new Array(itens.length);
  let proximo = 0;
  let abortado = false;

  async function trabalhador(): Promise<void> {
    for (;;) {
      if (abortado) return;
      const indice = proximo++;
      if (indice >= itens.length) return;
      try {
        resultados[indice] = await tarefa(itens[indice], indice);
      } catch (err) {
        abortado = true;
        throw err;
      }
    }
  }

  const trabalhadores = Array.from(
    { length: Math.min(limite, itens.length) },
    () => trabalhador(),
  );
  // allSettled + relançar: espera os trabalhadores em voo terminarem antes de
  // devolver o erro. `Promise.all` rejeitaria de imediato, deixando
  // requisições órfãs em andamento depois de o sync já ter sido dado por
  // encerrado.
  const desfechos = await Promise.allSettled(trabalhadores);
  const falha = desfechos.find((d) => d.status === "rejected");
  if (falha && falha.status === "rejected") throw falha.reason;

  return resultados;
}
