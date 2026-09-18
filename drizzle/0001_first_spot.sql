ALTER TABLE "copia" DROP CONSTRAINT "copia_carta_catalogo_fk";
--> statement-breakpoint
ALTER TABLE "copia" ADD COLUMN "idioma_catalogo" "idioma" NOT NULL;--> statement-breakpoint
ALTER TABLE "copia" ADD CONSTRAINT "copia_carta_catalogo_fk" FOREIGN KEY ("carta_id","idioma_catalogo") REFERENCES "public"."carta_catalogo"("id","idioma") ON DELETE no action ON UPDATE no action;