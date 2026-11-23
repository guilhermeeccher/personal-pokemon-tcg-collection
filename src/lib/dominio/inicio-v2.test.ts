import { describe, expect, it } from "vitest";

import { montarVitrine, type CopiaParaVitrine, type JoiaParaVitrine } from "./inicio-v2";

const joia = (cartaId: string): JoiaParaVitrine => ({ cartaId, nome: `Nome ${cartaId}`, setNome: "Set", localId: "1", raridade: null });
const copia = (id: string, cartaId: string, criadoEm: string): CopiaParaVitrine => ({
  id,
  cartaId,
  variante: "normal",
  idioma: "pt",
  criadoEm: new Date(criadoEm),
});

describe("montarVitrine", () => {
  it("mantém a ordem das joias, que é a da visão geral", () => {
    const r = montarVitrine(
      [joia("b"), joia("a")],
      [copia("1", "a", "2026-01-01T00:00:00Z"), copia("2", "b", "2026-01-01T00:00:00Z")],
      new Map(),
    );
    expect(r.map((c) => c.cartaId)).toEqual(["b", "a"]);
  });

  it("abre a cópia mais antiga da carta, com o id desempatando", () => {
    const r = montarVitrine(
      [joia("a")],
      [
        copia("9", "a", "2026-02-01T00:00:00Z"),
        copia("5", "a", "2026-01-01T00:00:00Z"),
        copia("3", "a", "2026-01-01T00:00:00Z"),
      ],
      new Map(),
    );
    expect(r[0].copiaId).toBe("3");
  });

  it("tira da vitrine uma joia que ficou sem cópia", () => {
    expect(montarVitrine([joia("a")], [], new Map())).toEqual([]);
  });

  it("leva a imagem e a procedência da linha da joia; sem elas, nulas", () => {
    const [com, sem] = montarVitrine(
      [joia("a"), joia("b")],
      [copia("1", "a", "2026-01-01T00:00:00Z"), copia("2", "b", "2026-01-01T00:00:00Z")],
      new Map([["a", { imagemUrl: "https://exemplo.test/a", imagemOrigem: "cdn" as const }]]),
    );
    expect(com).toMatchObject({ imagemUrl: "https://exemplo.test/a", imagemOrigem: "cdn" });
    expect(sem).toMatchObject({ imagemUrl: null, imagemOrigem: null });
  });
});
