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

const sql = postgres(databaseUrl, { max: 1 });
const db = drizzle(sql);

try {
  console.log("Aplicando migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations aplicadas.");
} catch (err) {
  console.error("Falha ao aplicar migrations:", err);
  process.exit(1);
} finally {
  await sql.end();
}
