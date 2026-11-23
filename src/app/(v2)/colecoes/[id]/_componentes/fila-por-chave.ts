/**
 * Uma fila por chave: as tarefas da mesma chave rodam uma de cada vez, na
 * ordem em que entraram; chaves diferentes não se esperam. Pura (sem rede),
 * para ser testada.
 *
 * A marcação de compra usa uma por coleção: a aba "O que falta" e a seção de
 * compra do detalhe escrevem pela mesma rota, e um "tirar" no detalhe não
 * pode chegar ao servidor antes de um "pôr" que a aba mandou primeiro — o
 * último gesto do usuário é o que fica.
 */
export function criarFilaPorChave() {
  const caudas = new Map<string, Promise<unknown>>();
  return function enfileirar<T>(chave: string, tarefa: () => Promise<T>): Promise<T> {
    const anterior = caudas.get(chave) ?? Promise.resolve();
    // A tarefa roda depois da anterior terminar, dê ela certo ou não.
    const esta = anterior.then(tarefa, tarefa);
    const cauda = esta.catch(() => undefined);
    caudas.set(chave, cauda);
    // Fila vazia some do mapa: nada fica preso a uma coleção que saiu da tela.
    void cauda.then(() => {
      if (caudas.get(chave) === cauda) caudas.delete(chave);
    });
    return esta;
  };
}
