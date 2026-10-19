import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

import { reescritasDoModuloDesligado } from "./src/lib/dominio/acesso/caminhos-modulo";

const nextConfig: NextConfig = {
  // O Next 16 escreve um bloco `<!-- BEGIN:nextjs-agent-rules -->` no
  // AGENTS.md a cada `next dev`. Este repositório mantém o AGENTS.md à
  // mão, como contrato de contribuição, e o bloco reaparecia no diff de
  // todo PR de quem rodasse o modo de desenvolvimento. Desligado aqui em
  // vez de removido a cada vez.
  agentRules: false,
  /* Acesso por senha desligado: o proxy marca os caminhos do módulo
     (login, sessão, saúde, robots.txt, manifesto, ícones do PWA) com
     `x-acesso-desligado: 1`, e esta reescrita os manda para uma pasta
     privada do App Router (`_`), que nunca roteia — o 404 do próprio Next,
     idêntico ao de antes do módulo, em qualquer método. Reescrita de
     configuração, e não `NextResponse.rewrite` no proxy, porque esta não
     deixa cabeçalho na resposta; a do proxy expõe `x-middleware-rewrite`.
     A lista e o formato das regras moram em `caminhos-modulo.ts`, a mesma
     fonte da decisão do proxy.

     O marcador pode vir de fora, e isso não abre nada:
     - a reescrita vale só para os caminhos do módulo: numa rota que já
       existia, o marcador não muda nada;
     - com o módulo desligado, num caminho do módulo, ele só dá o 404 que
       esse caminho já daria;
     - com o módulo ligado, o proxy o trata como cabeçalho interno: a
       requisição conta como sem sessão (401 ou login), e numa rota pública
       ele é tirado antes de seguir. Como esta reescrita só roda depois do
       proxy, ela nunca o vê;
     - num desvio que pule o proxy, o pior caso continua sendo um 404. */
  async rewrites() {
    return {
      beforeFiles: reescritasDoModuloDesligado(),
      afterFiles: [],
      fallback: [],
    };
  },
  images: {
    // Imagens de carta vêm direto da TCGdex (spec §7) — sem cache local
    // nesta fase. Sufixo obrigatório na URL (`/low.webp`, `/high.webp`,
    // confirmado ao vivo em 2026-08-24; a URL crua do catálogo devolve 404).
    remotePatterns: [
      { protocol: "https", hostname: "assets.tcgdex.net", pathname: "/**" },
    ],
  },
};

/* O plugin só aponta o `next-intl` para `src/i18n/request.ts` (o caminho
   padrão dele é `./i18n/request.ts`, que não é onde este projeto guarda
   código-fonte). Nenhum middleware e nenhum prefixo de rota entram junto:
   o idioma vem do cookie, e as rotas continuam em português. */
export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
