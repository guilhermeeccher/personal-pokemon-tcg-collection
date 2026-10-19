/**
 * Teste estático do acesso por senha: percorre `src/app` no disco e falha se
 * a proteção faltar em qualquer ponto de entrada. É a terceira camada de
 * defesa (as outras duas são o proxy e o `comAcesso`/`exigirSessao` em si):
 * a que impede que o próximo `route.ts`, `page.tsx` ou server action nasça
 * sem guarda e ninguém perceba.
 *
 * A análise (`cobertura-estatica.ts`) lê a AST; a segunda metade deste
 * arquivo prova, com fontes de exemplo, que cada violação é de fato pega —
 * um verificador que nunca falha não verifica nada.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  cadeiaAteOBanco,
  ehArquivoDeAcao,
  metodosExportados,
  problemasDeAcao,
  problemasDePagina,
  problemasDeRouteHandler,
  problemasDeUseServerInterno,
} from "./cobertura-estatica";
import { CAMINHOS_ROTAS_DO_MODULO } from "./rotas-publicas";

const RAIZ = path.resolve(__dirname, "../../../..");
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
const lerDisco = (caminho: string): string | undefined => {
  const completo = path.join(RAIZ, caminho);
  return existsSync(completo) && statSync(completo).isFile() ? readFileSync(completo, "utf8") : undefined;
};
const sob = (relativoAoApp: string) => `${APP}/${relativoAoApp}`;

/**
 * Todo `route.ts` que exporta `GET`. Um `GET` é lido sem sessão por qualquer
 * coisa que faça uma navegação (imagem, link, prefetch) e não passa pela
 * checagem de origem, então **só pode ler**. Um `GET` novo quebra este teste
 * até alguém conferir que ele não altera dados (nada de insert, update,
 * delete, disparo de rodada, download, escrita em arquivo ou cookie) e o
 * acrescentar aqui. Dois GETs de hoje fazem uma única escrita de limpeza,
 * idempotente: fecham rodadas de varredura mortas
 * (`opcoes-compra` e `inventario/precos`).
 */
const ROTAS_COM_GET = [
  "api/cartas/route.ts",
  "api/colecoes/[id]/exportar/route.ts",
  "api/colecoes/[id]/melhorias/route.ts",
  "api/colecoes/[id]/opcoes-compra/exportar/route.ts",
  "api/colecoes/[id]/opcoes-compra/route.ts",
  "api/colecoes/[id]/opcoes-compra/sem-estoque/route.ts",
  "api/colecoes/[id]/route.ts",
  "api/colecoes/route.ts",
  "api/copias/[id]/destinos/route.ts",
  "api/copias/elegiveis-vagas-vazias/route.ts",
  "api/copias/exportar-liga/route.ts",
  "api/copias/exportar/route.ts",
  "api/copias/route.ts",
  "api/dex/jogos/route.ts",
  "api/imagens-locais/[cartaId]/[idioma]/route.ts",
  "api/inventario/precos/route.ts",
  "api/inventario/repetidas/route.ts",
  "api/inventario/resumo/route.ts",
  "api/saude/route.ts",
  "api/sets-mypcards/route.ts",
  "api/sets/[setId]/cartas/route.ts",
  "api/sets/route.ts",
  "api/vagas/[id]/candidatos/route.ts",
  "manifest.webmanifest/route.ts",
  "pwa/[arquivo]/route.ts",
  "robots.txt/route.ts",
];

