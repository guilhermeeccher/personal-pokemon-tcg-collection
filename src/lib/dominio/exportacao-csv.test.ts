import { describe, expect, it } from "vitest";

import {
  adapterNossoCsvColecao,
  adapterNossoCsvInventario,
  escaparCampoCsv,
  formatarDecimalBr,
  gerarCsv,
  nomeArquivoColecao,
  nomeArquivoInventario,
  slugificar,
  type LinhaExportacaoColecao,
  type LinhaExportacaoInventario,
} from "./exportacao-csv";

/**
 * Parser CSV mínimo, só para teste: respeita separador `;`, aspas
 * duplas (incluindo `""` escapado) e quebra `\r\n` como fim de linha —
 * quebra de linha DENTRO de aspas não conta como novo registro. Existe
 * só para provar, de fora, que `gerarCsv` produz um arquivo válido
 * (mesmo teste que um humano abrindo no Excel faria "na mão").
 */
function parseCsv(textoOriginal: string): string[][] {
  const texto = textoOriginal.startsWith("﻿") ? textoOriginal.slice(1) : textoOriginal;
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let dentroAspas = false;
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (dentroAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i += 2;
          continue;
        }
        dentroAspas = false;
        i++;
        continue;
      }
      campo += c;
      i++;
      continue;
    }
    if (c === '"') {
      dentroAspas = true;
      i++;
      continue;
    }
    if (c === ";") {
      linha.push(campo);
      campo = "";
      i++;
      continue;
    }
    if (c === "\r" && texto[i + 1] === "\n") {
      linha.push(campo);
      linhas.push(linha);
      campo = "";
      linha = [];
      i += 2;
      continue;
    }
    campo += c;
    i++;
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

const LINHA_BASE: LinhaExportacaoInventario = {
  cartaNome: "Pikachu",
  cartaLocalId: "025",
  setNome: "Base Set",
  setSigla: "BS",
  idioma: "pt",
  variante: "holo",
  condicao: "NM",
  quantidade: 1,
  gradedEmpresa: null,
  gradedNota: null,
  gradedCertificado: null,
  localizacao: "Fichário 1, pág. 3",
  aquisicaoData: "2026-01-10",
  aquisicaoOrigem: "Loja X",
  aquisicaoPreco: "12.50",
  notas: null,
};

describe("escaparCampoCsv", () => {
  it("campo simples sai igual, sem aspas", () => {
    expect(escaparCampoCsv("Pikachu")).toBe("Pikachu");
  });

  it("campo vazio sai vazio", () => {
    expect(escaparCampoCsv("")).toBe("");
  });

  it("campo contendo o próprio separador (;) fica entre aspas", () => {
    expect(escaparCampoCsv("comprado; trocado depois")).toBe('"comprado; trocado depois"');
  });

  it("campo com aspas duplas fica entre aspas, com as internas dobradas", () => {
    expect(escaparCampoCsv('carta "premiada"')).toBe('"carta ""premiada"""');
  });

  it("campo com quebra de linha (\\n) fica entre aspas", () => {
    expect(escaparCampoCsv("linha 1\nlinha 2")).toBe('"linha 1\nlinha 2"');
  });

  it("campo com \\r fica entre aspas", () => {
    expect(escaparCampoCsv("linha 1\rlinha 2")).toBe('"linha 1\rlinha 2"');
  });

  it("combina separador, aspas e quebra de linha no mesmo campo", () => {
    const bruto = 'nota; com "aspas"\ne quebra';
    const escapado = escaparCampoCsv(bruto);
    expect(escapado).toBe('"nota; com ""aspas""\ne quebra"');
    // e volta ao original ao remover só o envelope de aspas e desfazer o dobramento.
    expect(escapado.slice(1, -1).replace(/""/g, '"')).toBe(bruto);
  });
});

describe("formatarDecimalBr", () => {
  it("null vira string vazia", () => {
    expect(formatarDecimalBr(null)).toBe("");
  });

  it("troca ponto por vírgula", () => {
    expect(formatarDecimalBr("12.50")).toBe("12,50");
  });

  it("valor inteiro com duas casas (0.00) também troca", () => {
    expect(formatarDecimalBr("0.00")).toBe("0,00");
  });
});

describe("slugificar", () => {
  it("remove acentos e baixa a caixa", () => {
    expect(slugificar("Pokédex")).toBe("pokedex");
  });

  it("troca espaço e caracteres não alfanuméricos por hífen, sem hífen nas pontas", () => {
    expect(slugificar("  Coleção Básica! ")).toBe("colecao-basica");
  });
});

