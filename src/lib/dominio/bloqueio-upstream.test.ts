import { describe, expect, it } from "vitest";

import {
  ErroBloqueioUpstream,
  classificarErro,
  classificarStatus,
} from "./bloqueio-upstream";

describe("classificarStatus", () => {
  it("trata 429 e 403 como bloqueio", () => {
    expect(classificarStatus(429)).toBe("bloqueio");
    expect(classificarStatus(403)).toBe("bloqueio");
  });

  it("trata 5xx como transitório", () => {
    expect(classificarStatus(500)).toBe("transitorio");
    expect(classificarStatus(502)).toBe("transitorio");
    expect(classificarStatus(522)).toBe("transitorio");
  });

  it("trata 404 como permanente — repetir não muda a resposta", () => {
    expect(classificarStatus(404)).toBe("permanente");
    expect(classificarStatus(400)).toBe("permanente");
  });
});

describe("classificarErro", () => {
  it("reconhece connection refused como bloqueio", () => {
    // Foi exatamente o que a TCGdex devolveu ao nosso IP em 2026-08-25,
    // enquanto respondia 200 para o resto da internet.
    expect(classificarErro({ code: "ECONNREFUSED" })).toBe("bloqueio");
  });

  it("desce no `cause` — undici aninha o código do socket", () => {
    const erroFetch = Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("connect ECONNREFUSED"), {
        code: "ECONNREFUSED",
      }),
    });
    expect(classificarErro(erroFetch)).toBe("bloqueio");
  });

  it("reconhece reset e rede inalcançável como bloqueio", () => {
    expect(classificarErro({ code: "ECONNRESET" })).toBe("bloqueio");
    expect(classificarErro({ code: "ENETUNREACH" })).toBe("bloqueio");
  });

  it("trata timeout e erro desconhecido como transitório", () => {
    expect(classificarErro({ code: "ETIMEDOUT" })).toBe("transitorio");
    expect(classificarErro(new Error("qualquer coisa"))).toBe("transitorio");
    expect(classificarErro(null)).toBe("transitorio");
  });
});

describe("ErroBloqueioUpstream", () => {
  it("carrega o motivo e explica por que abortou", () => {
    const err = new ErroBloqueioUpstream("HTTP 429 em /v2/en/cards/base1-1");
    expect(err.motivo).toBe("HTTP 429 em /v2/en/cards/base1-1");
    expect(err.message).toContain("HTTP 429");
    expect(err.name).toBe("ErroBloqueioUpstream");
    expect(err).toBeInstanceOf(Error);
  });
});
