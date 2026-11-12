-- Preço de referência das candidatas de compra (opções de compra tiradas do catálogo, com a
-- fonte Cardmarket). Só acrescenta: duas tabelas novas, nada existente é alterado.
CREATE TABLE "preco_candidata_cardmarket" (
	"carta_id" text PRIMARY KEY NOT NULL,
	"id_produto" integer,
	"idioma_consulta" text,
	"foil" boolean DEFAULT false NOT NULL,
	"tendencia_eur" numeric(10, 2),
	"media_eur" numeric(10, 2),
	"minimo_eur" numeric(10, 2),
	"media30_eur" numeric(10, 2),
	"cotacao" numeric(10, 4),
	"cotacao_data" date,
	"valor_eur" numeric(10, 2),
	"valor" numeric(10, 2),
	"criterio_valor" text,
	"atualizado_upstream" timestamp with time zone,
	"encontrada" boolean NOT NULL,
	"preco_em" timestamp with time zone,
	"consultado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rodada_preco_candidata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"colecao_id" uuid NOT NULL,
	"total_cartas" integer DEFAULT 0 NOT NULL,
	"cartas_consultadas" integer DEFAULT 0 NOT NULL,
	"cartas_com_falha" integer DEFAULT 0 NOT NULL,
	"requisicoes" integer DEFAULT 0 NOT NULL,
	"concluida_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rodada_preco_candidata" ADD CONSTRAINT "rodada_preco_candidata_colecao_id_colecao_id_fk" FOREIGN KEY ("colecao_id") REFERENCES "public"."colecao"("id") ON DELETE cascade ON UPDATE no action;