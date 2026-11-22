import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  montarVagasDaGrade,
  type EntradaGrade,
  type VagaBaseDaGrade,
} from "./grade-colecao";

// Dados inventados: nenhum nome, número ou id vem de uma coleção real.

const base = (sobrescrever: Partial<VagaBaseDaGrade>): VagaBaseDaGrade => ({
  id: "v1",
  chave: "1",
  copiaId: null,
  nomeEspecie: null,
  cartaNome: null,
  cartaLocalId: null,
  setNome: null,
  imagemUrl: null,
  imagemOrigem: null,
  candidatosDisponiveis: 0,
  variante: null,
  idiomaFisico: null,
  condicao: null,
  energia: null,
  divisao: null,
  ...sobrescrever,
});

const entrada = (sobrescrever: Partial<EntradaGrade>): EntradaGrade => ({
  tipo: "pokedex",
  vagas: [],
  copias: [],
  esperadas: [],
  melhorias: [],
  escolhas: [],
  ...sobrescrever,
});

const preenchida = (id: string, chave: string, copiaId: string): VagaBaseDaGrade =>
  base({
    id,
    chave,
    copiaId,
    nomeEspecie: "Monstrinho",
    cartaNome: "Monstrinho ex",
    cartaLocalId: "010",
    setNome: "Edição Inventada",
    imagemUrl: "https://cdn.invalid/xx/010",
    imagemOrigem: "catalogo",
    variante: "holo",
    idiomaFisico: "en",
    condicao: "NM",
    energia: "fogo",
    divisao: "kanto",
  });

describe("montarVagasDaGrade", () => {
  it("vaga preenchida: a ficha da cópia e o idioma físico separados (regra 7), com a data de entrada", () => {
    const [v] = montarVagasDaGrade(
      entrada({
        vagas: [preenchida("v1", "6", "c1")],
        copias: [
          {
            vagaId: "v1",
            copiaId: "c1",
            cartaId: "xx-010",
            idiomaCatalogo: "pt",
            raridade: "Rara Dupla",
            desde: new Date("2026-11-01T12:00:00Z"),
          },
        ],
      }),
    );
    expect(v).toMatchObject({
      numero: "6",
      especie: "Monstrinho",
      cartaNome: "Monstrinho ex",
      carta: { cartaId: "xx-010", idiomaCatalogo: "pt", raridade: "Rara Dupla" },
      copia: { id: "c1", variante: "holo", idioma: "en", condicao: "NM", desde: "2026-11-01T12:00:00.000Z" },
    });
    expect(v).not.toHaveProperty("livres");
    expect(v).not.toHaveProperty("upgrade");
    expect(v).not.toHaveProperty("escolhas");
  });

  it("vaga vazia de Pokédex não tem carta (regra 3) e diz quantas cópias livres servem", () => {
    const [v] = montarVagasDaGrade(
      entrada({ vagas: [base({ chave: "25", nomeEspecie: "Faiscante", candidatosDisponiveis: 2 })] }),
    );
    expect(v).toEqual({ id: "v1", chave: "25", numero: "25", especie: "Faiscante", livres: 2 });
  });

  it("vaga vazia de set: a carta esperada e o número impresso, nunca a chave crua", () => {
    const [v] = montarVagasDaGrade(
      entrada({
        tipo: "set",
        vagas: [base({ chave: "xx1/004", nomeEspecie: "ignorado", cartaNome: "Brasinha", cartaLocalId: "004" })],
        esperadas: [{ chave: "xx1/004", cartaId: "xx1-004", idiomaCatalogo: "en", raridade: "Comum" }],
      }),
    );
    expect(v).not.toHaveProperty("especie");
    expect(v).toMatchObject({
      numero: "004",
      cartaNome: "Brasinha",
      carta: { cartaId: "xx1-004", idiomaCatalogo: "en", raridade: "Comum" },
    });
  });

  it("upgrade: o eixo da melhor candidata, só em vaga preenchida", () => {
    const vagas = montarVagasDaGrade(
      entrada({
        vagas: [preenchida("v1", "6", "c1"), base({ id: "v2", chave: "7" })],
        copias: [
          { vagaId: "v1", copiaId: "c1", cartaId: "a", idiomaCatalogo: "pt", raridade: null, desde: new Date(0) },
        ],
        melhorias: [
          { vagaId: "v1", candidatas: [{ eixo: "raridade" }, { eixo: "variante" }] },
          { vagaId: "v2", candidatas: [{ eixo: "idioma" }] },
        ],
      }),
    );
    expect(vagas.map((v) => v.upgrade)).toEqual(["raridade", undefined]);
  });

  it("escolhas: só as da vaga vazia, com o id que desmarca; a da preenchida fica de fora", () => {
    const vagas = montarVagasDaGrade(
      entrada({
        vagas: [preenchida("v1", "6", "c1"), base({ id: "v2", chave: "7" })],
        copias: [
          { vagaId: "v1", copiaId: "c1", cartaId: "a", idiomaCatalogo: "pt", raridade: null, desde: new Date(0) },
        ],
        escolhas: [
          { id: "e1", chave: "7", cartaId: "b", nome: "B", vagaVazia: true },
          { id: "e2", chave: "7", cartaId: null, nome: "Fora", vagaVazia: true },
          { id: "e3", chave: "6", cartaId: "c", nome: "C", vagaVazia: false },
        ],
      }),
    );
    expect(vagas.map((v) => v.escolhas?.map((x) => x.id))).toEqual([undefined, ["e1", "e2"]]);
  });

  it("falha, em vez de desenhar meia vaga, quando a cópia não veio na mesma leitura", () => {
    expect(() => montarVagasDaGrade(entrada({ vagas: [preenchida("v1", "6", "c1")] }))).toThrow();
    expect(() =>
      montarVagasDaGrade(
        entrada({
          vagas: [preenchida("v1", "6", "c1")],
          copias: [
            { vagaId: "v1", copiaId: "outra", cartaId: "a", idiomaCatalogo: "pt", raridade: null, desde: new Date(0) },
          ],
        }),
      ),
    ).toThrow();
  });

  it("mantém a ordem da leitura base", () => {
    const vagas = montarVagasDaGrade(
      entrada({ vagas: [base({ id: "a", chave: "3" }), base({ id: "b", chave: "1" })] }),
    );
    expect(vagas.map((v) => v.id)).toEqual(["a", "b"]);
  });
});

