import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, negotiateLocale, resolveLocale } from "./config";

describe("negotiateLocale", () => {
  it("casa por prefixo de língua, não pela etiqueta inteira", () => {
    expect(negotiateLocale("pt-PT")).toBe("pt-BR");
    expect(negotiateLocale("pt")).toBe("pt-BR");
    expect(negotiateLocale("en-GB")).toBe("en");
  });

  it("respeita o peso q antes da ordem do cabeçalho", () => {
    expect(negotiateLocale("en;q=0.5,pt-BR;q=0.9")).toBe("pt-BR");
    expect(negotiateLocale("pt-BR;q=0.2,en;q=0.8")).toBe("en");
  });

  it("em empate de peso, vale a ordem em que o cabeçalho lista", () => {
    expect(negotiateLocale("pt-BR,en")).toBe("pt-BR");
    expect(negotiateLocale("en,pt-BR")).toBe("en");
  });

  it("ignora '*' e idioma com q=0", () => {
    expect(negotiateLocale("*")).toBeNull();
    expect(negotiateLocale("pt-BR;q=0,*")).toBeNull();
  });

  it("devolve null quando nenhum idioma conhecido aparece", () => {
    expect(negotiateLocale("ja,de;q=0.7")).toBeNull();
    expect(negotiateLocale("")).toBeNull();
    expect(negotiateLocale(null)).toBeNull();
  });
});

describe("resolveLocale", () => {
  it("cookie vence a negociação", () => {
    expect(resolveLocale("en", "pt-BR")).toBe("en");
    expect(resolveLocale("pt-BR", "en")).toBe("pt-BR");
  });

  it("cookie com valor desconhecido é ignorado", () => {
    expect(resolveLocale("klingon", "pt-BR")).toBe("pt-BR");
  });

  it("sem cookie e sem negociação, cai no padrão", () => {
    expect(resolveLocale(null, null)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(undefined, "ja")).toBe(DEFAULT_LOCALE);
  });
});
