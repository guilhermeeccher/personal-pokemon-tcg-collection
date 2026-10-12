CREATE TYPE "public"."categoria_forma_dex" AS ENUM('base', 'regional', 'genero', 'cosmetica', 'especial');--> statement-breakpoint
CREATE TABLE "dex_forma" (
	"id" text PRIMARY KEY NOT NULL,
	"numero" integer NOT NULL,
	"especie" text NOT NULL,
	"forma" text,
	"categoria" "categoria_forma_dex" NOT NULL,
	"geracao" integer NOT NULL,
	"lendario" boolean DEFAULT false NOT NULL,
	"mitico" boolean DEFAULT false NOT NULL,
	"shiny_obtenivel" boolean DEFAULT true NOT NULL,
	"sprite" text NOT NULL,
	"ordem" integer NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dex_secao" (
	"categoria" "categoria_forma_dex" PRIMARY KEY NOT NULL,
	"conta" boolean NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "dex_forma_numero_idx" ON "dex_forma" USING btree ("numero");--> statement-breakpoint
CREATE INDEX "dex_forma_ordem_idx" ON "dex_forma" USING btree ("ordem");