/**
 * BarraProgresso — o trilho fino com preenchimento.
 *
 * Consolida a barra que estava duplicada inline na visão geral (uma na
 * linha de distribuição, outra no cartão de coleção), com as mesmas
 * medidas do design system: 6px de altura, trilho `surface-inset`, cantos
 * em pílula, e a largura animando em 340ms.
 */

export function BarraProgresso({
  valor,
  maximo,
  tom = "primario",
  cor,
  altura = 6,
  rotulo,
  mostrarValor = false,
}: {
  valor: number;
  maximo: number;
  tom?: "primario" | "acento" | "neutro";
  /** Cor explícita, quando a barra é colorida pelo próprio dado (raridade,
      condição, variante). Vence o `tom`. */
  cor?: string;
  altura?: number;
  rotulo?: string;
  mostrarValor?: boolean;
}) {
  const pct = maximo > 0 ? Math.max(0, Math.min(100, (valor / maximo) * 100)) : 0;
  const preenchimento =
    cor ??
    {
      primario: "var(--action-primary)",
      acento: "var(--action-accent)",
      neutro: "var(--slate-2)",
    }[tom];

  return (
    <div className="flex flex-col gap-1.5">
      {(rotulo || mostrarValor) && (
        <div className="flex justify-between text-xs text-muted">
          <span>{rotulo}</span>
          {mostrarValor && (
            <span className="font-mono tabular-nums text-foreground">
              {valor}/{maximo}
            </span>
          )}
        </div>
      )}
      <div
        className="overflow-hidden rounded-pill bg-inset"
        style={{ height: altura }}
        role="progressbar"
        aria-valuenow={valor}
        aria-valuemin={0}
        aria-valuemax={maximo}
      >
        <div
          className="h-full rounded-pill [transition:width_var(--dur-slow)_var(--curva-saida)]"
          style={{ width: `${pct}%`, background: preenchimento }}
        />
      </div>
    </div>
  );
}
