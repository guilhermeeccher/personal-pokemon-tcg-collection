/**
 * `/dex/inventario` e `/dex/jogos` na v2 (pacote 5e-a) guardam o módulo como
 * as pontes guardavam e como `paginas-dex.test.ts` prova para `/dex` e
 * `/dex/pokedex`: a sessão primeiro, depois a flag, e com o módulo desligado
 * o 404 do Next sai **antes de qualquer leitura do banco** (AGENTS.md,
 * "Optional module: Living Dex"; `rules.md`, "Dex shared code", A). Arquivo
 * próprio, e não mais linhas naquele, porque os pacotes da Dex correm em
 * paralelo e cada um é dono só das suas telas.
 *
 * O `notFound()` é o do Next, não simulado: o `digest` do erro que ele lança
 * diz o código. Simulados são a sessão, a flag, o `connection()` (que fora de
 * uma requisição lança) e as leituras, que falham o teste se forem chamadas
 * com o módulo desligado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({ livingDex: false, falhar: false, chamadas: [] as string[] }));

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
vi.mock("next-intl/server", () => ({ getTranslations: async () => (chave: string) => chave }));
vi.mock("@/lib/db/client", () => ({ db: {} }));

function leitura(nome: string) {
  return async () => {
    estado.chamadas.push(nome);
    if (estado.falhar) throw new Error("banco fora");
    return [];
  };
}
vi.mock("@/lib/db/dex", () => ({
  listarFormasDex: leitura("listarFormasDex"),
  listarRegistrosDex: leitura("listarRegistrosDex"),
  listarJogosPossuidos: leitura("listarJogosPossuidos"),
}));
vi.mock("@/lib/db/dex-planejamento", () => ({ listarTrofeus: leitura("listarTrofeus") }));
// As telas em si (clientes, com CSS): este teste é só da página no servidor.
vi.mock("./inventario/_componentes/inventario-dex", () => ({ InventarioDex: () => null }));
vi.mock("./jogos/_componentes/lista-jogos", () => ({ ListaJogos: () => null }));
vi.mock("../_componentes/primitivos/painel", () => ({ AvisoEmLinha: () => null }));
vi.mock("./_componentes/tentar-de-novo", () => ({ TentarDeNovo: () => null }));

type Pagina = { default: () => Promise<unknown> };
const PAGINAS = [
  ["/dex/inventario", () => import("./inventario/page"), ["listarFormasDex", "listarJogosPossuidos", "listarRegistrosDex"]],
  ["/dex/jogos", () => import("./jogos/page"), ["listarJogosPossuidos", "listarTrofeus"]],
] as const;

beforeEach(() => {
  estado.livingDex = false;
  estado.falhar = false;
  estado.chamadas = [];
});

describe("inventário e jogos da Dex na v2", () => {
  it.each(PAGINAS)("%s: módulo desligado, 404 direto, sem ler o banco", async (_rota, carregar) => {
    const pagina = (await carregar()) as Pagina;
    const erro = await pagina.default().catch((e: { digest?: string }) => e);
    expect((erro as { digest?: string }).digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(estado.chamadas).toEqual(["exigirSessao", "connection", "moduloLivingDexAtivo"]);
  });

  it.each(PAGINAS)("%s: módulo ligado, a guarda vem antes das leituras da v1", async (_rota, carregar, leituras) => {
    estado.livingDex = true;
    const pagina = (await carregar()) as Pagina;
    await pagina.default();
    expect(estado.chamadas.slice(0, 3)).toEqual(["exigirSessao", "connection", "moduloLivingDexAtivo"]);
    expect([...estado.chamadas.slice(3)].sort()).toEqual([...leituras].sort());
  });

  it.each(PAGINAS)("%s: uma leitura que falha vira o aviso de erro, nunca uma lista vazia", async (_rota, carregar) => {
    estado.livingDex = true;
    estado.falhar = true;
    const erroDoConsole = vi.spyOn(console, "error").mockImplementation(() => {});
    const pagina = (await carregar()) as Pagina;
    const elemento = (await pagina.default()) as { props: { tom?: string; papel?: string } };
    expect(elemento.props).toMatchObject({ tom: "perigo", papel: "alert" });
    expect(erroDoConsole).toHaveBeenCalled();
    erroDoConsole.mockRestore();
  });
});
