import { describe, expect, it, vi } from "vitest";

import {
  TETO_CORPO_BYTES,
  extrairSenha,
  lerCorpoComTeto,
  processarEntrada,
  respostaDaEntrada,
  senhaCabeNoLogin,
} from "./entrar";
import { criarLimiteTentativas } from "./limite-tentativas";
import { analisarHashSenha, gerarHashSenha, tamanhoSenha, verificarSenha } from "./senha";

const codificador = new TextEncoder();

/** Um stream que entrega os pedaços dados, contando quantos foram lidos. */
function stream(...pedacos: (string | Uint8Array)[]) {
  const estado = { lidos: 0, cancelado: false };
  const fila = pedacos.map((p) => (typeof p === "string" ? codificador.encode(p) : p));
  const corpo = new ReadableStream<Uint8Array>({
    pull(controle) {
      const proximo = fila.shift();
      if (proximo === undefined) {
        controle.close();
        return;
      }
      estado.lidos++;
      controle.enqueue(proximo);
    },
    cancel() {
      estado.cancelado = true;
    },
  });
  return { corpo, estado };
}

describe("lerCorpoComTeto", () => {
  it("lê um corpo dentro do teto, em vários pedaços", async () => {
    const { corpo } = stream('{"senha":', '"abc"}');
    expect(await lerCorpoComTeto(corpo, null)).toBe('{"senha":"abc"}');
  });

  it("aceita exatamente o teto", async () => {
    const { corpo } = stream("a".repeat(TETO_CORPO_BYTES));
    expect(await lerCorpoComTeto(corpo, String(TETO_CORPO_BYTES))).toHaveLength(TETO_CORPO_BYTES);
  });

  it("recusa pelo Content-Length declarado sem ler nada", async () => {
    const { corpo, estado } = stream("x");
    expect(await lerCorpoComTeto(corpo, String(TETO_CORPO_BYTES + 1))).toBeNull();
    expect(estado.lidos).toBe(0);
    expect(estado.cancelado).toBe(true);
  });

  it("recusa Content-Length malformado", async () => {
    for (const cl of ["-1", "abc", "1e3", "", "10, 10"]) {
      expect(await lerCorpoComTeto(stream("{}").corpo, cl), cl).toBeNull();
    }
  });

  it("não confia no cabeçalho: um corpo que mente é cortado ao passar do teto", async () => {
    const pedaco = "a".repeat(600);
    const { corpo, estado } = stream(pedaco, pedaco, pedaco, pedaco, pedaco);
    expect(await lerCorpoComTeto(corpo, "10")).toBeNull();
    // Parou no segundo pedaço (1.200 bytes > 1.024), sem ler o resto.
    expect(estado.lidos).toBe(2);
    expect(estado.cancelado).toBe(true);
  });

  it("sem Content-Length também corta pelo que leu", async () => {
    expect(await lerCorpoComTeto(stream("a".repeat(TETO_CORPO_BYTES + 1)).corpo, null)).toBeNull();
  });

  it("recusa UTF-8 inválido", async () => {
    expect(await lerCorpoComTeto(stream(new Uint8Array([0x7b, 0xff, 0x7d])).corpo, null)).toBeNull();
  });

  it("sem corpo é texto vazio", async () => {
    expect(await lerCorpoComTeto(null, null)).toBe("");
  });
});

describe("extrairSenha", () => {
  it("aceita só {\"senha\": texto}", () => {
    expect(extrairSenha('{"senha":"correta-e-longa-o-bastante"}')).toBe("correta-e-longa-o-bastante");
    expect(extrairSenha(' { "senha" : "x" } ')).toBe("x");
  });

  it("recusa qualquer outra forma", () => {
    for (const texto of [
      "",
      "senha",
      "null",
      '"senha"',
      "[]",
      '["x"]',
      "{}",
      '{"senha":1}',
      '{"senha":null}',
      '{"senha":["x"]}',
      '{"senha":""}',
      '{"senha":"x","outra":1}',
      '{"Senha":"x"}',
      '{"senha":"x"',
    ]) {
      expect(extrairSenha(texto), texto).toBeNull();
    }
  });

  it("recusa senha acima de 256 caracteres", () => {
    expect(extrairSenha(JSON.stringify({ senha: "a".repeat(256) }))).toBe("a".repeat(256));
    expect(extrairSenha(JSON.stringify({ senha: "a".repeat(257) }))).toBeNull();
  });
});

describe("processarEntrada", () => {
  function entrada(corpo: string, verificar: (s: string) => Promise<boolean>, limite = criarLimiteTentativas()) {
    return processarEntrada({
      corpo: stream(corpo).corpo,
      contentLength: null,
      ip: "203.0.113.7",
      limite,
      verificar,
    });
  }

  it("senha certa é ok, errada é senha_invalida", async () => {
    const verificar = vi.fn(async (s: string) => s === "certa");
    expect(await entrada('{"senha":"certa"}', verificar)).toBe("ok");
    expect(await entrada('{"senha":"errada"}', verificar)).toBe("senha_invalida");
    expect(verificar).toHaveBeenCalledTimes(2);
  });

  it("corpo ruim é senha_invalida sem verificar e sem gastar tentativa do IP", async () => {
    const limite = criarLimiteTentativas({ maxErros: 1 });
    const verificar = vi.fn(async () => true);
    for (const corpo of ["nada", '{"senha":1}', JSON.stringify({ senha: "a".repeat(300) })]) {
      expect(await entrada(corpo, verificar, limite)).toBe("senha_invalida");
    }
    expect(verificar).not.toHaveBeenCalled();
    // A única tentativa do IP continua disponível.
    expect(await entrada('{"senha":"x"}', verificar, limite)).toBe("ok");
  });

  it("cinco erros bloqueiam o IP, e o bloqueado nem verifica", async () => {
    const limite = criarLimiteTentativas();
    const verificar = vi.fn(async () => false);
    for (let i = 0; i < 5; i++) expect(await entrada('{"senha":"x"}', verificar, limite)).toBe("senha_invalida");
    expect(await entrada('{"senha":"x"}', verificar, limite)).toBe("bloqueado");
    expect(verificar).toHaveBeenCalledTimes(5);
  });

  it("a terceira verificação simultânea é concorrência, e as vagas voltam depois", async () => {
    const limite = criarLimiteTentativas();
    const liberar: Array<() => void> = [];
    const verificarLento = () => new Promise<boolean>((resolve) => liberar.push(() => resolve(false)));

    const a = entrada('{"senha":"a"}', verificarLento, limite);
    const b = entrada('{"senha":"b"}', verificarLento, limite);
    // Dá tempo de as duas lerem o corpo e chegarem ao limite.
    await vi.waitFor(() => expect(liberar).toHaveLength(2));
    expect(await entrada('{"senha":"c"}', async () => true, limite)).toBe("concorrencia");

    liberar.forEach((f) => f());
    expect(await a).toBe("senha_invalida");
    expect(await b).toBe("senha_invalida");
    expect(await entrada('{"senha":"d"}', async () => true, limite)).toBe("ok");
  });
});

