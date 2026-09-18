ALTER TYPE "public"."origem_imagem_local" ADD VALUE 'mypcards';--> statement-breakpoint
CREATE TABLE "set_mypcards" (
	"set_id" text PRIMARY KEY NOT NULL,
	"numero" integer NOT NULL,
	"origem_url" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Semeia os dois sets já descobertos em 2026-08-29, com o link de onde o
-- número saiu. `mee` veio de um link colado na tela; `mep` foi
-- achado varrendo uma faixa de 60 números a partir dele (a numeração deles
-- segue ordem de entrada no catálogo, então sets irmãos ficam vizinhos).
-- Dado de referência, não schema: sem isto, uma instalação nova teria que
-- sondar o CDN de novo para chegar no mesmo número.
INSERT INTO "set_mypcards" ("set_id", "numero", "origem_url") VALUES
  ('mee', 2370, 'https://img.mypcards.com/cdn-cgi/image/h=425,fit=contain,f=auto/img/2/2370/pokemon_mee_004/pokemon_mee_004_pt.jpg'),
  ('mep', 2369, 'https://img.mypcards.com/img/2/2369/pokemon_mep_001/pokemon_mep_001_pt.jpg')
ON CONFLICT ("set_id") DO NOTHING;
