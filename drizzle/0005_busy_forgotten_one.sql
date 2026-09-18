CREATE TYPE "public"."origem_imagem_local" AS ENUM('upload', 'url');--> statement-breakpoint
CREATE TABLE "imagem_local" (
	"carta_id" text NOT NULL,
	"idioma" "idioma" NOT NULL,
	"arquivo_nome" text NOT NULL,
	"mime_type" text NOT NULL,
	"tamanho_bytes" integer NOT NULL,
	"origem" "origem_imagem_local" NOT NULL,
	"origem_url" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imagem_local_carta_id_idioma_pk" PRIMARY KEY("carta_id","idioma")
);
--> statement-breakpoint
ALTER TABLE "imagem_local" ADD CONSTRAINT "imagem_local_carta_catalogo_fk" FOREIGN KEY ("carta_id","idioma") REFERENCES "public"."carta_catalogo"("id","idioma") ON DELETE cascade ON UPDATE no action;