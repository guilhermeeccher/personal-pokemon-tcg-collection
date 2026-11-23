/**
 * A convivência da v1 (em `/v1/...`) com a v2 (na raiz), lida do disco, sem
 * banco: toda tela antiga tem par na raiz, toda ponte vai para a mesma tela e
 * ela existe, a v1 nunca linka para a raiz, e a v2 não importa a pele da v1.
 * As regras e o porquê estão em `telas-v1.ts`; a segunda metade deste arquivo
 * prova, com fontes de exemplo, que cada violação é pega.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { especificadoresDeImportacao, resolverBase } from "./acesso/cobertura-estatica";
import {
  catchAllsOpcionais,
  destinoDaPonte,
  ehCaminhoDeTelaSemV1,
  literaisDeTelaSemV1,
  rotaCobre,
  rotaDaPagina,
  semPrefixoV1,
} from "./telas-v1";

const RAIZ = path.resolve(__dirname, "../../..");
const APP = "src/app";

function listar(pasta: string): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(path.join(RAIZ, pasta))) {
    const relativo = `${pasta}/${nome}`;
    if (statSync(path.join(RAIZ, relativo)).isDirectory()) achados.push(...listar(relativo));
    else achados.push(relativo);
  }
  return achados;
}

const ARQUIVOS = listar(APP);
const ler = (arquivo: string) => readFileSync(path.join(RAIZ, arquivo), "utf8");
const doApp = (arquivo: string) => arquivo.slice(APP.length + 1);
const ehFonte = (a: string) => /\.tsx?$/.test(a);

const PAGINAS = ARQUIVOS.filter((a) => a.endsWith("/page.tsx"));
const rotaDe = (a: string) => rotaDaPagina(doApp(a));
const PAGINAS_V1 = PAGINAS.filter((a) => a.startsWith(`${APP}/(v1)/v1/`));
const PAGINAS_V2 = PAGINAS.filter((a) => a.startsWith(`${APP}/(v2)/`));
const ROTAS_V1 = PAGINAS_V1.map((a) => rotaDe(a)!);
const ROTAS_V2 = PAGINAS_V2.map((a) => rotaDe(a)!);

describe("telas da v1 e pares na raiz", () => {
  it("encontra as telas (o varredor não está olhando para o lugar errado)", () => {
    expect(ROTAS_V1).toContain("/v1");
    expect(ROTAS_V1).toContain("/v1/colecoes/[id]/opcoes-compra");
    expect(ROTAS_V1).toContain("/v1/dex/pokedex");
    expect(ROTAS_V1.length).toBeGreaterThan(20);
  });

  it("toda página da v1 mora em /v1 (nenhuma tela solta no grupo da v1; o login é da v2)", () => {
    const fora = PAGINAS.filter((a) => a.startsWith(`${APP}/(v1)/`) && !a.startsWith(`${APP}/(v1)/v1/`));
    expect(fora).toEqual([]);
  });

  it.each(ROTAS_V1)("%s tem par na raiz (página da v2 ou ponte)", (rota) => {
    const naRaiz = semPrefixoV1(rota)!;
    const par = ROTAS_V2.find((r) => rotaCobre(r, naRaiz));
    expect(par, `nenhuma página em src/app/(v2) responde por ${naRaiz}`).toBeDefined();
  });

  it("nenhuma página fica fora dos dois grupos (o layout raiz de cada uma é o da sua versão)", () => {
    const soltas = PAGINAS.filter((a) => !a.startsWith(`${APP}/(v1)/`) && !a.startsWith(`${APP}/(v2)/`));
    expect(soltas).toEqual([]);
  });
});

describe("pontes", () => {
  const pontes = PAGINAS_V2.map((a) => ({ arquivo: a, rota: rotaDe(a)!, fonte: ler(a) })).filter(
    (p) => destinoDaPonte(p.fonte, catchAllsOpcionais(p.rota)) !== null,
  );

  it("encontra as pontes", () => {
    expect(pontes.length).toBeGreaterThan(0);
  });

  it.each(pontes)("$rota vai para a mesma tela em /v1, e ela existe", ({ rota, fonte }) => {
    const destino = destinoDaPonte(fonte, catchAllsOpcionais(rota));
    expect(destino, "o destino tem de ser um array literal de segmentos").not.toBe("invalido");
    expect(destino).toBe(rota);
    /* Catch-all: basta existir alguma tela da v1 abaixo dele; as que não
       existem caem no 404 da v1, como antes. Fora isso, a mesma rota em /v1. */
    const naV1 = ROTAS_V1.map((r) => semPrefixoV1(r)!);
    const ehCatchAll = rota.includes("[...") || rota.includes("[[...");
    expect(ehCatchAll ? naV1.some((r) => rotaCobre(rota, r)) : naV1.includes(rota)).toBe(true);
  });

  it("nenhum catch-all na v2, na raiz nem abaixo de /dex (a raiz pegaria os caminhos do módulo de acesso desligado; a Dex tem uma ponte por tela, e o caminho que a v1 não tem cai no 404 padrão)", () => {
    const catchAlls = ROTAS_V2.filter((r) => r.includes("[..."));
    expect(catchAlls).toEqual([]);
  });
});

