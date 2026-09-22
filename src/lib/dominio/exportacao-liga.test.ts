import { describe, expect, it } from "vitest";

import {
  campoCsvLiga,
  COLUNAS_LIGA,
  csvLiga,
  dividirEmArquivos,
  linhaCsvLiga,
  linhaLiga,
  MAX_CARTAS_POR_ARQUIVO,
  nomeArquivoLiga,
  type CopiaParaExportar,
} from "./exportacao-liga";

/** O cabeçalho do arquivo real de exportação do site deles, verbatim. */
const CABECALHO_REAL =
  '"Edicao (PTBR)","Edicao (EN)","Edicao (Sigla)","Card (PT)","Card (EN)",Quantidade,"Qualidade (M NM SP MP HP D)","Idioma (BR EN DE ES FR IT JP KO RU TW)","Raridade (C I U R H E X U P A L S)","Cor (C D O E Y F R G L M P W)",Extras,"Card #",Comentario,"# Cards na Edicao"';

const GENGAR: CopiaParaExportar = {
  setNomePt: "Heróis Excelsos",
  setNomeEn: "Ascended Heroes",
  setSigla: "ASC",
  cartaNomePt: "Mega Gengar ex",
  cartaNomeEn: "Mega Gengar ex",
  quantidade: 1,
  condicao: "NM",
  idioma: "pt",
  raridade: "Ultra Rara",
  categoria: "Pokémon",
  tipos: ["Darkness"],
  variante: "holo",
  localId: "269",
  notas: null,
  setQtdOficial: 217,
};

describe("campoCsvLiga", () => {
  it("cita só quando o campo tem espaço, vírgula ou aspas", () => {
    // Não é a convenção usual de CSV — é a regra que reproduz o arquivo
    // deles byte a byte.
    expect(campoCsvLiga("ASC")).toBe("ASC");
    expect(campoCsvLiga("Foil")).toBe("Foil");
    expect(campoCsvLiga("269")).toBe("269");
    expect(campoCsvLiga("")).toBe("");
    expect(campoCsvLiga("Mega Gengar ex")).toBe('"Mega Gengar ex"');
    expect(campoCsvLiga("a,b")).toBe('"a,b"');
  });

  it("duplica aspas internas", () => {
    expect(campoCsvLiga('diz "oi"')).toBe('"diz ""oi"""');
  });
});

describe("cabeçalho", () => {
  it("é idêntico ao do arquivo real da LigaPokemon", () => {
    // Se esta linha quebrar, o formato mudou do lado deles — ou alguém
    // "arrumou" a ordem das colunas aqui.
    expect(linhaCsvLiga(COLUNAS_LIGA)).toBe(CABECALHO_REAL);
  });
});

describe("linhaLiga", () => {
  it("reproduz o exemplo real nas colunas que sabemos preencher", () => {
    const l = linhaLiga(GENGAR);
    expect(l[0]).toBe("Heróis Excelsos");
    expect(l[1]).toBe("Ascended Heroes");
    expect(l[2]).toBe("ASC");
    expect(l[3]).toBe("Mega Gengar ex");
    expect(l[5]).toBe("1");
    expect(l[6]).toBe("NM");
    expect(l[7]).toBe("PT");
    expect(l[9]).toBe("D"); // Darkness — confirmado pelo exemplo
    expect(l[11]).toBe("269");
    expect(l[13]).toBe("217");
  });

  it("mapeia a escala de condição para a deles", () => {
    expect(linhaLiga({ ...GENGAR, condicao: "LP" })[6]).toBe("SP");
    expect(linhaLiga({ ...GENGAR, condicao: "MP" })[6]).toBe("MP");
    expect(linhaLiga({ ...GENGAR, condicao: "HP" })[6]).toBe("HP");
    expect(linhaLiga({ ...GENGAR, condicao: "DMG" })[6]).toBe("D");
  });

  it("carta de dois tipos usa o primeiro — a coluna deles é uma letra só", () => {
    expect(linhaLiga({ ...GENGAR, tipos: ["Grass", "Darkness"] })[9]).toBe("G");
  });

  it("quebra de linha na nota vira espaço, para não virar linha nova no CSV", () => {
    expect(linhaLiga({ ...GENGAR, notas: "canto\namassado" })[12]).toBe("canto amassado");
  });

  it("tira o acento do nome da CARTA, mas não do nome da edição", () => {
    // Assimetria deles, não nossa: em 761 linhas de export, Card (PT) e
    // Card (EN) não têm um caractere fora do ASCII, e Edicao (PTBR) tem
    // acento à vontade. Mandar acentuado arrisca o casamento por nome.
    const l = linhaLiga({
      ...GENGAR,
      setNomePt: "Heróis Excelsos",
      cartaNomePt: "Maçarico",
      cartaNomeEn: "Poké Pad",
    });
    expect(l[0]).toBe("Heróis Excelsos");
    expect(l[3]).toBe("Macarico");
    expect(l[4]).toBe("Poke Pad");
  });

  it("o total da edição sai com três dígitos", () => {
    // Só apareceu no segundo export: 084 e 094. No primeiro, 217 já tinha
    // três dígitos e escondia a regra — e 270 das 327 linhas comparáveis
    // divergiam por causa disso.
    expect(linhaLiga({ ...GENGAR, setQtdOficial: 94 })[13]).toBe("094");
    expect(linhaLiga({ ...GENGAR, setQtdOficial: 84 })[13]).toBe("084");
    expect(linhaLiga({ ...GENGAR, setQtdOficial: 217 })[13]).toBe("217");
  });

  it("campo nulo do catálogo não vira 'null' no arquivo", () => {
    const l = linhaLiga({ ...GENGAR, setSigla: null, cartaNomeEn: null });
    expect(l[2]).toBe("");
    expect(l[4]).toBe("");
  });
});

