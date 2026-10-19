import { describe, expect, it } from "vitest";

import { escolherIcone, nomeIconeConhecido, type LeituraPasta, type NomeIconePwa } from "./escolha-icone";

const GENERICO = new Uint8Array([1]);
const DA_PASTA = new Uint8Array([2, 2]);

function montar(pasta: string | undefined, leitura: LeituraPasta, jaAvisados = new Set<NomeIconePwa>()) {
  let lidosDaPasta = 0;
  return {
    jaAvisados,
    lidos: () => lidosDaPasta,
    rodar: (nome: NomeIconePwa = "icone-192.png") =>
      escolherIcone({
        nome,
        pasta,
        lerDaPasta: async () => {
          lidosDaPasta++;
          return leitura;
        },
        lerGenerico: async () => GENERICO,
        jaAvisados,
      }),
  };
}

describe("nomeIconeConhecido", () => {
  it("aceita os quatro nomes e devolve o da lista", () => {
    for (const n of ["icone-180.png", "icone-192.png", "icone-512.png", "icone-maskable-512.png"]) {
      expect(nomeIconeConhecido(n)).toBe(n);
    }
  });

  it("recusa qualquer outra coisa, inclusive caminho e variações de grafia", () => {
    for (const n of ["", "../icone-192.png", "icone-192.PNG", "icone-192.png/", "a/icone-192.png", "%2e%2e", "icone-96.png"]) {
      expect(nomeIconeConhecido(n)).toBeNull();
    }
  });
});

describe("escolherIcone", () => {
  it("sem pasta (ausente, vazia ou só espaços): genérico, sem aviso e sem tocar na pasta", async () => {
    for (const pasta of [undefined, "", "   "]) {
      const m = montar(pasta, { estado: "ok", bytes: DA_PASTA });
      expect(await m.rodar()).toEqual({ bytes: GENERICO, origem: "generico", avisar: false });
      expect(m.lidos()).toBe(0);
    }
  });

  it("pasta com o arquivo: serve o da pasta, sem aviso", async () => {
    const m = montar("/dados", { estado: "ok", bytes: DA_PASTA });
    expect(await m.rodar()).toEqual({ bytes: DA_PASTA, origem: "pasta", avisar: false });
  });

  it.each<LeituraPasta>([{ estado: "ausente" }, { estado: "erro" }, { estado: "ok", bytes: new Uint8Array() }])(
    "pasta sem o arquivo utilizável (%j): genérico daquele arquivo, com aviso na primeira vez",
    async (leitura) => {
      const m = montar("/dados", leitura);
      expect(await m.rodar()).toEqual({ bytes: GENERICO, origem: "generico", avisar: true });
      expect((await m.rodar()).avisar).toBe(false);
    },
  );

  it("o aviso é por arquivo", async () => {
    const m = montar("/dados", { estado: "ausente" });
    expect((await m.rodar("icone-180.png")).avisar).toBe(true);
    expect((await m.rodar("icone-512.png")).avisar).toBe(true);
    expect((await m.rodar("icone-180.png")).avisar).toBe(false);
    expect((await m.rodar("icone-512.png")).avisar).toBe(false);
  });
});
