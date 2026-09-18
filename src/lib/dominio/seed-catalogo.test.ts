import { describe, expect, it } from "vitest";

import {
  COLUNAS_CATALOGO,
  COLUNAS_SET_MYPCARDS,
  analisarCsv,
  converterLinhaCatalogo,
  converterLinhaSetMypcards,
  lerRegistrosCsv,
  type RegistroCsv,
} from "./seed-catalogo";

/** Linha real do seed (a primeira de `carta-catalogo.csv.gz`), como o
 * `COPY ... FORMAT csv` do Postgres a escreve. */
const CABECALHO_REAL = COLUNAS_CATALOGO.join(",");
const LINHA_REAL =
  "bw1-1,pt,bw1,Black & White,Black & White,bw,BLW,2011-04-25,1,Snivy," +
  'Pokémon,Comum,[495],normal,sync,t,f,f,f,f,"[""Grass""]",f,' +
  "https://assets.tcgdex.net/pt/bw/bw1/1,,,Kagemaru Himeno,114,115,t";

function registroReal(): RegistroCsv {
  return lerRegistrosCsv(`${CABECALHO_REAL}\n${LINHA_REAL}\n`, COLUNAS_CATALOGO)[0];
}

describe("analisarCsv", () => {
  it("separa campos e registros simples", () => {
    expect(analisarCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("distingue campo NULL (vazio sem aspas) de string vazia (aspas)", () => {
    // É a diferença que faz `raridade` chegar como null em vez de ''.
    expect(analisarCsv('a,"",b\n')).toEqual([["a", "", "b"]]);
    expect(analisarCsv("a,,b\n")).toEqual([["a", null, "b"]]);
  });

  it("preserva vírgula, aspa dobrada e quebra de linha dentro do campo", () => {
    expect(analisarCsv('"x, y","diz ""oi""","linha1\nlinha2"\n')).toEqual([
      ["x, y", 'diz "oi"', "linha1\nlinha2"],
    ]);
  });

  it("aceita CRLF como fim de registro", () => {
    expect(analisarCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("aceita última linha sem quebra final", () => {
    expect(analisarCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("recusa aspa que nunca fecha", () => {
    expect(() => analisarCsv('a,"sem fim\n')).toThrow(/nunca é fechada/);
  });

  it("recusa lixo depois da aspa de fechamento", () => {
    expect(() => analisarCsv('"a"b,c\n')).toThrow(/lixo depois da aspa/);
  });
});

describe("lerRegistrosCsv", () => {
  it("casa cada registro com o cabeçalho pelo nome, não pela posição", () => {
    const registros = lerRegistrosCsv("b,a\n2,1\n", ["a", "b"]);
    expect(registros).toEqual([{ a: "1", b: "2" }]);
  });

  it("recusa cabeçalho com coluna faltando ou sobrando", () => {
    expect(() => lerRegistrosCsv("a\n1\n", ["a", "b"])).toThrow(/Faltando: \[b\]/);
    expect(() => lerRegistrosCsv("a,b,c\n1,2,3\n", ["a", "b"])).toThrow(
      /Não esperadas: \[c\]/,
    );
  });

  it("recusa linha com número de campos diferente do cabeçalho", () => {
    expect(() => lerRegistrosCsv("a,b\n1,2,3\n", ["a", "b"])).toThrow(
      /Linha 2 do CSV tem 3 campos/,
    );
  });

  it("ignora linha em branco no meio do arquivo", () => {
    expect(lerRegistrosCsv("a,b\n1,2\n\n3,4\n", ["a", "b"])).toHaveLength(2);
  });

  it("recusa arquivo vazio", () => {
    expect(() => lerRegistrosCsv("", ["a"])).toThrow(/CSV vazio/);
  });
});

describe("converterLinhaCatalogo", () => {
  it("converte uma linha real do seed no formato de carta_catalogo", () => {
    expect(converterLinhaCatalogo(registroReal())).toEqual({
      id: "bw1-1",
      idioma: "pt",
      setId: "bw1",
      setNome: "Black & White",
      setSerie: "Black & White",
      setSerieId: "bw",
      setSigla: "BLW",
      setLancamento: "2011-04-25",
      localId: "1",
      nome: "Snivy",
      categoria: "Pokémon",
      raridade: "Comum",
      dexIds: [495],
      forma: "normal",
      origem: "sync",
      varianteNormalDisponivel: true,
      varianteReverseDisponivel: false,
      varianteHoloDisponivel: false,
      variantePrimeiraEdicaoDisponivel: false,
      variantePromoDisponivel: false,
      tipos: ["Grass"],
      dexIdsDerivado: false,
      imagemUrl: "https://assets.tcgdex.net/pt/bw/bw1/1",
      imagemCdnExiste: null,
      imagemCdnVerificadoEm: null,
      ilustrador: "Kagemaru Himeno",
      setQtdOficial: 114,
      setQtdTotal: 115,
      ativa: true,
    });
  });

  it("é determinístico: a mesma linha sempre vira a mesma coisa", () => {
    // Base da idempotência: o upsert por (id, idioma) só não altera nada na
    // segunda rodada porque a conversão não inventa valor a cada leitura.
    expect(converterLinhaCatalogo(registroReal())).toEqual(
      converterLinhaCatalogo(registroReal()),
    );
  });

  it("não traz criado_em nem atualizado_em — são do relógio do banco", () => {
    const linha = converterLinhaCatalogo(registroReal());
    expect(linha).not.toHaveProperty("criadoEm");
    expect(linha).not.toHaveProperty("atualizadoEm");
  });

  it("lê arrays vazios e campos nulos", () => {
    const csv =
      `${CABECALHO_REAL}\n` +
      "mee-1,en,mee,Set,Serie,,,,1,Energia,Energy,,[],normal,sync," +
      "f,f,f,f,f,[],f,,,,,10,10,f\n";
    const linha = converterLinhaCatalogo(
      lerRegistrosCsv(csv, COLUNAS_CATALOGO)[0],
    );
    expect(linha.dexIds).toEqual([]);
    expect(linha.tipos).toEqual([]);
    expect(linha.raridade).toBeNull();
    expect(linha.ilustrador).toBeNull();
    expect(linha.setSigla).toBeNull();
    expect(linha.setSerieId).toBeNull();
    expect(linha.setLancamento).toBeNull();
    expect(linha.imagemUrl).toBeNull();
    expect(linha.ativa).toBe(false);
  });

  it("lê a data/hora de verificação do CDN como Date em UTC", () => {
    const csv =
      `${CABECALHO_REAL}\n` +
      "SMH-11,jp,SMH,Set,Serie,SM,,,11,Charmander,Pokemon,,[4],normal,manual," +
      "t,f,f,f,f,[],f,,t,2026-08-29T12:34:56.789Z,,131,131,t\n";
    const linha = converterLinhaCatalogo(
      lerRegistrosCsv(csv, COLUNAS_CATALOGO)[0],
    );
    expect(linha.origem).toBe("manual");
    expect(linha.imagemCdnExiste).toBe(true);
    expect(linha.imagemCdnVerificadoEm).toEqual(
      new Date("2026-08-29T12:34:56.789Z"),
    );
  });

  it("aceita booleano escrito como true/false além de t/f", () => {
    const registro = { ...registroReal(), ativa: "false" };
    expect(converterLinhaCatalogo(registro).ativa).toBe(false);
  });

  it("recusa idioma ou forma fora do enum, em vez de deixar o banco decidir", () => {
    expect(() =>
      converterLinhaCatalogo({ ...registroReal(), idioma: "es" }),
    ).toThrow(/'idioma' tem valor fora do enum/);
    expect(() =>
      converterLinhaCatalogo({ ...registroReal(), forma: "kanto" }),
    ).toThrow(/'forma' tem valor fora do enum/);
  });

  it("recusa campo obrigatório vazio", () => {
    expect(() =>
      converterLinhaCatalogo({ ...registroReal(), nome: null }),
    ).toThrow(/'nome' é obrigatória/);
  });

  it("recusa booleano, inteiro e array malformados", () => {
    expect(() =>
      converterLinhaCatalogo({ ...registroReal(), ativa: "sim" }),
    ).toThrow(/'ativa' não é um booleano/);
    expect(() =>
      converterLinhaCatalogo({ ...registroReal(), set_qtd_oficial: "114.5" }),
    ).toThrow(/'set_qtd_oficial' não é um inteiro/);
    expect(() =>
      converterLinhaCatalogo({ ...registroReal(), dex_ids: "495" }),
    ).toThrow(/'dex_ids' deveria ser um array JSON/);
    expect(() =>
      converterLinhaCatalogo({ ...registroReal(), dex_ids: '["495"]' }),
    ).toThrow(/'dex_ids' deveria conter só inteiros/);
    expect(() =>
      converterLinhaCatalogo({ ...registroReal(), tipos: "[1]" }),
    ).toThrow(/'tipos' deveria conter só textos/);
  });
});

describe("converterLinhaSetMypcards", () => {
  it("converte a linha do mapeamento de set", () => {
    const csv =
      "set_id,numero,origem_url\n" +
      "mee,2370,https://img.mypcards.com/img/2/2370/pokemon_mee_004/pokemon_mee_004_pt.jpg\n";
    const registros = lerRegistrosCsv(csv, COLUNAS_SET_MYPCARDS);
    expect(converterLinhaSetMypcards(registros[0])).toEqual({
      setId: "mee",
      numero: 2370,
      origemUrl:
        "https://img.mypcards.com/img/2/2370/pokemon_mee_004/pokemon_mee_004_pt.jpg",
    });
  });

  it("recusa número que não é inteiro", () => {
    expect(() =>
      converterLinhaSetMypcards({
        set_id: "mee",
        numero: "dois mil",
        origem_url: "https://exemplo",
      }),
    ).toThrow(/'numero' não é um inteiro/);
  });
});
