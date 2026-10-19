import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

import { CabecalhoPagina } from "@/app/_componentes/cabecalho-pagina";
import { Painel } from "@/app/_componentes/painel";
import { configuracaoAcessoAtual, sessaoValida } from "@/lib/acesso";
import { NOME_COOKIE_SESSAO } from "@/lib/dominio/acesso/sessao";
import { sanitizarVolta } from "@/lib/dominio/acesso/volta";

import { FormularioLogin } from "./formulario-login";

/**
 * Tela de login. É a única página que não chama `exigirSessao()`: ela é o
 * destino de quem não tem sessão.
 *
 * Com o módulo desligado a rota não existe (404), como as demais rotas novas
 * do módulo. O `connection()` vem antes de ler a flag, pelo mesmo motivo de
 * `exigirSessao`: a imagem é construída sem o `.env`, e uma página que o
 * build pré-renderizasse congelaria o "desligado".
 *
 * Quem já tem sessão válida não precisa ver o formulário: vai direto para
 * onde queria ir. O `volta` passa por `sanitizarVolta` aqui e não só no
 * cliente, porque é o servidor que redireciona.
 */
export default async function PaginaLogin({ searchParams }: PageProps<"/login">) {
  await connection();
  const config = configuracaoAcessoAtual();
  if (config.estado === "desligado") notFound();

  const { volta: voltaBruta } = await searchParams;
  const volta = sanitizarVolta(typeof voltaBruta === "string" ? voltaBruta : null);

  if (config.estado === "ligada") {
    const valor = (await cookies()).get(NOME_COOKIE_SESSAO)?.value;
    if (await sessaoValida(valor, config)) redirect(volta);
  }

  const t = await getTranslations("login");
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-4 sm:p-8 md:pt-16">
      <CabecalhoPagina titulo={t("titulo")} descricao={t("descricao")} />
      <Painel padding="md">
        <FormularioLogin volta={volta} />
      </Painel>
    </main>
  );
}
