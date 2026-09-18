import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  deveBuscarProximaPagina,
  LINHAS_POR_PAGINA,
  contarBlocosBusca,
  nomeCompativelComEspecie,
  parsearBuscaLiga,
  termoDeBusca,
  urlBuscaLiga,
  type LinhaBuscaLiga,
} from "./liga-busca";

/**
 * HTML real da busca por "Bulbasaur" (2026-09-02), recortado em cinco blocos:
 * um sem estoque e quatro com preço, cobrindo numeração com e sem zero à
 * esquerda e sigla com sufixo (`QSG-G`).
 */
const html = readFileSync(
  new URL("./fixtures/liga-busca-bulbasaur.html", import.meta.url),
  "utf-8",
);

describe("urlBuscaLiga", () => {
  it("põe o filtro de produto dentro do termo, que é como a sintaxe deles funciona", () => {
    const url = urlBuscaLiga("Bulbasaur");
    expect(url).toContain("card=Bulbasaur%20searchprod%3D0");
    expect(url).toContain("orderBy=7");
    expect(url).toContain("page=1");
  });

  it("escapa espécie de nome composto sem perder o filtro", () => {
    // "Mr. Mime" e "Farfetch'd" são os nomes que quebram busca ingênua:
    // o espaço vira %20 e o apóstrofo passa direto (é caractere válido em
    // query string), mas o `searchprod=0` precisa continuar colado ao termo.
    const url = urlBuscaLiga("Mr. Mime");
    expect(url).toContain("card=Mr.%20Mime%20searchprod%3D0");
    expect(urlBuscaLiga("Farfetch'd")).toContain("card=Farfetch'd%20searchprod%3D0");
  });

  it("pagina", () => {
    expect(urlBuscaLiga("Bulbasaur", 3)).toContain("page=3");
  });
});

describe("parsearBuscaLiga", () => {
  const linhas = parsearBuscaLiga(html);

  it("lê todos os blocos da página", () => {
    expect(linhas).toHaveLength(5);
  });

  it("separa nome, sigla, id e número da edição", () => {
    const mega = linhas.find((l) => l.edicaoSigla === "MEG");
    expect(mega).toMatchObject({
      nome: "Bulbasaur",
      edicaoSigla: "MEG",
      edicaoId: 730,
      numero: "001",
    });
    expect(mega?.edicaoNome).not.toBe("");
  });

  it("preserva o número como o site escreve, sem normalizar zero à esquerda", () => {
    // `SW 77` e `MEG 001` conviveriam mal se o parser decidisse um formato:
    // a normalização é do casamento, não da leitura.
    expect(linhas.map((l) => l.numero)).toContain("77");
    expect(linhas.map((l) => l.numero)).toContain("001");
  });

  it("trata R$ 0,00 como sem estoque, nunca como carta grátis", () => {
    const semEstoque = linhas.filter((l) => l.preco === null);
    expect(semEstoque).toHaveLength(1);
    expect(semEstoque[0].precoMedio).toBeNull();
    expect(semEstoque[0].precoMaximo).toBeNull();
  });

  it("converte preço em pt-BR para número", () => {
    const precos = linhas.map((l) => l.preco).filter((p) => p !== null);
    expect(precos).toContain(0.15);
    expect(precos).toContain(1.5);
    expect(precos.every((p) => p > 0)).toBe(true);
  });

  it("guarda o caminho da carta para o link de ofertas", () => {
    expect(linhas[0].caminho).toMatch(/^\/\?view=cards\/card&card=/);
  });

  it("devolve lista vazia para HTML sem resultado, sem lançar", () => {
    expect(parsearBuscaLiga("<html><body>nada aqui</body></html>")).toEqual([]);
  });

  it("ignora bloco sem link de carta em vez de derrubar a página inteira", () => {
    const sujo = `<div class="mtg-single"><div>propaganda</div></div>${html}`;
    expect(parsearBuscaLiga(sujo)).toHaveLength(5);
  });
});

describe("deveBuscarProximaPagina", () => {
  const linha = (preco: number | null): LinhaBuscaLiga => ({
    nome: "Bulbasaur",
    edicaoSigla: "MEG",
    edicaoId: 730,
    edicaoNome: "Mega Evolution",
    numero: "001",
    total: "230",
    preco,
    precoMedio: preco,
    precoMaximo: preco,
    caminho: "/?view=cards/card&card=Bulbasaur (001/230)",
  });

  const paginaCheia = (preco: number | null) => ({
    blocos: LINHAS_POR_PAGINA,
    linhas: Array.from({ length: LINHAS_POR_PAGINA }, () => linha(preco)),
  });

  it("para quando a página veio incompleta — é a última", () => {
    expect(deveBuscarProximaPagina({ blocos: 1, linhas: [linha(1)] }, 100)).toBe(false);
  });

  it("para quando o preço da página já passou do teto", () => {
    // Ordenação crescente: se o mais caro daqui já custa mais que o teto,
    // as próximas páginas são só mais caras.
    expect(deveBuscarProximaPagina(paginaCheia(50), 20)).toBe(false);
  });

  it("continua quando a página cheia ainda está abaixo do teto", () => {
    expect(deveBuscarProximaPagina(paginaCheia(5), 20)).toBe(true);
  });

  it("continua quando a página cheia é toda sem estoque", () => {
    // É exatamente o caso do Espeon medido em 2026-09-02: a primeira página
    // inteira sem estoque, e as cartas compráveis só na segunda.
    expect(deveBuscarProximaPagina(paginaCheia(null), 20)).toBe(true);
  });

  it("sem teto, segue enquanto a página vier cheia", () => {
    expect(deveBuscarProximaPagina(paginaCheia(999), null)).toBe(true);
  });

  it("conta BLOCOS, não linhas lidas — um bloco ilegível não encerra a busca", () => {
    // Caso real do Mewtwo (2026-09-02): 40 blocos, 39 parseados, e as cartas
    // com estoque estavam na página 2 que nunca foi buscada.
    const cheia = paginaCheia(null);
    expect(deveBuscarProximaPagina({ blocos: 40, linhas: cheia.linhas.slice(0, 39) }, 20)).toBe(true);
  });
});

