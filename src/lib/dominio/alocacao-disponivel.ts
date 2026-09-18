/**
 * O que a tela diz sobre a possibilidade de alocar numa vaga vazia.
 *
 * Por que existe: até 2026-08-29 o botão "Alocar" aparecia habilitado em
 * toda vaga vazia, e clicar abria a lista de candidatos — vazia na
 * imensa maioria das vezes. Medido numa Pokédex real: **240 vagas
 * vazias, 11 com alguma cópia livre que sirva.** 95% dos cliques não
 * levavam a lugar nenhum.
 *
 * A contagem vem do servidor (`contarCandidatosPorVagaVazia`, em
 * `lib/db/consultas.ts`), que aplica as mesmas regras de universo já
 * testadas em `elegibilidade-vaga.ts`. Aqui só se decide o texto.
 *
 * Regra 5 do AGENTS.md continua intacta: desabilitar o que não tem opção
 * não é escolher pelo usuário — quando há candidata, a lista aparece igual
 * e a escolha segue sendo dele.
 */

/**
 * Texto da tooltip do botão "Alocar".
 *
 * Vale tanto para o caso habilitado quanto para o desabilitado: botão
 * cinza sem explicação vira suspeita de bug, e saber "quantas opções eu
 * tenho" antes do clique poupa abrir a lista.
 */
export function rotuloAlocacao(candidatosDisponiveis: number): string {
  if (candidatosDisponiveis <= 0) {
    return "Nenhuma cópia livre sua cabe nesta vaga.";
  }
  if (candidatosDisponiveis === 1) {
    return "1 cópia livre sua cabe nesta vaga.";
  }
  return `${candidatosDisponiveis} cópias livres suas cabem nesta vaga.`;
}