describe("cobertura estática: route handlers", () => {
  const rotas = ARQUIVOS.filter((a) => a.endsWith("/route.ts"));
  const doModulo: ReadonlySet<string> = new Set(CAMINHOS_ROTAS_DO_MODULO.map(sob));

  it.each(rotas)("%s: todo método HTTP está envolvido", (arquivo) => {
    const problemas = problemasDeRouteHandler(readFileSync(path.join(RAIZ, arquivo), "utf8"), doModulo.has(arquivo));
    expect(problemas, `${arquivo}: ${problemas.join("; ")}`).toEqual([]);
  });

  it("todo arquivo de CAMINHOS_ROTAS_DO_MODULO existe (a lista não está desatualizada)", () => {
    const faltando = CAMINHOS_ROTAS_DO_MODULO.filter((c) => !existsSync(path.join(RAIZ, sob(c))));
    expect(faltando, `não existem em src/app: ${faltando.join(", ")}`).toEqual([]);
  });

  it("os route.ts com GET são exatamente a lista conferida (ver o comentário da lista)", () => {
    const reais = rotas
      .filter((a) => metodosExportados(readFileSync(path.join(RAIZ, a), "utf8")).includes("GET"))
      .map((a) => a.slice(APP.length + 1))
      .sort();
    expect(reais).toEqual([...ROTAS_COM_GET].sort());
  });
});

describe("cobertura estática: páginas", () => {
  const paginas = ARQUIVOS.filter((a) => a.endsWith("/page.tsx") && a !== sob("login/page.tsx"));

  it("encontra páginas (o varredor não está olhando para o lugar errado)", () => {
    expect(paginas.length).toBeGreaterThan(10);
  });

  it.each(paginas)("%s: começa por await exigirSessao()", (arquivo) => {
    const problemas = problemasDePagina(readFileSync(path.join(RAIZ, arquivo), "utf8"));
    expect(problemas, `${arquivo}: ${problemas.join("; ")}`).toEqual([]);
  });
});

describe("cobertura estática: server actions", () => {
  const acoes = ARQUIVOS.filter((a) => /\.tsx?$/.test(a) && ehArquivoDeAcao(readFileSync(path.join(RAIZ, a), "utf8")));

  it("encontra as actions", () => {
    expect(acoes).toContain(sob("_acoes/definir-locale.ts"));
  });

  it.each(acoes)("%s: toda action começa por await exigirSessaoNaAcao()", (arquivo) => {
    const problemas = problemasDeAcao(readFileSync(path.join(RAIZ, arquivo), "utf8"));
    expect(problemas, `${arquivo}: ${problemas.join("; ")}`).toEqual([]);
  });
});

describe("cobertura estática: nenhuma server function dentro de função", () => {
  // A regra do projeto: server action só em arquivo com "use server" no topo
  // (conferido acima). Uma action declarada dentro de uma página ou de um
  // componente seria um endpoint sem guarda, mesmo com a página protegida.
  const fontes = ARQUIVOS.filter((a) => /\.tsx?$/.test(a) && !a.endsWith(".test.ts"));

  it.each(fontes)("%s", (arquivo) => {
    const problemas = problemasDeUseServerInterno(readFileSync(path.join(RAIZ, arquivo), "utf8"));
    expect(problemas, `${arquivo}: ${problemas.join("; ")}`).toEqual([]);
  });
});

describe("cobertura estática: arquivos especiais não chegam ao banco", () => {
  const ESPECIAIS = /\/(layout|template|loading|error|global-error|not-found|default)\.tsx?$/;
  const especiais = ARQUIVOS.filter((a) => ESPECIAIS.test(a));

  it("encontra o layout raiz", () => {
    expect(especiais).toContain(sob("layout.tsx"));
  });

  it.each(especiais)("%s: não importa @/lib/db, direta nem indiretamente", (arquivo) => {
    const cadeia = cadeiaAteOBanco(arquivo, lerDisco);
    expect(cadeia, cadeia ? `${arquivo} chega ao banco por: ${cadeia.join(" -> ")}` : "").toBeNull();
  });
});

/* ---------- o verificador pega cada violação ---------- */

const IMPORTA = `import { comAcesso, rotaDoModulo, exigirSessao, exigirSessaoNaAcao } from "@/lib/acesso";\n`;

