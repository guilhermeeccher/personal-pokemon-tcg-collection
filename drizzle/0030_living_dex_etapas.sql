CREATE TABLE "dex_tarefa_etapa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tarefa_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"texto" text NOT NULL,
	"detalhe" text,
	"feita" boolean DEFAULT false NOT NULL,
	"feita_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dex_tarefa_etapa" ADD CONSTRAINT "dex_tarefa_etapa_tarefa_id_dex_tarefa_id_fk" FOREIGN KEY ("tarefa_id") REFERENCES "public"."dex_tarefa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dex_tarefa_etapa_tarefa_idx" ON "dex_tarefa_etapa" USING btree ("tarefa_id");