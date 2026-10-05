CREATE TABLE "liga_snapshot_preco" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rodada_id" uuid,
	"tirado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"soma_medios" numeric(12, 2) NOT NULL,
	"cartas_com_preco" integer NOT NULL,
	"preco_medio_por_carta" numeric(12, 2) NOT NULL,
	"soma_minimos" numeric(12, 2) NOT NULL,
	CONSTRAINT "liga_snapshot_preco_rodada_id_unique" UNIQUE("rodada_id")
);
--> statement-breakpoint
CREATE TABLE "preco_carta_liga_historico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"carta_id" text NOT NULL,
	"rodada_id" uuid,
	"preco" numeric(10, 2),
	"preco_medio" numeric(10, 2),
	"preco_maximo" numeric(10, 2),
	"encontrada" boolean NOT NULL,
	"consultado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "preco_carta_liga_historico_carta_idx" ON "preco_carta_liga_historico" USING btree ("carta_id","consultado_em");--> statement-breakpoint
-- Backfill (só INSERT; não altera nenhuma linha existente; idempotente pelos NOT EXISTS).
-- 1) Uma linha de histórico por carta do estado atual de preco_carta_liga, datada do
--    consultado_em dela e sem rodada (a consulta aconteceu antes do histórico existir).
INSERT INTO "preco_carta_liga_historico" ("carta_id", "rodada_id", "preco", "preco_medio", "preco_maximo", "encontrada", "consultado_em")
SELECT p."carta_id", NULL, p."preco", p."preco_medio", p."preco_maximo", p."encontrada", p."consultado_em"
FROM "preco_carta_liga" p
WHERE NOT EXISTS (SELECT 1 FROM "preco_carta_liga_historico" h WHERE h."carta_id" = p."carta_id");
--> statement-breakpoint
-- 2) O ponto inicial do gráfico: UMA foto do estado atual, datada do consultado_em mais
--    recente. Mesma regra de `fotografarPrecos` (lib/dominio/historico-precos.ts): conta a
--    carta achada com valor = médio, senão mínimo; soma_minimos soma o mínimo dessas cartas.
INSERT INTO "liga_snapshot_preco" ("rodada_id", "tirado_em", "soma_medios", "cartas_com_preco", "preco_medio_por_carta", "soma_minimos")
SELECT NULL,
       max(p."consultado_em"),
       round(sum(coalesce(p."preco_medio", p."preco")), 2),
       count(*),
       round(sum(coalesce(p."preco_medio", p."preco")) / count(*), 2),
       round(coalesce(sum(p."preco"), 0), 2)
FROM "preco_carta_liga" p
WHERE p."encontrada" AND coalesce(p."preco_medio", p."preco") IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "liga_snapshot_preco")
HAVING count(*) > 0;
