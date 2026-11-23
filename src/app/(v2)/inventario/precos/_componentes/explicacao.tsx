"use client";

import { useId, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import estilos from "./precos.module.css";

/**
 * Uma explicação curta que abre por **toque e por teclado**, no lugar onde a
 * v1 usava `title` ou `Dica`: "nada só no hover ou no `title`" (AGENTS.md,
 * "Mobile layout"). O botão é um disclosure (`aria-expanded`) e o texto aparece
 * em linha, abaixo dele, empurrando o resto: não flutua, não sai da tela a
 * 320 px e não precisa de camada nem de foco preso.
 *
 * `assunto` é o que o botão explica ("foil", "sem preço"); ele entra no nome
 * acessível, para um leitor de tela distinguir os vários botões de uma lista.
 */
export function Explicacao({
  assunto,
  texto,
  children,
  tom = "neutro",
}: {
  assunto: string;
  texto: ReactNode;
  /** O que o botão mostra (a etiqueta, o selo); sem isso, o próprio assunto. */
  children?: ReactNode;
  tom?: "neutro" | "aviso" | "perigo";
}) {
  const t = useTranslations("v2Precos.explicacao");
  const id = useId();
  const [aberta, setAberta] = useState(false);
  return (
    <span className={estilos.explicacao}>
      <button
        type="button"
        className={estilos.explicacaoBotao}
        data-tom={tom}
        aria-expanded={aberta}
        aria-controls={id}
        aria-label={aberta ? t("fechar", { assunto }) : t("abrir", { assunto })}
        onClick={() => setAberta((v) => !v)}
      >
        <span>{children ?? assunto}</span>
        <span className={estilos.explicacaoInfo} aria-hidden>
          {aberta ? "−" : "i"}
        </span>
      </button>
      <span id={id} className={estilos.explicacaoTexto} hidden={!aberta}>
        {texto}
      </span>
    </span>
  );
}
