import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

import { Pokebola } from "@/app/(v2)/_componentes/casca/icones";
import { configuracaoAcessoAtual, sessaoValida } from "@/lib/acesso";
import { NOME_COOKIE_SESSAO } from "@/lib/dominio/acesso/sessao";
import { sanitizarVolta } from "@/lib/dominio/acesso/volta";

import { FormularioLogin } from "./formulario-login";
import estilos from "./login.module.css";

/**
 * Tela de login da v2. É a única página que não chama `exigirSessao()`: ela é
 * o destino de quem não tem sessão. A exceção é exata
 * (`cobertura-estatica.test.ts`): este arquivo, e nenhum outro.
 *
 * Com o módulo desligado a rota não existe (404), como as demais rotas do
 * módulo. O `connection()` vem antes de ler a flag, pelo mesmo motivo de
 * `exigirSessao`: a imagem é construída sem o `.env`, e uma página que o
 * build pré-renderizasse congelaria o "desligado".
 *
 * Quem já tem sessão válida não precisa ver o formulário: vai direto para
 * onde queria ir. O `volta` passa por `sanitizarVolta` aqui e não só no
 * cliente, porque é o servidor que redireciona.
 *
 * Sem trilho e sem barra de abas: a casca reconhece `/login` e desenha só a
 * luz ambiente em volta (`casca.tsx`). Um menu ali levaria a telas que o
 * proxy mandaria de volta para cá.
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

  const t = await getTranslations("v2Login");
  return (
    <section className={`v2-vidro ${estilos.cartao}`} aria-labelledby="titulo-login">
      <Pokebola className={estilos.marca} />
      <h1 id="titulo-login" className={estilos.titulo}>
        {t("titulo")}
      </h1>
      <p className={estilos.descricao}>{t("descricao")}</p>
      <FormularioLogin volta={volta} />
    </section>
  );
}
