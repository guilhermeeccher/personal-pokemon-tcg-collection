CREATE TYPE "public"."nivel_trofeu_dex" AS ENUM('bronze', 'prata', 'ouro');--> statement-breakpoint
CREATE TYPE "public"."origem_dex" AS ENUM('sessao', 'manual');--> statement-breakpoint
CREATE TYPE "public"."status_plano_dex" AS ENUM('ativo', 'concluido', 'encerrado');--> statement-breakpoint
CREATE TYPE "public"."status_tarefa_dex" AS ENUM('aberta', 'feita', 'descartada');--> statement-breakpoint
CREATE TYPE "public"."tipo_tarefa_dex" AS ENUM('captura', 'evolucao', 'troca', 'progresso', 'transferencia', 'outro');--> statement-breakpoint
CREATE TYPE "public"."tipo_trofeu_dex" AS ENUM('checkpoint', 'marco');--> statement-breakpoint
CREATE TABLE "dex_plano" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" text NOT NULL,
	"objetivo" text,
	"inicio" date NOT NULL,
	"fim" date,
	"status" "status_plano_dex" DEFAULT 'ativo' NOT NULL,
	"origem" "origem_dex" NOT NULL,
	"trofeu_ids" text[] DEFAULT '{}' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dex_sessao_ref" (
	"ref" text PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"entidade_id" uuid,
	"aplicado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dex_tarefa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plano_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text,
	"tipo" "tipo_tarefa_dex" NOT NULL,
	"jogo_id" text,
	"forma_ids" text[] DEFAULT '{}' NOT NULL,
	"trofeu_id" text,
	"status" "status_tarefa_dex" DEFAULT 'aberta' NOT NULL,
	"concluida_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dex_trofeu" (
	"id" text PRIMARY KEY NOT NULL,
	"jogo_id" text NOT NULL,
	"tipo" "tipo_trofeu_dex" NOT NULL,
	"nivel" "nivel_trofeu_dex" NOT NULL,
	"ordem" integer NOT NULL,
	"textos" jsonb NOT NULL,
	"requer" text[] DEFAULT '{}' NOT NULL,
	"libera" integer[] DEFAULT '{}' NOT NULL,
	"fonte" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dex_trofeu_obtido" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trofeu_id" text NOT NULL,
	"obtido_em" date NOT NULL,
	"origem" "origem_dex" NOT NULL,
	"notas" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dex_trofeu_obtido_trofeu_unico" UNIQUE("trofeu_id")
);
--> statement-breakpoint
ALTER TABLE "dex_tarefa" ADD CONSTRAINT "dex_tarefa_plano_id_dex_plano_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."dex_plano"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dex_tarefa" ADD CONSTRAINT "dex_tarefa_trofeu_id_dex_trofeu_id_fk" FOREIGN KEY ("trofeu_id") REFERENCES "public"."dex_trofeu"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dex_trofeu_obtido" ADD CONSTRAINT "dex_trofeu_obtido_trofeu_id_dex_trofeu_id_fk" FOREIGN KEY ("trofeu_id") REFERENCES "public"."dex_trofeu"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dex_tarefa_plano_idx" ON "dex_tarefa" USING btree ("plano_id");--> statement-breakpoint
CREATE INDEX "dex_trofeu_jogo_idx" ON "dex_trofeu" USING btree ("jogo_id");