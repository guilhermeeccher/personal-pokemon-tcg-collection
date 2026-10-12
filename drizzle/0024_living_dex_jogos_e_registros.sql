CREATE TABLE "dex_jogo_possuido" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jogo_id" text NOT NULL,
	"desde" date,
	"notas" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dex_jogo_possuido_jogo_unico" UNIQUE("jogo_id")
);
--> statement-breakpoint
CREATE TABLE "dex_registro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"forma_id" text NOT NULL,
	"shiny" boolean DEFAULT false NOT NULL,
	"jogo_origem" text NOT NULL,
	"local" text NOT NULL,
	"capturado_em" date,
	"notas" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dex_registro" ADD CONSTRAINT "dex_registro_forma_id_dex_forma_id_fk" FOREIGN KEY ("forma_id") REFERENCES "public"."dex_forma"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dex_registro_forma_idx" ON "dex_registro" USING btree ("forma_id");--> statement-breakpoint
CREATE INDEX "dex_registro_local_idx" ON "dex_registro" USING btree ("local");