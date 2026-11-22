-- Grupos de coleções e a ordem da lista. Só acrescenta: uma tabela nova e duas colunas em
-- "colecao", nada existente é alterado ou removido.
CREATE TABLE "grupo_colecao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"serie_id" text,
	"ordem" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "colecao" ADD COLUMN "grupo_id" uuid;--> statement-breakpoint
ALTER TABLE "colecao" ADD COLUMN "ordem" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "colecao" ADD CONSTRAINT "colecao_grupo_id_grupo_colecao_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupo_colecao"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Preenchimento à mão: a lista era ordenada pela mais nova primeiro, e continua assim depois da
-- migração. Todas as coleções nascem em "sem grupo", posições 0..n-1 nessa ordem.
UPDATE "colecao" AS c SET "ordem" = o."posicao"
FROM (
	SELECT "id", (row_number() OVER (ORDER BY "criado_em" DESC, "id") - 1)::integer AS "posicao"
	FROM "colecao"
) AS o
WHERE c."id" = o."id";