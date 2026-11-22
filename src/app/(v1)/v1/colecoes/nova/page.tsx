import { exigirSessao } from "@/lib/acesso";

import NovaColecaoPage from "./pagina-cliente";

/* A tela é um componente de cliente, que não pode conferir a sessão; este
   invólucro de servidor confere antes de entregá-la (ver `lib/acesso.ts`).
   `?set=` chega do botão "Criar coleção" de uma sugestão de set; o texto é da
   URL e a tela o trata como não confiável (só o usa se achar o set na lista). */
export default async function Pagina({ searchParams }: PageProps<"/v1/colecoes/nova">) {
  await exigirSessao();
  const params = await searchParams;
  return <NovaColecaoPage setInicial={typeof params.set === "string" ? params.set : ""} />;
}
