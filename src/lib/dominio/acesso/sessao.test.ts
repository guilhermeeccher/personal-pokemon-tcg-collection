import { describe, expect, it } from "vitest";

import {
  atributosCookieSessao,
  codificarBase64Url,
  decodificarBase64Url,
  DURACAO_SESSAO_SEGUNDOS,
  emitirSessao,
  NOME_COOKIE_SESSAO,
  TOLERANCIA_EMISSAO_FUTURA_SEGUNDOS,
  verificarSessao,
} from "./sessao";

const segredo = new Uint8Array(32).fill(7);
const outroSegredo = new Uint8Array(32).fill(8);
const hashSenhaTexto = "scrypt:32768:8:1:AAAAAAAAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA";
const AGORA = Date.UTC(2026, 9, 19, 12, 0, 0);
const DIA = 86_400_000;

const base = { segredo, hashSenhaTexto };

/** Monta um cookie à mão, com MAC válido, para os casos que `emitirSessao`
 *  se recusa a produzir. */
async function forjar(campos: {
  versao?: number;
  emissao: number;
  expiracao: number;
  impressao?: Uint8Array;
  chave?: Uint8Array;
}): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(campos.chave ?? segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const impressao =
    campos.impressao ??
    new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(hashSenhaTexto))).slice(0, 16);
  const corpo = new Uint8Array(25);
  const dv = new DataView(corpo.buffer);
  corpo[0] = campos.versao ?? 1;
  dv.setUint32(1, campos.emissao);
  dv.setUint32(5, campos.expiracao);
  corpo.set(impressao, 9);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, corpo));
  const total = new Uint8Array(57);
  total.set(corpo);
  total.set(mac, 25);
  return codificarBase64Url(total);
}

const s = (ms: number) => Math.floor(ms / 1000);

