/**
 * O comportamento de cada página-ponte da v2, executada de verdade: a guarda
 * vem antes de tudo, o redirecionamento é 307 (nunca 308) para a mesma tela em
 * `/v1` com a mesma query, e a Dex desligada dá 404 sem redirecionar.
 * `telas-v1.test.ts` confere a forma das pontes lendo o código; este confere o
 * que elas fazem, e pega o que aquele não vê — uma guarda da Dex removida, um
 * `{}` no lugar de `searchParams`, um `permanentRedirect`.
 *
 * O `redirect()` e o `notFound()` são os do Next, não simulados: eles lançam um
 * erro cujo `digest` diz o tipo, o destino e o código HTTP, e é ele que o
 * teste lê. Simulados são só a sessão e a flag do módulo.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { destinoV1 } from "@/lib/dominio/destino-v1";
import { rotaDaPagina } from "@/lib/dominio/telas-v1";

const estado = vi.hoisted(() => ({ livingDex: true, recusarSessao: false, chamadas: [] as string[] }));

vi.mock("@/lib/acesso", () => ({
  exigirSessao: async () => {
    estado.chamadas.push("exigirSessao");
    if (estado.recusarSessao) throw new Error("sem sessão");
  },
}));
vi.mock("@/lib/modulos", () => ({
  moduloLivingDexAtivo: () => {
    estado.chamadas.push("moduloLivingDexAtivo");
    return estado.livingDex;
  },
}));

/* Uma ponte por tela da Dex, sem catch-all: um caminho de Dex que a v1 não tem
   cai no 404 padrão do Next, ligado ou desligado o módulo. */
const TELAS_DA_DEX = [
  "/dex/cadastrar",
  "/dex/caixas",
  "/dex/novo-cadastro",
  "/dex/planos",
  "/dex/recebidos",
  "/dex/trofeus",
];

const PASTA_V2 = path.resolve(__dirname, "..");

function paginas(pasta: string): string[] {
  const achadas: string[] = [];
  for (const nome of readdirSync(pasta)) {
    const completo = path.join(pasta, nome);
    if (statSync(completo).isDirectory()) achadas.push(...paginas(completo));
    else if (nome === "page.tsx") achadas.push(completo);
  }
  return achadas;
}

type Props = { params: Promise<Record<string, string | string[]>>; searchParams: Promise<Record<string, string | string[]>> };
type Pagina = { default: (props: Props) => Promise<unknown> };

/* O que o Next entrega à página: `params` crus, com os escapes da URL
   (medido no 16.3), e `searchParams` decodificados. */
const ID_CRU = "37a2fdeb%20x%2Fy";
const BUSCA = { jogo: "a", busca: "Pokémon a+b 100%", set: ["sv01", "sv02"] };

function exemploDe(rota: string): { params: Record<string, string | string[]>; segmentos: string[] } {
  const params: Record<string, string | string[]> = {};
  const segmentos: string[] = [];
  for (const s of rota.split("/").filter(Boolean)) {
    if (s === "[id]") {
      params.id = ID_CRU;
      segmentos.push(ID_CRU);
    } else if (s.startsWith("[")) {
      throw new Error(`parâmetro sem exemplo neste teste: ${s} (${rota})`);
    } else segmentos.push(s);
  }
  return { params, segmentos };
}

async function executar(arquivo: string, params: Record<string, string | string[]>) {
  const pagina = (await import(arquivo)) as Pagina;
  try {
    await pagina.default({ params: Promise.resolve(params), searchParams: Promise.resolve(BUSCA) });
  } catch (e) {
    return e as { digest?: string; message?: string };
  }
  return null;
}

/* Ponte é a página que chama `irParaV1` (o mesmo critério do
   `grep -rl irParaV1` do README da v2). As páginas reais da v2 — o
   laboratório hoje, as telas depois — ficam fora: não redirecionam. */
const PONTES = paginas(PASTA_V2)
  .filter((arquivo) => readFileSync(arquivo, "utf8").includes("irParaV1"))
  .map((arquivo) => ({
    arquivo,
    rota: rotaDaPagina(path.relative(path.resolve(PASTA_V2, ".."), arquivo).split(path.sep).join("/"))!,
  }));

beforeEach(() => {
  estado.livingDex = true;
  estado.recusarSessao = false;
  estado.chamadas = [];
});

describe("pontes da v2, executadas", () => {
  /* As 13 da Fase 0, menos as que uma tela real já substituiu: cada pacote que
     entrega uma tela tira a linha dela daqui (e só a dela). */
  it("encontra as pontes que ainda restam", () => {
    expect(PONTES.map((p) => p.rota).sort()).toEqual(
      [...TELAS_DA_DEX].sort(),
    );
  });

  it.each(PONTES)("$rota: 307 para a mesma tela em /v1, com a query", async ({ arquivo, rota }) => {
    const { params, segmentos } = exemploDe(rota);
    const erro = await executar(arquivo, params);
    const destino = destinoV1(segmentos, BUSCA);
    expect(erro?.digest).toBe(`NEXT_REDIRECT;replace;${destino};307;`);
    expect(estado.chamadas[0]).toBe("exigirSessao");
  });

  it.each(PONTES)("$rota: sem sessão, a guarda decide e nada redireciona para a v1", async ({ arquivo, rota }) => {
    estado.recusarSessao = true;
    const erro = await executar(arquivo, exemploDe(rota).params);
    expect(erro?.message).toBe("sem sessão");
    expect(estado.chamadas).toEqual(["exigirSessao"]);
  });

  it("com a Dex desligada, cada tela dela dá 404 direto, antes de qualquer redirecionamento", async () => {
    estado.livingDex = false;
    const dex = PONTES.filter((p) => p.rota.startsWith("/dex"));
    expect(dex).toHaveLength(TELAS_DA_DEX.length);
    for (const { arquivo } of dex) {
      estado.chamadas = [];
      const erro = await executar(arquivo, {});
      expect(erro?.digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
      expect(estado.chamadas).toEqual(["exigirSessao", "moduloLivingDexAtivo"]);
    }
  });

  /* `/dex` e `/dex/pokedex` já são telas da v2 (pacote 5a; o 404 delas com o
     módulo desligado está em `dex/paginas-dex.test.ts`): o caso sem query
     passa a uma ponte da Dex que ainda resta. */
  it("uma ponte da Dex vai para a mesma tela em /v1, sem query quando não veio nenhuma", async () => {
    const dex = PONTES.find((p) => p.rota.startsWith("/dex"));
    if (!dex) return;
    const pagina = (await import(dex.arquivo)) as Pagina;
    const erro = await pagina
      .default({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })
      .catch((e: { digest?: string }) => e);
    expect((erro as { digest?: string }).digest).toBe(`NEXT_REDIRECT;replace;/v1${dex.rota};307;`);
  });

  it("nenhuma ponte da Dex é catch-all", () => {
    expect(PONTES.filter((p) => p.rota.includes("["))).toSatisfy((l: { rota: string }[]) =>
      l.every((p) => !p.rota.startsWith("/dex")),
    );
  });
});
