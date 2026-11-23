/**
 * `/dex/novo-cadastro` na v2 (pacote 5d) guarda o módulo como as outras telas
 * da Dex: a sessão primeiro, depois a flag, e com o módulo desligado o 404 do
 * Next sai **antes de qualquer leitura do banco** (AGENTS.md, "Optional
 * module: Living Dex"; `rules.md`, "Dex shared code", A). Mesmo método de
 * `paginas-caixas-recebidos.test.ts`, num arquivo à parte para os pacotes da
 * Dex não editarem o mesmo teste ao mesmo tempo.
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

function leitura(nome: string, valor: unknown[] = []) {
  return async () => {
    estado.chamadas.push(nome);
    if (estado.falharLeitura) throw new Error("banco fora do ar");
    return valor;
  };
}
vi.mock("@/lib/db/dex", () => ({
  listarFormasDex: leitura("listarFormasDex"),
  lerSecoesDex: leitura("lerSecoesDex"),
  listarRegistrosDex: leitura("listarRegistrosDex"),
  lerCaixasReservadas: leitura("lerCaixasReservadas"),
  listarJogosPossuidos: leitura("listarJogosPossuidos", [
    { jogoId: "go", ativo: true },
    { jogoId: "sword", ativo: false },
  ]),
}));
vi.mock("@/lib/db/dex-planejamento", () => ({
  listarTrofeus: leitura("listarTrofeus", [
    { id: "a", tipo: "checkpoint", obtido: null },
    { id: "b", tipo: "checkpoint", obtido: { em: null } },
    { id: "c", tipo: "marco", obtido: null },
  ]),
}));
vi.mock("./novo-cadastro/_componentes/novo-cadastro", () => ({ NovoCadastro: () => null }));
vi.mock("./_componentes/tentar-de-novo", () => ({ TentarDeNovo: () => null }));

type Pagina = { default: () => Promise<unknown> };
const carregar = () => import("./novo-cadastro/page") as Promise<Pagina>;

beforeEach(() => {
  estado.livingDex = false;
  estado.falharLeitura = false;
  estado.chamadas = [];
});

describe("Novo cadastro na v2", () => {
  it("módulo desligado: 404 direto, sem redirecionar e sem ler o banco", async () => {
    const pagina = await carregar();
    const erro = await pagina.default().catch((e: { digest?: string }) => e);
    expect((erro as { digest?: string }).digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(estado.chamadas).toEqual(["exigirSessao", "connection", "moduloLivingDexAtivo"]);
  });

  it("módulo ligado: a guarda vem antes das leituras; só jogos ativos e checkpoints pendentes vão à tela", async () => {
    estado.livingDex = true;
    const pagina = await carregar();
    const tela = (await pagina.default()) as { props: { jogos: { jogoId: string }[]; checkpoints: { id: string }[] } };
    expect(estado.chamadas.slice(0, 3)).toEqual(["exigirSessao", "connection", "moduloLivingDexAtivo"]);
    expect(estado.chamadas.slice(3).sort()).toEqual([
      "lerCaixasReservadas",
      "lerSecoesDex",
      "listarFormasDex",
      "listarJogosPossuidos",
      "listarRegistrosDex",
      "listarTrofeus",
    ]);
    expect(tela.props.jogos.map((j) => j.jogoId)).toEqual(["go"]);
    expect(tela.props.checkpoints.map((c) => c.id)).toEqual(["a"]);
  });

  it("uma leitura que falha vira aviso de erro, nunca uma grade vazia", async () => {
    estado.livingDex = true;
    estado.falharLeitura = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const pagina = await carregar();
    const resultado = (await pagina.default()) as { props: { tom: string; papel: string } };
    expect(resultado.props.tom).toBe("perigo");
    expect(resultado.props.papel).toBe("alert");
  });
});
