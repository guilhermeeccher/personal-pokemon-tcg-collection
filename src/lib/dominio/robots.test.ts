import { describe, expect, it } from "vitest";

import { caminhoDeUrl, caminhoPermitido, parsearRobots } from "./robots";

/**
 * O formato do arquivo deles, como documentado nas decisões da Fase 6: rota
 * por query string (`?view=cards/...`), `Crawl-delay` no grupo `*`.
 */
const ROBOTS_LIGA = `
# comentário que não é regra
User-agent: *
Crawl-delay: 360
Allow: /?view=cards/search
Allow: /?view=cards/card
Disallow: /?view=cards/pricehistory
Disallow: /bzr/
Disallow: /colecao/
Disallow: /ecom/
Sitemap: https://www.ligapokemon.com.br/sitemap.xml
`;

const NOSSO_AGENTE = "colecao-pokemon/1.0 (colecao pessoal, uso nao comercial)";

describe("parsearRobots", () => {
  it("tira o Crawl-delay do grupo que vale para nós", () => {
    expect(parsearRobots(ROBOTS_LIGA, NOSSO_AGENTE).crawlDelaySegundos).toBe(360);
  });

  it("prefere o grupo do nosso agente ao grupo curinga", () => {
    const texto = `
User-agent: *
Crawl-delay: 360

User-agent: colecao-pokemon
Crawl-delay: 30
`;
    expect(parsearRobots(texto, NOSSO_AGENTE).crawlDelaySegundos).toBe(30);
  });

  it("linhas de agente consecutivas formam um grupo só", () => {
    const texto = `
User-agent: Googlebot
User-agent: *
Crawl-delay: 12
Disallow: /interno/
`;
    const regras = parsearRobots(texto, NOSSO_AGENTE);
    expect(regras.crawlDelaySegundos).toBe(12);
    expect(caminhoPermitido(regras, "/interno/x")).toBe(false);
  });

  it("dois grupos para nós somam regras, e o Crawl-delay maior vence", () => {
    // Na dúvida sobre qual grupo é o nosso, o erro barato é esperar demais.
    const texto = `
User-agent: *
Crawl-delay: 10
Disallow: /a/

User-agent: *
Crawl-delay: 90
Disallow: /b/
`;
    const regras = parsearRobots(texto, NOSSO_AGENTE);
    expect(regras.crawlDelaySegundos).toBe(90);
    expect(caminhoPermitido(regras, "/a/x")).toBe(false);
    expect(caminhoPermitido(regras, "/b/x")).toBe(false);
  });

  it("arquivo sem Crawl-delay declara nulo, e não zero", () => {
    // Zero seria "pode vir sem intervalo" — o contrário do que o silêncio diz.
    const texto = "User-agent: *\nDisallow: /privado/\n";
    expect(parsearRobots(texto, NOSSO_AGENTE).crawlDelaySegundos).toBeNull();
  });

  it("arquivo vazio, HTML de erro ou lixo não vira regra", () => {
    for (const lixo of ["", "<!DOCTYPE html><html>404</html>", "???"]) {
      const regras = parsearRobots(lixo, NOSSO_AGENTE);
      expect(regras.crawlDelaySegundos).toBeNull();
      expect(regras.regras).toHaveLength(0);
    }
  });

  it("ignora diretiva órfã, antes de qualquer User-agent", () => {
    const texto = "Disallow: /\nUser-agent: *\nAllow: /\n";
    expect(caminhoPermitido(parsearRobots(texto, NOSSO_AGENTE), "/qualquer")).toBe(true);
  });

  it("grupo de outro agente não vale para nós", () => {
    const texto = "User-agent: Googlebot\nDisallow: /\n";
    const regras = parsearRobots(texto, NOSSO_AGENTE);
    expect(regras.regras).toHaveLength(0);
    expect(caminhoPermitido(regras, "/?view=cards/search")).toBe(true);
  });
});

describe("caminhoPermitido", () => {
  const regras = parsearRobots(ROBOTS_LIGA, NOSSO_AGENTE);

  it("libera as duas rotas que a varredura usa", () => {
    expect(caminhoPermitido(regras, "/?view=cards/search&card=Bulbasaur&page=1")).toBe(true);
    expect(caminhoPermitido(regras, "/?view=cards/card&card=123")).toBe(true);
  });

  it("barra as rotas proibidas, inclusive a que mora na query", () => {
    expect(caminhoPermitido(regras, "/?view=cards/pricehistory&card=1")).toBe(false);
    expect(caminhoPermitido(regras, "/bzr/loja")).toBe(false);
    expect(caminhoPermitido(regras, "/colecao/minha")).toBe(false);
    expect(caminhoPermitido(regras, "/ecom/carrinho")).toBe(false);
  });

  it("casamento mais longo decide, e empate é a favor do Allow", () => {
    const texto = "User-agent: *\nDisallow: /loja/\nAllow: /loja/aberta\n";
    const r = parsearRobots(texto, NOSSO_AGENTE);
    expect(caminhoPermitido(r, "/loja/fechada")).toBe(false);
    expect(caminhoPermitido(r, "/loja/aberta")).toBe(true);

    const empate = parsearRobots("User-agent: *\nDisallow: /x\nAllow: /x\n", NOSSO_AGENTE);
    expect(caminhoPermitido(empate, "/x")).toBe(true);
  });

  it("entende curinga e ancoragem", () => {
    const r = parsearRobots(
      "User-agent: *\nDisallow: /*.pdf$\nDisallow: /a/*/b\n",
      NOSSO_AGENTE,
    );
    expect(caminhoPermitido(r, "/manual.pdf")).toBe(false);
    expect(caminhoPermitido(r, "/manual.pdf?download=1")).toBe(true);
    expect(caminhoPermitido(r, "/a/qualquer/b")).toBe(false);
  });

  it("Disallow vazio é permissão, não bloqueio", () => {
    const r = parsearRobots("User-agent: *\nDisallow:\n", NOSSO_AGENTE);
    expect(caminhoPermitido(r, "/qualquer")).toBe(true);
  });

  it("se eles fecharem a busca, a resposta passa a ser não", () => {
    // O ponto de derivar do arquivo: proibição nova vale no dia em que eles a
    // escrevem, sem release nosso.
    const r = parsearRobots("User-agent: *\nDisallow: /?view=cards/\n", NOSSO_AGENTE);
    expect(caminhoPermitido(r, "/?view=cards/search&card=Pikachu")).toBe(false);
  });
});

describe("caminhoDeUrl", () => {
  it("devolve caminho e query, que é contra o que o robots.txt é avaliado", () => {
    expect(caminhoDeUrl("https://www.ligapokemon.com.br/?view=cards/search&page=2")).toBe(
      "/?view=cards/search&page=2",
    );
  });

  it("URL inválida volta como veio, em vez de estourar", () => {
    expect(caminhoDeUrl("não é url")).toBe("não é url");
  });
});