describe("respostaDaEntrada", () => {
  it("corpo genérico, e atraso em todo erro menos a concorrência", () => {
    expect(respostaDaEntrada("ok")).toEqual({ status: 200, corpo: { ok: true }, atrasar: false });
    expect(respostaDaEntrada("senha_invalida")).toEqual({
      status: 401,
      corpo: { erro: "senha_invalida" },
      atrasar: true,
    });
    expect(respostaDaEntrada("bloqueado")).toEqual({ status: 429, corpo: { erro: "muitas_tentativas" }, atrasar: true });
    expect(respostaDaEntrada("concorrencia")).toEqual({
      status: 429,
      corpo: { erro: "muitas_tentativas" },
      atrasar: false,
    });
  });
});

describe("senhaCabeNoLogin — da geração ao login, no limite do corpo", () => {
  const bytesDoCorpo = (senha: string) => codificador.encode(JSON.stringify({ senha })).byteLength;
  const EMOJI = "\u{1F600}"; // 4 bytes em UTF-8, 1 ponto de código

  /** O caminho inteiro: hash real, corpo montado como a tela monta, login
   *  com o scrypt real. Dois scrypts por chamada. */
  async function entraDeVerdade(senha: string) {
    const hash = analisarHashSenha(await gerarHashSenha(senha));
    if (!hash) throw new Error("hash inválido");
    const corpo = JSON.stringify({ senha });
    return processarEntrada({
      corpo: stream(corpo).corpo,
      contentLength: String(codificador.encode(corpo).byteLength),
      ip: "203.0.113.9",
      limite: criarLimiteTentativas(),
      verificar: (s) => verificarSenha(s, hash),
    });
  }

  it("a que cabe exatamente no teto é gerada e entra", async () => {
    // `{"senha":""}` são 12 bytes; 253 emojis, 1.012.
    const senha = EMOJI.repeat(253);
    expect(bytesDoCorpo(senha)).toBe(TETO_CORPO_BYTES);
    expect(senhaCabeNoLogin(senha)).toBe(true);
    expect(await entraDeVerdade(senha)).toBe("ok");
  });

  it("um emoji a mais não cabe, mesmo dentro dos 256 caracteres; 256 emojis também não", () => {
    expect(tamanhoSenha(EMOJI.repeat(254))).toBeLessThanOrEqual(256);
    expect(senhaCabeNoLogin(EMOJI.repeat(254))).toBe(false);
    expect(senhaCabeNoLogin(EMOJI.repeat(256))).toBe(false);
  });

  it("aspas e barras contam escapadas, como o JSON as manda", async () => {
    // 250 emojis + 6 caracteres que o JSON escapa (2 bytes cada): 1.012.
    const noLimite = EMOJI.repeat(250) + '\\"\\"\\"';
    expect(tamanhoSenha(noLimite)).toBe(256);
    expect(bytesDoCorpo(noLimite)).toBe(TETO_CORPO_BYTES);
    expect(senhaCabeNoLogin(noLimite)).toBe(true);
    expect(await entraDeVerdade(noLimite)).toBe("ok");

    // Em bytes crus caberia (1.009 + 12); escapada, passa (1.014 + 12).
    const passa = EMOJI.repeat(251) + "\\".repeat(5);
    expect(codificador.encode(passa).byteLength + 12).toBeLessThanOrEqual(TETO_CORPO_BYTES);
    expect(senhaCabeNoLogin(passa)).toBe(false);
  });

  it("a forma NFD também tem que caber, mesmo quando a NFC cabe", () => {
    // Sílaba hangul: 3 bytes em NFC, duas letras de 3 bytes em NFD.
    const nfc = "\uAC00".repeat(200); // 가
    expect(bytesDoCorpo(nfc)).toBeLessThanOrEqual(TETO_CORPO_BYTES);
    expect(bytesDoCorpo(nfc.normalize("NFD"))).toBeGreaterThan(TETO_CORPO_BYTES);
    expect(senhaCabeNoLogin(nfc)).toBe(false);
    expect(senhaCabeNoLogin(nfc.normalize("NFD"))).toBe(false);
    // E uma que cabe nas duas formas passa.
    expect(senhaCabeNoLogin("\uAC00".repeat(100))).toBe(true);
  });

  it("senha comum de gerenciador cabe com folga", () => {
    expect(senhaCabeNoLogin("k8#Qv!2mZp@9Lr$4Tx&7Wn")).toBe(true);
  });
});
