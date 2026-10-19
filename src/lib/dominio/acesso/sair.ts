/**
 * O que o cliente faz depois de pedir `DELETE /api/sessao` ("Sair").
 *
 * O servidor confirma e só então o cliente navega. `200` é o cookie apagado;
 * `401` é a sessão que já não valia (expirou, ou a senha foi trocada), e o
 * login vai mostrar o formulário do mesmo jeito. Qualquer outra resposta, ou
 * a falta dela (`null`: a requisição rejeitou), não prova que o cookie saiu:
 * navegar mostraria um login que o proxy mandaria de volta para dentro, e a
 * pessoa acharia que saiu sem ter saído. Fica na tela, com o erro.
 */
export type DestinoAposSair = "login" | "erro";

export function destinoAposSair(status: number | null): DestinoAposSair {
  return status === 200 || status === 401 ? "login" : "erro";
}
