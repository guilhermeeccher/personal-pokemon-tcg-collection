"use client";

import { type ReactNode, useState } from "react";

import { type EstadoEscada, falhasDaEscada, registrarFalha } from "@/lib/dominio/escada-imagens";

/**
 * Uma imagem de CDN com uma escada de fontes: se a primeira falha (404, rede),
 * tenta a seguinte, e sem nenhuma que carregue mostra o `fallback`. É o mesmo
 * cuidado da v1 com o logo do set (`logos` vem em ordem de preferência) e
 * evita o ícone de imagem quebrada numa lista de dezenas de cartões. Simples
 * `<img>`, nunca `next/image` (regra de imagens do `AGENTS.md`).
 *
 * As falhas ficam presas às fontes que as tiveram (`escada-imagens.ts`): uma
 * escada nova, vinda de uma atualização da página, começa na primeira fonte.
 *
 * Decorativa por padrão (`alt=""`): o cartão em volta diz o que a imagem é.
 */
export function ImagemEscada({
  fontes,
  fallback = null,
  className,
  alt = "",
}: {
  fontes: readonly string[];
  fallback?: ReactNode;
  className?: string;
  alt?: string;
}) {
  const [estado, setEstado] = useState<EstadoEscada>({ chave: "", falhas: 0 });
  const fonte = fontes[falhasDaEscada(estado, fontes)];
  if (fonte === undefined) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- imagem de CDN sem o otimizador (AGENTS.md)
    <img
      key={fonte}
      src={fonte}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setEstado((atual) => registrarFalha(atual, fontes))}
    />
  );
}
