// Aplica as migrations do Drizzle. Roda na subida do container, antes de a
// app servir tráfego (ver compose.yaml e AGENTS.md). Idempotente: o Drizzle
// mantém uma tabela de controle (`drizzle.__drizzle_migrations`) e só aplica
// o que ainda não foi aplicado — rodar duas vezes é no-op.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL não configurada.");
  process.exit(1);
}

/*
 * Avisos do Postgres durante as migrations.
 *
 * O `DROP TABLE ... CASCADE` da migration 0016 faz o servidor mandar um
 * NOTICE por dependência que cai junto, e o comportamento padrão do driver é
 * despejar o objeto cru do protocolo no console (`{ severity_local: 'NOTICE',
 * severity: 'NOTICE', code: '00000', message: 'drop cascades to ...' }`). Num
 * primeiro boot isso é a primeira coisa que aparece na tela, logo antes de
 * "Migrations aplicadas" — parece uma pilha de erro, e não é.
 *
 * Aqui cada aviso passa por um filtro por severidade. NOTICE, INFO, DEBUG e
 * LOG — informativos por definição do próprio protocolo — saem contados no
 * fim, num resumo de uma linha. WARNING e acima saem na hora, em linha
 * legível, porque aí o Postgres está avisando que algo saiu diferente do
 * pedido.
 *
 * **Isto não engole erro.** Erro de migration não chega por este caminho: o
 * servidor manda ErrorResponse, o driver rejeita a promise e a exceção cai no
 * `catch` abaixo, que imprime tudo e sai com código 1. O jeito errado de
 * calar este ruído seria um `catch` vazio em volta do `migrate` — o container
 * subiria com o schema pela metade e ninguém ficaria sabendo.
 */
const SEVERIDADES_INFORMATIVAS = new Set(["NOTICE", "INFO", "DEBUG", "LOG"]);
let avisosInformativos = 0;

function aoReceberAviso(aviso) {
  // `severity` (não localizada, sempre em inglês) existe desde o Postgres
  // 9.6; `severity_local` vem no idioma do servidor e é o fallback.
  const severidade = (aviso.severity ?? aviso.severity_local ?? "").toUpperCase();

  if (SEVERIDADES_INFORMATIVAS.has(severidade)) {
    avisosInformativos += 1;
    return;
  }

  const detalhe = aviso.detail ? ` (${aviso.detail})` : "";
  console.warn(`[migrate] ${severidade || "AVISO"}: ${aviso.message ?? ""}${detalhe}`);
}

const sql = postgres(databaseUrl, { max: 1, onnotice: aoReceberAviso });
const db = drizzle(sql);

try {
  console.log("Aplicando migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log(
    avisosInformativos > 0
      ? `Migrations aplicadas. (${avisosInformativos} aviso(s) informativo(s) do Postgres ` +
          "omitido(s): objeto que já existia, ou dependência removida em cascata.)"
      : "Migrations aplicadas.",
  );
} catch (err) {
  console.error("Falha ao aplicar migrations:", err);
  process.exit(1);
} finally {
  await sql.end();
}
