import { describe, expect, it } from "vitest";

import { type CamadaRegistrada, camadaDoTopo, escolherAlvoDeFoco, modalDoTopo, precisaTrava } from "./camadas";

const c = (id: string, nivel: CamadaRegistrada["nivel"], ordem: number, travaRolagem = false): CamadaRegistrada => ({
  id,
  nivel,
  ordem,
  travaRolagem,
});

describe("camadaDoTopo", () => {
  it("pilha vazia não tem topo", () => {
    expect(camadaDoTopo([])).toBeUndefined();
  });

  it("o nível vence a ordem de abertura", () => {
    // O detalhe abriu antes, mas está num nível acima da janela.
    expect(camadaDoTopo([c("detalhe", "detalhe", 1), c("janela", "janela", 2)])?.id).toBe("detalhe");
  });

  it("no mesmo nível, a última aberta", () => {
    expect(camadaDoTopo([c("a", "janela", 3), c("b", "janela", 5), c("c", "janela", 4)])?.id).toBe("b");
  });

  it("a ordem no array não importa (efeitos podem registrar em qualquer ordem)", () => {
    const pilha = [c("janela", "janela", 1), c("confirmacao", "janela", 2)];
    expect(camadaDoTopo(pilha)?.id).toBe("confirmacao");
    expect(camadaDoTopo([...pilha].reverse())?.id).toBe("confirmacao");
  });
});

describe("modalDoTopo", () => {
  it("o balão recebe o Esc, mas o foco continua preso na janela", () => {
    const pilha = [c("janela", "janela", 1), c("balao", "balao", 2)];
    expect(camadaDoTopo(pilha)?.id).toBe("balao");
    expect(modalDoTopo(pilha)?.id).toBe("janela");
  });

  it("sem camada modal, nenhuma prende o foco", () => {
    expect(modalDoTopo([c("balao", "balao", 1)])).toBeUndefined();
  });
});

describe("precisaTrava", () => {
  it("trava enquanto qualquer camada pedir, por contagem", () => {
    const janela = c("janela", "janela", 1, true);
    const detalhe = c("detalhe", "detalhe", 2, true);
    expect(precisaTrava([janela, detalhe])).toBe(true);
    // Fechar o detalhe não destrava o fundo da janela que continua aberta.
    expect(precisaTrava([janela])).toBe(true);
    expect(precisaTrava([])).toBe(false);
  });

  it("balão sem trava não trava", () => {
    expect(precisaTrava([c("balao", "balao", 1)])).toBe(false);
  });
});

describe("escolherAlvoDeFoco", () => {
  const no = (nome: string, isConnected: boolean) => ({ nome, isConnected });

  it("o resolvedor vem antes do elemento que abriu", () => {
    const resolvido = no("celula-remontada", true);
    const abridor = no("celula-original", true);
    expect(escolherAlvoDeFoco([resolvido, abridor])).toBe(resolvido);
  });

  it("pula o que saiu do DOM (célula desmontada pela virtualização)", () => {
    const abridor = no("celula-original", false);
    const principal = no("main", true);
    expect(escolherAlvoDeFoco([null, abridor, principal])).toBe(principal);
  });

  it("nada no DOM: nulo", () => {
    expect(escolherAlvoDeFoco([undefined, no("x", false)])).toBeNull();
  });
});
