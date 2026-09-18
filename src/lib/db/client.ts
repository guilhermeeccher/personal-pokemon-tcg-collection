import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

function obterDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL não configurada.");
  }
  return url;
}

type ClientCru = ReturnType<typeof postgres>;
type DbDrizzle = ReturnType<typeof drizzle<typeof schema>>;

let clienteReal: ClientCru | undefined;
let dbReal: DbDrizzle | undefined;

function obterClienteReal(): ClientCru {
  clienteReal ??= postgres(obterDatabaseUrl(), { max: 10 });
  return clienteReal;
}

function obterDbReal(): DbDrizzle {
  dbReal ??= drizzle(obterClienteReal(), { schema });
  return dbReal;
}

/**
 * Conexão preguiçosa: só conecta no primeiro uso real, não na importação
 * do módulo. `next build` importa cada route handler para coletar
 * metadados de rota (App Router) sem nunca chamar um método do client —
 * se a conexão fosse eager, o build quebraria sem `DATABASE_URL` (que não
 * está disponível no build da imagem Docker, só em runtime — ver
 * Dockerfile). Route handlers e scripts continuam usando `db`/`client`
 * exatamente como antes; só o instante da conexão mudou.
 */
export const client: ClientCru = new Proxy({} as ClientCru, {
  get(_alvo, propriedade, receptor) {
    const real = obterClienteReal();
    const valor = Reflect.get(real, propriedade, receptor);
    return typeof valor === "function" ? valor.bind(real) : valor;
  },
});

export const db: DbDrizzle = new Proxy({} as DbDrizzle, {
  get(_alvo, propriedade, receptor) {
    const real = obterDbReal();
    const valor = Reflect.get(real, propriedade, receptor);
    return typeof valor === "function" ? valor.bind(real) : valor;
  },
});

/** Tipo da conexão, para funções (scripts, sync) que a recebem por parâmetro. */
export type Database = typeof db;

/**
 * Tipo do objeto de transação que `db.transaction` entrega ao callback.
 * Derivado dele, e não escrito à mão a partir dos genéricos do Drizzle:
 * a forma muda entre versões, e a única definição que nunca diverge é a
 * do próprio método.
 *
 * Existe para funções auxiliares que precisam rodar DENTRO de uma
 * transação já aberta (a fusão de cópias no cadastro, por exemplo) — elas
 * recebem `Database | Transacao` e servem aos dois casos.
 */
export type Transacao = Parameters<Parameters<Database["transaction"]>[0]>[0];
