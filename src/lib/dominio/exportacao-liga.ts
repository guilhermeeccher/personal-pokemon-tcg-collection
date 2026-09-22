/**
 * Exportação do inventário no formato de importação da **LigaPokemon**
 * (Fase 7 da spec). Módulo puro — quem lê o banco e monta o ZIP fica
 * fora daqui.
 *
 * ## De onde veio o formato
 *
 * De um export real do site deles, colhido em 2026-08-29
 * (`export_fdf949…csv`). Uma linha de exemplo, decomposta com parser de
 * CSV e não a olho:
 *
 *     "Heróis Excelsos","Ascended Heroes",ASC,"Mega Gengar ex",
 *     "Mega Gengar ex",1,NM,PT,MA,D,Foil,269,,217
 *
 * Duas descobertas boas na comparação com o nosso catálogo: **a sigla do
 * set é idêntica à nossa** (`ASC` = `set_sigla`), e a contagem da edição
 * também (217 = `set_qtd_oficial`). Não é preciso tabela de tradução de
 * set — o medo inicial não se confirmou.
 *
 * ## O segundo arquivo, e o que ele resolveu
 *
 * Em 2026-08-29 o usuário mandou um segundo export
 * (`export_e38e0957…csv`): **760 linhas cobrindo quatro sets inteiros**
 * (ASC, MEW, PFL, PBL). Cruzando linha a linha com o nosso catálogo por
 * sigla + número da carta, as tabelas deixaram de ser palpite:
 *
 * - **Cor: resolvida por completo.** `Dragon → O` apareceu 20 vezes, e os
 *   outros nove tipos confirmaram a dedução anterior. Duas regras novas
 *   que só o volume revelou: **Treinador é sempre `C`** (113 de 113) e
 *   **Energia é `E`** — `E` não é um tipo de Pokémon, é a categoria.
 * - **Raridade: seis das doze resolvidas**, com 100% de consistência em
 *   605 linhas. As outras continuam em branco, e a razão está abaixo.
 *
 * ## O que segue em branco, e por quê
 *
 * Três raridades nossas mapeiam para MAIS DE UM código deles, e **o
 * discriminador não existe no nosso dado**:
 *
 * - `Rara` → `R` (46) ou `RH` (25). A separação é por set: no MEW toda
 *   rara é holo, nos outros três não. Testei as flags de variante do
 *   catálogo e elas são **idênticas** nos dois grupos — não há sinal.
 * - `Ultra Rara` → `RU` (51), `SR` (14) ou `MA` (7).
 * - `Mega Hiper Raro` → `RP`, `MA` ou `HR`.
 *
 * `MA` aparece só em carta cujo nome começa com "Mega" (8 de 8) — mas o
 * inverso é falso: das 62 cartas "Mega" do arquivo, só 8 são `MA`. A
 * condição é necessária e não suficiente, então não serve como regra.
 *
 * Preencher por palpite marcaria a carta como outra coisa no site dele.
 * Em branco, o site usa o que ele já tiver ou pede a informação; errado,
 * o usuário só descobre depois.
 *
 * ## Diferença conhecida e aceita
 *
 * Duas energias especiais têm nome diferente no catálogo deles: eles
 * abreviam o tipo dentro do nome — `Shadowy Darkness Energy` vira
 * `Shadowy D Energy`, `Voltaic Lightning Energy` vira
 * `Voltaic L Energy`. Em português o padrão nem se sustenta: as duas
 * viram `Energia E ...`, com o mesmo `E` para Escuridão e para Voltaica.
 *
 * São 2 cartas em 760, com regra inconsistente. Codificar uma abreviação
 * a partir disso corromperia nomes de carta para ganhar dois casos — não
 * vale, e a diferença fica registrada aqui.
 *
 * ## Conferência contra o arquivo real
 *
 * Cruzando o nosso ZIP com o export dele por sigla + número, **327
 * cartas comparáveis, 2 divergências** — as duas energias acima. Foi essa
 * conferência que revelou o acento no nome da carta e o preenchimento com
 * zeros do total da edição; antes delas eram 290 divergências.
 *
 * O cabeçalho do arquivo deles não serve como documentação: anuncia `BR`
 * para idioma e o dado real traz `PT`, e lista letras de raridade
 * (`C I U R H E X U P A L S`) que não cobrem `IR`, `IS`, `RD`, `RU`,
 * `MA`, `RP` nem `HR`.
 */

