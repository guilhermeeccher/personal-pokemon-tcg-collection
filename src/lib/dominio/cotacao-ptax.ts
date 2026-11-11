/**
 * A cotação que converte o preço do Cardmarket em reais: a **PTAX de
 * fechamento**, cotação de **venda**, do boletim mais recente, pela API
 * Olinda do Banco Central. Módulo puro: monta a URL e escolhe o boletim; a
 * requisição está em `lib/cotacao/ptax.ts`.
 *
 * Por que a PTAX de fechamento: é a taxa oficial publicada uma vez por dia
 * útil, com data — dá para escrever na tela "PTAX de DD/MM/AAAA" e qualquer
 * um conferir. Os boletins de abertura e intermediários mudam ao longo do
 * dia e não são a referência de ninguém. A de venda é a que se usa para
 * converter um valor em moeda estrangeira.
 *
 * Formato da resposta (conferido em 2026-11-11):
 * `{ "value": [ { "cotacaoVenda": 6.1, "dataHoraCotacao": "2026-11-11 13:09:28.613",
 * "tipoBoletim": "Fechamento" }, ... ] }`, com boletins `Abertura` e
 * `Intermediário` misturados.
 */

const BASE_OLINDA = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/";

/** O boletim escolhido: a cotação de venda e a data (YYYY-MM-DD) dele. */
export interface CotacaoPtax {
  cotacao: number;
  data: string;
}

const FORMATO_SAO_PAULO = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * A data `MM-DD-YYYY` que a Olinda pede, **no fuso de São Paulo**: é o dia
 * do boletim. Pelo relógio UTC, das 21h às 24h de Brasília já seria o dia
 * seguinte, e a consulta pediria um dia que ainda não existe.
 */
export function dataOlinda(instante: Date): string {
  const partes = FORMATO_SAO_PAULO.formatToParts(instante);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? "";
  return `${parte("month")}-${parte("day")}-${parte("year")}`;
}

/**
 * URL de `CotacaoMoedaPeriodo` da Olinda: todos os boletins da moeda entre
 * as duas datas, só com os três campos que a escolha usa.
 */
export function urlPtaxPeriodo(moeda: string, inicio: Date, fim: Date): string {
  // A moeda entra crua na URL (entre aspas, como a OData pede): só um código
  // ISO de três letras passa, e nada mais vira parte da consulta.
  if (!/^[A-Z]{3}$/.test(moeda)) throw new Error(`Moeda inválida para a PTAX: ${moeda}`);
  return (
    `${BASE_OLINDA}CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@moeda='${moeda}'&@dataInicial='${dataOlinda(inicio)}'&@dataFinalCotacao='${dataOlinda(fim)}'` +
    `&$format=json&$select=cotacaoVenda,dataHoraCotacao,tipoBoletim`
  );
}

const DATA_HORA = /^(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/;

/**
 * O boletim de fechamento mais recente da resposta, ou `null` quando não há
 * nenhum válido (fora do formato, sem fechamento no período, cotação zero
 * ou não numérica). Quem chama trata `null` como cotação indisponível: a
 * rodada não começa sem ela.
 */
export function escolherPtaxDeFechamento(resposta: unknown): CotacaoPtax | null {
  if (typeof resposta !== "object" || resposta === null) return null;
  const valores = (resposta as { value?: unknown }).value;
  if (!Array.isArray(valores)) return null;

  let escolhido: { cotacao: number; dataHora: string; data: string } | null = null;
  for (const item of valores) {
    if (typeof item !== "object" || item === null) continue;
    const { cotacaoVenda, dataHoraCotacao, tipoBoletim } = item as Record<string, unknown>;
    if (tipoBoletim !== "Fechamento") continue;
    if (typeof cotacaoVenda !== "number" || !Number.isFinite(cotacaoVenda) || cotacaoVenda <= 0) continue;
    if (typeof dataHoraCotacao !== "string") continue;
    const casou = DATA_HORA.exec(dataHoraCotacao.trim());
    if (!casou) continue;
    // `AAAA-MM-DD HH:MM:SS` compara certo como texto: o mais recente é o maior.
    if (escolhido === null || dataHoraCotacao.trim() > escolhido.dataHora) {
      escolhido = { cotacao: cotacaoVenda, dataHora: dataHoraCotacao.trim(), data: casou[1] };
    }
  }
  return escolhido === null ? null : { cotacao: escolhido.cotacao, data: escolhido.data };
}
