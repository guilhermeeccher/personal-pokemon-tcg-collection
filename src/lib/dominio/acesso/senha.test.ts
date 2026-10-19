import { describe, expect, it } from "vitest";

import {
  analisarHashSenha,
  gerarHashSenha,
  normalizarSenha,
  TAMANHO_MAXIMO_SENHA,
  TAMANHO_MINIMO_SENHA,
  tamanhoSenha,
  verificarSenha,
} from "./senha";

// O scrypt real leva ~100 ms: poucos casos com ele, e um hash gerado só uma vez.
const SENHA = "senha-de-teste-bem-comprida";
const SAL = "A".repeat(21) + "A"; // 22 caracteres = 16 bytes
const HASH = "B".repeat(42) + "A"; // 43 caracteres = 32 bytes

describe("analisarHashSenha", () => {
  it("aceita o formato com os parâmetros fixos", () => {
    const h = analisarHashSenha(`scrypt:32768:8:1:${SAL}:${HASH}`);
    expect(h?.sal.length).toBe(16);
    expect(h?.hash.length).toBe(32);
  });

  it.each([
    ["N diferente", `scrypt:16384:8:1:${SAL}:${HASH}`],
    ["N gigante", `scrypt:1073741824:8:1:${SAL}:${HASH}`],
    ["N com zero à esquerda", `scrypt:032768:8:1:${SAL}:${HASH}`],
    ["r diferente", `scrypt:32768:16:1:${SAL}:${HASH}`],
    ["p diferente", `scrypt:32768:8:2:${SAL}:${HASH}`],
    ["outro esquema", `argon2:32768:8:1:${SAL}:${HASH}`],
    ["campo a menos", `scrypt:32768:8:1:${SAL}`],
    ["campo a mais", `scrypt:32768:8:1:${SAL}:${HASH}:x`],
    ["separador $", `$scrypt$32768$8$1$${SAL}$${HASH}`],
    ["sal curto", `scrypt:32768:8:1:${SAL.slice(1)}:${HASH}`],
    ["hash longo", `scrypt:32768:8:1:${SAL}:${HASH}AAAA`],
    ["base64 com +", `scrypt:32768:8:1:${SAL.slice(1)}+:${HASH}`],
    ["com =", `scrypt:32768:8:1:${SAL}==:${HASH}`],
    ["bits sobrando (não canônico)", `scrypt:32768:8:1:${SAL.slice(0, 21)}B:${HASH}`],
    ["espaço em volta", ` scrypt:32768:8:1:${SAL}:${HASH}`],
    ["vazio", ""],
  ])("recusa %s", (_, texto) => {
    expect(analisarHashSenha(texto)).toBeNull();
  });
});

describe("gerar e verificar", () => {
  it("o hash gerado tem o formato, verifica a senha certa e recusa as erradas", async () => {
    const texto = await gerarHashSenha(SENHA);
    expect(texto).toMatch(/^scrypt:32768:8:1:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/);
    const hash = analisarHashSenha(texto);
    expect(hash).not.toBeNull();
    if (!hash) return;

    expect(await verificarSenha(SENHA, hash)).toBe(true);
    expect(await verificarSenha(SENHA + "x", hash)).toBe(false);
    expect(await verificarSenha("", hash)).toBe(false);
  });

  it("sal aleatório: a mesma senha gera hashes diferentes", async () => {
    const [a, b] = await Promise.all([gerarHashSenha(SENHA), gerarHashSenha(SENHA)]);
    expect(a).not.toBe(b);
  });

  it("senha acima do teto é false sem rodar scrypt", async () => {
    const hash = analisarHashSenha(`scrypt:32768:8:1:${SAL}:${HASH}`);
    if (!hash) throw new Error("hash de teste inválido");
    const inicio = performance.now();
    expect(await verificarSenha("x".repeat(TAMANHO_MAXIMO_SENHA + 1), hash)).toBe(false);
    expect(performance.now() - inicio).toBeLessThan(20);
  });

  it("gerar recusa senha fora dos limites", async () => {
    await expect(gerarHashSenha("x".repeat(TAMANHO_MINIMO_SENHA - 1))).rejects.toThrow(RangeError);
    await expect(gerarHashSenha("x".repeat(TAMANHO_MAXIMO_SENHA + 1))).rejects.toThrow(RangeError);
  });

  it("forma composta e decomposta verificam uma contra a outra", async () => {
    const composta = "senha-com-acento-\u00e1\u00e9";
    const decomposta = "senha-com-acento-a\u0301e\u0301";
    expect(composta).not.toBe(decomposta);
    const deUm = analisarHashSenha(await gerarHashSenha(composta));
    const deOutro = analisarHashSenha(await gerarHashSenha(decomposta));
    if (!deUm || !deOutro) throw new Error("hash gerado inválido");
    expect(await verificarSenha(decomposta, deUm)).toBe(true);
    expect(await verificarSenha(composta, deOutro)).toBe(true);
  });

  it("o mínimo vale depois da NFC e em pontos de código", async () => {
    const decomposta = "a\u0301".repeat(8); // length 16, mas oito "á"
    expect(decomposta.length).toBe(16);
    expect(tamanhoSenha(decomposta)).toBe(8);
    await expect(gerarHashSenha(decomposta)).rejects.toThrow(RangeError);
    await expect(gerarHashSenha("\u00e1".repeat(8))).rejects.toThrow(RangeError);

    const foraDoBmp = "\u{1F600}".repeat(8); // length 16, oito caracteres
    expect(foraDoBmp.length).toBe(16);
    expect(tamanhoSenha(foraDoBmp)).toBe(8);
    await expect(gerarHashSenha(foraDoBmp)).rejects.toThrow(RangeError);
  });

  it("o teto de verificação também é em pontos de código depois da NFC", async () => {
    const hash = analisarHashSenha(`scrypt:32768:8:1:${SAL}:${HASH}`);
    if (!hash) throw new Error("hash de teste inválido");
    // 257 caracteres: acima do teto contando certo, nos dois jeitos de chegar lá.
    const inicio = performance.now();
    expect(await verificarSenha("\u{1F600}".repeat(TAMANHO_MAXIMO_SENHA + 1), hash)).toBe(false);
    expect(await verificarSenha("a\u0301".repeat(TAMANHO_MAXIMO_SENHA + 1), hash)).toBe(false);
    expect(await verificarSenha("x".repeat(1_000_000), hash)).toBe(false);
    expect(performance.now() - inicio).toBeLessThan(50);
    // 256 caracteres fora do BMP (length 512) estão dentro do teto.
    expect(tamanhoSenha("\u{1F600}".repeat(TAMANHO_MAXIMO_SENHA))).toBe(TAMANHO_MAXIMO_SENHA);
  });

  it("normalizarSenha é NFC", () => {
    expect(normalizarSenha("a\u0301")).toBe("\u00e1");
  });

  it("limites exportados são os do plano", () => {
    expect(TAMANHO_MINIMO_SENHA).toBe(16);
    expect(TAMANHO_MAXIMO_SENHA).toBe(256);
  });
});