describe("o verificador de route handlers", () => {
  it("aceita comAcesso", () => {
    const fonte = `${IMPORTA}export const GET = comAcesso(async function GET() { return Response.json({}); });`;
    expect(problemasDeRouteHandler(fonte, false)).toEqual([]);
  });

  it("aceita comAcesso com arrow e rotaDoModulo no arquivo do módulo", () => {
    const fonte = `${IMPORTA}export const GET = rotaDoModulo(async () => new Response(null));\nexport const POST = comAcesso(async () => new Response(null));`;
    expect(problemasDeRouteHandler(fonte, true)).toEqual([]);
  });

  it("pega handler sem envoltório", () => {
    expect(problemasDeRouteHandler(`export async function GET() { return Response.json({}); }`, false)).not.toEqual([]);
    expect(problemasDeRouteHandler(`export function POST() { return Response.json({}); }`, false)).not.toEqual([]);
    expect(problemasDeRouteHandler(`${IMPORTA}export const DELETE = async () => new Response(null);`, false)).not.toEqual([]);
  });

  it("pega um envoltório que não é o comAcesso", () => {
    expect(problemasDeRouteHandler(`${IMPORTA}export const GET = outraCoisa(async () => new Response(null));`, false)).not.toEqual([]);
  });

  it("pega comAcesso que não vem de @/lib/acesso", () => {
    const fonte = `const comAcesso = <T,>(h: T) => h;\nexport const GET = comAcesso(async () => new Response(null));`;
    expect(problemasDeRouteHandler(fonte, false)).not.toEqual([]);
  });

  it("pega rotaDoModulo fora da lista", () => {
    const fonte = `${IMPORTA}export const GET = rotaDoModulo(async () => new Response(null));`;
    expect(problemasDeRouteHandler(fonte, false)).not.toEqual([]);
  });

  it("pega a reexportação com outro nome, o export * e o default", () => {
    expect(problemasDeRouteHandler(`${IMPORTA}const y = comAcesso(async () => new Response(null));\nexport { y as GET };`, false)).not.toEqual([]);
    expect(problemasDeRouteHandler(`export * from "./outro";`, false)).not.toEqual([]);
    expect(problemasDeRouteHandler(`export default async function handler() {}`, false)).not.toEqual([]);
    expect(problemasDeRouteHandler(`const h = async () => {};\nexport default h;`, false)).not.toEqual([]);
  });

  it("ignora export que não é método (dynamic, runtime)", () => {
    expect(problemasDeRouteHandler(`export const dynamic = "force-dynamic";`, false)).toEqual([]);
  });

  it("pega comentário e string fingindo ser a proteção", () => {
    const fonte = `// export const GET = comAcesso(async () => {});\nexport async function GET() { const s = "comAcesso("; }`;
    expect(problemasDeRouteHandler(fonte, false)).not.toEqual([]);
  });

  it("metodosExportados enxerga qualquer forma de export de GET", () => {
    expect(metodosExportados(`export async function GET() {}`)).toEqual(["GET"]);
    expect(metodosExportados(`export const GET = comAcesso(f);`)).toEqual(["GET"]);
    expect(metodosExportados(`const y = 1;\nexport { y as GET, y as dynamic };`)).toEqual(["GET"]);
    expect(metodosExportados(`export const POST = comAcesso(f);`)).toEqual(["POST"]);
  });
});

describe("o verificador de páginas", () => {
  it("aceita a página em ordem, com generateMetadata", () => {
    const fonte = `${IMPORTA}export async function generateMetadata() { await exigirSessao(); return {}; }
export default async function Pagina() { await exigirSessao(); return null; }`;
    expect(problemasDePagina(fonte)).toEqual([]);
  });

  it("pega página sem exigirSessao", () => {
    expect(problemasDePagina(`export default async function Pagina() { return null; }`)).not.toEqual([]);
  });

  it("pega exigirSessao na segunda instrução", () => {
    const fonte = `${IMPORTA}export default async function Pagina() { const x = await dados(); await exigirSessao(); return x; }`;
    expect(problemasDePagina(fonte)).not.toEqual([]);
  });

  it("pega exigirSessao sem await e com argumento", () => {
    expect(problemasDePagina(`${IMPORTA}export default async function P() { exigirSessao(); return null; }`)).not.toEqual([]);
    expect(problemasDePagina(`${IMPORTA}export default async function P() { await exigirSessao(1); return null; }`)).not.toEqual([]);
  });

  it('pega página "use client"', () => {
    const fonte = `"use client";\n${IMPORTA}export default async function P() { await exigirSessao(); return null; }`;
    expect(problemasDePagina(fonte)).not.toEqual([]);
  });

  it("pega generateMetadata e generateViewport sem a chamada", () => {
    const base = `${IMPORTA}export default async function P() { await exigirSessao(); return null; }\n`;
    expect(problemasDePagina(`${base}export async function generateMetadata() { return {}; }`)).not.toEqual([]);
    expect(problemasDePagina(`${base}export const generateViewport = async () => ({});`)).not.toEqual([]);
    expect(problemasDePagina(`${base}export async function generateViewport() { await dados(); await exigirSessao(); return {}; }`)).not.toEqual([]);
  });

  it("pega default export que não é declaração de função", () => {
    expect(problemasDePagina(`${IMPORTA}const P = async () => { await exigirSessao(); return null; };\nexport default P;`)).not.toEqual([]);
  });

  it("pega página sem default export", () => {
    expect(problemasDePagina(`export const x = 1;`)).not.toEqual([]);
  });
});