describe("emitir e verificar", () => {
  it("o cookie emitido vale e tem o tamanho fixo", async () => {
    const valor = await emitirSessao({ ...base, agoraMs: AGORA });
    expect(valor).toMatch(/^[A-Za-z0-9_-]{76}$/);
    expect(await verificarSessao(valor, { ...base, agoraMs: AGORA })).toBe(true);
    expect(await verificarSessao(valor, { ...base, agoraMs: AGORA + 179 * DIA })).toBe(true);
  });

  it("expira em 180 dias, sem renovação", async () => {
    const valor = await emitirSessao({ ...base, agoraMs: AGORA });
    const fim = AGORA + DURACAO_SESSAO_SEGUNDOS * 1000;
    expect(await verificarSessao(valor, { ...base, agoraMs: fim - 1000 })).toBe(true);
    expect(await verificarSessao(valor, { ...base, agoraMs: fim })).toBe(false);
  });

  it("duração curta (verificação de produção) expira no prazo dela", async () => {
    const valor = await emitirSessao({ ...base, agoraMs: AGORA, duracaoSegundos: 600 });
    expect(await verificarSessao(valor, { ...base, agoraMs: AGORA + 599_000 })).toBe(true);
    expect(await verificarSessao(valor, { ...base, agoraMs: AGORA + 600_000 })).toBe(false);
  });

  it("emitir recusa duração acima de 180 dias, zero, negativa ou fracionária", async () => {
    for (const duracaoSegundos of [DURACAO_SESSAO_SEGUNDOS + 1, 0, -1, 1.5]) {
      await expect(emitirSessao({ ...base, agoraMs: AGORA, duracaoSegundos })).rejects.toThrow(RangeError);
    }
  });

  it("trocar o hash da senha derruba a sessão", async () => {
    const valor = await emitirSessao({ ...base, agoraMs: AGORA });
    const outroHash = hashSenhaTexto.replace(/A:/, "B:");
    expect(await verificarSessao(valor, { segredo, hashSenhaTexto: outroHash, agoraMs: AGORA })).toBe(false);
  });

  it("trocar o segredo derruba a sessão", async () => {
    const valor = await emitirSessao({ ...base, agoraMs: AGORA });
    expect(await verificarSessao(valor, { segredo: outroSegredo, hashSenhaTexto, agoraMs: AGORA })).toBe(false);
  });

  it("adulterar qualquer byte invalida", async () => {
    const valor = await emitirSessao({ ...base, agoraMs: AGORA });
    const bytes = decodificarBase64Url(valor);
    if (!bytes) throw new Error("cookie emitido não decodifica");
    for (let i = 0; i < bytes.length; i++) {
      const copia = bytes.slice();
      copia[i] ^= 0x01;
      expect(await verificarSessao(codificarBase64Url(copia), { ...base, agoraMs: AGORA })).toBe(false);
    }
  });

  it.each([
    ["ausente", undefined],
    ["vazio", ""],
    ["lixo", "abc"],
    ["um caractere a menos", "A".repeat(75)],
    ["um caractere a mais", "A".repeat(77)],
    ["alfabeto base64 comum", "+".repeat(76)],
    ["com =", "A".repeat(74) + "=="],
  ])("recusa %s sem lançar", async (_, valor) => {
    expect(await verificarSessao(valor, { ...base, agoraMs: AGORA })).toBe(false);
  });

  it("forjado com o segredo certo vale (controle do helper do teste)", async () => {
    const valor = await forjar({ emissao: s(AGORA), expiracao: s(AGORA) + 3600 });
    expect(await verificarSessao(valor, { ...base, agoraMs: AGORA })).toBe(true);
  });

  it("recusa versão desconhecida, mesmo com MAC válido", async () => {
    const valor = await forjar({ versao: 2, emissao: s(AGORA), expiracao: s(AGORA) + 3600 });
    expect(await verificarSessao(valor, { ...base, agoraMs: AGORA })).toBe(false);
  });

  it("recusa duração acima de 180 dias, mesmo com MAC válido", async () => {
    const valor = await forjar({ emissao: s(AGORA), expiracao: s(AGORA) + DURACAO_SESSAO_SEGUNDOS + 1 });
    expect(await verificarSessao(valor, { ...base, agoraMs: AGORA })).toBe(false);
  });

  it("recusa expiração antes da emissão", async () => {
    const valor = await forjar({ emissao: s(AGORA), expiracao: s(AGORA) - 1 });
    expect(await verificarSessao(valor, { ...base, agoraMs: AGORA })).toBe(false);
  });

  it("recusa impressão de outro hash, mesmo com MAC válido", async () => {
    const valor = await forjar({ emissao: s(AGORA), expiracao: s(AGORA) + 3600, impressao: new Uint8Array(16) });
    expect(await verificarSessao(valor, { ...base, agoraMs: AGORA })).toBe(false);
  });

  it("emissão no futuro: aceita dentro da tolerância declarada, recusa além", async () => {
    const dentro = await emitirSessao({ ...base, agoraMs: AGORA + TOLERANCIA_EMISSAO_FUTURA_SEGUNDOS * 1000 });
    const alem = await emitirSessao({ ...base, agoraMs: AGORA + (TOLERANCIA_EMISSAO_FUTURA_SEGUNDOS + 1) * 1000 });
    expect(await verificarSessao(dentro, { ...base, agoraMs: AGORA })).toBe(true);
    expect(await verificarSessao(alem, { ...base, agoraMs: AGORA })).toBe(false);
  });
});

describe("base64url estrito", () => {
  it("ida e volta", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(decodificarBase64Url(codificarBase64Url(bytes))).toEqual(bytes);
  });

  it.each(["A", "AB=", "A+B/", "AB C", "AB", "AQ=="])("recusa %s", (texto) => {
    // "AB" não é canônico (o canônico de 0x00 é "AA"); os outros fogem do alfabeto ou do tamanho.
    expect(decodificarBase64Url(texto)).toBeNull();
  });
});

describe("cookie", () => {
  it("nome e atributos", () => {
    expect(NOME_COOKIE_SESSAO).toBe("__Host-sessao");
    expect(DURACAO_SESSAO_SEGUNDOS).toBe(180 * 24 * 3600);
    expect(atributosCookieSessao(600)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
  });
});
