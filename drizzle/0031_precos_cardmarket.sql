-- Fonte de preço Cardmarket (PRECO_FONTE=cardmarket). Não destrutiva: cria o enum e as duas
-- tabelas novas e acrescenta `fonte` às tabelas de rodada e de foto. As linhas que já existem
-- são todas da Liga e ficam 'liga' pelo default; nada da Liga é alterado nem apagado.
CREATE TYPE "public"."fonte_preco" AS ENUM('liga', 'cardmarket');--> statement-breakpoint
CREATE TABLE "preco_carta_cardmarket" (
	"carta_id" text PRIMARY KEY NOT NULL,
	"id_produto" integer,
	"idioma_consulta" text,
	"foil" boolean DEFAULT false NOT NULL,
	"tendencia_eur" numeric(10, 2),
	"media_eur" numeric(10, 2),
	"minimo_eur" numeric(10, 2),
	"cotacao" numeric(10, 4),
	"cotacao_data" date,
	"tendencia" numeric(10, 2),
	"media" numeric(10, 2),
	"minimo" numeric(10, 2),
	"atualizado_upstream" timestamp with time zone,
	"encontrada" boolean NOT NULL,
	"consultado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preco_carta_cardmarket_historico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"carta_id" text NOT NULL,
	"rodada_id" uuid,
	"foil" boolean DEFAULT false NOT NULL,
	"tendencia_eur" numeric(10, 2),
	"media_eur" numeric(10, 2),
	"minimo_eur" numeric(10, 2),
	"cotacao" numeric(10, 4),
	"cotacao_data" date,
	"tendencia" numeric(10, 2),
	"media" numeric(10, 2),
	"minimo" numeric(10, 2),
	"encontrada" boolean NOT NULL,
	"consultado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "liga_rodada_preco" ADD COLUMN "fonte" "fonte_preco" DEFAULT 'liga' NOT NULL;--> statement-breakpoint
ALTER TABLE "liga_snapshot_preco" ADD COLUMN "fonte" "fonte_preco" DEFAULT 'liga' NOT NULL;--> statement-breakpoint
CREATE INDEX "preco_carta_cardmarket_historico_carta_idx" ON "preco_carta_cardmarket_historico" USING btree ("carta_id","consultado_em");