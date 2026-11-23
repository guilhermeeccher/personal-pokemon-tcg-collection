/**
 * `/dex/trofeus` e `/dex/planos` na v2 (pacote 5e-b) guardam o módulo como as
 * pontes guardavam: a sessão primeiro, depois a flag, e com o módulo desligado
 * o 404 do Next sai **antes de qualquer leitura do banco** (AGENTS.md,
 * "Optional module: Living Dex"; `rules.md`, "Dex shared code", A). O mesmo
 * protocolo de `paginas-dex.test.ts` (pacote 5a), num arquivo próprio para os
 * pacotes da Dex não disputarem a mesma lista: o `notFound()` é o do Next, e
 * o `digest` do erro diz o código; simulados são a sessão, a flag, o
 * `connection()` e as leituras, que falham o teste se forem chamadas com o
 * módulo desligado.
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
  lerSecoesDex: async () => {
    estado.chamadas.push("lerSecoesDex");
    return { regional: true, genero: true, especial: true };
  },
  listarRegistrosDex: leitura("listarRegistrosDex"),
  listarJogosPossuidos: leitura("listarJogosPossuidos"),
}));
vi.mock("@/lib/db/dex-planejamento", () => ({
  listarPlanos: leitura("listarPlanos"),
  listarTrofeus: leitura("listarTrofeus"),
}));
// As telas em si (clientes, com CSS): este teste é só da página no servidor.
vi.mock("./trofeus/_componentes/painel-trofeus", () => ({ PainelTrofeus: () => null }));
vi.mock("./planos/_componentes/painel-planos", () => ({ PainelPlanos: () => null }));

type Props = { searchParams: Promise<Record<string, string | string[]>> };
type Pagina = { default: (props: Props) => Promise<unknown> };
const PAGINAS = [
  ["/dex/trofeus", () => import("./trofeus/page")],
  ["/dex/planos", () => import("./planos/page")],
] as const;
const props = (): Props => ({ searchParams: Promise.resolve({ jogo: "firered" }) });

beforeEach(() => {
  estado.livingDex = false;
  estado.chamadas = [];
});

describe("troféus e planos da Dex na v2", () => {
  it.each(PAGINAS)("%s: módulo desligado, 404 direto, sem ler o banco", async (_rota, carregar) => {
    const pagina = (await carregar()) as Pagina;
    const erro = await pagina.default(props()).catch((e: { digest?: string }) => e);
    expect((erro as { digest?: string }).digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(estado.chamadas).toEqual(["exigirSessao", "connection", "moduloLivingDexAtivo"]);
  });

  it.each(PAGINAS)("%s: módulo ligado, a guarda vem antes das leituras, e nada redireciona", async (_rota, carregar) => {
    estado.livingDex = true;
    const pagina = (await carregar()) as Pagina;
    await pagina.default(props());
    expect(estado.chamadas.slice(0, 3)).toEqual(["exigirSessao", "connection", "moduloLivingDexAtivo"]);
    expect(estado.chamadas.length).toBeGreaterThan(3);
  });
});
