import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Imagens de carta vêm direto da TCGdex (spec §7) — sem cache local
    // nesta fase. Sufixo obrigatório na URL (`/low.webp`, `/high.webp`,
    // confirmado ao vivo em 2026-08-24; a URL crua do catálogo devolve 404).
    remotePatterns: [
      { protocol: "https", hostname: "assets.tcgdex.net", pathname: "/**" },
    ],
  },
};

export default nextConfig;
