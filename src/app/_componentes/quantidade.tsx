"use client";

/**
 * Quantidade — o campo numérico com botões "−" e "+" do celular (stepper).
 *
 * ## Como usar
 *
 * Troque o `<input type="number" ...>` da tela por:
 *
 *     <Quantidade
 *       rotulo={nomeDaCarta}                     // vai no aria-label dos botões
 *       inputProps={{ type: "number", min: 0, value, onChange, className, ... }}
 *       onAjustar={(delta) => setValor(converter(valor) + delta)}
 *     />
 *
 * `inputProps` é tudo o que o `<input>` já recebia hoje (classes, ref,
 * handlers, `onKeyDown`, `data-*`, `aria-label` ...). `onAjustar` recebe
 * `1` ou `-1` e a tela faz a conta do jeito dela: vazio vale 0 onde hoje é
 * assim, o piso e o teto são os dela. O componente não converte nem grava
 * valor nenhum; ele só chama `onAjustar` e deixa o resto com quem chama.
 * Quando a linha tem Enter que avança de campo, passe também
 * `enterKeyHint: "next"` em `inputProps` (o padrão do celular é "done").
 *
 * ## O que muda por largura
 *
 * - **De 768px para cima, e na hidratação**: devolve exatamente
 *   `<input {...inputProps} />`. Nenhum invólucro, nenhum atributo a mais.
 *   Desktop sai idêntico.
 * - **Abaixo de 768px** (`useEhMobile()`): o mesmo input entre dois botões
 *   `type="button"` de 44 x 44, numa linha inteira. O input continua
 *   digitável. `inputMode="numeric"` e `enterKeyHint="done"` entram só se
 *   `inputProps` não trouxe os seus.
 *
 * ## Quando os botões se desabilitam
 *
 * Por quem sabe o valor, que é este componente (lê `inputProps.value`):
 *
 * - "−" fica desabilitado quando o valor é <= `min`, ou quando está vazio e
 *   `min` >= 0 (vazio já é "nada", não há para onde descer);
 * - "+" fica desabilitado quando o valor é >= `max`;
 * - os dois, quando o input está `disabled` ou `readOnly`.
 *
 * Nesses casos `onAjustar` nunca é chamado. Por isso `value` é obrigatório
 * no tipo: sem ele (input não controlado) o componente não saberia o número
 * para desabilitar nos limites, e girar o aparelho, que remonta o campo,
 * apagaria a digitação.
 *
 * ## Cuidado
 *
 * Cruzar a fronteira de 768px com a tela aberta (girar o aparelho) troca a
 * árvore — input solto de um lado, input entre botões do outro —, então o
 * React remonta o campo. Com `value` controlado (exigido no tipo) nada se
 * perde; só o foco do campo, na troca.
 */

import { useTranslations } from "next-intl";
import type { ComponentPropsWithRef } from "react";

import { useEhMobile } from "./use-eh-mobile";

/* 44 x 44 é o alvo de toque mínimo. `shrink-0` para o campo, que é `flex-1`,
   nunca espremer o botão. */
const CLASSES_BOTAO =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-pill border border-line bg-surface text-foreground shadow-1 [transition:var(--transition-control)] active:bg-surface-hover disabled:pointer-events-none disabled:border-transparent disabled:bg-inset disabled:text-subtle disabled:shadow-none";

/** Número do `value` do input, ou `null` quando vazio/ausente/não numérico. */
function numeroDe(valor: ComponentPropsWithRef<"input">["value"]): number | null {
  if (valor === undefined || Array.isArray(valor)) return null;
  const texto = String(valor).trim().replace(",", ".");
  if (texto === "") return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

/** `min`/`max` chegam como número ou texto; qualquer outra coisa é "sem limite". */
function limiteDe(valor: string | number | undefined): number | null {
  if (valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Sinal de menos e de mais desenhados à mão: não há ícone deles em `Icone`. */
function Traco({ vertical }: { vertical: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
      <path d="M3 8h10" />
      {vertical && <path d="M8 3v10" />}
    </svg>
  );
}

export function Quantidade({
  inputProps,
  onAjustar,
  rotulo,
}: {
  /** `value` obrigatório: ver "Quando os botões se desabilitam" acima. */
  inputProps: Omit<ComponentPropsWithRef<"input">, "value" | "defaultValue"> & {
    value: string | number;
    defaultValue?: never;
  };
  onAjustar: (delta: 1 | -1) => void;
  rotulo: string;
}) {
  const t = useTranslations("componentes.mobile");
  const ehMobile = useEhMobile();

  if (!ehMobile) return <input {...inputProps} />;

  const atual = numeroDe(inputProps.value);
  const min = limiteDe(inputProps.min);
  const max = limiteDe(inputProps.max);
  const travado = Boolean(inputProps.disabled || inputProps.readOnly);

  const naoDesce = travado || (min !== null && (atual === null ? min >= 0 : atual <= min));
  const naoSobe = travado || (max !== null && atual !== null && atual >= max);

  return (
    <div className="flex w-full items-center gap-2">
      <button
        type="button"
        aria-label={t("diminuir", { nome: rotulo })}
        disabled={naoDesce}
        onClick={() => onAjustar(-1)}
        className={CLASSES_BOTAO}
      >
        <Traco vertical={false} />
      </button>
      <input
        {...inputProps}
        inputMode={inputProps.inputMode ?? "numeric"}
        enterKeyHint={inputProps.enterKeyHint ?? "done"}
        // `text-base!`: 16px vence qualquer `text-xs`/`text-sm` que a tela mande no
        // input — abaixo disso o Safari dá zoom ao focar (R3).
        className={`${inputProps.className ?? ""} min-h-11 min-w-0 flex-1 text-center text-base!`}
      />
      <button
        type="button"
        aria-label={t("aumentar", { nome: rotulo })}
        disabled={naoSobe}
        onClick={() => onAjustar(1)}
        className={CLASSES_BOTAO}
      >
        <Traco vertical />
      </button>
    </div>
  );
}