describe("a v1 nunca linka para a raiz", () => {
  const daV1 = ARQUIVOS.filter(
    (a) => ehFonte(a) && (a.startsWith(`${APP}/(v1)/`) || a.startsWith(`${APP}/_componentes/`)),
  );

  it("encontra os arquivos", () => {
    expect(daV1).toContain(`${APP}/_componentes/nav-estrutura.ts`);
    expect(daV1.length).toBeGreaterThan(50);
  });

  it.each(daV1)("%s", (arquivo) => {
    const soltos = literaisDeTelaSemV1(ler(arquivo)).map((l) => `${arquivo}:${l.linha} "${l.texto}"`);
    expect(soltos, `caminho de tela sem /v1: ${soltos.join(", ")}`).toEqual([]);
  });
});

describe("a v2 não importa a pele da v1", () => {
  const daV2 = ARQUIVOS.filter((a) => ehFonte(a) && a.startsWith(`${APP}/(v2)/`));
  const PELE_V1 = [`${APP}/_componentes`, `${APP}/(v1)`];

  it.each(daV2)("%s", (arquivo) => {
    const proibidos = especificadoresDeImportacao(ler(arquivo)).filter((esp) => {
      const base = resolverBase(esp, arquivo);
      return base !== null && PELE_V1.some((p) => base === p || base.startsWith(`${p}/`));
    });
    expect(proibidos, `${arquivo} importa da v1: ${proibidos.join(", ")}`).toEqual([]);
  });
});

/* ---------- o verificador pega cada violação ---------- */

describe("rotaDaPagina", () => {
  it("tira os grupos e devolve a URL", () => {
    expect(rotaDaPagina("(v1)/v1/page.tsx")).toBe("/v1");
    expect(rotaDaPagina("(v1)/v1/colecoes/[id]/page.tsx")).toBe("/v1/colecoes/[id]");
    expect(rotaDaPagina("(v2)/login/page.tsx")).toBe("/login");
    expect(rotaDaPagina("(v2)/page.tsx")).toBe("/");
    expect(rotaDaPagina("(v2)/dex/[[...resto]]/page.tsx")).toBe("/dex/[[...resto]]");
  });

  it("ignora o que não é página e as pastas privadas", () => {
    expect(rotaDaPagina("(v2)/layout.tsx")).toBeNull();
    expect(rotaDaPagina("(v2)/_ponte/page.tsx")).toBeNull();
  });
});

describe("rotaCobre", () => {
  it("rota fixa só cobre ela mesma", () => {
    expect(rotaCobre("/colecoes", "/colecoes")).toBe(true);
    expect(rotaCobre("/colecoes", "/colecoes/nova")).toBe(false);
    expect(rotaCobre("/colecoes/nova", "/colecoes")).toBe(false);
    expect(rotaCobre("/", "/")).toBe(true);
    expect(rotaCobre("/", "/colecoes")).toBe(false);
  });

  it("[id] cobre [id] mas não um estático no lugar errado", () => {
    expect(rotaCobre("/colecoes/[id]", "/colecoes/[id]")).toBe(true);
    expect(rotaCobre("/colecoes/[id]", "/colecoes/falta")).toBe(true); // o Next prefere o estático, mas a URL tem dono
    expect(rotaCobre("/colecoes/falta", "/colecoes/[id]")).toBe(false);
    expect(rotaCobre("/colecoes/[id]", "/colecoes/[id]/opcoes-compra")).toBe(false);
  });

  it("catch-all opcional cobre a pasta e tudo abaixo; o obrigatório, só abaixo", () => {
    expect(rotaCobre("/dex/[[...resto]]", "/dex")).toBe(true);
    expect(rotaCobre("/dex/[[...resto]]", "/dex/pokedex")).toBe(true);
    expect(rotaCobre("/dex/[[...resto]]", "/colecoes")).toBe(false);
    expect(rotaCobre("/dex/[...resto]", "/dex")).toBe(false);
    expect(rotaCobre("/dex/[...resto]", "/dex/a/b")).toBe(true);
  });
});

