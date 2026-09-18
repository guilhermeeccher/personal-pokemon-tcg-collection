/**
 * Leitura dos arquivos de seed do catálogo (`seed/`), que vêm versionados
 * no repositório para que uma instalação nova nasça com as cartas já
 * cadastradas — sem nenhuma requisição a api.tcgdex.net e sem o clone de
 * ~220 MB do repositório de dados da TCGdex.
 *
 * Este módulo é puro: só converte texto CSV em linhas prontas para o
 * `INSERT`. Quem lê o arquivo, descomprime e grava no banco é
 * `scripts/seed-catalogo.ts`.
 *
 * **Dialeto CSV.** É o do `COPY ... WITH (FORMAT csv, HEADER)` do
 * Postgres, que é quem gera os arquivos (ver `seed/README.md`):
 *  - separador `,`, registros terminados por `\n` (`\r\n` também é aceito);
 *  - campo entre aspas duplas quando contém `,`, `"` ou quebra de linha, com
 *    a aspa interna dobrada (`""`);
 *  - **campo vazio SEM aspas é `NULL`; `""` é string vazia.** A distinção é
 *    do formato e é preservada aqui — por isso o parser devolve
 *    `string | null` e não `string`. Confundir os dois gravaria `''` em
 *    `raridade`/`ilustrador`, onde o resto do sistema espera `null`;
 *  - booleano sai como `t`/`f` (também aceitamos `true`/`false`, para o caso
 *    de alguém regerar o arquivo com um `::text` no meio);
 *  - `dex_ids` e `tipos` são arrays e saem em **JSON** (`to_json(...)` no
 *    comando de exportação), não no literal `{a,b}` do Postgres: JSON tem
 *    uma única regra de escape, o literal de array tem três e nenhuma delas
 *    é a do CSV.
 *
 * O cabeçalho é conferido contra a lista esperada — coluna a mais, a menos
 * ou renomeada aborta a leitura em vez de gravar dado torto em silêncio.
 * A ordem das colunas no arquivo é livre: o casamento é por nome.
 */
import type { cartaCatalogo, setMypcards } from "@/lib/db/schema";

/** Linha pronta para `insert(cartaCatalogo)`. */
export type LinhaSeedCatalogo = typeof cartaCatalogo.$inferInsert;
/** Linha pronta para `insert(setMypcards)`. */
export type LinhaSeedSetMypcards = typeof setMypcards.$inferInsert;

/** Valor de um campo do CSV. `null` = campo vazio sem aspas (NULL). */
export type CampoCsv = string | null;

/** Um registro do CSV, indexado pelo nome da coluna no cabeçalho. */
export type RegistroCsv = Readonly<Record<string, CampoCsv>>;

/** Colunas esperadas em `seed/carta-catalogo.csv.gz`. */
export const COLUNAS_CATALOGO = [
  "id",
  "idioma",
  "set_id",
  "set_nome",
  "set_serie",
  "set_serie_id",
  "set_sigla",
  "set_lancamento",
  "local_id",
  "nome",
  "categoria",
  "raridade",
  "dex_ids",
  "forma",
  "origem",
  "variante_normal_disponivel",
  "variante_reverse_disponivel",
  "variante_holo_disponivel",
  "variante_primeira_edicao_disponivel",
  "variante_promo_disponivel",
  "tipos",
  "dex_ids_derivado",
  "imagem_url",
  "imagem_cdn_existe",
  "imagem_cdn_verificado_em",
  "ilustrador",
  "set_qtd_oficial",
  "set_qtd_total",
  "ativa",
] as const;

/** Colunas esperadas em `seed/set-mypcards.csv`. */
export const COLUNAS_SET_MYPCARDS = ["set_id", "numero", "origem_url"] as const;

const IDIOMAS = ["pt", "en", "jp"] as const;
const FORMAS = [
  "normal",
  "alola",
  "galar",
  "hisui",
  "paldea",
  "mega",
  "gigantamax",
] as const;
const ORIGENS = ["sync", "manual"] as const;

const VIRGULA = 0x2c;
const ASPA = 0x22;
const NOVA_LINHA = 0x0a;
const RETORNO = 0x0d;

/**
 * Quebra o texto CSV em registros de campos. Não interpreta cabeçalho nem
 * tipos — só desfaz o formato.
 */
