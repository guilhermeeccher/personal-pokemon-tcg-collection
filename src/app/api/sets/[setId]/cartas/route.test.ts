import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * O contrato do `?catalogo=` na rota, sem banco: a consulta é trocada por um
 * espião. A decisão de qual ficha usar é pura e tem o próprio teste
 * (`catalogo-grade-set.test.ts`); aqui se confere que a rota a lê, passa
 * adiante e recusa o que não conhece antes de consultar qualquer coisa.
 */
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/db/consultas", () => ({
  obterGradeDoSet: vi.fn(),
  contarCopiasPorCartaId: vi.fn(async () => ({})),
}));

import { contarCopiasPorCartaId, obterGradeDoSet } from "@/lib/db/consultas";

import { GET } from "./route";

const grade = {
  setId: "neo1",
  setNome: "x",
  idiomaCatalogo: "jp",
  temPt: false,
  cartasEmOutroIdioma: 0,
  cartas: [{ cartaId: "neo1-001", idiomaCatalogo: "jp", localId: "001" }],
};

async function pedir(consulta: string) {
  return GET(new Request(`http://local/api/sets/neo1/cartas${consulta}`), {
    params: Promise.resolve({ setId: "neo1" }),
  });
}

beforeEach(() => {
  vi.mocked(obterGradeDoSet).mockReset();
  vi.mocked(contarCopiasPorCartaId).mockClear();
});

describe("GET /api/sets/:setId/cartas — ?catalogo=", () => {
  it("sem o parâmetro, a consulta de sempre (pedido nulo)", async () => {
    vi.mocked(obterGradeDoSet).mockResolvedValue({ ...grade, idiomaCatalogo: "en" } as never);
    const r = await pedir("");
    expect(r.status).toBe(200);
    expect(obterGradeDoSet).toHaveBeenCalledWith({}, "neo1", null);
  });

  it("catalogo=jp vai pedido à consulta", async () => {
    vi.mocked(obterGradeDoSet).mockResolvedValue(grade as never);
    const r = await pedir("?catalogo=jp");
    expect(r.status).toBe(200);
    expect(obterGradeDoSet).toHaveBeenCalledWith({}, "neo1", "jp");
    const corpo = await r.json();
    expect(corpo.cartas[0]).toMatchObject({ cartaId: "neo1-001", idiomaCatalogo: "jp", qtdPossuida: 0 });
  });

  it("sem a grade pedida (set sem ficha japonesa), 404", async () => {
    vi.mocked(obterGradeDoSet).mockResolvedValue(null);
    const r = await pedir("?catalogo=jp");
    expect(r.status).toBe(404);
  });

  it.each(["?catalogo=", "?catalogo=JP", "?catalogo=pt", "?catalogo=jp&catalogo=jp", "?catalogo=jp&catalogo=en"])(
    "%s é recusado com 400, sem consultar",
    async (consulta) => {
      const r = await pedir(consulta);
      expect(r.status).toBe(400);
      expect(obterGradeDoSet).not.toHaveBeenCalled();
    },
  );
});
