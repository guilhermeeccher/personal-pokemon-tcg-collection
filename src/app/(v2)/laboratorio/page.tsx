import { notFound } from "next/navigation";

import { exigirSessao } from "@/lib/acesso";

import { PaginaCliente } from "./pagina-cliente";

/*
 * Laboratório da v2: a casca e todos os primitivos, em todos os estados, numa
 * página só. Serve para conferir os pacotes seguintes (capturas nas larguras
 * do contrato, Esc, foco, trava de rolagem, modo leve) sem montar uma tela de
 * verdade. Só em desenvolvimento: no build de produção responde 404, e por
 * isso não entra no mapa de navegação nem no `parity.md` — não é tela do app.
 */
export default async function PaginaLaboratorio() {
  await exigirSessao();
  if (process.env.NODE_ENV === "production") notFound();
  return <PaginaCliente />;
}
