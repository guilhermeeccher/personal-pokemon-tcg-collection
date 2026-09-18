/**
 * Detecta quando o universo de vagas materializado para uma coleção de
 * set ficou menor do que o catálogo diz ser o oficial/total do set — uma
 * lacuna do upstream (achado real: `mfb` tem 34 de 48 cartas oficiais no
 * catálogo `en`; `smp`/`swshp`/`svp` em pt e `tk-sm-l`/`swshp`/`exu` em
 * en têm lacunas parecidas, quase todos promocionais).
 *
 * Regra de negócio explícita (2026-08-25, achado do coordenador): a
 * criação NUNCA é recusada por isso — bloquear travaria sets legítimos
 * por um buraco do upstream que nada tem a ver com quem cadastra. O que
 * não pode acontecer é a coleção MENTIR que está completa. Este módulo
 * só compara e sinaliza; quem chama decide onde expor o aviso.
 *
 * Simétrico e nunca stale por design: não persiste nada — quem chama
 * sempre recalcula contra o estado atual do catálogo (`qtdOficial`/
 * `qtdTotal` vêm frescos da consulta), então se um sync futuro completar
 * o set, o aviso some sozinho, sem migração nem reconciliação manual.
 *
 * Simetria que a tarefa exige: uma coleção com o catálogo completo
 * (`vagasMaterializadas >= vagasEsperadas`) nunca ganha aviso nem
 * denominador diferente — devolve `null`, e quem chama omite o campo
 * inteiro da resposta.
 *
 * Módulo puro, sem I/O.
 */

export interface AvisoCatalogoIncompleto {
  vagasMaterializadas: number;
  vagasEsperadas: number;
  vagasFaltantes: number;
}

export function detectarCatalogoIncompleto(
  vagasMaterializadas: number,
  vagasEsperadas: number,
): AvisoCatalogoIncompleto | null {
  if (vagasMaterializadas >= vagasEsperadas) return null;
  return {
    vagasMaterializadas,
    vagasEsperadas,
    vagasFaltantes: vagasEsperadas - vagasMaterializadas,
  };
}
