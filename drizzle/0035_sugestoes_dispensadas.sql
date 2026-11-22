-- Sugestões de coleção dispensadas ("Não tenho interesse"). Só acrescenta: uma tabela nova,
-- nada existente é alterado.
CREATE TABLE "sugestao_dispensada" (
	"tipo" text NOT NULL,
	"valor" text NOT NULL,
	"dispensada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sugestao_dispensada_unica" UNIQUE("tipo","valor")
);
