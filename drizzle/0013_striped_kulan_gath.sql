ALTER TABLE "liga_opcao" ALTER COLUMN "dex" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "liga_opcao" ALTER COLUMN "especie" DROP NOT NULL;--> statement-breakpoint
--
-- `chave` entra em três passos, e não como `ADD COLUMN ... NOT NULL`: a tabela
-- já tem as opções da primeira varredura real (2026-09-02), e uma coluna
-- obrigatória sem default derrubaria a migration nelas. As linhas antigas são
-- todas de Pokédex, onde a chave da vaga é o próprio número — o backfill é
-- exato, não é palpite.
--
ALTER TABLE "liga_opcao" ADD COLUMN "chave" text;--> statement-breakpoint
UPDATE "liga_opcao" SET "chave" = "dex"::text WHERE "chave" IS NULL;--> statement-breakpoint
ALTER TABLE "liga_opcao" ALTER COLUMN "chave" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "liga_opcao_varredura_chave_idx" ON "liga_opcao" USING btree ("varredura_id","chave");