import type { Condicao, Idioma, VarianteCopia } from "./enums";

/** As 14 colunas, na ordem exata do arquivo deles. */
export const COLUNAS_LIGA = [
  "Edicao (PTBR)",
  "Edicao (EN)",
  "Edicao (Sigla)",
  "Card (PT)",
  "Card (EN)",
  "Quantidade",
  "Qualidade (M NM SP MP HP D)",
  "Idioma (BR EN DE ES FR IT JP KO RU TW)",
  "Raridade (C I U R H E X U P A L S)",
  "Cor (C D O E Y F R G L M P W)",
  "Extras",
  "Card #",
  "Comentario",
  "# Cards na Edicao",
] as const;

/**
 * Tipo da carta → letra da coluna "Cor". **Todos confirmados** contra as
 * 760 linhas do segundo export, exceto `Fairy`, que não apareceu na
 * amostra e segue a mesma notação clássica do TCG.
 */
const COR_POR_TIPO: Record<string, string> = {
  Colorless: "C",
  Darkness: "D",
  Fairy: "Y", // única não vista na amostra
  Dragon: "O", // 20 ocorrências
  Fighting: "F",
  Fire: "R",
  Grass: "G",
  Lightning: "L",
  Metal: "M",
  Psychic: "P",
  Water: "W",
};

/**
 * A categoria manda na cor antes do tipo — regra que só o volume
 * revelou:
 *
 * - **Treinador é sempre `C`**, 113 de 113 no arquivo deles.
 * - **Energia é `E`**. `E` não é um tipo de Pokémon: é a categoria. Uma
 *   "Energia Psíquica" tem tipo Psychic no nosso catálogo e sai como `E`,
 *   não `P`.
 *
 * Só carta de Pokémon usa a letra do tipo.
 */
const COR_POR_CATEGORIA: Record<string, string> = {
  treinador: "C",
  trainer: "C",
  energia: "E",
  energy: "E",
};

/**
 * Condição nossa → "Qualidade" deles.
 *
 * O cabeçalho deles lista `M NM SP MP HP D`. `NM`, `MP` e `HP` são
 * idênticos aos nossos. `LP` (Lightly Played) vira `SP` (Slightly
 * Played), e `DMG` vira `D`: são a mesma posição na escala, com nome
 * diferente. **Só `NM` está confirmado pelo exemplo** — os outros quatro
 * seguem a ordem da escala, que é a leitura óbvia, mas não foram vistos
 * em dado real.
 */
const QUALIDADE_POR_CONDICAO: Record<Condicao, string> = {
  NM: "NM",
  LP: "SP",
  MP: "MP",
  HP: "HP",
  DMG: "D",
};

/** Idioma físico da cópia → coluna "Idioma". `PT`, e não `BR`, conforme o dado real. */
const IDIOMA_LIGA: Record<Idioma, string> = {
  pt: "PT",
  en: "EN",
  jp: "JP",
};

/**
 * Variante → coluna "Extras".
 *
 * O vocabulário deles, extraído do segundo export: `Foil`,
 * `Reverse Foil`, `Promo`, `Master Ball`, `Pokeball Foil`.
 *
 * `holo → Foil` está **confirmado**: é o que a exportação da coleção do
 * usuário trouxe numa carta holo. `Reverse Foil` e `Promo` são termos DELES,
 * com correspondência exata com as nossas variantes — não são invenção
 * nossa. `Master Ball` e `Pokeball Foil` são acabamentos exclusivos do
 * set 151 que o nosso modelo não representa.
 *
 * Cuidado ao ler o segundo export: lá o campo lista os acabamentos
 * DISPONÍVEIS para a carta no set (todas as 215 linhas do MEW trazem a
 * mesma string), porque é uma listagem de set. Numa exportação de
 * COLEÇÃO, que é o nosso caso, ele descreve a cópia — e é essa a leitura
 * que vale aqui.
 *
 * `normal` e `primeira-edicao` saem em branco: a primeira porque não há o
 * que declarar, a segunda porque não apareceu no vocabulário deles.
 */
