import { describe, expect, it } from "vitest";

import { fontesDaImagem } from "./imagem-carta";

const CDN = "https://assets.tcgdex.net/pt/sv/sv01/001";

describe("fontesDaImagem", () => {
  it("grade: só a low, sem troca", () => {
    expect(fontesDaImagem(CDN, "low")).toEqual({ base: `${CDN}/low.webp`, alvo: `${CDN}/low.webp`, trocaDepois: false });
  });

  it("high sob demanda: começa na low e troca depois", () => {
    expect(fontesDaImagem(CDN, "high")).toEqual({ base: `${CDN}/low.webp`, alvo: `${CDN}/high.webp`, trocaDepois: true });
  });

  it("foto local já é o arquivo final: sem sufixo e sem troca", () => {
    const local = "/api/imagens-locais/sv01-001/pt";
    expect(fontesDaImagem(local, "high")).toEqual({ base: local, alvo: local, trocaDepois: false });
  });

  it("sem imagem: nada a carregar", () => {
    expect(fontesDaImagem(null, "high")).toEqual({ base: null, alvo: null, trocaDepois: false });
  });
});
