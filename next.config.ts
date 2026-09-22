import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O Next 16 escreve um bloco `<!-- BEGIN:nextjs-agent-rules -->` no
  // AGENTS.md a cada `next dev`. Este repositório mantém o AGENTS.md à
  // mão, como contrato de contribuição, e o bloco reaparecia no diff de
  // todo PR de quem rodasse o modo de desenvolvimento. Desligado aqui em
  // vez de removido a cada vez.
  agentRules: false,
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
