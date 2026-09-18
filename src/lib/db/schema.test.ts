import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { cartaCatalogo, copia } from "./schema";

/**
 * Regra 7 (AGENTS.md): "Idioma da cópia é o idioma da carta física,
 * independente da linha de catálogo que a identifica." Módulo puro — sem
 * banco: inspeciona a definição real do schema Drizzle (a mesma que gera a
 * migration aplicada no Postgres), não uma reimplementação da regra.
 *
 * O caso real (cadastrar `idioma = pt` sobre a linha de catálogo `en` do
 * Charizard da Coleção Básica, `base1-4`) foi validado à parte com uma
 * checagem SQL contra o Postgres do compose — reportado no relatório desta
 * tarefa, não reproduzido aqui.
 */
describe("copia — separação entre idioma_catalogo (FK) e idioma físico", () => {
  it("a FK para carta_catalogo usa (carta_id, idioma_catalogo) — não (carta_id, idioma)", () => {
    const { foreignKeys } = getTableConfig(copia);
    expect(foreignKeys).toHaveLength(1);

    const fk = foreignKeys[0].reference();
    expect(fk.columns.map((c) => c.name)).toEqual([
      "carta_id",
      "idioma_catalogo",
    ]);
    expect(fk.foreignTable).toBe(cartaCatalogo);
    expect(fk.foreignColumns.map((c) => c.name)).toEqual(["id", "idioma"]);
  });

  it("a coluna idioma (física) não participa de nenhuma foreign key", () => {
    const { foreignKeys } = getTableConfig(copia);
    const colunasEmFk = foreignKeys.flatMap((fk) =>
      fk.reference().columns.map((c) => c.name),
    );
    expect(colunasEmFk).not.toContain("idioma");
  });

  it("permite montar o insert do caso real sem nenhuma restrição de igualdade entre os dois campos", () => {
    // Caso da spec §3.2 / critério de aceite da Fase 0: Charizard da
    // Coleção Básica (base1-4) não tem linha `pt` no upstream — a cópia é
    // identificada pela linha `en` e registra o idioma físico separado.
    const valores: typeof copia.$inferInsert = {
      cartaId: "base1-4",
      idiomaCatalogo: "en",
      idioma: "pt",
      variante: "holo",
      condicao: "NM",
    };

    expect(valores.idioma).toBe("pt");
    expect(valores.idiomaCatalogo).toBe("en");
    expect(valores.idioma).not.toBe(valores.idiomaCatalogo);
  });
});
