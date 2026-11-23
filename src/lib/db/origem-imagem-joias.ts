/**
 * De onde veio a foto de cada joia (`origemDaImagem`): governa o selo de foto
 * emprestada (outra língua, mypcards) que a Carta mostra. `listarJoias` entrega
 * só a URL já escolhida pela cadeia de procedência; a origem sai da mesma
 * cadeia, aqui, só para os pares das oito joias — a leitura `consultas.ts`
 * compartilhada com a capa das coleções não muda.
 */

import { and, eq, or } from "drizzle-orm";

import type { Idioma } from "@/lib/dominio/enums";
import type { OrigemImagem } from "@/lib/dominio/origem-imagem";

import type { Database } from "./client";
import { origemDaImagem } from "./consultas";
import { cartaCatalogo } from "./schema";

/** `cartaId|idioma` → origem da foto. */
export async function lerOrigemImagemJoias(
  db: Database,
  pares: readonly { cartaId: string; idioma: Idioma }[],
): Promise<Map<string, OrigemImagem | null>> {
  if (pares.length === 0) return new Map();
  const linhas = await db
    .select({ id: cartaCatalogo.id, idioma: cartaCatalogo.idioma, origem: origemDaImagem(cartaCatalogo) })
    .from(cartaCatalogo)
    .where(or(...pares.map((p) => and(eq(cartaCatalogo.id, p.cartaId), eq(cartaCatalogo.idioma, p.idioma)))));
  return new Map(linhas.map((l) => [`${l.id}|${l.idioma}`, l.origem]));
}
