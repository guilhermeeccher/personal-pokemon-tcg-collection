-- Valor guardado da fonte Cardmarket (a trava da tendência fora da curva). Não destrutiva:
-- acrescenta colunas anuláveis às duas tabelas do Cardmarket e preenche só elas. Nenhuma
-- coluna que já existe é alterada, e nada da Liga é tocado.
ALTER TABLE "preco_carta_cardmarket" ADD COLUMN "media30_eur" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "preco_carta_cardmarket" ADD COLUMN "media30" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "preco_carta_cardmarket" ADD COLUMN "valor_eur" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "preco_carta_cardmarket" ADD COLUMN "valor" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "preco_carta_cardmarket" ADD COLUMN "criterio_valor" text;--> statement-breakpoint
ALTER TABLE "preco_carta_cardmarket_historico" ADD COLUMN "media30_eur" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "preco_carta_cardmarket_historico" ADD COLUMN "media30" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "preco_carta_cardmarket_historico" ADD COLUMN "valor_eur" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "preco_carta_cardmarket_historico" ADD COLUMN "valor" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "preco_carta_cardmarket_historico" ADD COLUMN "criterio_valor" text;--> statement-breakpoint
-- Backfill, só nas colunas novas e só nas linhas encontradas: o valor passa a ser a regra de
-- até aqui (a tendência, senão a média). As linhas antigas não guardaram a média de 30 dias,
-- então não há como aplicar a trava a elas; ela vale a partir da próxima consulta de cada
-- carta (`escolherValorCardmarket`). Linha não encontrada fica com as colunas novas nulas,
-- como fica o preço dela. Idempotente: rodar de novo grava os mesmos valores.
UPDATE "preco_carta_cardmarket"
SET "valor" = coalesce("tendencia", "media"),
    "valor_eur" = coalesce("tendencia_eur", "media_eur"),
    "criterio_valor" = CASE WHEN "tendencia" IS NOT NULL THEN 'tendencia' WHEN "media" IS NOT NULL THEN 'media' END
WHERE "encontrada";--> statement-breakpoint
UPDATE "preco_carta_cardmarket_historico"
SET "valor" = coalesce("tendencia", "media"),
    "valor_eur" = coalesce("tendencia_eur", "media_eur"),
    "criterio_valor" = CASE WHEN "tendencia" IS NOT NULL THEN 'tendencia' WHEN "media" IS NOT NULL THEN 'media' END
WHERE "encontrada";