describe("o verificador de server actions", () => {
  it("reconhece o arquivo de actions pela diretiva", () => {
    expect(ehArquivoDeAcao(`"use server";\nexport async function a() {}`)).toBe(true);
    expect(ehArquivoDeAcao(`export async function a() {}`)).toBe(false);
    expect(ehArquivoDeAcao(`const s = "use server";`)).toBe(false);
  });

  it("aceita a action em ordem", () => {
    const fonte = `"use server";\n${IMPORTA}export async function a() { await exigirSessaoNaAcao(); }\nexport const b = async () => { await exigirSessaoNaAcao(); };`;
    expect(problemasDeAcao(fonte)).toEqual([]);
  });

  it("pega action sem a chamada", () => {
    expect(problemasDeAcao(`"use server";\nexport async function a() { return 1; }`)).not.toEqual([]);
    expect(problemasDeAcao(`"use server";\nexport const b = async () => 1;`)).not.toEqual([]);
  });

  it("pega action com exigirSessao em vez de exigirSessaoNaAcao", () => {
    expect(problemasDeAcao(`"use server";\n${IMPORTA}export async function a() { await exigirSessao(); }`)).not.toEqual([]);
  });

  it("pega a chamada na segunda instrução e o export que esconde a função", () => {
    expect(problemasDeAcao(`"use server";\n${IMPORTA}export async function a() { const x = 1; await exigirSessaoNaAcao(); }`)).not.toEqual([]);
    expect(problemasDeAcao(`"use server";\nasync function a() {}\nexport { a };`)).not.toEqual([]);
  });
});

describe("o verificador de procedência das guardas", () => {
  const pagina = (cabeca: string, corpo = "await exigirSessao();") =>
    `${cabeca}\nexport default async function P() { ${corpo} return null; }`;
  const acao = (cabeca: string) =>
    `"use server";\n${cabeca}\nexport async function a() { await exigirSessaoNaAcao(); }`;

  it("aceita a guarda importada de @/lib/acesso", () => {
    expect(problemasDePagina(pagina(`import { exigirSessao } from "@/lib/acesso";`))).toEqual([]);
    expect(problemasDeAcao(acao(`import { exigirSessaoNaAcao } from "@/lib/acesso";`))).toEqual([]);
  });

  it("pega função local vazia com o nome da guarda", () => {
    expect(problemasDePagina(pagina(`async function exigirSessao() {}`))).not.toEqual([]);
    expect(problemasDeAcao(acao(`async function exigirSessaoNaAcao() {}`))).not.toEqual([]);
    expect(problemasDePagina(pagina(`const exigirSessao = async () => {};`))).not.toEqual([]);
  });

  it("pega import do mesmo nome de outro módulo, e import renomeado", () => {
    expect(problemasDePagina(pagina(`import { exigirSessao } from "./falso";`))).not.toEqual([]);
    expect(problemasDeAcao(acao(`import { exigirSessaoNaAcao } from "../falso";`))).not.toEqual([]);
    expect(problemasDePagina(pagina(`import { outra as exigirSessao } from "@/lib/acesso";`))).not.toEqual([]);
    expect(problemasDePagina(pagina(`import { exigirSessao as x } from "@/lib/acesso";`))).not.toEqual([]);
  });

  it("pega import do acesso mais uma declaração do mesmo nome (sombreamento)", () => {
    const cabeca = `import { exigirSessao } from "@/lib/acesso";`;
    expect(problemasDePagina(`${cabeca}\nexport default async function P(exigirSessao: () => Promise<void>) { await exigirSessao(); return null; }`)).not.toEqual([]);
    expect(problemasDePagina(`${cabeca}\nexport default async function P() { const exigirSessao = async () => {}; await exigirSessao(); return null; }`)).not.toEqual([]);
  });

  it("vale também para generateMetadata", () => {
    const fonte = `import { exigirSessao } from "./falso";\nexport default async function P() { return null; }\nexport async function generateMetadata() { await exigirSessao(); return {}; }`;
    expect(problemasDePagina(fonte)).not.toEqual([]);
  });
});

