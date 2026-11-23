"use client";

import { useFormatter } from "next-intl";

/**
 * Uma data guardada como `AAAA-MM-DD` (a conquista de um troféu, o início e o
 * fim de um plano), curta e no idioma da interface. Sem fuso: é uma data, não
 * um instante — lida em UTC e escrita em UTC, nunca muda de dia. Usam as
 * telas de troféus e de planos (pacote 5e-b).
 */
export function DataCurta({ iso }: { iso: string }) {
  const formato = useFormatter();
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return <>{iso}</>;
  return (
    <time dateTime={iso.slice(0, 10)}>
      {formato.dateTime(new Date(Date.UTC(a, m - 1, d)), { dateStyle: "medium", timeZone: "UTC" })}
    </time>
  );
}
