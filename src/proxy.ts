/**
 * Proxy do Next 16 (o antigo `middleware.ts`; roda no runtime Node e não
 * aceita configurar runtime). Só tem papel com o acesso opcional por senha
 * (`ACESSO_COM_SENHA=1`). Desligado, devolve `NextResponse.next()` puro —
 * nem um cabeçalho a mais —, menos nos caminhos do próprio módulo: ali
 * marca a requisição com `x-acesso-desligado`, e a reescrita do
 * `next.config.ts` a leva a uma pasta privada, que dá o 404 de hoje,
 * idêntico, em qualquer método.
 *
 * Fino de propósito: a regra inteira está em
 * `lib/dominio/acesso/decisao-proxy.ts`, testada sem o Next. Aqui só se lê
 * a requisição e se traduz a decisão em resposta.
 *
 * É a primeira de três camadas. Se um desvio no Next fizer uma requisição
 * pular o proxy, `exigirSessao` em cada página e `comAcesso` em cada route
 * handler seguram (`lib/acesso.ts`).
 */
import { NextResponse, type NextRequest } from "next/server";

import { configuracaoAcessoAtual, lerCookie, respostaErroAcesso, sessaoValida } from "@/lib/acesso";
import type { ConfiguracaoAcesso } from "@/lib/dominio/acesso/configuracao";
import { CABECALHO_DESLIGADO } from "@/lib/dominio/acesso/caminhos-modulo";
import {
  HTML_CONFIGURACAO_INCOMPLETA,
  aplicarCabecalhosSeguranca,
  decidirProxy,
} from "@/lib/dominio/acesso/decisao-proxy";
import { NOME_COOKIE_SESSAO } from "@/lib/dominio/acesso/sessao";

/* Os motivos da configuração incompleta vão para o log uma vez por
   configuração, não a cada requisição: com o app recusando tudo, cada
   pedido de ícone repetiria o mesmo bloco. `configuracaoAcessoAtual`
   devolve o mesmo objeto enquanto o ambiente não muda, então a identidade
   dele basta como chave. Os motivos nunca trazem o valor das variáveis. */
let configuracaoJaLogada: ConfiguracaoAcesso | null = null;

function logarConfiguracaoIncompleta(config: Extract<ConfiguracaoAcesso, { estado: "invalida" }>): void {
  if (configuracaoJaLogada === config) return;
  configuracaoJaLogada = config;
  console.error(
    "[acesso] ACESSO_COM_SENHA=1, mas a configuração está incompleta; o app responde 503 até corrigir:\n" +
      config.motivos.map((m) => `  - ${m}`).join("\n"),
  );
}