describe("decodificação do rótulo vindo do href", () => {
  it("desfaz + e %27 no nome da carta", () => {
    // Caso real da primeira varredura (2026-09-02): o site escreve
    // `Team+Rocket%27s+Drowzee` dentro do href.
    const bloco = `<div class="mtg-single">
      <a href="/?view=cards/card&card=Team+Rocket%27s+Drowzee (079/182)&ed=DRI&num=079"></a>
      <div class="price-min">R$ 0,10</div></div>`;
    const [linha] = parsearBuscaLiga(bloco);
    expect(linha.nome).toBe("Team Rocket's Drowzee");
    expect(linha.numero).toBe("079");
  });

  it("mantém o caminho codificado — ele é URL, não texto", () => {
    const bloco = `<div class="mtg-single">
      <a href="/?view=cards/card&card=Team+Rocket%27s+Drowzee (079/182)&ed=DRI&num=079"></a></div>`;
    const [linha] = parsearBuscaLiga(bloco);
    expect(linha.caminho).toContain("%27");
  });

  it("não explode com sequência percentual malformada", () => {
    const bloco = `<div class="mtg-single">
      <a href="/?view=cards/card&card=Bulba%ZZsaur (001/165)&ed=MEW&num=001"></a></div>`;
    expect(() => parsearBuscaLiga(bloco)).not.toThrow();
  });
});

describe("entidade HTML dentro do parâmetro card", () => {
  it("lê a carta cujo total é ∞ escrito como entidade", () => {
    // `Mewtwo (104/&infin;)` — um `[^"&]+` corta no & da entidade e o bloco
    // inteiro se perde.
    const bloco = `<div class="mtg-single">
      <a href="/?view=cards/card&card=Mewtwo (104/&infin;)&ed=MEP&num=104"></a>
      <div class="price-min">R$ 0,50</div></div>`;
    const [linha] = parsearBuscaLiga(bloco);
    expect(linha).toBeDefined();
    expect(linha.nome).toBe("Mewtwo");
    expect(linha.edicaoSigla).toBe("MEP");
    expect(linha.preco).toBe(0.5);
  });
});

describe("contarBlocosBusca", () => {
  it("conta o que a página trouxe, mesmo o que o parser não lê", () => {
    const bloco = '<div class="mtg-single">sem link</div>';
    expect(contarBlocosBusca(bloco.repeat(3))).toBe(3);
    expect(parsearBuscaLiga(bloco.repeat(3))).toHaveLength(0);
  });
});

describe("termoDeBusca", () => {
  it("tira o símbolo de gênero e exige casamento com o catálogo", () => {
    // Eles escrevem `Nidoran [F]` / `Nidoran Female` / `Nidoran Fêmea`;
    // o símbolo devolve zero resultado.
    expect(termoDeBusca("Nidoran♀")).toEqual({ termo: "Nidoran", exigeCasamento: true });
    expect(termoDeBusca("Nidoran♂")).toEqual({ termo: "Nidoran", exigeCasamento: true });
  });

  it("deixa o nome comum intacto e sem exigência", () => {
    expect(termoDeBusca("Bulbasaur")).toEqual({ termo: "Bulbasaur", exigeCasamento: false });
    expect(termoDeBusca("Mr. Mime")).toEqual({ termo: "Mr. Mime", exigeCasamento: false });
    expect(termoDeBusca("Farfetch'd")).toEqual({ termo: "Farfetch'd", exigeCasamento: false });
  });
});

describe("nomeCompativelComEspecie", () => {
  it("recusa a espécie cujo nome apenas contém a buscada", () => {
    // O caso que motivou a função: a vaga do Mew recebeu oferta de Mewtwo.
    expect(nomeCompativelComEspecie("Mewtwo", "Mew")).toBe(false);
    expect(nomeCompativelComEspecie("Mewtwo ex", "Mew")).toBe(false);
    expect(nomeCompativelComEspecie("Pidgeotto", "Pidgey")).toBe(false);
    expect(nomeCompativelComEspecie("Nidorina", "Nidoran")).toBe(false);
  });

  it("aceita a própria espécie, inclusive com prefixo de dono ou sufixo", () => {
    expect(nomeCompativelComEspecie("Mew", "Mew")).toBe(true);
    expect(nomeCompativelComEspecie("Mew ex", "Mew")).toBe(true);
    expect(nomeCompativelComEspecie("Team Rocket's Nidoran Female", "Nidoran♀")).toBe(true);
    expect(nomeCompativelComEspecie("Giovanni's Nidoran Male", "Nidoran♂")).toBe(true);
  });

  it("ignora acento e caixa", () => {
    expect(nomeCompativelComEspecie("NIDORAN FÊMEA", "Nidoran♀")).toBe(true);
    expect(nomeCompativelComEspecie("flabebe", "Flabébé")).toBe(true);
  });

  it("lida com pontuação no nome da espécie", () => {
    expect(nomeCompativelComEspecie("Mr. Mime", "Mr. Mime")).toBe(true);
    expect(nomeCompativelComEspecie("Farfetch'd", "Farfetch'd")).toBe(true);
    expect(nomeCompativelComEspecie("Galarian Farfetch'd", "Farfetch'd")).toBe(true);
  });
});
