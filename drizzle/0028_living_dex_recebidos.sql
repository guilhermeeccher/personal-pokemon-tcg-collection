CREATE TABLE "dex_preferencias" (
	"id" integer PRIMARY KEY NOT NULL,
	"caixas_reservadas" integer DEFAULT 0 NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dex_registro" ADD COLUMN "a_guardar" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- O que já está no HOME entra em Recebidos: o sistema não sabe o que já foi arrumado,
-- e mostrar demais é melhor que esconder (um "Guardei tudo" limpa).
UPDATE "dex_registro" SET "a_guardar" = true WHERE "local" = 'home';