const EXTRAS_POR_VARIANTE: Partial<Record<VarianteCopia, string>> = {
  holo: "Foil",
  reverse: "Reverse Foil",
  promo: "Promo",
};

/**
 * Raridade nossa → código deles. Aprendido cruzando as 760 linhas do
 * segundo export com o nosso catálogo por sigla + número da carta.
 *
 * **Só entram aqui as que mapearam para UM código, sem exceção.** As
 * seis abaixo são 100% consistentes em 605 linhas. As ambíguas (`Rara`,
 * `Ultra Rara`, `Mega Hiper Raro`) ficam de fora de propósito — ver o
 * cabeçalho do módulo.
 *
 * As chaves em inglês existem porque cópia identificada por linha de
 * catálogo `en` traz a raridade em inglês ("Common", "Double rare"). É o
 * mesmo conceito, e deixar de fora faria a mesma carta exportar diferente
 * conforme o idioma do catálogo que a identificou.
 */
const RARIDADE_LIGA: Record<string, string> = {
  // pt
  Comum: "C",
  Incomum: "U",
  "Rara Dupla": "RD",
  "Ilustração Rara": "IR",
  "Ilustração Rara Especial": "IS",
  "Hiper rara": "HR",
  // en — mesmos conceitos, vindos de linha de catálogo em inglês
  Common: "C",
  Uncommon: "U",
  "Double rare": "RD",
  "Illustration rare": "IR",
  "Special illustration rare": "IS",
  "Hyper rare": "HR",
};

/**
 * Tira o acento, mantendo a letra base: `Maçarico` → `Macarico`,
 * `Poké Pad` → `Poke Pad`.
 *
 * Serve **só ao nome da carta**, e essa assimetria é deles, não nossa:
 * nas 761 linhas dos dois exports, `Card (PT)` e `Card (EN)` não têm um
 * único caractere fora do ASCII, enquanto `Edicao (PTBR)` tem acento à
 * vontade ("Heróis Excelsos", "Escuridão Absoluta"). Mandar o nome
 * acentuado é arriscar que o casamento por nome no site deles falhe
 * justamente nas cartas em português.
 */
function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * O total de cartas da edição sai com zeros à esquerda até três dígitos.
 *
 * Descoberto comparando os dois exports: o primeiro trazia `217` e
 * parecia não ter regra, porque 217 já tem três dígitos. O segundo
 * trouxe `084` e `094` — e revelou o preenchimento. Sem isto, 270 das 327
 * linhas comparáveis divergiam do arquivo deles.
 */
function tresDigitos(n: number): string {
  return String(n).padStart(3, "0");
}

export interface CopiaParaExportar {
  setNomePt: string | null;
  setNomeEn: string | null;
  setSigla: string | null;
  cartaNomePt: string | null;
  cartaNomeEn: string | null;
  quantidade: number;
  condicao: Condicao;
  idioma: Idioma;
  raridade: string | null;
  /** "Pokémon"/"Pokemon", "Treinador"/"Trainer", "Energia"/"Energy". */
  categoria: string | null;
  tipos: readonly string[];
  variante: VarianteCopia;
  localId: string;
  notas: string | null;
  setQtdOficial: number;
}

/** Uma linha do CSV, já na ordem das colunas. */
export function linhaLiga(c: CopiaParaExportar): string[] {
  return [
    // Nome da EDIÇÃO mantém acento; nome da CARTA, não. Ver `semAcento`.
    c.setNomePt ?? "",
    c.setNomeEn ?? "",
    c.setSigla ?? "",
    semAcento(c.cartaNomePt ?? ""),
    semAcento(c.cartaNomeEn ?? ""),
    String(c.quantidade),
    QUALIDADE_POR_CONDICAO[c.condicao] ?? "",
    IDIOMA_LIGA[c.idioma] ?? "",
    (c.raridade && RARIDADE_LIGA[c.raridade]) ?? "",
    corDaCarta(c.categoria, c.tipos),
    EXTRAS_POR_VARIANTE[c.variante] ?? "",
    c.localId,
    // Comentário do arquivo deles é campo livre; a nota da cópia é o que
    // mais se parece com isso. Quebra de linha viraria linha nova no CSV,
    // então vira espaço.
    (c.notas ?? "").replace(/\s*\n\s*/g, " ").trim(),
    tresDigitos(c.setQtdOficial),
  ];
}