describe("destinoDaPonte", () => {
  const ponte = (chamada: string) =>
    `import { irParaV1 } from "@/app/(v2)/_ponte/ir-para-v1";\nexport default async function P() { await exigirSessao(); ${chamada} }`;

  it("lê os segmentos fixos, o [id] e o catch-all", () => {
    expect(destinoDaPonte(ponte(`irParaV1(["colecoes", "nova"], {});`), new Set())).toBe("/colecoes/nova");
    expect(destinoDaPonte(ponte(`irParaV1([], {});`), new Set())).toBe("/");
    expect(destinoDaPonte(ponte(`irParaV1(["colecoes", id], b);`), new Set())).toBe("/colecoes/[id]");
    expect(destinoDaPonte(ponte(`irParaV1(["dex", ...resto], b);`), new Set(["resto"]))).toBe("/dex/[[...resto]]");
  });

  it("página que não é ponte", () => {
    expect(destinoDaPonte(`export default async function P() { return null; }`, new Set())).toBeNull();
  });

  it("recusa o destino que não dá para conferir", () => {
    expect(destinoDaPonte(ponte(`irParaV1(segmentos, b);`), new Set())).toBe("invalido");
    expect(destinoDaPonte(ponte(`irParaV1(["colecoes", \`x\${id}\`], b);`), new Set())).toBe("invalido");
    expect(destinoDaPonte(ponte(`irParaV1(["a"], b); irParaV1(["b"], b);`), new Set())).toBe("invalido");
  });

  it("uma ponte que aponta para outra tela é pega pela comparação com a rota", () => {
    expect(destinoDaPonte(ponte(`irParaV1(["colecoes"], {});`), new Set())).not.toBe("/colecoes/nova");
  });
});

describe("literais de caminho de tela", () => {
  it("o que é e o que não é caminho de tela sem /v1", () => {
    for (const t of ["/", "/colecoes", "/colecoes/nova?set=x", "/dex/cadastrar?", "/inventario#x", "/v1x", "/v2"]) {
      expect(ehCaminhoDeTelaSemV1(t), t).toBe(true);
    }
    for (const t of [
      "/v1",
      "/v1/colecoes",
      "/v1?x=1",
      "/api/colecoes",
      "/login",
      "/login?volta=%2F",
      "/pwa/icone-180.png",
      "/manifest.webmanifest",
      "/favicon.ico",
      "#caixa-3",
      "https://www.ligapokemon.com.br/",
      "//cdn",
      "colecoes",
      "",
    ]) {
      expect(ehCaminhoDeTelaSemV1(t), t).toBe(false);
    }
    expect(ehCaminhoDeTelaSemV1("/loginx")).toBe(true);
  });

  it("pega href, Link, router.push, template e estrutura do menu, com a linha", () => {
    const fonte = [
      `const a = <a href="/colecoes">x</a>;`,
      `router.push(\`/colecoes/\${id}\`);`,
      `const itens = [{ href: "/dex/planos" }];`,
      `const ok = <Link href="/v1/colecoes">x</Link>;`,
    ].join("\n");
    expect(literaisDeTelaSemV1(fonte)).toEqual([
      { linha: 1, texto: "/colecoes" },
      { linha: 2, texto: "/colecoes/" },
      { linha: 3, texto: "/dex/planos" },
    ]);
  });

  it("o template que começa por /${...} conta em posição de navegação", () => {
    const fonte = [
      `router.replace(\`/\${secao}/planos\`);`,
      `router.push(x ? \`/\${a}\` : "/v1");`,
      `const l = <Link href={\`/\${secao}\`}>x</Link>;`,
      `const o = <Link href={{ pathname: \`/\${secao}/planos\`, query: { a: 1 } }}>x</Link>;`,
      `const p = { href: \`/\${secao}\` + "?a=1" };`,
      `redirect(\`/\${s}\`);`,
      `location.assign(\`/\${s}\` as string);`,
    ].join("\n");
    expect(literaisDeTelaSemV1(fonte).map((l) => l.linha)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("e não conta na numeração n/total de um texto de tela", () => {
    const fonte = [
      `const a = <span>{o.total ? \`/\${o.total}\` : ""}</span>;`,
      `const b = \`(\${o.numero}\${o.total ? \`/\${o.total}\` : ""})\`;`,
      `const c = rotulo(\`/\${total}\`);`,
      `const d = <a title={\`/\${total}\`} href="/v1">x</a>;`,
    ].join("\n");
    expect(literaisDeTelaSemV1(fonte)).toEqual([]);
  });

  it("ignora comentário, import, tipo de rota e a numeração n/total", () => {
    const fonte = [
      `// a tela /colecoes mostra "/colecoes"`,
      `import x from "/colecoes";`,
      `type P = PageProps<"/colecoes/nova">;`,
      `const n = \`\${a}/\${b}\`;`,
      `const m = \`/\${total}\`;`,
      `fetch("/api/colecoes");`,
    ].join("\n");
    expect(literaisDeTelaSemV1(fonte)).toEqual([]);
  });
});
