import { describe, expect, it } from "vitest";

import { criarLimiteTentativas, type LimiteTentativas } from "./limite-tentativas";

const MIN = 60_000;

function relogio(inicio = 1_000_000) {
  let t = inicio;
  return {
    agora: () => t,
    andar: (ms: number) => {
      t += ms;
    },
  };
}

/** Uma verificação que fica pendurada até o teste decidir o resultado. */
function pendurada() {
  let resolver: (ok: boolean) => void = () => {};
  let rejeitar: (erro: Error) => void = () => {};
  let comecou = false;
  const verificar = () => {
    comecou = true;
    return new Promise<boolean>((res, rej) => {
      resolver = res;
      rejeitar = rej;
    });
  };
  return {
    verificar,
    comecou: () => comecou,
    acabar: (ok: boolean) => resolver(ok),
    falhar: (erro: Error) => rejeitar(erro),
  };
}

const tentar = (limite: LimiteTentativas, ip: string, sucesso: boolean) => limite.executar(ip, async () => sucesso);

describe("criarLimiteTentativas", () => {
  it("dez verificações simultâneas do mesmo IP: só 5 começam", async () => {
    const limite = criarLimiteTentativas({ maxConcorrentes: 100 });
    const verificacoes = Array.from({ length: 10 }, () => pendurada());
    const resultados = verificacoes.map((v) => limite.executar("1.1.1.1", v.verificar));
    expect(verificacoes.filter((v) => v.comecou())).toHaveLength(5);
    verificacoes.forEach((v) => v.acabar(false));
    expect(await Promise.all(resultados)).toEqual([
      ...Array(5).fill("senha_invalida"),
      ...Array(5).fill("bloqueado"),
    ]);
  });

  it("a terceira simultânea é recusada por concorrência, sem começar e sem consumir tentativa", async () => {
    const limite = criarLimiteTentativas();
    const a = pendurada();
    const b = pendurada();
    const c = pendurada();
    const ra = limite.executar("1.1.1.1", a.verificar);
    const rb = limite.executar("2.2.2.2", b.verificar);
    expect(await limite.executar("3.3.3.3", c.verificar)).toBe("concorrencia");
    expect(c.comecou()).toBe(false);
    a.acabar(false);
    expect(await ra).toBe("senha_invalida");
    // Liberou uma vaga, e o 3.3.3.3 continua com as cinco tentativas.
    for (let i = 0; i < 5; i++) expect(await tentar(limite, "3.3.3.3", false)).toBe("senha_invalida");
    expect(await tentar(limite, "3.3.3.3", true)).toBe("bloqueado");
    b.acabar(true);
    expect(await rb).toBe("ok");
  });

  it("o teto de 2 é real: verificações penduradas além de 30 s ainda ocupam a vaga", async () => {
    const r = relogio();
    const limite = criarLimiteTentativas({ agora: r.agora });
    const a = pendurada();
    const b = pendurada();
    const ra = limite.executar("1.1.1.1", a.verificar);
    const rb = limite.executar("2.2.2.2", b.verificar);
    r.andar(31_000);
    const c = pendurada();
    expect(await limite.executar("3.3.3.3", c.verificar)).toBe("concorrencia");
    r.andar(60 * MIN);
    expect(await limite.executar("3.3.3.3", c.verificar)).toBe("concorrencia");
    expect(c.comecou()).toBe(false);
    a.acabar(true);
    await ra;
    expect(await limite.executar("3.3.3.3", async () => true)).toBe("ok");
    b.acabar(true);
    await rb;
  });

  it("exceção na verificação libera a vaga, conta como erro e é propagada", async () => {
    const limite = criarLimiteTentativas({ maxConcorrentes: 1 });
    const v = pendurada();
    const r = limite.executar("1.1.1.1", v.verificar);
    v.falhar(new Error("falhou"));
    await expect(r).rejects.toThrow("falhou");
    // A vaga voltou (o teto é 1) e sobram quatro tentativas.
    for (let i = 0; i < 4; i++) expect(await tentar(limite, "1.1.1.1", false)).toBe("senha_invalida");
    expect(await tentar(limite, "1.1.1.1", true)).toBe("bloqueado");
  });

  it("exceção síncrona na verificação também libera a vaga", async () => {
    const limite = criarLimiteTentativas({ maxConcorrentes: 1 });
    await expect(
      limite.executar("1.1.1.1", () => {
        throw new Error("síncrona");
      }),
    ).rejects.toThrow("síncrona");
    expect(await tentar(limite, "2.2.2.2", true)).toBe("ok");
  });

  it("5 erros bloqueiam aquele IP por 15 min, e só ele", async () => {
    const r = relogio();
    const limite = criarLimiteTentativas({ agora: r.agora });
    for (let i = 0; i < 5; i++) expect(await tentar(limite, "1.1.1.1", false)).toBe("senha_invalida");
    expect(await tentar(limite, "1.1.1.1", true)).toBe("bloqueado");
    // Sem bloqueio global: outro IP entra normalmente.
    expect(await tentar(limite, "2.2.2.2", true)).toBe("ok");

    r.andar(15 * MIN - 1);
    expect(await tentar(limite, "1.1.1.1", true)).toBe("bloqueado");
    r.andar(1);
    expect(await tentar(limite, "1.1.1.1", true)).toBe("ok");
  });

  it("depois do bloqueio o IP recomeça com cinco tentativas", async () => {
    const r = relogio();
    const limite = criarLimiteTentativas({ agora: r.agora, bloqueioMs: 5 * MIN });
    for (let i = 0; i < 5; i++) await tentar(limite, "1.1.1.1", false);
    r.andar(5 * MIN);
    for (let i = 0; i < 5; i++) expect(await tentar(limite, "1.1.1.1", false)).toBe("senha_invalida");
    expect(await tentar(limite, "1.1.1.1", true)).toBe("bloqueado");
  });

  it("erros saem da janela de 15 min", async () => {
    const r = relogio();
    const limite = criarLimiteTentativas({ agora: r.agora });
    for (let i = 0; i < 4; i++) await tentar(limite, "1.1.1.1", false);
    r.andar(15 * MIN);
    for (let i = 0; i < 5; i++) expect(await tentar(limite, "1.1.1.1", false)).toBe("senha_invalida");
    expect(await tentar(limite, "1.1.1.1", true)).toBe("bloqueado");
  });

  it("verificação lenta conta o erro a partir de quando terminou", async () => {
    const r = relogio();
    const limite = criarLimiteTentativas({ agora: r.agora, maxConcorrentes: 10 });
    const lentas = Array.from({ length: 5 }, () => pendurada());
    const resultados = lentas.map((v) => limite.executar("1.1.1.1", v.verificar));
    r.andar(20 * MIN); // além da janela
    lentas.forEach((v) => v.acabar(false));
    await Promise.all(resultados);
    expect(await tentar(limite, "1.1.1.1", true)).toBe("bloqueado");
  });

  it("sucesso desfaz a reserva", async () => {
    const limite = criarLimiteTentativas();
    for (let i = 0; i < 20; i++) expect(await tentar(limite, "1.1.1.1", true)).toBe("ok");
    for (let i = 0; i < 4; i++) await tentar(limite, "1.1.1.1", false);
    expect(await tentar(limite, "1.1.1.1", true)).toBe("ok");
    expect(await tentar(limite, "1.1.1.1", false)).toBe("senha_invalida");
    expect(await tentar(limite, "1.1.1.1", true)).toBe("bloqueado");
  });

  it("só um `true` de verdade é sucesso", async () => {
    const limite = criarLimiteTentativas();
    const quase = (() => Promise.resolve(1 as unknown as boolean)) as () => Promise<boolean>;
    expect(await limite.executar("1.1.1.1", quase)).toBe("senha_invalida");
  });

  it("o mapa tem teto e descarta os IPs usados há mais tempo", async () => {
    const limite = criarLimiteTentativas({ maxEntradas: 3 });
    for (let i = 0; i < 5; i++) await tentar(limite, "1.1.1.1", false);
    expect(await tentar(limite, "1.1.1.1", true)).toBe("bloqueado");
    await tentar(limite, "2.2.2.2", false);
    await tentar(limite, "3.3.3.3", false);
    expect(await tentar(limite, "1.1.1.1", true)).toBe("bloqueado"); // tocado: virou o mais recente
    await tentar(limite, "2.2.2.2", false);
    await tentar(limite, "3.3.3.3", false);
    await tentar(limite, "4.4.4.4", false);
    // Agora o 1.1.1.1 foi o menos usado e saiu: esquecido, livre de novo.
    expect(await tentar(limite, "1.1.1.1", true)).toBe("ok");
  });

  it("o mapa não passa do teto com milhares de IPs", async () => {
    const limite = criarLimiteTentativas({ maxEntradas: 100 });
    for (let i = 0; i < 5; i++) await tentar(limite, "alvo", false);
    for (let i = 0; i < 10_000; i++) await tentar(limite, `ip-${i}`, false);
    // O alvo foi descartado (prova indireta de que o mapa não cresceu sem fim).
    expect(await tentar(limite, "alvo", true)).toBe("ok");
  });

  it("IP descartado do mapa no meio da verificação não corrompe a contagem", async () => {
    const limite = criarLimiteTentativas({ maxEntradas: 1 });
    const v = pendurada();
    const r = limite.executar("1.1.1.1", v.verificar);
    // Outro IP entra no mapa de uma entrada só e empurra o 1.1.1.1 para fora.
    expect(await tentar(limite, "2.2.2.2", true)).toBe("ok");
    v.acabar(false);
    expect(await r).toBe("senha_invalida");
    // A vaga foi devolvida uma vez só: cabem exatamente duas de novo.
    const a = pendurada();
    const b = pendurada();
    const ra = limite.executar("3.3.3.3", a.verificar);
    const rb = limite.executar("4.4.4.4", b.verificar);
    expect(await limite.executar("5.5.5.5", async () => true)).toBe("concorrencia");
    a.acabar(true);
    b.acabar(true);
    expect(await Promise.all([ra, rb])).toEqual(["ok", "ok"]);
  });
});
