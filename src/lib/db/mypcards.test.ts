import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { semFotoParaMypcards } from "./mypcards";

/**
 * Sem banco: confere a forma do SQL do critério de candidata ao mypcards.
 * O que pode quebrar aqui é alguém trocá-lo pela cadeia de imagem
 * inteira, que tiraria da lista a carta que só tem scan emprestado.
 */
const render = () => new PgDialect().sqlToQuery(semFotoParaMypcards()).sql.replace(/\s+/g, " ");

describe("semFotoParaMypcards", () => {
  it("a imagem_url própria e a da outra língua só contam se não verificadas como ausentes", () => {
    const s = render();
    expect(s).toContain(
      '(case when "carta_catalogo"."imagem_cdn_existe" is distinct from false then "carta_catalogo"."imagem_url" end) is null',
    );
    expect(s).toContain(
      "(case when emprestimo.imagem_cdn_existe is distinct from false then emprestimo.imagem_url end) is not null",
    );
  });

  it("o arquivo do CDN próprio confirmado conta como foto", () => {
    expect(render()).toContain(
      'not ( "carta_catalogo"."imagem_cdn_existe" is true and (case when "carta_catalogo"."set_serie_id" is not null then',
    );
  });

  it("imagem local só da própria linha; o scan emprestado da outra língua não tira a carta", () => {
    const s = render();
    expect(s).toContain('"imagem_local"."idioma" = "carta_catalogo"."idioma"');
    expect(s).not.toContain("local_emprestado");
    expect(s).not.toContain("mypcards'");
  });
});
