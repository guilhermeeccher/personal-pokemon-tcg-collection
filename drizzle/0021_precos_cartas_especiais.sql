CREATE TABLE "liga_rodada_preco" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
CREATE TABLE "preco_carta_liga" (
	"carta_id" text PRIMARY KEY NOT NULL,
	"edicao_sigla" text,
	"edid" integer,
	"numero" text,
	"preco" numeric(10, 2),
	"preco_medio" numeric(10, 2),
	"preco_maximo" numeric(10, 2),
	"encontrada" boolean NOT NULL,
	"paginas_max" integer NOT NULL,
	"consultado_em" timestamp with time zone DEFAULT now() NOT NULL
);
