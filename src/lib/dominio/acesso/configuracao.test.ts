import { describe, expect, it } from "vitest";

import { lerConfiguracaoAcesso, moduloAcessoLigado } from "./configuracao";

const HASH = "scrypt:32768:8:1:AAAAAAAAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA";
// 32 bytes = 43 caracteres base64url sem "=".
const SEGREDO = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN-_A";
const ORIGENS = "https://exemplo.test, http://127.0.0.1:3010";

const completo = {
  ACESSO_COM_SENHA: "1",
  SENHA_ACESSO_HASH: HASH,
  SEGREDO_SESSAO: SEGREDO,
  ORIGENS_PERMITIDAS: ORIGENS,
};

function motivos(ambiente: Record<string, string | undefined>): string[] {
  const c = lerConfiguracaoAcesso(ambiente);
  if (c.estado !== "invalida") throw new Error(`esperado inválida, veio ${c.estado}`);
  return c.motivos;
}

describe("moduloAcessoLigado", () => {
  it("só o valor 1 liga", () => {
    expect(moduloAcessoLigado({ ACESSO_COM_SENHA: "1" })).toBe(true);
  });

  it.each([undefined, "", "0", "false", "true", "sim", " 1", "1 "])("%s não liga", (valor) => {
    expect(moduloAcessoLigado({ ACESSO_COM_SENHA: valor })).toBe(false);
  });
});

describe("lerConfiguracaoAcesso", () => {
  it("desligado ignora as outras variáveis, mesmo inválidas", () => {
    expect(lerConfiguracaoAcesso({})).toEqual({ estado: "desligado" });
    expect(lerConfiguracaoAcesso({ ...completo, ACESSO_COM_SENHA: "0" })).toEqual({ estado: "desligado" });
    expect(lerConfiguracaoAcesso({ ACESSO_COM_SENHA: "", SENHA_ACESSO_HASH: "lixo" })).toEqual({
      estado: "desligado",
    });
  });

  it("ligado e completo", () => {
    const c = lerConfiguracaoAcesso(completo);
    expect(c.estado).toBe("ligada");
    if (c.estado !== "ligada") return;
    expect(c.hashSenhaTexto).toBe(HASH);
    expect(c.hashSenha.sal.length).toBe(16);
    expect(c.segredo.length).toBe(32);
    expect([...c.origens]).toEqual(["https://exemplo.test", "http://127.0.0.1:3010"]);
  });

  it("aceita segredo maior que 32 bytes e uma origem só", () => {
    const c = lerConfiguracaoAcesso({
      ...completo,
      SEGREDO_SESSAO: SEGREDO + "abcdefghijklmnopqrstu",
      ORIGENS_PERMITIDAS: "https://exemplo.test",
    });
    expect(c.estado).toBe("ligada");
  });

  it.each(["SENHA_ACESSO_HASH", "SEGREDO_SESSAO", "ORIGENS_PERMITIDAS"])(
    "falha fechada com %s ausente ou vazia",
    (variavel) => {
      for (const valor of [undefined, ""]) {
        const m = motivos({ ...completo, [variavel]: valor });
        expect(m).toHaveLength(1);
        expect(m[0]).toContain(variavel);
      }
    },
  );

  it("as três ausentes dão três motivos", () => {
    expect(motivos({ ACESSO_COM_SENHA: "1" })).toHaveLength(3);
  });

  it.each([
    ["N diferente", HASH.replace("32768", "16384")],
    ["formato com $", HASH.replace(/:/g, "$")],
    ["espaço no fim", HASH + " "],
    ["truncado", HASH.slice(0, -1)],
  ])("hash inválido: %s", (_, valor) => {
    const m = motivos({ ...completo, SENHA_ACESSO_HASH: valor });
    expect(m).toHaveLength(1);
    expect(m[0]).toContain("SENHA_ACESSO_HASH");
  });

  it.each([
    ["31 bytes", SEGREDO.slice(0, 41) + "A"],
    ["base64 comum", SEGREDO.replace("-", "+")],
    ["com =", SEGREDO + "="],
    ["espaço", SEGREDO + " "],
    ["comprimento impossível", SEGREDO + "AA"],
    ["não canônico", SEGREDO.slice(0, -1) + "B"],
  ])("segredo inválido: %s", (_, valor) => {
    const m = motivos({ ...completo, SEGREDO_SESSAO: valor });
    expect(m).toHaveLength(1);
    expect(m[0]).toContain("SEGREDO_SESSAO");
  });

  it.each([
    "https://exemplo.test/",
    "https://exemplo.test/caminho",
    "https://exemplo.test?x=1",
    "https://exemplo.test#x",
    "https://usuario:senha@exemplo.test",
    "https://EXEMPLO.test",
    "https://exemplo.test:443",
    "http://exemplo.test:80",
    "ftp://exemplo.test",
    "exemplo.test",
    "*",
    "null",
    "https://exemplo.test,",
    "https://exemplo.test,,http://127.0.0.1:3010",
    "https://exemplo.test;http://127.0.0.1:3010",
  ])("origens inválidas: %s", (valor) => {
    const m = motivos({ ...completo, ORIGENS_PERMITIDAS: valor });
    expect(m.length).toBeGreaterThan(0);
    expect(m.every((x) => x.includes("ORIGENS_PERMITIDAS"))).toBe(true);
  });

  it("os motivos nunca ecoam o valor da variável", () => {
    const segredoRuim = "segredo-curto-que-nao-pode-aparecer";
    const hashRuim = "scrypt:1:1:1:valor-que-nao-pode-aparecer:x";
    const origemRuim = "https://origem-que-nao-pode-aparecer.test/";
    const m = motivos({
      ACESSO_COM_SENHA: "1",
      SENHA_ACESSO_HASH: hashRuim,
      SEGREDO_SESSAO: segredoRuim,
      ORIGENS_PERMITIDAS: origemRuim,
    }).join("\n");
    expect(m).not.toContain("nao-pode-aparecer");
  });
});
