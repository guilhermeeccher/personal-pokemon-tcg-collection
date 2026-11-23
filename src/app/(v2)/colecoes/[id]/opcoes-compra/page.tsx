import { exigirSessao } from "@/lib/acesso";
import { fonteDePreco } from "@/lib/dominio/fonte-preco";

import { OpcoesCompra } from "./_componentes/pagina-opcoes";

/**
 * Opções de compra de uma coleção na v2 (pacote 4a), na mesma URL da v1. A
 * tela é um componente de cliente, que não pode conferir a sessão; este
 * invólucro de servidor confere antes de entregá-la (`lib/acesso.ts`).
 *
 * Ele também diz à tela qual é a fonte de preço da instalação antes do
 * primeiro `GET`, para os textos não piscarem com os da Liga numa instalação
 * Cardmarket. `exigirSessao` já chama `connection()`, então `PRECO_FONTE` é
 * lido a cada requisição, nunca congelado no build.
 */
export default async function PaginaOpcoesCompra({ params }: PageProps<"/colecoes/[id]/opcoes-compra">) {
  await exigirSessao();
  const { id } = await params;
  return <OpcoesCompra id={id} fonte={fonteDePreco()} />;
}
