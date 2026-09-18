import { describe, expect, it } from "vitest";

import { ehUuid } from "./uuid";

describe("ehUuid", () => {
  it("aceita UUID v4 válido, minúsculo", () => {
    expect(ehUuid("0897edb7-921b-415e-93ec-fedeef90bde3")).toBe(true);
  });

  it("aceita UUID válido em maiúsculo", () => {
    expect(ehUuid("0897EDB7-921B-415E-93EC-FEDEEF90BDE3")).toBe(true);
  });

  it("rejeita texto arbitrário (achado do coordenador: 'nao-e-uuid')", () => {
    expect(ehUuid("nao-e-uuid")).toBe(false);
  });

  it("rejeita string vazia", () => {
    expect(ehUuid("")).toBe(false);
  });

  it("rejeita UUID sem hífens", () => {
    expect(ehUuid("0897edb7921b415e93ecfedeef90bde3")).toBe(false);
  });

  it("rejeita UUID com um caractere a menos", () => {
    expect(ehUuid("0897edb7-921b-415e-93ec-fedeef90bde")).toBe(false);
  });

  it("rejeita UUID com um caractere a mais", () => {
    expect(ehUuid("0897edb7-921b-415e-93ec-fedeef90bde33")).toBe(false);
  });

  it("rejeita UUID com caractere não-hex", () => {
    expect(ehUuid("0897edb7-921b-415e-93ec-fedeef90bdeg")).toBe(false);
  });

  it("rejeita id de outro domínio (ex.: local_id de carta_catalogo)", () => {
    expect(ehUuid("sv03.5-001")).toBe(false);
  });

  it("rejeita path traversal / injeção grosseira", () => {
    expect(ehUuid("../../etc/passwd")).toBe(false);
    expect(ehUuid("'; drop table colecao; --")).toBe(false);
  });
});
