/**
 * O estado de uma escada de imagens (`ImagemEscada`): quantas fontes da
 * escada já falharam **para este conjunto de fontes**. As falhas ficam presas
 * à chave das fontes — se a página atualiza e o componente recebe outra
 * escada (a capa mudou), a contagem recomeça em zero em vez de pular a
 * primeira fonte nova só porque a anterior tinha falhado.
 */

export interface EstadoEscada {
  chave: string;
  falhas: number;
}

export function chaveDasFontes(fontes: readonly string[]): string {
  return JSON.stringify(fontes);
}

/** Quantas fontes falharam para a escada de agora (zero se o estado é de outra). */
export function falhasDaEscada(estado: EstadoEscada, fontes: readonly string[]): number {
  return estado.chave === chaveDasFontes(fontes) ? estado.falhas : 0;
}

/** Registra uma falha na escada de agora, descartando a contagem de uma escada antiga. */
export function registrarFalha(estado: EstadoEscada, fontes: readonly string[]): EstadoEscada {
  return { chave: chaveDasFontes(fontes), falhas: falhasDaEscada(estado, fontes) + 1 };
}
