CREATE TABLE "liga_edicao" (
	"edid" integer PRIMARY KEY NOT NULL,
	"sigla" text NOT NULL,
	"nome" text NOT NULL,
	"set_id" text,
	"origem_vinculo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liga_opcao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"varredura_id" uuid NOT NULL,
	"dex" integer NOT NULL,
	"especie" text NOT NULL,
	"nome" text NOT NULL,
	"edicao_sigla" text NOT NULL,
	"edid" integer,
	"edicao_nome" text NOT NULL,
	"numero" text NOT NULL,
	"total" text,
	"preco" numeric(10, 2) NOT NULL,
	"preco_medio" numeric(10, 2),
	"preco_maximo" numeric(10, 2),
	"caminho" text NOT NULL,
	"carta_id" text,
	"idioma_catalogo" "idioma",
	"selecionada" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liga_varredura" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"colecao_id" uuid NOT NULL,
	"filtros" jsonb NOT NULL,
	"vagas_consultadas" integer DEFAULT 0 NOT NULL,
	"requisicoes" integer DEFAULT 0 NOT NULL,
	"concluida_em" timestamp with time zone,
	"erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "liga_opcao" ADD CONSTRAINT "liga_opcao_varredura_id_liga_varredura_id_fk" FOREIGN KEY ("varredura_id") REFERENCES "public"."liga_varredura"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liga_varredura" ADD CONSTRAINT "liga_varredura_colecao_id_colecao_id_fk" FOREIGN KEY ("colecao_id") REFERENCES "public"."colecao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "liga_opcao_varredura_dex_idx" ON "liga_opcao" USING btree ("varredura_id","dex");--> statement-breakpoint
CREATE INDEX "liga_opcao_selecionada_idx" ON "liga_opcao" USING btree ("varredura_id","selecionada");