CREATE TYPE "public"."condicao" AS ENUM('NM', 'LP', 'MP', 'HP', 'DMG');--> statement-breakpoint
CREATE TYPE "public"."forma" AS ENUM('normal', 'alola', 'galar', 'hisui', 'paldea', 'mega', 'gigantamax');--> statement-breakpoint
CREATE TYPE "public"."idioma" AS ENUM('pt', 'en', 'jp');--> statement-breakpoint
CREATE TYPE "public"."tipo_colecao" AS ENUM('pokedex', 'set', 'customizada');--> statement-breakpoint
CREATE TYPE "public"."variante_copia" AS ENUM('normal', 'reverse', 'holo', 'primeira_edicao', 'promo');--> statement-breakpoint
CREATE TABLE "carta_catalogo" (
	"id" text NOT NULL,
	"idioma" "idioma" NOT NULL,
	"set_id" text NOT NULL,
	"set_nome" text NOT NULL,
	"set_serie" text NOT NULL,
	"local_id" text NOT NULL,
	"nome" text NOT NULL,
	"categoria" text NOT NULL,
	"raridade" text,
	"dex_ids" integer[] DEFAULT '{}' NOT NULL,
	"forma" "forma" DEFAULT 'normal' NOT NULL,
	"variante_normal_disponivel" boolean DEFAULT false NOT NULL,
	"variante_reverse_disponivel" boolean DEFAULT false NOT NULL,
	"variante_holo_disponivel" boolean DEFAULT false NOT NULL,
	"variante_primeira_edicao_disponivel" boolean DEFAULT false NOT NULL,
	"variante_promo_disponivel" boolean DEFAULT false NOT NULL,
	"imagem_url" text,
	"ilustrador" text,
	"set_qtd_oficial" integer NOT NULL,
	"set_qtd_total" integer NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carta_catalogo_id_idioma_pk" PRIMARY KEY("id","idioma")
);
--> statement-breakpoint
CREATE TABLE "colecao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_colecao" NOT NULL,
	"parametro" jsonb,
	"idioma_exigido" "idioma",
	"notas" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"carta_id" text NOT NULL,
	"idioma" "idioma" NOT NULL,
	"variante" "variante_copia" NOT NULL,
	"quantidade" integer DEFAULT 1 NOT NULL,
	"condicao" "condicao" NOT NULL,
	"graded_empresa" text,
	"graded_nota" text,
	"graded_certificado" text,
	"localizacao" text,
	"aquisicao_data" date,
	"aquisicao_origem" text,
	"aquisicao_preco" numeric(10, 2),
	"notas" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vaga" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"colecao_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"copia_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vaga_copia_id_unique" UNIQUE("copia_id"),
	CONSTRAINT "vaga_colecao_chave_unique" UNIQUE("colecao_id","chave")
);
--> statement-breakpoint
ALTER TABLE "copia" ADD CONSTRAINT "copia_carta_catalogo_fk" FOREIGN KEY ("carta_id","idioma") REFERENCES "public"."carta_catalogo"("id","idioma") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaga" ADD CONSTRAINT "vaga_colecao_id_colecao_id_fk" FOREIGN KEY ("colecao_id") REFERENCES "public"."colecao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaga" ADD CONSTRAINT "vaga_copia_id_copia_id_fk" FOREIGN KEY ("copia_id") REFERENCES "public"."copia"("id") ON DELETE set null ON UPDATE no action;