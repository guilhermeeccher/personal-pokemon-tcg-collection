import { exigirSessao } from "@/lib/acesso";
import { fonteDePreco } from "@/lib/dominio/fonte-preco";

import { Precos } from "./_componentes/precos";

/**
 * Preços das cartas especiais da v2 (pacote 2d). A tela é um componente de
 * cliente, que não pode conferir a sessão; este invólucro de servidor confere
 * antes de entregá-la (`lib/acesso.ts`).
 *
 * Ele também diz à tela qual é a fonte de preço da instalação antes do
 * primeiro `GET`, para os textos não piscarem com os da Liga numa instalação
 * Cardmarket. `exigirSessao` já chama `connection()`, então `PRECO_FONTE` é
 * lido a cada requisição, nunca congelado no build.
 */
export default async function PaginaPrecos() {
  await exigirSessao();
  return <Precos fonte={fonteDePreco()} />;
}
