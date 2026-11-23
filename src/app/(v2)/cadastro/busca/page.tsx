import { exigirSessao } from "@/lib/acesso";

import { CadastroBusca } from "./_componentes/cadastro-busca";

/**
 * Cadastro por busca da v2 (pacote 3b). A tela é um componente de cliente, que
 * não pode conferir a sessão; este invólucro de servidor confere antes de
 * entregá-la (`lib/acesso.ts`). Toda a leitura e toda a escrita passam pelas
 * rotas que a v1 já usa (`GET /api/cartas`, `POST /api/copias`,
 * `POST /api/cartas/manual`): nada novo no servidor.
 */
export default async function PaginaCadastroBusca() {
  await exigirSessao();
  return <CadastroBusca />;
}
