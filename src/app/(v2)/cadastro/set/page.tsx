import { exigirSessao } from "@/lib/acesso";

import { CadastroSet } from "./_componentes/cadastro-set";

/**
 * Cadastro por set da v2 (pacote 3a). A tela é um componente de cliente, que
 * não pode conferir a sessão; este invólucro de servidor confere antes de
 * entregá-la (ver `lib/acesso.ts`).
 */
export default async function PaginaCadastroSet() {
  await exigirSessao();
  return <CadastroSet />;
}
