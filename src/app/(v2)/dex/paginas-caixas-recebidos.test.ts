/**
 * `/dex/caixas` e `/dex/recebidos` na v2 (pacote 5b) guardam o módulo como as
 * outras telas da Dex: a sessão primeiro, depois a flag, e com o módulo
 * desligado o 404 do Next sai **antes de qualquer leitura do banco**
 * (AGENTS.md, "Optional module: Living Dex"; `rules.md`, "Dex shared code",
 * A). Mesmo método de `paginas-dex.test.ts`: o `notFound()` é o do Next (o
 * `digest` do erro diz o código); simulados são a sessão, a flag, o
 * `connection()` e as leituras, que falham o teste se forem chamadas com o
 * módulo desligado. Um arquivo à parte para os pacotes da Dex não editarem o
 * mesmo teste ao mesmo tempo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  livingDex: false,
  chamadas: [] as string[],
  falharLeitura: false,
}));

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
    if (estado.falharLeitura) throw new Error("banco fora do ar");
    return [];
  };
}
vi.mock("@/lib/db/dex", () => ({
  listarFormasDex: leitura("listarFormasDex"),
  lerSecoesDex: leitura("lerSecoesDex"),
  listarRegistrosDex: leitura("listarRegistrosDex"),
  lerCaixasReservadas: leitura("lerCaixasReservadas"),
}));
// As telas em si (clientes, com CSS) e o botão de tentar de novo: o teste é só da página no servidor.
vi.mock("./caixas/_componentes/caixas-home", () => ({ CaixasHome: () => null }));
vi.mock("./recebidos/_componentes/recebidos-home", () => ({ RecebidosHome: () => null }));
vi.mock("./_componentes/tentar-de-novo", () => ({ TentarDeNovo: () => null }));

type Pagina = { default: () => Promise<unknown> };
const PAGINAS = [
  ["/dex/caixas", () => import("./caixas/page")],
  ["/dex/recebidos", () => import("./recebidos/page")],
] as const;

beforeEach(() => {
  estado.livingDex = false;
  estado.falharLeitura = false;
  estado.chamadas = [];
});

describe("Caixas e Recebidos na v2", () => {
  it.each(PAGINAS)("%s: módulo desligado, 404 direto, sem ler o banco", async (_rota, carregar) => {
    const pagina = (await carregar()) as Pagina;
    const erro = await pagina.default().catch((e: { digest?: string }) => e);
    expect((erro as { digest?: string }).digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(estado.chamadas).toEqual(["exigirSessao", "connection", "moduloLivingDexAtivo"]);
  });

  it.each(PAGINAS)("%s: módulo ligado, a guarda vem antes das quatro leituras", async (_rota, carregar) => {
    estado.livingDex = true;
    const pagina = (await carregar()) as Pagina;
    await pagina.default();
    expect(estado.chamadas.slice(0, 3)).toEqual(["exigirSessao", "connection", "moduloLivingDexAtivo"]);
    expect(estado.chamadas.slice(3).sort()).toEqual(
      ["lerCaixasReservadas", "lerSecoesDex", "listarFormasDex", "listarRegistrosDex"],
    );
  });

  it.each(PAGINAS)("%s: uma leitura que falha vira aviso de erro, nunca uma tela vazia", async (_rota, carregar) => {
    estado.livingDex = true;
    estado.falharLeitura = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const pagina = (await carregar()) as Pagina;
    const resultado = (await pagina.default()) as { type: unknown; props: { tom: string; papel: string } };
    expect(resultado.props.tom).toBe("perigo");
    expect(resultado.props.papel).toBe("alert");
  });
});