describe("nomeArquivoInventario / nomeArquivoColecao", () => {
  it("monta nome de arquivo do inventário com a data", () => {
    expect(nomeArquivoInventario("2026-08-25")).toBe("inventario-pokemon-2026-08-25.csv");
  });

  it("monta nome de arquivo da coleção com nome slugificado e data", () => {
    expect(nomeArquivoColecao("Pokédex Kanto", "2026-08-25")).toBe(
      "colecao-pokedex-kanto-2026-08-25.csv",
    );
  });
});

describe("gerarCsv — adapter do inventário", () => {
  it("começa com BOM UTF-8", () => {
    const csv = gerarCsv(adapterNossoCsvInventario, [LINHA_BASE]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("primeira linha é o cabeçalho, com as colunas esperadas na ordem", () => {
    const csv = gerarCsv(adapterNossoCsvInventario, []);
    const linhas = parseCsv(csv);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toEqual([
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
    ]);
  });

  it("uma cópia com quantidade = 3 gera UMA linha, com a coluna quantidade valendo 3", () => {
    const csv = gerarCsv(adapterNossoCsvInventario, [{ ...LINHA_BASE, quantidade: 3 }]);
    const linhas = parseCsv(csv);
    // cabeçalho + 1 linha de dados, nunca 3.
    expect(linhas).toHaveLength(2);
    expect(linhas[1][7]).toBe("3");
  });

  it("número de linhas de dados confere com número de itens passados", () => {
    const itens = [LINHA_BASE, { ...LINHA_BASE, cartaNome: "Raichu" }, { ...LINHA_BASE, cartaNome: "Bulbasaur" }];
    const csv = gerarCsv(adapterNossoCsvInventario, itens);
    const linhas = parseCsv(csv);
    expect(linhas).toHaveLength(1 + itens.length);
  });

  it("preço vem em formato brasileiro (vírgula decimal) na célula da planilha", () => {
    const csv = gerarCsv(adapterNossoCsvInventario, [{ ...LINHA_BASE, aquisicaoPreco: "199.90" }]);
    const linhas = parseCsv(csv);
    expect(linhas[1][14]).toBe("199,90");
  });

  it("campos nulos saem como célula vazia, não como a string 'null'", () => {
    const csv = gerarCsv(adapterNossoCsvInventario, [
      { ...LINHA_BASE, gradedEmpresa: null, gradedNota: null, gradedCertificado: null, localizacao: null, notas: null },
    ]);
    const linhas = parseCsv(csv);
    expect(linhas[1][8]).toBe("");
    expect(linhas[1][11]).toBe("");
    expect(linhas[1][15]).toBe("");
  });

  it(
    "teste que importa: notas com separador, aspas duplas e quebra de linha real — " +
      "o arquivo continua com o número certo de linhas e de colunas",
    () => {
      const notaComplicada = 'Comprada; trocada com "fulano"\nna feira de trocas';
      const itens: LinhaExportacaoInventario[] = [
        { ...LINHA_BASE, notas: notaComplicada },
        { ...LINHA_BASE, cartaNome: "Charizard" }, // linha normal logo depois, não pode ser engolida
      ];
      const csv = gerarCsv(adapterNossoCsvInventario, itens);
      const linhas = parseCsv(csv);

      // cabeçalho + 2 itens = 3 linhas, nunca mais (quebra de linha na nota
      // não pode virar registro novo) nem menos (aspas não podem "vazar"
      // e engolir a linha seguinte).
      expect(linhas).toHaveLength(3);
      // todas as linhas têm o mesmo número de colunas do cabeçalho.
      for (const linha of linhas) expect(linha).toHaveLength(16);
      // a nota volta exatamente como estava, quebra de linha incluída.
      expect(linhas[1][15]).toBe(notaComplicada);
      expect(linhas[2][0]).toBe("Charizard");
    },
  );
});

describe("gerarCsv — adapter da coleção", () => {
  const LINHA_COLECAO: LinhaExportacaoColecao = { ...LINHA_BASE, vagaChave: "25" };

  it("cabeçalho da coleção é o do inventário mais a coluna Vaga ao final", () => {
    const csv = gerarCsv(adapterNossoCsvColecao, []);
    const [cabecalho] = parseCsv(csv);
    expect(cabecalho.at(-1)).toBe("Vaga");
    expect(cabecalho).toHaveLength(17);
  });

  it("linha de dados carrega a chave da vaga na última coluna", () => {
    const csv = gerarCsv(adapterNossoCsvColecao, [LINHA_COLECAO]);
    const linhas = parseCsv(csv);
    expect(linhas[1].at(-1)).toBe("25");
  });
});
