-- A triagem do usuário passa a sobreviver à varredura (2026-09-17).
--
-- Antes, a marcação vivia em `liga_opcao.selecionada`, ou seja, na linha da
-- rodada: varredura nova nascia com a seleção zerada. O usuário marcou 126
-- cartas da Pokédex, uma por vaga vazia, e a próxima atualização de preço
-- apagaria as 126. A escolha não é sobre preço, é sobre qual carta o usuário
-- quer ter.
--
-- ESTA MIGRATION NÃO PODE PERDER ESSAS MARCAÇÕES. Por isso o INSERT abaixo
-- roda ANTES do DROP COLUMN, na mesma transação: ou as duas coisas acontecem,
-- ou nenhuma.

CREATE TABLE "escolha_compra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"colecao_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"identidade" text NOT NULL,
	"especie" text,
	"nome" text NOT NULL,
	"edicao_sigla" text NOT NULL,
	"edid" integer,
	"edicao_nome" text NOT NULL,
	"numero" text NOT NULL,
	"total" text,
	"caminho" text NOT NULL,
	"carta_id" text,
	"idioma_catalogo" "idioma",
	"preco" numeric(10, 2),
	"preco_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "escolha_compra_unica" UNIQUE("colecao_id","chave","identidade")
);
--> statement-breakpoint
DROP INDEX "liga_opcao_selecionada_idx";--> statement-breakpoint
ALTER TABLE "escolha_compra" ADD CONSTRAINT "escolha_compra_colecao_id_colecao_id_fk" FOREIGN KEY ("colecao_id") REFERENCES "public"."colecao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "escolha_compra_colecao_idx" ON "escolha_compra" USING btree ("colecao_id");--> statement-breakpoint
-- Copia as marcações vivas para a tabela nova.
--
-- A `identidade` é a mesma regra de `lib/dominio/identidade-carta.ts`: prefixo
-- (`edid:` ou `sigla:`) mais o número sem zero à esquerda. É repetida aqui em
-- SQL de propósito e uma vez só — migration é artefato histórico, congelado no
-- tempo, e não uma segunda implementação viva da regra.
--
-- `DISTINCT ON` mantém a marcação da varredura mais recente quando a mesma
-- carta foi marcada em rodadas diferentes: o preço mais novo é o que vale.
INSERT INTO "escolha_compra" (
  "colecao_id", "chave", "identidade", "especie", "nome", "edicao_sigla",
  "edid", "edicao_nome", "numero", "total", "caminho", "carta_id",
  "idioma_catalogo", "preco", "preco_em"
)
SELECT DISTINCT ON (v."colecao_id", o."chave", ident."identidade")
  v."colecao_id", o."chave", ident."identidade", o."especie", o."nome",
  o."edicao_sigla", o."edid", o."edicao_nome", o."numero", o."total",
  o."caminho", o."carta_id", o."idioma_catalogo", o."preco", v."criado_em"
FROM "liga_opcao" o
JOIN "liga_varredura" v ON v."id" = o."varredura_id"
CROSS JOIN LATERAL (
  SELECT (
    CASE WHEN o."edid" IS NOT NULL
         THEN 'edid:' || o."edid"::text
         ELSE 'sigla:' || upper(btrim(o."edicao_sigla"))
    END
  ) || '/' || regexp_replace(btrim(o."numero"), '^0+([0-9])', '\1') AS "identidade"
) ident
WHERE o."selecionada"
ORDER BY v."colecao_id", o."chave", ident."identidade", v."criado_em" DESC
ON CONFLICT ON CONSTRAINT "escolha_compra_unica" DO NOTHING;
--> statement-breakpoint
ALTER TABLE "liga_opcao" DROP COLUMN "selecionada";