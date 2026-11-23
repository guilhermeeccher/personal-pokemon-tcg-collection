/**
 * A data local de hoje, `YYYY-MM-DD` — não a UTC, que vira o dia às 21h no
 * Brasil: um troféu marcado às 22h de domingo seria gravado como segunda.
 *
 * Sem pele, por isso em `_comum/`: a v1 e a v2 usam a mesma função para o
 * valor inicial da data de um troféu e o início de um plano (dono: pacote
 * 5e-b — `docs/design-v2/rules.md`, "Dex shared code"). `agora` existe para o
 * teste; a tela chama sem argumento.
 */
export function hojeLocal(agora: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}