export async function proxy(request: NextRequest): Promise<NextResponse | Response> {
  const config = configuracaoAcessoAtual();

  const decisao = await decidirProxy(
    {
      metodo: request.method,
      caminho: request.nextUrl.pathname,
      busca: request.nextUrl.search,
      cabecalhos: request.headers,
    },
    config,
    () =>
      config.estado === "ligada"
        ? sessaoValida(lerCookie(request.headers, NOME_COOKIE_SESSAO), config)
        : Promise.resolve(false),
  );

  switch (decisao.tipo) {
    case "intocada":
      return NextResponse.next();

    case "inexistente": {
      /* Só marca; quem reescreve é o `next.config.ts`, e só nos caminhos
         do módulo (ver `caminhos-modulo.ts`). Responder 404 daqui, ou reescrever com
         `NextResponse.rewrite`, mudaria corpo ou cabeçalhos em relação ao
         404 de antes do módulo. O `rotaDoModulo` também responde 404, mas é
         a reserva, sem corpo. */
      const marcada = new Headers(request.headers);
      marcada.set(CABECALHO_DESLIGADO, "1");
      return NextResponse.next({ request: { headers: marcada } });
    }

    case "configuracao_invalida": {
      if (config.estado === "invalida") logarConfiguracaoIncompleta(config);
      const resposta = new Response(HTML_CONFIGURACAO_INCOMPLETA, {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
      aplicarCabecalhosSeguranca(resposta.headers, true);
      return resposta;
    }

    case "imagem_recusada": {
      const resposta = Response.json({ erro: "imagem_recusada" }, { status: 400 });
      aplicarCabecalhosSeguranca(resposta.headers, true);
      return resposta;
    }

    case "recusar": {
      const resposta = respostaErroAcesso(decisao.status, decisao.codigo);
      aplicarCabecalhosSeguranca(resposta.headers, true);
      return resposta;
    }

    case "redirecionar": {
      // URL absoluta porque o `NextResponse.redirect` exige; o Next a
      // devolve relativa no `Location` quando o host é o da requisição.
      const resposta = NextResponse.redirect(new URL(decisao.destino, request.url), 307);
      aplicarCabecalhosSeguranca(resposta.headers, true);
      return resposta;
    }

    case "seguir": {
      let resposta: NextResponse;
      if (decisao.remover.length > 0) {
        const limpos = new Headers(request.headers);
        for (const nome of decisao.remover) limpos.delete(nome);
        resposta = NextResponse.next({ request: { headers: limpos } });
      } else {
        resposta = NextResponse.next();
      }
      aplicarCabecalhosSeguranca(resposta.headers, decisao.privada);
      return resposta;
    }
  }
}

export const config = {
  /*
   * Tudo, menos `/_next/static/**`. Essa exceção é segura: ali só há os
   * arquivos públicos do build (JS, CSS, fontes), sem dado nenhum, iguais
   * para qualquer instalação, e o Next serve essa pasta direto do disco —
   * nenhuma rota do app responde abaixo dela, então um caminho ali que não
   * é arquivo dá 404, não uma página. Eles ficam com o cache imutável do
   * Next e sem os cabeçalhos de segurança (nem o 503 da configuração
   * incompleta), o que os testes consideram.
   *
   * O Next testa o matcher contra o caminho cru **e** o decodificado, e
   * roda o proxy se qualquer um casar: um `/_next/static%2F..` cru não
   * começa com `_next/static/` e passa pelo proxy. O `/_next/image` também
   * passa.
   *
   * **Segunda exceção, nos cabeçalhos: `/_next/image`.** Passa pelo proxy
   * (sessão exigida, como tudo), mas a resposta final fica com o
   * `Cache-Control` e a CSP do próprio otimizador: ele os reescreve depois
   * do proxy (`setResponseHeaders`, em `image-optimizer`), e o
   * `Cache-Control: private, no-store` e o `frame-ancestors 'none'` postos
   * aqui não chegam. Aceito, decidido assim:
   * - com o módulo ligado, o otimizador só recebe URL remota `https:`
   *   (`urlDoOtimizadorAceita`: qualquer outra `url` leva 400 aqui, com ou
   *   sem sessão, antes de ele ver a requisição), e o `remotePatterns`
   *   restringe à TCGdex. Ele só entrega imagem pública, e por isso o cache
   *   dele nunca devolve imagem privada com o módulo ligado — nem uma
   *   local otimizada enquanto o módulo estava desligado, que o cache, sem
   *   saber da flag, entregaria sem refazer a busca. (Num desvio que pule o
   *   proxy, a busca de uma URL local nova, feita por dentro e sem o
   *   cookie, ainda cai no 401 do `comAcesso`.)
   * - a CSP do otimizador tem `sandbox`, que já impede a imagem de rodar
   *   qualquer coisa num quadro;
   * - o cache de borda do proxy reverso tem regra própria de bypass;
   * - impor os nossos valores exigiria mudar o `next.config.ts` também com
   *   o módulo desligado, o que o módulo não pode fazer.
   *
   * O valor tem que ser literal: o Next o lê no build, por análise
   * estática.
   */
  matcher: ["/((?!_next/static/).*)"],
};