describe("o verificador de server functions dentro de função", () => {
  it("pega a action interna de uma página protegida, sem guarda", () => {
    const fonte = `${IMPORTA}export default async function P() {
  await exigirSessao();
  async function salvar() { "use server"; await gravar(); }
  return salvar;
}`;
    expect(problemasDePagina(fonte)).toEqual([]); // a página em si está protegida...
    const problemas = problemasDeUseServerInterno(fonte);
    expect(problemas).not.toEqual([]); // ...mas a action interna é proibida
    expect(problemas[0]).toContain("arquivo com");
  });

  it("pega arrow, expressão de função e método", () => {
    expect(problemasDeUseServerInterno(`export const f = async () => { "use server"; };`)).not.toEqual([]);
    expect(problemasDeUseServerInterno(`export const f = async function () { "use server"; };`)).not.toEqual([]);
    expect(problemasDeUseServerInterno(`export const o = { async m() { "use server"; } };`)).not.toEqual([]);
  });

  it("não acusa a diretiva do topo do arquivo nem a string comum", () => {
    expect(problemasDeUseServerInterno(`"use server";\nexport async function a() {}`)).toEqual([]);
    expect(problemasDeUseServerInterno(`export function f() { const s = "use server"; return s; }`)).toEqual([]);
  });
});

describe("o verificador de arquivos especiais", () => {
  const arvore: Record<string, string> = {
    "src/app/layout.tsx": `import { Barra } from "./barra";\nexport default function L() { return Barra; }`,
    "src/app/barra.tsx": `import { dados } from "@/lib/consultas-do-menu";\nexport const Barra = dados;`,
    "src/lib/consultas-do-menu.ts": `import { db } from "@/lib/db/client";\nexport const dados = db;`,
    "src/lib/db/client.ts": `export const db = 1;`,
    "src/app/limpo.tsx": `import React from "react";\nimport { x } from "@/lib/puro";\nexport const y = x;`,
    "src/lib/puro.ts": `export const x = 1;`,
    "src/app/ciclo-a.tsx": `import "./ciclo-b";`,
    "src/app/ciclo-b.tsx": `import "./ciclo-a";`,
    "src/app/dinamico.tsx": `export const f = () => import("../lib/db");`,
    "src/lib/db.ts": `export const db = 1;`,
  };
  const ler = (c: string) => arvore[c];

  it("pega layout que chega ao banco por um arquivo intermediário", () => {
    expect(cadeiaAteOBanco("src/app/layout.tsx", ler)).toEqual([
      "src/app/layout.tsx",
      "src/app/barra.tsx",
      "src/lib/consultas-do-menu.ts",
      "src/lib/db/client",
    ]);
  });

  it("pega import dinâmico do banco", () => {
    expect(cadeiaAteOBanco("src/app/dinamico.tsx", ler)).not.toBeNull();
  });

  it("deixa passar quem não chega ao banco, ignora pacotes e sobrevive a ciclo", () => {
    expect(cadeiaAteOBanco("src/app/limpo.tsx", ler)).toBeNull();
    expect(cadeiaAteOBanco("src/app/ciclo-a.tsx", ler)).toBeNull();
  });
});
