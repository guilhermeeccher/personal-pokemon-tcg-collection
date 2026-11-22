import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { imagemDaCarta, origemDaImagem } from "./consultas";
import { cartaCatalogo } from "./schema";
import {
  partesDoExcluded,
  urlCatalogoNaoAusente,
  urlDeduzidaImagem,
  vereditoCdnAoGravar,
} from "./veredicto-imagem-cdn";

/**
 * Sem banco: renderiza o SQL que o Drizzle mandaria e confere a forma. O
 * comportamento no Postgres (`is distinct from` tratando nulo, `excluded`
 * e a tabela lendo a linha de antes do UPDATE) é o da documentação dele;
 * o que pode quebrar aqui é a expressão deixar de dizer isso.
 */
const dialeto = new PgDialect();
const render = (s: Parameters<PgDialect["sqlToQuery"]>[0]) =>
  dialeto.sqlToQuery(s).sql.replace(/\s+/g, " ").trim();

describe("urlCatalogoNaoAusente", () => {
  it("só some com false: true e null (não verificada) mantêm a URL", () => {
    expect(render(urlCatalogoNaoAusente(cartaCatalogo.imagemUrl, cartaCatalogo.imagemCdnExiste))).toBe(
      '(case when "carta_catalogo"."imagem_cdn_existe" is distinct from false then "carta_catalogo"."imagem_url" end)',
    );
  });
});

describe("cadeia de imagem (degrausImagem)", () => {
  it("o degrau 2 e a oficial emprestada do degrau 5 pulam a URL verificada como ausente", () => {
    const s = render(imagemDaCarta(cartaCatalogo));
    expect(s).toContain(
      `(2, (case when "carta_catalogo"."imagem_cdn_existe" is distinct from false then "carta_catalogo"."imagem_url" end)::text, 'catalogo'::text)`,
    );
    expect(s).toContain(
      "coalesce( (case when emprestimo.imagem_cdn_existe is distinct from false then emprestimo.imagem_url end),",
    );
  });

  it("a URL e a origem leem a mesma lista de degraus", () => {
    const degraus = (s: string) => s.slice(s.indexOf("(values"), s.indexOf("as degrau("));
    const url = render(imagemDaCarta(cartaCatalogo));
    const origem = render(origemDaImagem(cartaCatalogo));
    expect(degraus(url).length).toBeGreaterThan(0);
    expect(degraus(origem)).toBe(degraus(url));
  });
});

describe("vereditoCdnAoGravar", () => {
  const efetivaAtual =
    'coalesce("carta_catalogo"."imagem_url", (case when "carta_catalogo"."set_serie_id" is not null then ' +
    "'https://assets.tcgdex.net/' || case when \"carta_catalogo\".\"idioma\" = 'jp' then 'ja' else \"carta_catalogo\".\"idioma\"::text end " +
    "|| '/' || \"carta_catalogo\".\"set_serie_id\" || '/' || \"carta_catalogo\".\"set_id\" || '/' || \"carta_catalogo\".\"local_id\" end))";

  it("compara a URL EFETIVA (gravada, ou deduzida quando nula): nula → nula com série nova também troca", () => {
    const v = vereditoCdnAoGravar(partesDoExcluded());
    const existe = render(v.imagemCdnExiste);
    expect(existe).toContain("coalesce(excluded.imagem_url, (case when excluded.set_serie_id is not null then");
    expect(existe).toContain(
      "|| '/' || excluded.set_serie_id || '/' || excluded.set_id || '/' || excluded.local_id end))",
    );
    expect(existe).toContain(`is distinct from ${efetivaAtual} then null else "carta_catalogo"."imagem_cdn_existe" end`);
  });

  it("as duas colunas zeram pela mesma condição; a mesma URL efetiva mantém o par", () => {
    const v = vereditoCdnAoGravar(partesDoExcluded());
    const condicao = (s: string) => s.slice(0, s.indexOf(" then "));
    const existe = render(v.imagemCdnExiste);
    const data = render(v.imagemCdnVerificadoEm);
    expect(condicao(existe)).toBe(condicao(data));
    expect(existe).toMatch(/then null else "carta_catalogo"\."imagem_cdn_existe" end$/);
    expect(data).toMatch(/then null else "carta_catalogo"\."imagem_cdn_verificado_em" end$/);
  });

  it("compara com a URL que a escrita grava (importador: coalesce com a atual)", () => {
    const v = vereditoCdnAoGravar(partesDoExcluded(sql`coalesce(excluded.imagem_url, ${cartaCatalogo.imagemUrl})`));
    expect(render(v.imagemCdnExiste)).toContain(
      'case when coalesce(coalesce(excluded.imagem_url, "carta_catalogo"."imagem_url"), (case when excluded.set_serie_id',
    );
  });
});

describe("urlDeduzidaImagem", () => {
  it("monta o mesmo padrão de urlBaseImagemCartaCdn (ja para jp, caixa e zeros intactos)", () => {
    const s = render(
      urlDeduzidaImagem({ idioma: sql`'jp'`, setSerieId: sql`'XX'`, setId: sql`'XX1H'`, localId: sql`'009'` }),
    );
    expect(s).toBe(
      "(case when 'XX' is not null then 'https://assets.tcgdex.net/' || case when 'jp' = 'jp' then 'ja' else 'jp'::text end || '/' || 'XX' || '/' || 'XX1H' || '/' || '009' end)",
    );
  });
});
