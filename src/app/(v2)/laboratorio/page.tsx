import { notFound } from "next/navigation";

import { exigirSessao } from "@/lib/acesso";

import { PaginaCliente } from "./pagina-cliente";
import type { ParametrosDetalhe } from "./secao-detalhe";

function um(v: string | string[] | undefined): string | null {
  const x = Array.isArray(v) ? v[0] : v;
  return x && x.trim() !== "" ? x.trim() : null;
}

/*
 * Laboratório da v2: a casca e todos os primitivos, em todos os estados, numa
 * página só. Serve para conferir os pacotes seguintes (capturas nas larguras
 * do contrato, Esc, foco, trava de rolagem, modo leve) sem montar uma tela de
 * verdade. Só em desenvolvimento: no build de produção responde 404, e por
 * isso não entra no mapa de navegação nem no `parity.md` — não é tela do app.
 */
export default async function PaginaLaboratorio({ searchParams }: PageProps<"/laboratorio">) {
  await exigirSessao();
  if (process.env.NODE_ENV === "production") notFound();
  // Ids reais da instalação para abrir o detalhe de carta (pacote 1b).
  const busca = await searchParams;
  const detalhe: ParametrosDetalhe = {
    colecao: um(busca.colecao),
    vaga: um(busca.vaga),
    carta: um(busca.carta),
    copia: um(busca.copia),
    abrir: um(busca.abrir) === "1",
  };
  return <PaginaCliente detalhe={detalhe} />;
}
