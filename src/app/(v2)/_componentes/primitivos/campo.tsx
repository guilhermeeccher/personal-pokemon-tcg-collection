"use client";

import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
  useId,
} from "react";

import estilos from "./campo.module.css";

interface PropsRotulo {
  /** Texto visível acima do campo. Sem rótulo visível, passe `aria-label`. */
  rotulo?: ReactNode;
  /** Explicação curta abaixo; lida pelo leitor de tela com o campo. */
  dica?: ReactNode;
  /** Mensagem de erro; marca o campo inválido. */
  erro?: ReactNode;
}

/*
 * O invólucro dos três campos: rótulo, controle, dica e erro, ligados por
 * `id`. A dica e o erro são texto visível, nunca `title`: no celular não há
 * hover.
 */
function Moldura({
  id,
  rotulo,
  dica,
  erro,
  children,
}: PropsRotulo & { id: string; children: ReactNode }) {
  return (
    <div className={estilos.grupo}>
      {rotulo && (
        <label htmlFor={id} className={estilos.rotulo}>
          {rotulo}
        </label>
      )}
      {children}
      {dica && (
        <span id={`${id}-dica`} className={estilos.dica}>
          {dica}
        </span>
      )}
      {erro && (
        <span id={`${id}-erro`} className={estilos.erro} role="alert">
          {erro}
        </span>
      )}
    </div>
  );
}

function descritoPor(id: string, { dica, erro }: PropsRotulo): string | undefined {
  const ids = [dica ? `${id}-dica` : null, erro ? `${id}-erro` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export const Campo = forwardRef<HTMLInputElement, PropsRotulo & InputHTMLAttributes<HTMLInputElement>>(
  function Campo({ rotulo, dica, erro, id, className, ...resto }, ref) {
    const gerado = useId();
    const idFinal = id ?? gerado;
    return (
      <Moldura id={idFinal} rotulo={rotulo} dica={dica} erro={erro}>
        <input
          ref={ref}
          id={idFinal}
          className={[estilos.entrada, className].filter(Boolean).join(" ")}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descritoPor(idFinal, { dica, erro })}
          {...resto}
        />
      </Moldura>
    );
  },
);

export const AreaTexto = forwardRef<HTMLTextAreaElement, PropsRotulo & TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function AreaTexto({ rotulo, dica, erro, id, className, ...resto }, ref) {
    const gerado = useId();
    const idFinal = id ?? gerado;
    return (
      <Moldura id={idFinal} rotulo={rotulo} dica={dica} erro={erro}>
        <textarea
          ref={ref}
          id={idFinal}
          className={[estilos.entrada, className].filter(Boolean).join(" ")}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descritoPor(idFinal, { dica, erro })}
          {...resto}
        />
      </Moldura>
    );
  },
);

export const Selecao = forwardRef<HTMLSelectElement, PropsRotulo & SelectHTMLAttributes<HTMLSelectElement>>(
  function Selecao({ rotulo, dica, erro, id, className, children, ...resto }, ref) {
    const gerado = useId();
    const idFinal = id ?? gerado;
    return (
      <Moldura id={idFinal} rotulo={rotulo} dica={dica} erro={erro}>
        <select
          ref={ref}
          id={idFinal}
          className={[estilos.entrada, className].filter(Boolean).join(" ")}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descritoPor(idFinal, { dica, erro })}
          {...resto}
        >
          {children}
        </select>
      </Moldura>
    );
  },
);
