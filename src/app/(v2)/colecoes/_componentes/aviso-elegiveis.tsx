"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { BotaoLink } from "../../_componentes/primitivos/botao";
import { AvisoEmLinha } from "../../_componentes/primitivos/painel";

interface Contagem {
  prontas: number;
  foraDePadrao: number;
}

/**
 * "Você tem cópias livres que preenchem vagas vazias" — só conta e leva a
 * "O que falta", onde a pessoa decide (regra 5: o sistema nunca aloca
 * sozinho). Lido no navegador, depois da lista, de propósito: a rota varre o
 * inventário e uma falha aqui não pode travar a tela de coleções. Sem resposta
 * boa, não aparece nada.
 */
export function AvisoElegiveis() {
  const t = useTranslations("v2Colecoes");
  const [contagem, setContagem] = useState<Contagem | null>(null);

  useEffect(() => {
    let ativo = true;
    fetch("/api/copias/elegiveis-vagas-vazias")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Partial<Contagem> | null) => {
        if (!ativo || !d) return;
        if (typeof d.prontas === "number" && typeof d.foraDePadrao === "number") {
          setContagem({ prontas: d.prontas, foraDePadrao: d.foraDePadrao });
        }
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  if (!contagem || (contagem.prontas === 0 && contagem.foraDePadrao === 0)) return null;

  return (
    <AvisoEmLinha
      tom="sucesso"
      papel="status"
      icone={<Check aria-hidden />}
      acao={
        <BotaoLink href="/colecoes/falta" variante="secundario" pequeno>
          {t("verOQueFalta")}
        </BotaoLink>
      }
    >
      {contagem.prontas > 0 && (
        <>
          {t.rich("elegiveisProntas", { total: contagem.prontas, forte: (partes) => <strong>{partes}</strong> })}{" "}
        </>
      )}
      {contagem.foraDePadrao > 0 &&
        t.rich("elegiveisForaDePadrao", { total: contagem.foraDePadrao, forte: (partes) => <strong>{partes}</strong> })}
    </AvisoEmLinha>
  );
}
