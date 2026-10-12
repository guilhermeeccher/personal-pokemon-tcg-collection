ALTER TYPE "public"."tipo_trofeu_dex" ADD VALUE 'calculado';--> statement-breakpoint
ALTER TABLE "dex_trofeu" ADD COLUMN "regra" jsonb;