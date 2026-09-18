import { describe, expect, it } from "vitest";

import { crc32, montarZip } from "./zip";

const cod = new TextEncoder();

describe("crc32", () => {
  it("bate com os vetores conhecidos do CRC-32", () => {
    // Valores clássicos, os mesmos usados para conferir zlib e PNG. Se um
    // dia o ZIP sair corrompido, é aqui que se descobre se o problema é o
    // checksum ou o layout dos bytes.
    expect(crc32(cod.encode(""))).toBe(0);
    expect(crc32(cod.encode("a"))).toBe(0xe8b7be43);
    expect(crc32(cod.encode("abc"))).toBe(0x352441c2);
    expect(crc32(cod.encode("123456789"))).toBe(0xcbf43926);
  });

  it("é sensível à ordem dos bytes", () => {
    expect(crc32(cod.encode("ab"))).not.toBe(crc32(cod.encode("ba")));
  });
});

describe("montarZip", () => {
  const data = new Date(2026, 7, 29, 12, 30, 20);

  it("começa com a assinatura de local file header", () => {
    const zip = montarZip([{ nome: "a.csv", conteudo: cod.encode("x") }], data);
    expect([...zip.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it("termina com a assinatura de end of central directory", () => {
    const zip = montarZip([{ nome: "a.csv", conteudo: cod.encode("x") }], data);
    expect([...zip.slice(-22, -18)]).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });

  it("declara o número de entradas nos dois campos do EOCD", () => {
    const zip = montarZip(
      [
        { nome: "1.csv", conteudo: cod.encode("a") },
        { nome: "2.csv", conteudo: cod.encode("b") },
        { nome: "3.csv", conteudo: cod.encode("c") },
      ],
      data,
    );
    const eocd = zip.slice(-22);
    const nesteDisco = eocd[8] | (eocd[9] << 8);
    const total = eocd[10] | (eocd[11] << 8);
    expect(nesteDisco).toBe(3);
    expect(total).toBe(3);
  });

  it("guarda o conteúdo sem compressão, legível dentro do arquivo", () => {
    // Modo stored: os bytes do CSV aparecem literalmente no ZIP. É o que
    // permite conferir o conteúdo sem descompactar.
    const zip = montarZip([{ nome: "a.csv", conteudo: cod.encode("Mega Gengar ex") }], data);
    const texto = new TextDecoder().decode(zip);
    expect(texto).toContain("Mega Gengar ex");
  });

  it("ZIP vazio ainda é um ZIP válido", () => {
    const zip = montarZip([], data);
    expect(zip.length).toBe(22); // só o EOCD
    expect([...zip.slice(0, 4)]).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });

  it("marca o nome como UTF-8 para acento não virar lixo", () => {
    // Bit 11 do flag de propósito geral, no local header (offset 6).
    const zip = montarZip([{ nome: "coleção.csv", conteudo: cod.encode("x") }], data);
    const flag = zip[6] | (zip[7] << 8);
    expect(flag & 0x0800).toBe(0x0800);
  });

  it("data anterior a 1980 não é representável e não corrompe o arquivo", () => {
    // O campo de data do ZIP conta anos a partir de 1980; um valor
    // negativo estouraria o campo e quebraria o arquivo inteiro.
    const zip = montarZip([{ nome: "a.csv", conteudo: cod.encode("x") }], new Date(1970, 0, 1));
    expect([...zip.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect([...zip.slice(-22, -18)]).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });
});
