import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/*
 * Regras de plataforma da v2 que um teste sem navegador consegue fixar, lendo
 * os arquivos-fonte (como `cobertura-estatica.test.ts` faz com o acesso).
 */

const RAIZ_V2 = path.resolve(__dirname, "../..");
const CSS_CARTA = path.resolve(__dirname, "../carta/carta.module.css");

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = path.join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(tsx?|css)$/.test(nome) && !/\.test\.ts$/.test(nome) ? [caminho] : [];
  });
}

describe("View Transitions na v2", () => {
  it("nenhum arquivo da v2 chama a API de View Transition do documento à mão", () => {
    const chamadaDireta = /\.startViewTransition\s*\(/;
    const culpados = arquivos(RAIZ_V2).filter((f) => chamadaDireta.test(readFileSync(f, "utf8")));
    expect(culpados).toEqual([]);
  });
});

describe("orçamento de composição da Carta", () => {
  const css = readFileSync(CSS_CARTA, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  /* Blocos `seletor { declarações }` de primeiro nível ou dentro de @media.
     O módulo não usa aninhamento de CSS, então isto basta. */
  const regras = Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g), (m) => ({
    seletor: m[1].trim(),
    corpo: m[2],
  }));

  it("o módulo foi lido", () => {
    expect(regras.length).toBeGreaterThan(5);
  });

  it("nenhum backdrop-filter", () => {
    expect(css).not.toMatch(/backdrop-filter/);
  });

  it("will-change, preserve-3d e mix-blend-mode só em regras da carta ativa", () => {
    const caras = regras.filter((r) => /will-change|preserve-3d|mix-blend-mode/.test(r.corpo));
    expect(caras.length).toBeGreaterThan(0);
    for (const r of caras) {
      // Cada seletor da lista tem de exigir a carta ativa.
      for (const s of r.seletor.split(",")) expect(s, r.seletor).toMatch(/\[data-ativa\]/);
    }
  });

  it("touch-action: none só no modo palco", () => {
    const nenhum = regras.filter((r) => /touch-action:\s*none/.test(r.corpo));
    expect(nenhum.length).toBe(1);
    expect(nenhum[0].seletor).toMatch(/\[data-modo="palco"\]/);
  });
});
