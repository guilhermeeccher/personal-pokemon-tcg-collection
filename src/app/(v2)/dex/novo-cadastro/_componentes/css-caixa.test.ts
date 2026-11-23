import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ALTURA_CABECALHO_CAIXA, RESPIRO_CAIXA, VAO_CAIXA } from "../../caixas/_componentes/geometria-caixa";

/*
 * A caixa do Novo cadastro usa a geometria de `/dex/caixas`
 * (`geometria-caixa.ts`, pacote 5b) para a grade virtual pô-la sem montá-la;
 * quem desenha é este CSS. Se uma medida mudar só de um lado, a última
 * fileira corta ou sobra um vazio — o mesmo teste do 5b, sobre este arquivo.
 */
describe("o CSS da caixa do Novo cadastro (`novo-cadastro.module.css`)", () => {
  const css = readFileSync(path.join(__dirname, "novo-cadastro.module.css"), "utf8");
  const medida = (nome: string) => Number(new RegExp(`--cx-${nome}:\\s*(\\d+)px`).exec(css)?.[1]);

  it("declara as mesmas três medidas das constantes", () => {
    expect(medida("respiro")).toBe(RESPIRO_CAIXA);
    expect(medida("vao")).toBe(VAO_CAIXA);
    expect(medida("cabecalho")).toBe(ALTURA_CABECALHO_CAIXA);
  });

  it("a caixa tem o respiro nos quatro lados, as vagas o vão e o cabeçalho a altura", () => {
    expect(/\.caixa\s*\{[^}]*\}/.exec(css)?.[0]).toMatch(/padding:\s*var\(--cx-respiro\)\s*;/);
    expect(/\.posicoes\s*\{[^}]*\}/.exec(css)?.[0]).toMatch(/gap:\s*var\(--cx-vao\)/);
    expect(/\.cabecalhoCaixa\s*\{[^}]*\}/.exec(css)?.[0]).toMatch(/height:\s*var\(--cx-cabecalho\)/);
  });
});
