/**
 * A ligação entre as consultas da parte TCG da página inicial, com as
 * consultas simuladas — sem Postgres. O que se protege: o "Quase lá" recebe
 * todas as coleções, e o corte em 4 é só de "Suas coleções".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { selecionarQuaseLa, type Divisao } from "@/lib/dominio/divisoes-colecao";

import type { Database } from "./client";
import type { ColecaoNaVitrine, QuaseLa } from "./consultas";

const consultas = vi.hoisted(() => ({
  obterTotaisInventario: vi.fn(),
  listarColecoesNaVitrine: vi.fn(),
  listarQuaseLa: vi.fn(),
}));
vi.mock("@/lib/db/consultas", () => consultas);

import { lerTcgInicio, MINIATURAS_POR_DIVISAO, QUASE_LA_NO_INICIO } from "./inicio";

/* Tudo inventado aqui. */
const db = {} as Database;

const regiao = (id: string, total: number, preenchidas: number): Divisao => ({
  id: `regiao:${id}`,
  tipo: "regiao",
  regiao: "kanto",
  total,
  preenchidas,
});

const colecao = (id: string, preenchidas: number): ColecaoNaVitrine => ({
  id,
  nome: `Coleção ${id}`,
  tipo: "pokedex",
  parametro: null,
  idiomaExigido: null,
  notas: null,
  criadoEm: new Date("2026-10-01T00:00:00Z"),
  atualizadoEm: new Date("2026-10-01T00:00:00Z"),
  totalVagas: 100,
  vagasPreenchidas: preenchidas,
  divisoes: [regiao(id, 100, preenchidas)],
  capa: null,
  logos: [],
});

/* A quinta é a mais perto de fechar: só aparece se o Quase lá a receber. */
const todas = [colecao("a", 10), colecao("b", 20), colecao("c", 30), colecao("d", 40), colecao("e", 95)];

beforeEach(() => {
  consultas.obterTotaisInventario.mockResolvedValue({
    cartasDistintas: 7,
    totalUnidades: 9,
    unidadesAlocadas: 4,
    unidadesLivres: 5,
  });
  consultas.listarColecoesNaVitrine.mockResolvedValue(todas);
  /* Como a consulta real: escolhe entre as coleções que recebe. */
  consultas.listarQuaseLa.mockImplementation(
    async (_db: Database, colecoes: readonly ColecaoNaVitrine[], limite: number): Promise<QuaseLa[]> =>
      selecionarQuaseLa(colecoes, limite).map((e) => ({
        ...e,
        colecaoNome: colecoes.find((c) => c.id === e.colecaoId)!.nome,
        tipo: "pokedex",
        faltantes: [
          { chave: "25", nome: null, imagemUrl: null },
          { chave: "0", nome: null, imagemUrl: null },
        ],
      })),
  );
});

describe("lerTcgInicio", () => {
  it("o Quase lá recebe as cinco coleções; Suas coleções fica com quatro", async () => {
    const r = await lerTcgInicio(db);

    expect(consultas.listarQuaseLa).toHaveBeenCalledTimes(1);
    const [dbRecebido, colecoesRecebidas, limite, miniaturas] = consultas.listarQuaseLa.mock.calls[0];
    expect(dbRecebido).toBe(db);
    expect((colecoesRecebidas as ColecaoNaVitrine[]).map((c) => c.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(limite).toBe(QUASE_LA_NO_INICIO);
    expect(miniaturas).toBe(MINIATURAS_POR_DIVISAO);

    expect(r.quaseLa[0]).toMatchObject({ colecaoId: "e", colecaoNome: "Coleção e", faltam: 5 });
    expect(r.colecoes.map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
    expect(r.totalColecoes).toBe(5);
  });

  it("monta os DTOs só com os campos da tela", async () => {
    const r = await lerTcgInicio(db);
    expect(r.totais).toEqual({ cartasDistintas: 7, totalUnidades: 9 });
    expect(Object.keys(r.colecoes[0]).sort()).toEqual(["id", "nome", "tipo", "totalVagas", "vagasPreenchidas"]);
    expect(Object.keys(r.quaseLa[0]).sort()).toEqual(["colecaoId", "colecaoNome", "divisao", "faltam", "miniaturas"]);
    // Pokédex: o sprite pelo número; número que não é espécie fica sem imagem, com o rótulo escrito.
    expect(r.quaseLa[0].miniaturas).toEqual([
      { url: expect.stringMatching(/\/25\.png$/), rotulo: "25" },
      { url: null, rotulo: "0" },
    ]);
  });
});
