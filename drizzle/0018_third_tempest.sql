-- Cartas que a Compra por Lista da Liga devolveu como "sem estoque" (2026-09-24).
-- Só cria a tabela: nenhum dado existente é tocado. Ver
-- `lib/dominio/sem-estoque-liga.ts`.

CREATE TABLE "sem_estoque_liga" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chave" text NOT NULL,
	"nome" text NOT NULL,
	"numero" text NOT NULL,
	"total" text,
	"qualidade" text DEFAULT '' NOT NULL,
	"registrado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sem_estoque_liga_unica" UNIQUE("chave","qualidade")
);
