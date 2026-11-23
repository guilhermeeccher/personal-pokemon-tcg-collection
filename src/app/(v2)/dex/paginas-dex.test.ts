/**
 * As telas reais da Dex na v2 (`/dex` e `/dex/pokedex`, pacote 5a;
 * `/dex/cadastrar`, pacote 5c) guardam o
 * módulo como as pontes guardavam: a sessão primeiro, depois a flag, e com o
 * módulo desligado o 404 do Next sai **antes de qualquer leitura do banco**
 * (AGENTS.md, "Optional module: Living Dex"; `rules.md`, "Dex shared code",
 * A). O `notFound()` é o do Next, não simulado: o `digest` do erro que ele
 * lança diz o código. Simulados são a sessão, a flag, o `connection()` (que
 * fora de uma requisição lança) e as leituras, que falham o teste se forem
 * chamadas com o módulo desligado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({ livingDex: false, chamadas: [] as string[] }));

vi.mock("@/lib/acesso", () => ({
  exigirSessao: async () => {
    estado.chamadas.push("exigirSessao");
  },
}));
vi.mock("@/lib/modulos", () => ({
  moduloLivingDexAtivo: () => {
    estado.chamadas.push("moduloLivingDexAtivo");
    return estado.livingDex;
  },
}));
vi.mock("next/server", () => ({
  connection: async () => {
    estado.chamadas.push("connection");
  },
}));
vi.mock("@/lib/db/client", () => ({ db: {} }));

function leitura(nome: string) {
  return async () => {
    estado.chamadas.push(nome);
    return [];
  };
}
vi.mock("@/lib/db/dex", () => ({
  listarFormasDex: leitura("listarFormasDex"),
  lerSecoesDex: leitura("lerSecoesDex"),
  listarRegistrosDex: leitura("listarRegistrosDex"),
  listarJogosPossuidos: leitura("listarJogosPossuidos"),
  lerCaixasReservadas: leitura("lerCaixasReservadas"),
}));
vi.mock("@/lib/db/dex-planejamento", () => ({
  listarPlanos: leitura("listarPlanos"),
  listarTrofeus: leitura("listarTrofeus"),
}));
// As telas em si (clientes, com CSS): este teste é só da página no servidor.
vi.mock("./_visao-geral/visao-geral-dex", () => ({ VisaoGeralDex: () => null }));
vi.mock("./pokedex/_componentes/grade-pokedex", () => ({ GradePokedex: () => null }));
vi.mock("./cadastrar/_componentes/cadastro-por-jogo", () => ({ CadastroPorJogo: () => null }));

type Pagina = { default: (props: { searchParams: Promise<Record<string, string>> }) => Promise<unknown> };
const PAGINAS = [
  ["/dex", () => import("./page")],
  ["/dex/pokedex", () => import("./pokedex/page")],
  ["/dex/cadastrar", () => import("./cadastrar/page")],
] as const;
const PROPS = { searchParams: Promise.resolve({}) };

beforeEach(() => {
  estado.livingDex = false;
  estado.chamadas = [];
});

describe("telas da Dex na v2", () => {
  it.each(PAGINAS)("%s: módulo desligado, 404 direto, sem ler o banco", async (_rota, carregar) => {
    const pagina = (await carregar()) as Pagina;
    const erro = await pagina.default(PROPS).catch((e: { digest?: string }) => e);
    expect((erro as { digest?: string }).digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(estado.chamadas).toEqual(["exigirSessao", "connection", "moduloLivingDexAtivo"]);
  });

  it.each(PAGINAS)("%s: módulo ligado, a guarda vem antes das leituras", async (_rota, carregar) => {
    estado.livingDex = true;
    const pagina = (await carregar()) as Pagina;
    await pagina.default(PROPS);
    expect(estado.chamadas.slice(0, 3)).toEqual(["exigirSessao", "connection", "moduloLivingDexAtivo"]);
    expect(estado.chamadas.length).toBeGreaterThan(3);
  });
});
