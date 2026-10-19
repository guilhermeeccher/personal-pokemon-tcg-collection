import { exigirSessao } from "@/lib/acesso";

import ColecaoPage from "./pagina-cliente";

/* A tela é um componente de cliente, que não pode conferir a sessão; este
   invólucro de servidor confere antes de entregá-la (ver `lib/acesso.ts`). */
export default async function Pagina() {
  await exigirSessao();
  return <ColecaoPage />;
}
