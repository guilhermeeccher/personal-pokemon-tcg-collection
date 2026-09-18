/**
 * Geração de CSV para exportação (spec §5 Fase 3; AGENTS.md convenções de
 * módulo puro). Decisões fechadas, não reabrir:
 *
 * - Separador `;` e UTF-8 com BOM: destino é planilha em pt-BR — com `,`
 *   o Excel pt-BR joga tudo numa coluna só, e sem BOM a acentuação quebra.
 * - Uma linha por CÓPIA, não por unidade: cópia com `quantidade = 3` sai
 *   como uma linha só, com a coluna quantidade valendo 3.
 * - Exportação de coleção traz só vaga PREENCHIDA — "o que falta" já tem
 *   tela própria (spec §5 Fase 2); misturar quebraria a conferência de
 *   linhas do critério de aceite.
 *
 * Decimal (preço de aquisição) em formato brasileiro — vírgula como
 * separador decimal. Coerente com a decisão de separador `;`: como `;`
 * já não é vírgula, não há conflito de delimitador ao usar `,` como
 * decimal (diferente do que aconteceria com CSV separado por vírgula).
 *
 * Camada de adapter (spec §5 Fase 7): `AdapterExportacaoCsv<T>` e
 * `gerarCsv` são o mecanismo de geração, agnóstico de formato de saída.
 * `adapterNossoCsvInventario`/`adapterNossoCsvColecao` são a primeira
 * implementação ("nosso" CSV). Quando a Fase 7 destravar (arquivos de
 * exemplo da LigaPokemon), o adapter dela entra como um novo
 * `AdapterExportacaoCsv<T>` — mesma engine (`gerarCsv`), mesmas rotas,
 * só troca qual adapter é passado. Não implementado aqui de propósito:
 * formato desconhecido, dedução proibida (AGENTS.md).
 */

import type { Condicao, Idioma, VarianteCopia } from "./enums";

const SEPARADOR = ";";
const QUEBRA_LINHA = "\r\n";
const BOM_UTF8 = "\uFEFF";

/**
 * Escapa um campo para CSV com separador `;`: entre aspas quando contém o
 * separador, aspas duplas ou quebra de linha (`\n`/`\r`) — o `notas` é
 * texto livre do usuário, é onde isso acontece na vida real. Aspas
 * internas dobram (`"` → `""`), regra padrão CSV.
 */
export function escaparCampoCsv(valor: string): string {
  const precisaAspas =
    valor.includes(SEPARADOR) ||
    valor.includes('"') ||
    valor.includes("\n") ||
    valor.includes("\r");
  if (!precisaAspas) return valor;
  return `"${valor.replace(/"/g, '""')}"`;
}

/**
 * `numeric(10,2)` do Postgres chega como string ("12.50") via Drizzle
 * (evita perda de precisão do `number`). Só troca o ponto por vírgula —
 * sem separador de milhar, mantém round-trip simples para a Fase 4.
 */
export function formatarDecimalBr(valor: string | null): string {
  if (valor === null) return "";
  return valor.replace(".", ",");
}

/** Remove acentos, baixa caixa, troca não-alfanumérico por hífen — nome de arquivo ASCII-seguro. */
export function slugificar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function nomeArquivoInventario(dataIso: string): string {
  return `inventario-pokemon-${dataIso}.csv`;
}

export function nomeArquivoColecao(nomeColecao: string, dataIso: string): string {
  return `colecao-${slugificar(nomeColecao)}-${dataIso}.csv`;
}

// --- Formato "nosso CSV" ----------------------------------------------------

/**
 * Colunas comuns ao inventário e à coleção (spec/AGENTS Fase 3): nome,
 * número, expansão, sigla, idioma da carta FÍSICA (regra 7 — nunca o
 * idioma do catálogo), variante, condição, quantidade, graded,
 * localização, aquisição, notas.
 */
export interface CamposComunsExportacao {
  cartaNome: string;
  cartaLocalId: string;
  setNome: string;
  setSigla: string | null;
  /** Idioma FÍSICO da cópia (AGENTS.md regra 7) — nunca o idioma do catálogo. */
  idioma: Idioma;
  variante: VarianteCopia;
  condicao: Condicao;
  quantidade: number;
  gradedEmpresa: string | null;
  gradedNota: string | null;
  gradedCertificado: string | null;
  localizacao: string | null;
  aquisicaoData: string | null;
  aquisicaoOrigem: string | null;
  aquisicaoPreco: string | null;
  notas: string | null;
}

export type LinhaExportacaoInventario = CamposComunsExportacao;

/** Exportação por coleção acrescenta a vaga que a cópia ocupa (chave: número da Pokédex ou local_id do set). */
export interface LinhaExportacaoColecao extends CamposComunsExportacao {
  vagaChave: string;
}

const CABECALHO_COMUM: readonly string[] = [
  "Carta",
  "Número",
  "Expansão",
  "Sigla",
  "Idioma",
  "Variante",
  "Condição",
  "Quantidade",
  "Graded empresa",
  "Graded nota",
  "Graded certificado",
  "Localização",
  "Data de aquisição",
  "Origem de aquisição",
  "Preço de aquisição",
  "Notas",
];

function camposComuns(item: CamposComunsExportacao): string[] {
  return [
    item.cartaNome,
    item.cartaLocalId,
    item.setNome,
    item.setSigla ?? "",
    item.idioma,
    item.variante,
    item.condicao,
    String(item.quantidade),
    item.gradedEmpresa ?? "",
    item.gradedNota ?? "",
    item.gradedCertificado ?? "",
    item.localizacao ?? "",
    item.aquisicaoData ?? "",
    item.aquisicaoOrigem ?? "",
    formatarDecimalBr(item.aquisicaoPreco),
    item.notas ?? "",
  ];
}

/**
 * Contrato de um destino de exportação: cabeçalho fixo + como extrair as
 * células (ainda sem escape) de um item. `gerarCsv` é a única coisa que
 * sabe escapar, separar e montar o arquivo — um adapter novo (LigaPokemon,
 * Fase 7) não reimplementa nada disso, só descreve as colunas.
 */
export interface AdapterExportacaoCsv<T> {
  formato: string;
  cabecalho: readonly string[];
  linha(item: T): string[];
}

export const adapterNossoCsvInventario: AdapterExportacaoCsv<LinhaExportacaoInventario> = {
  formato: "nosso",
  cabecalho: CABECALHO_COMUM,
  linha: camposComuns,
};

export const adapterNossoCsvColecao: AdapterExportacaoCsv<LinhaExportacaoColecao> = {
  formato: "nosso",
  cabecalho: [...CABECALHO_COMUM, "Vaga"],
  linha: (item) => [...camposComuns(item), item.vagaChave],
};

/**
 * Monta o arquivo CSV completo: BOM + cabeçalho + uma linha por item,
 * campo a campo escapado, separado por `;`, quebra de linha `\r\n`
 * (inclusive ao final — todo `wc -l`/leitor de linha bate com o número
 * de registros, sem linha extra em branco).
 */
export function gerarCsv<T>(
  adapter: AdapterExportacaoCsv<T>,
  itens: readonly T[],
): string {
  const linhas = [adapter.cabecalho, ...itens.map((item) => adapter.linha(item))];
  const corpo = linhas
    .map((campos) => campos.map((campo) => escaparCampoCsv(campo)).join(SEPARADOR))
    .join(QUEBRA_LINHA);
  return BOM_UTF8 + corpo + QUEBRA_LINHA;
}
