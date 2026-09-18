import { describe, expect, it } from "vitest";

import { rotuloAlocacao } from "./alocacao-disponivel";

describe("rotuloAlocacao", () => {
  it("explica o botão desabilitado — cinza sem motivo vira suspeita de bug", () => {
    expect(rotuloAlocacao(0)).toBe("Nenhuma cópia livre sua cabe nesta vaga.");
  });

  it("concorda no singular", () => {
    expect(rotuloAlocacao(1)).toBe("1 cópia livre sua cabe nesta vaga.");
  });

  it("concorda no plural", () => {
    expect(rotuloAlocacao(3)).toBe("3 cópias livres suas cabem nesta vaga.");
  });

  it("trata negativo como zero em vez de gerar frase sem sentido", () => {
    // Não deveria acontecer (a contagem vem de um count SQL), mas um
    // rótulo é o último lugar onde vale a pena explodir.
    expect(rotuloAlocacao(-1)).toBe("Nenhuma cópia livre sua cabe nesta vaga.");
  });
});
