CREATE TABLE "melhoria_descartada" (
	"vaga_id" uuid NOT NULL,
	"copia_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "melhoria_descartada_vaga_id_copia_id_pk" PRIMARY KEY("vaga_id","copia_id")
);
--> statement-breakpoint
ALTER TABLE "melhoria_descartada" ADD CONSTRAINT "melhoria_descartada_vaga_id_vaga_id_fk" FOREIGN KEY ("vaga_id") REFERENCES "public"."vaga"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "melhoria_descartada" ADD CONSTRAINT "melhoria_descartada_copia_id_copia_id_fk" FOREIGN KEY ("copia_id") REFERENCES "public"."copia"("id") ON DELETE cascade ON UPDATE no action;