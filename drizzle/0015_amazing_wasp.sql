CREATE TABLE "liga_coleta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"varredura_id" uuid NOT NULL,
	"filtros" jsonb NOT NULL,
	"cartas_consultadas" integer DEFAULT 0 NOT NULL,
	"requisicoes" integer DEFAULT 0 NOT NULL,
	"ofertas_colhidas" integer DEFAULT 0 NOT NULL,
	"concluida_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liga_loja" (
	"lj_id" integer PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"cidade" text,
	"uf" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liga_oferta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coleta_id" uuid NOT NULL,
	"opcao_id" uuid NOT NULL,
	"id_externo" integer NOT NULL,
	"loja_id" integer NOT NULL,
	"qualidade" text,
	"qualidade_id" integer NOT NULL,
	"idioma" text,
	"idioma_id" integer NOT NULL,
	"extra" text,
	"extra_id" integer,
	"quantidade" integer,
	"graded" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "liga_oferta_unica_na_coleta" UNIQUE("coleta_id","opcao_id","id_externo")
);
--> statement-breakpoint
ALTER TABLE "liga_opcao" ADD COLUMN "ofertas_consultadas_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "liga_opcao" ADD COLUMN "ofertas_encontradas" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "liga_coleta" ADD CONSTRAINT "liga_coleta_varredura_id_liga_varredura_id_fk" FOREIGN KEY ("varredura_id") REFERENCES "public"."liga_varredura"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liga_oferta" ADD CONSTRAINT "liga_oferta_coleta_id_liga_coleta_id_fk" FOREIGN KEY ("coleta_id") REFERENCES "public"."liga_coleta"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liga_oferta" ADD CONSTRAINT "liga_oferta_opcao_id_liga_opcao_id_fk" FOREIGN KEY ("opcao_id") REFERENCES "public"."liga_opcao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "liga_oferta_opcao_idx" ON "liga_oferta" USING btree ("opcao_id");--> statement-breakpoint
CREATE INDEX "liga_oferta_coleta_idx" ON "liga_oferta" USING btree ("coleta_id");--> statement-breakpoint
CREATE INDEX "liga_oferta_loja_idx" ON "liga_oferta" USING btree ("loja_id");