export function analisarCsv(texto: string): CampoCsv[][] {
  const registros: CampoCsv[][] = [];
  let campos: CampoCsv[] = [];
  let i = 0;
  const n = texto.length;

  while (i < n) {
    let valor: string;
    let comAspas = false;

    if (texto.charCodeAt(i) === ASPA) {
      comAspas = true;
      i++;
      const pedacos: string[] = [];
      for (;;) {
        const fim = texto.indexOf('"', i);
        if (fim === -1) {
          throw new Error(
            `CSV malformado: aspa aberta na posição ${i} nunca é fechada.`,
          );
        }
        pedacos.push(texto.slice(i, fim));
        i = fim + 1;
        if (texto.charCodeAt(i) === ASPA) {
          // `""` dentro do campo: uma aspa literal.
          pedacos.push('"');
          i++;
          continue;
        }
        break;
      }
      valor = pedacos.join("");
      const seguinte = i < n ? texto.charCodeAt(i) : -1;
      if (
        seguinte !== -1 &&
        seguinte !== VIRGULA &&
        seguinte !== NOVA_LINHA &&
        seguinte !== RETORNO
      ) {
        throw new Error(
          `CSV malformado: lixo depois da aspa de fechamento na posição ${i}.`,
        );
      }
    } else {
      let j = i;
      while (j < n) {
        const c = texto.charCodeAt(j);
        if (c === VIRGULA || c === NOVA_LINHA) break;
        j++;
      }
      valor = texto.slice(i, j);
      if (valor.endsWith("\r")) valor = valor.slice(0, -1);
      i = j;
    }

    campos.push(comAspas ? valor : valor === "" ? null : valor);

    if (i < n && texto.charCodeAt(i) === VIRGULA) {
      i++;
      continue;
    }
    if (i < n && texto.charCodeAt(i) === RETORNO) i++;
    if (i < n && texto.charCodeAt(i) === NOVA_LINHA) i++;
    registros.push(campos);
    campos = [];
  }

  return registros;
}

/**
 * Analisa o CSV e casa cada registro com o cabeçalho, conferindo que as
 * colunas são exatamente as esperadas.
 */
export function lerRegistrosCsv(
  texto: string,
  colunasEsperadas: readonly string[],
): RegistroCsv[] {
  const registros = analisarCsv(texto);
  if (registros.length === 0) {
    throw new Error("CSV vazio: nem o cabeçalho foi encontrado.");
  }

  const cabecalho = registros[0].map((c) => c ?? "");
  const faltando = colunasEsperadas.filter((c) => !cabecalho.includes(c));
  const sobrando = cabecalho.filter((c) => !colunasEsperadas.includes(c));
  if (faltando.length > 0 || sobrando.length > 0) {
    throw new Error(
      `Cabeçalho do CSV não confere. Faltando: [${faltando.join(", ")}]. ` +
        `Não esperadas: [${sobrando.join(", ")}].`,
    );
  }

  const linhas: RegistroCsv[] = [];
  for (let indice = 1; indice < registros.length; indice++) {
    const campos = registros[indice];
    if (campos.length === 1 && campos[0] === null) continue; // linha em branco
    if (campos.length !== cabecalho.length) {
      throw new Error(
        `Linha ${indice + 1} do CSV tem ${campos.length} campos, ` +
          `mas o cabeçalho tem ${cabecalho.length}.`,
      );
    }
    const registro: Record<string, CampoCsv> = {};
    for (let c = 0; c < cabecalho.length; c++) {
      registro[cabecalho[c]] = campos[c];
    }
    linhas.push(registro);
  }
  return linhas;
}

function textoOuNulo(registro: RegistroCsv, coluna: string): string | null {
  return registro[coluna] ?? null;
}

function exigirTexto(registro: RegistroCsv, coluna: string): string {
  const valor = registro[coluna];
  if (valor === null || valor === undefined) {
    throw new Error(`Coluna '${coluna}' é obrigatória e veio vazia.`);
  }
  return valor;
}

function exigirInteiro(registro: RegistroCsv, coluna: string): number {
  const bruto = exigirTexto(registro, coluna);
  const numero = Number(bruto);
  if (!Number.isInteger(numero)) {
    throw new Error(`Coluna '${coluna}' não é um inteiro: ${bruto}`);
  }
  return numero;
}

function paraBooleano(bruto: string, coluna: string): boolean {
  if (bruto === "t" || bruto === "true") return true;
  if (bruto === "f" || bruto === "false") return false;
  throw new Error(`Coluna '${coluna}' não é um booleano: ${bruto}`);
}

function exigirBooleano(registro: RegistroCsv, coluna: string): boolean {
  return paraBooleano(exigirTexto(registro, coluna), coluna);
}

function booleanoOuNulo(
  registro: RegistroCsv,
  coluna: string,
): boolean | null {
  const bruto = textoOuNulo(registro, coluna);
  return bruto === null ? null : paraBooleano(bruto, coluna);
}

function dataHoraOuNula(registro: RegistroCsv, coluna: string): Date | null {
  const bruto = textoOuNulo(registro, coluna);
  if (bruto === null) return null;
  const data = new Date(bruto);
  if (Number.isNaN(data.getTime())) {
    throw new Error(`Coluna '${coluna}' não é uma data/hora válida: ${bruto}`);
  }
  return data;
}