describe("Cor — aprendida das 760 linhas do segundo export", () => {
  const cor = (c: Partial<CopiaParaExportar>) => linhaLiga({ ...GENGAR, ...c })[9];

  it("Pokémon usa a letra do tipo", () => {
    // Todos confirmados contra o arquivo real, exceto Fairy, que não
    // apareceu na amostra.
    expect(cor({ tipos: ["Psychic"] })).toBe("P");
    expect(cor({ tipos: ["Darkness"] })).toBe("D");
    expect(cor({ tipos: ["Water"] })).toBe("W");
    expect(cor({ tipos: ["Grass"] })).toBe("G");
    expect(cor({ tipos: ["Colorless"] })).toBe("C");
    expect(cor({ tipos: ["Fighting"] })).toBe("F");
    expect(cor({ tipos: ["Fire"] })).toBe("R");
    expect(cor({ tipos: ["Lightning"] })).toBe("L");
    expect(cor({ tipos: ["Metal"] })).toBe("M");
  });

  it("Dragon é O — a letra que faltava, agora com 20 exemplos", () => {
    expect(cor({ tipos: ["Dragon"] })).toBe("O");
  });

  it("Treinador é sempre C, qualquer que seja o tipo", () => {
    // 113 de 113 no arquivo deles.
    expect(cor({ categoria: "Treinador", tipos: [] })).toBe("C");
    expect(cor({ categoria: "Trainer", tipos: [] })).toBe("C");
  });

  it("Energia é E — a categoria manda, não o tipo", () => {
    // "Energia Psíquica" tem tipo Psychic no nosso catálogo e sai como E,
    // não P. E não é um tipo de Pokémon: é a categoria.
    expect(cor({ categoria: "Energia", tipos: ["Psychic"] })).toBe("E");
    expect(cor({ categoria: "Energy", tipos: ["Water"] })).toBe("E");
  });

  it("Pokémon sem tipo conhecido sai em branco, em vez de chutar", () => {
    expect(cor({ categoria: "Pokémon", tipos: [] })).toBe("");
    expect(cor({ categoria: "Pokémon", tipos: ["Tipo Inventado"] })).toBe("");
  });
});

describe("Raridade — só o que mapeia sem ambiguidade", () => {
  const rar = (raridade: string | null) => linhaLiga({ ...GENGAR, raridade })[8];

  it("as seis confirmadas em 605 linhas", () => {
    expect(rar("Comum")).toBe("C");
    expect(rar("Incomum")).toBe("U");
    expect(rar("Rara Dupla")).toBe("RD");
    expect(rar("Ilustração Rara")).toBe("IR");
    expect(rar("Ilustração Rara Especial")).toBe("IS");
    expect(rar("Hiper rara")).toBe("HR");
  });

  it("aceita também a grafia em inglês do catálogo", () => {
    // Cópia identificada por linha de catálogo `en` traz "Common", não
    // "Comum". Sem isto, a mesma carta exportaria diferente conforme o
    // idioma do catálogo que a identificou.
    expect(rar("Common")).toBe("C");
    expect(rar("Double rare")).toBe("RD");
    expect(rar("Special illustration rare")).toBe("IS");
  });

  it("as ambíguas saem em branco, nunca chutadas", () => {
    // "Rara" é R ou RH conforme o set; "Ultra Rara" é RU, SR ou MA. O
    // discriminador não existe no nosso dado — testei até as flags de
    // variante, que são idênticas nos dois grupos.
    expect(rar("Rara")).toBe("");
    expect(rar("Ultra Rara")).toBe("");
    expect(rar("Mega Hiper Raro")).toBe("");
  });

  it("raridade desconhecida ou nula não quebra a linha", () => {
    expect(rar("Promo")).toBe("");
    expect(rar(null)).toBe("");
  });
});