/**
 * O peso da grade, com dados de exemplo inventados no formato real: uma
 * Pokédex nacional (1.025 vagas, um terço preenchido, com escolhas e
 * upgrades salpicados) e um set grande (250 vagas). O número fica registrado
 * no comentário de `grade-colecao.ts`; o teto aqui é o que pegaria um campo
 * novo que multiplica o payload sem ninguém perceber.
 */
describe("tamanho do payload", () => {
  const url = (n: number) => `https://assets.tcgdex.net/pt/sv/sv99/${String(n).padStart(3, "0")}`;

  function pokedexNacional(): EntradaGrade {
    const vagas: VagaBaseDaGrade[] = [];
    const copias: EntradaGrade["copias"][number][] = [];
    const escolhas: EntradaGrade["escolhas"][number][] = [];
    const melhorias: EntradaGrade["melhorias"][number][] = [];
    for (let n = 1; n <= 1025; n++) {
      const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      if (n % 3 === 0) {
        const copiaId = `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
        vagas.push({
          ...preenchida(id, String(n), copiaId),
          nomeEspecie: `Especie ${n}`,
          cartaNome: `Especie ${n} ex`,
          imagemUrl: url(n),
        });
        copias.push({
          vagaId: id,
          copiaId,
          cartaId: `sv99-${n}`,
          idiomaCatalogo: "pt",
          raridade: "Ilustração Rara",
          desde: new Date("2026-11-01T12:00:00Z"),
        });
        if (n % 30 === 0) melhorias.push({ vagaId: id, candidatas: [{ eixo: "raridade" }] });
      } else {
        vagas.push(base({ id, chave: String(n), nomeEspecie: `Especie ${n}`, divisao: "kanto", candidatosDisponiveis: n % 7 === 0 ? 1 : 0 }));
        if (n % 5 === 0) {
          escolhas.push({ id: `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`, chave: String(n), cartaId: `sv99-${n}`, nome: `Especie ${n}`, vagaVazia: true });
        }
      }
    }
    return entrada({ tipo: "pokedex", vagas, copias, escolhas, melhorias });
  }

  function setGrande(): EntradaGrade {
    const vagas: VagaBaseDaGrade[] = [];
    const copias: EntradaGrade["copias"][number][] = [];
    const esperadas: EntradaGrade["esperadas"][number][] = [];
    for (let n = 1; n <= 250; n++) {
      const local = String(n).padStart(3, "0");
      const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      const chave = `sv99/${local}`;
      if (n % 2 === 0) {
        const copiaId = `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
        vagas.push({ ...preenchida(id, chave, copiaId), cartaNome: `Carta ${n}`, cartaLocalId: local, imagemUrl: url(n) });
        copias.push({ vagaId: id, copiaId, cartaId: `sv99-${local}`, idiomaCatalogo: "pt", raridade: "Comum", desde: new Date(0) });
      } else {
        vagas.push(base({ id, chave, cartaNome: `Carta ${n}`, cartaLocalId: local, setNome: "Edição Inventada", imagemUrl: url(n), imagemOrigem: "catalogo", divisao: "sv99" }));
        esperadas.push({ chave, cartaId: `sv99-${local}`, idiomaCatalogo: "pt", raridade: "Comum" });
      }
    }
    return entrada({ tipo: "set", vagas, copias, esperadas });
  }

  it("Pokédex nacional e set grande cabem no orçamento", () => {
    const json = (e: EntradaGrade) => Buffer.from(JSON.stringify(montarVagasDaGrade(e)));
    const pokedex = json(pokedexNacional());
    const set = json(setGrande());
    console.info(
      `grade: pokédex nacional ${pokedex.length} bytes (gzip ${gzipSync(pokedex).length}); ` +
        `set de 250 vagas ${set.length} bytes (gzip ${gzipSync(set).length})`,
    );
    expect(pokedex.length).toBeLessThan(300_000);
    expect(set.length).toBeLessThan(120_000);
  });
});
