CREATE TYPE "public"."origem_carta" AS ENUM('sync', 'manual');--> statement-breakpoint
ALTER TABLE "carta_catalogo" ADD COLUMN "origem" "origem_carta" DEFAULT 'sync' NOT NULL;