describe("Extras — vocabulário deles", () => {
  const extras = (variante: CopiaParaExportar["variante"]) =>
    linhaLiga({ ...GENGAR, variante })[10];

  it("holo é Foil — confirmado na exportação da coleção do usuário", () => {
    expect(extras("holo")).toBe("Foil");
  });

  it("reverse e promo usam os termos deles", () => {
    expect(extras("reverse")).toBe("Reverse Foil");
    expect(extras("promo")).toBe("Promo");
  });

  it("normal e primeira edição saem em branco", () => {
    expect(extras("normal")).toBe("");
    expect(extras("primeira_edicao")).toBe("");
  });
});

describe("dividirEmArquivos", () => {
  const itens = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("cabe num arquivo só até o limite", () => {
    expect(dividirEmArquivos(itens(995))).toHaveLength(1);
  });

  it("passou do limite, abre o segundo arquivo", () => {
    const blocos = dividirEmArquivos(itens(996));
    expect(blocos).toHaveLength(2);
    expect(blocos[0]).toHaveLength(995);
    expect(blocos[1]).toHaveLength(1);
  });

  it("o exemplo que o usuário deu: 1100 cartas viram dois arquivos", () => {
    const blocos = dividirEmArquivos(itens(1100));
    expect(blocos).toHaveLength(2);
    expect(blocos[0]).toHaveLength(995);
    expect(blocos[1]).toHaveLength(105);
  });

  it("nenhum bloco passa do limite, em volume grande", () => {
    const blocos = dividirEmArquivos(itens(5000));
    expect(blocos).toHaveLength(6);
    for (const b of blocos) expect(b.length).toBeLessThanOrEqual(MAX_CARTAS_POR_ARQUIVO);
    expect(blocos.flat()).toHaveLength(5000);
  });

  it("inventário vazio gera um arquivo, não zero", () => {
    // Um CSV só com cabeçalho diz "nada a importar"; um ZIP vazio parece
    // download quebrado.
    expect(dividirEmArquivos([])).toEqual([[]]);
  });

  it("não perde nem duplica linha", () => {
    const original = itens(2500);
    expect(dividirEmArquivos(original).flat()).toEqual(original);
  });
});

describe("csvLiga", () => {
  it("abre com o cabeçalho e termina com quebra de linha", () => {
    const csv = csvLiga([linhaLiga(GENGAR)]);
    expect(csv.startsWith(CABECALHO_REAL)).toBe(true);
    expect(csv.endsWith("\n")).toBe(true);
  });

  it("usa LF, nunca CRLF — é o que o arquivo deles usa", () => {
    expect(csvLiga([linhaLiga(GENGAR)])).not.toContain("\r");
  });

  it("bloco vazio ainda sai com cabeçalho", () => {
    expect(csvLiga([]).trim()).toBe(CABECALHO_REAL);
  });
});

describe("nomeArquivoLiga", () => {
  it("numera com o total à vista", () => {
    expect(nomeArquivoLiga(0, 2, "2026-08-29")).toBe("ligapokemon-2026-08-29-1-de-2.csv");
    expect(nomeArquivoLiga(1, 2, "2026-08-29")).toBe("ligapokemon-2026-08-29-2-de-2.csv");
  });

  it("alinha os números para o nome ordenar direito com muitos arquivos", () => {
    // Sem o zero à esquerda, "10" viria antes de "2" na listagem.
    expect(nomeArquivoLiga(1, 12, "2026-08-29")).toBe("ligapokemon-2026-08-29-02-de-12.csv");
    expect(nomeArquivoLiga(11, 12, "2026-08-29")).toBe("ligapokemon-2026-08-29-12-de-12.csv");
  });
});