function exigirArrayJson(registro: RegistroCsv, coluna: string): unknown[] {
  const bruto = exigirTexto(registro, coluna);
  let valor: unknown;
  try {
    valor = JSON.parse(bruto);
  } catch {
    throw new Error(`Coluna '${coluna}' não é JSON válido: ${bruto}`);
  }
  if (!Array.isArray(valor)) {
    throw new Error(`Coluna '${coluna}' deveria ser um array JSON: ${bruto}`);
  }
  return valor;
}

function exigirArrayInteiros(
  registro: RegistroCsv,
  coluna: string,
): number[] {
  const itens = exigirArrayJson(registro, coluna);
  return itens.map((item) => {
    if (typeof item !== "number" || !Number.isInteger(item)) {
      throw new Error(
        `Coluna '${coluna}' deveria conter só inteiros: ${String(item)}`,
      );
    }
    return item;
  });
}

function exigirArrayTextos(registro: RegistroCsv, coluna: string): string[] {
  const itens = exigirArrayJson(registro, coluna);
  return itens.map((item) => {
    if (typeof item !== "string") {
      throw new Error(
        `Coluna '${coluna}' deveria conter só textos: ${String(item)}`,
      );
    }
    return item;
  });
}

function exigirEnum<T extends string>(
  registro: RegistroCsv,
  coluna: string,
  valores: readonly T[],
): T {
  const bruto = exigirTexto(registro, coluna);
  const achado = valores.find((v) => v === bruto);
  if (achado === undefined) {
    throw new Error(
      `Coluna '${coluna}' tem valor fora do enum (${valores.join("|")}): ${bruto}`,
    );
  }
  return achado;
}

/**
 * Converte um registro do CSV numa linha de `carta_catalogo`.
 *
 * `criado_em` e `atualizado_em` **não** vêm do arquivo de propósito: são o
 * relógio de quem gerou o seed, não o de quem o carrega. Ficam com o
 * `now()` do banco no insert; o script renova `atualizado_em` no upsert.
 */
export function converterLinhaCatalogo(
  registro: RegistroCsv,
): LinhaSeedCatalogo {
  return {
    id: exigirTexto(registro, "id"),
    idioma: exigirEnum(registro, "idioma", IDIOMAS),
    setId: exigirTexto(registro, "set_id"),
    setNome: exigirTexto(registro, "set_nome"),
    setSerie: exigirTexto(registro, "set_serie"),
    setSerieId: textoOuNulo(registro, "set_serie_id"),
    setSigla: textoOuNulo(registro, "set_sigla"),
    setLancamento: textoOuNulo(registro, "set_lancamento"),
    localId: exigirTexto(registro, "local_id"),
    nome: exigirTexto(registro, "nome"),
    categoria: exigirTexto(registro, "categoria"),
    raridade: textoOuNulo(registro, "raridade"),
    dexIds: exigirArrayInteiros(registro, "dex_ids"),
    forma: exigirEnum(registro, "forma", FORMAS),
    origem: exigirEnum(registro, "origem", ORIGENS),
    varianteNormalDisponivel: exigirBooleano(
      registro,
      "variante_normal_disponivel",
    ),
    varianteReverseDisponivel: exigirBooleano(
      registro,
      "variante_reverse_disponivel",
    ),
    varianteHoloDisponivel: exigirBooleano(
      registro,
      "variante_holo_disponivel",
    ),
    variantePrimeiraEdicaoDisponivel: exigirBooleano(
      registro,
      "variante_primeira_edicao_disponivel",
    ),
    variantePromoDisponivel: exigirBooleano(
      registro,
      "variante_promo_disponivel",
    ),
    tipos: exigirArrayTextos(registro, "tipos"),
    dexIdsDerivado: exigirBooleano(registro, "dex_ids_derivado"),
    imagemUrl: textoOuNulo(registro, "imagem_url"),
    imagemCdnExiste: booleanoOuNulo(registro, "imagem_cdn_existe"),
    imagemCdnVerificadoEm: dataHoraOuNula(
      registro,
      "imagem_cdn_verificado_em",
    ),
    ilustrador: textoOuNulo(registro, "ilustrador"),
    setQtdOficial: exigirInteiro(registro, "set_qtd_oficial"),
    setQtdTotal: exigirInteiro(registro, "set_qtd_total"),
    ativa: exigirBooleano(registro, "ativa"),
  };
}

/** Converte um registro do CSV numa linha de `set_mypcards`. */
export function converterLinhaSetMypcards(
  registro: RegistroCsv,
): LinhaSeedSetMypcards {
  return {
    setId: exigirTexto(registro, "set_id"),
    numero: exigirInteiro(registro, "numero"),
    origemUrl: exigirTexto(registro, "origem_url"),
  };
}
