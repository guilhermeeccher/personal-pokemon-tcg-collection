import { describe, expect, it } from "vitest";

import { MAX_DETALHE_ETAPA, MAX_ETAPAS_POR_TAREFA, MAX_TEXTO_ETAPA } from "@/lib/dominio/dex-etapas";

import {
  avisoTodasFeitas,
  cabeMaisEtapa,
  erroDaEtapa,
  erroDoPlano,
  etapasEditaveis,
  fraseDaRecusa,
  hrefCadastroDaTarefa,
  ofereceCadastro,
  telaVelha,
} from "./regras-planos";

const etapa = (feita: boolean) => ({ id: "e", ordem: 1, texto: "x", detalhe: null, feita, feitaEm: null });

describe("ofereceCadastro", () => {
  it("captura, evolução e troca oferecem; o resto não", () => {
    expect(["captura", "evolucao", "troca"].every((t) => ofereceCadastro(t as never))).toBe(true);
    expect(["progresso", "transferencia", "outro"].some((t) => ofereceCadastro(t as never))).toBe(false);
  });
});

describe("hrefCadastroDaTarefa", () => {
  const especies: Record<string, string> = { "f-25": "Pikachu", "f-26": "Raichu" };
  const especieDe = (id: string) => especies[id];

  it("o jogo da tarefa e a espécie da vaga única", () => {
    expect(hrefCadastroDaTarefa({ jogoId: "firered", formaIds: ["f-25"] }, especieDe)).toBe(
      "/dex/cadastrar?jogo=firered&busca=Pikachu",
    );
  });
  it("com várias vagas, só o jogo: a pessoa escolhe", () => {
    expect(hrefCadastroDaTarefa({ jogoId: "firered", formaIds: ["f-25", "f-26"] }, especieDe)).toBe(
      "/dex/cadastrar?jogo=firered",
    );
  });
  it("sem jogo e sem vaga, o cadastro sem filtro", () => {
    expect(hrefCadastroDaTarefa({ jogoId: null, formaIds: [] }, especieDe)).toBe("/dex/cadastrar");
  });
  it("uma vaga que a tela não conhece não vira busca", () => {
    expect(hrefCadastroDaTarefa({ jogoId: null, formaIds: ["f-999"] }, especieDe)).toBe("/dex/cadastrar");
  });
  it("o nome vai codificado na query", () => {
    expect(hrefCadastroDaTarefa({ jogoId: "go", formaIds: ["x"] }, () => "Mr. Mime & Co")).toBe(
      "/dex/cadastrar?jogo=go&busca=Mr.+Mime+%26+Co",
    );
  });
});

describe("etapas editáveis e o aviso de todas feitas", () => {
  it("só tarefa aberta em plano ativo", () => {
    expect(etapasEditaveis({ status: "ativo" }, { status: "aberta" })).toBe(true);
    expect(etapasEditaveis({ status: "ativo" }, { status: "feita" })).toBe(false);
    expect(etapasEditaveis({ status: "ativo" }, { status: "descartada" })).toBe(false);
    expect(etapasEditaveis({ status: "encerrado" }, { status: "aberta" })).toBe(false);
    expect(etapasEditaveis({ status: "concluido" }, { status: "aberta" })).toBe(false);
  });

  it("todas feitas avisa, e a tarefa continua aberta: quem conclui é a pessoa", () => {
    const tarefa = { status: "aberta" as const, etapas: [etapa(true), etapa(true)] };
    expect(avisoTodasFeitas({ status: "ativo" }, tarefa)).toBe(true);
    expect(tarefa.status).toBe("aberta");
  });
  it("sem aviso com uma por fazer, sem etapas, ou fora de um plano ativo", () => {
    expect(avisoTodasFeitas({ status: "ativo" }, { status: "aberta", etapas: [etapa(true), etapa(false)] })).toBe(false);
    expect(avisoTodasFeitas({ status: "ativo" }, { status: "aberta", etapas: [] })).toBe(false);
    expect(avisoTodasFeitas({ status: "encerrado" }, { status: "aberta", etapas: [etapa(true)] })).toBe(false);
    expect(avisoTodasFeitas({ status: "ativo" }, { status: "feita", etapas: [etapa(true)] })).toBe(false);
  });
});

describe("cabeMaisEtapa", () => {
  it(`até ${MAX_ETAPAS_POR_TAREFA} por tarefa`, () => {
    expect(cabeMaisEtapa(MAX_ETAPAS_POR_TAREFA - 1)).toBe(true);
    expect(cabeMaisEtapa(MAX_ETAPAS_POR_TAREFA)).toBe(false);
  });
});

describe("telaVelha", () => {
  it("404 e 409 relêem a página; 400 e 500 não", () => {
    expect([404, 409].every(telaVelha)).toBe(true);
    expect([400, 500].some(telaVelha)).toBe(false);
  });
});

describe("erroDoPlano", () => {
  const base = { titulo: "Kanto", inicio: "2026-11-23", fim: "" };
  it("um plano completo passa", () => {
    expect(erroDoPlano(base)).toBeNull();
    expect(erroDoPlano({ ...base, fim: "2026-11-23" })).toBeNull();
  });
  it("título só com espaços, início vazio, fim antes do início", () => {
    expect(erroDoPlano({ ...base, titulo: "   " })).toBe("tituloVazio");
    expect(erroDoPlano({ ...base, inicio: "" })).toBe("inicioVazio");
    expect(erroDoPlano({ ...base, fim: "2026-11-22" })).toBe("fimAntesDoInicio");
  });
});

describe("erroDaEtapa", () => {
  it("mede depois de aparar, como a rota", () => {
    expect(erroDaEtapa({ texto: `  ${"a".repeat(MAX_TEXTO_ETAPA)}  `, detalhe: "" })).toBeNull();
    expect(erroDaEtapa({ texto: "   ", detalhe: "" })).toBe("textoVazio");
    expect(erroDaEtapa({ texto: "a".repeat(MAX_TEXTO_ETAPA + 1), detalhe: "" })).toBe("textoLongo");
    expect(erroDaEtapa({ texto: "a", detalhe: "b".repeat(MAX_DETALHE_ETAPA + 1) })).toBe("detalheLongo");
    expect(erroDaEtapa({ texto: "a", detalhe: "b".repeat(MAX_DETALHE_ETAPA) })).toBeNull();
  });
});

describe("fraseDaRecusa", () => {
  const catalogo: Record<string, string> = { dexTarefaFechada: "A tarefa precisa estar aberta.", dexEtapasDemais: "No máximo {maximo}." };
  const t = Object.assign((chave: string, valores?: Record<string, string>) => catalogo[chave].replace("{maximo}", valores?.maximo ?? ""), {
    has: (chave: string) => chave in catalogo,
  });
  it("a recusa com chave, traduzida e com os valores", () => {
    expect(fraseDaRecusa(t, { recusa: { chave: "dexTarefaFechada" } }, "genérica")).toBe("A tarefa precisa estar aberta.");
    expect(fraseDaRecusa(t, { recusa: { chave: "dexEtapasDemais", valores: { maximo: "50" } } }, "genérica")).toBe("No máximo 50.");
  });
  it("o `erro` em inglês da validação nunca chega à tela: vira a frase genérica", () => {
    expect(fraseDaRecusa(t, { erro: "fim before inicio" }, "genérica")).toBe("genérica");
    expect(fraseDaRecusa(t, null, "genérica")).toBe("genérica");
    expect(fraseDaRecusa(t, { recusa: { chave: "chaveNova" } }, "genérica")).toBe("genérica");
  });
});