/**
 * A cor de uma carta.
 *
 * A categoria decide primeiro: Treinador é `C` e Energia é `E`,
 * independentemente do tipo que o catálogo registre. Só Pokémon usa a
 * letra do tipo; multi-tipo usa o primeiro, porque a coluna deles é uma
 * letra só. Tipo desconhecido sai em branco em vez de chutar.
 */
function corDaCarta(categoria: string | null, tipos: readonly string[]): string {
  const porCategoria = COR_POR_CATEGORIA[(categoria ?? "").toLowerCase()];
  if (porCategoria) return porCategoria;

  for (const tipo of tipos) {
    const letra = COR_POR_TIPO[tipo];
    if (letra) return letra;
  }
  return "";
}

/**
 * Escapa um campo do CSV **no estilo do arquivo deles**: aspas só quando
 * o campo tem espaço, vírgula, aspas ou quebra de linha.
 *
 * Não é a regra usual (que só citaria por vírgula/aspas). É a regra que
 * reproduz o arquivo deles byte a byte — `"Mega Gengar ex"` sai com
 * aspas, `ASC` e `Foil` sem. Ficar igual ao que o importador deles já
 * aceita vale mais que seguir a convenção.
 */
export function campoCsvLiga(valor: string): string {
  const precisaAspas = /[\s,"]/.test(valor);
  if (!precisaAspas) return valor;
  return `"${valor.replace(/"/g, '""')}"`;
}

export function linhaCsvLiga(campos: readonly string[]): string {
  return campos.map(campoCsvLiga).join(",");
}

/**
 * Máximo de CARTAS por arquivo — decisão de 2026-08-29: o site
 * dele aceita 995, e o cabeçalho não conta. Cada arquivo sai com até 996
 * linhas: 1 de cabeçalho + 995 de carta.
 */
export const MAX_CARTAS_POR_ARQUIVO = 995;

/**
 * Divide as linhas em blocos de no máximo `MAX_CARTAS_POR_ARQUIVO`.
 * Lista vazia devolve **um** bloco vazio: quem exporta pediu um arquivo, e
 * um CSV só com cabeçalho diz "nada a importar" melhor que um ZIP vazio.
 */
export function dividirEmArquivos<T>(
  itens: readonly T[],
  max = MAX_CARTAS_POR_ARQUIVO,
): T[][] {
  if (itens.length === 0) return [[]];
  const blocos: T[][] = [];
  for (let i = 0; i < itens.length; i += max) {
    blocos.push(itens.slice(i, i + max));
  }
  return blocos;
}

/**
 * Nome do arquivo dentro do ZIP. Numerado com o total à vista
 * (`1-de-3`), para o usuário saber na hora se baixou tudo e em que ordem
 * importar.
 */
export function nomeArquivoLiga(indice: number, total: number, data: string): string {
  const largura = String(total).length;
  const n = String(indice + 1).padStart(largura, "0");
  return `ligapokemon-${data}-${n}-de-${total}.csv`;
}

/**
 * O CSV completo de um bloco, com cabeçalho.
 *
 * Terminador **LF**, não CRLF, e com quebra também na última linha:
 * é o que o arquivo deles usa (conferido byte a byte no export de
 * 2026-08-29). O importador provavelmente aceita os dois, mas o que se
 * sabe é o que eles próprios geram.
 */
export function csvLiga(linhas: readonly (readonly string[])[]): string {
  return [linhaCsvLiga(COLUNAS_LIGA), ...linhas.map(linhaCsvLiga)].join("\n") + "\n";
}
