"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import estilos from "./aviso-flutuante.module.css";

export type TomAviso = "neutro" | "sucesso" | "erro";

/** Quanto o aviso fica na tela, em ms. Erro fica mais: dá tempo de ler. */
export const DURACAO_AVISO_MS: Record<TomAviso, number> = { neutro: 3200, sucesso: 3200, erro: 6000 };

interface Aviso {
  id: number;
  texto: ReactNode;
  tom: TomAviso;
}

type Avisar = (texto: ReactNode, opcoes?: { tom?: TomAviso }) => void;

const ContextoAviso = createContext<Avisar | null>(null);

/**
 * `const avisar = useAviso(); avisar("3 cartas marcadas")` — o recado
 * passageiro da v2 ("Copiado", "Coleção criada"). Para o que a pessoa
 * precisa ler e decidir, use um aviso em linha ou uma janela: este some.
 */
export function useAviso(): Avisar {
  const avisar = useContext(ContextoAviso);
  if (!avisar) throw new Error("useAviso fora do ProvedorAvisos (a casca da v2 o fornece)");
  return avisar;
}

/**
 * Um aviso por vez: o novo substitui o anterior e reinicia o relógio. A
 * região `role="status"` existe sempre (vazia quando não há aviso), porque o
 * leitor de tela só anuncia mudança dentro de uma região viva que já estava
 * no DOM.
 */
export function ProvedorAvisos({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const proximoId = useRef(0);

  const avisar = useCallback<Avisar>((texto, opcoes) => {
    proximoId.current += 1;
    setAviso({ id: proximoId.current, texto, tom: opcoes?.tom ?? "neutro" });
  }, []);

  useEffect(() => {
    if (!aviso) return;
    const relogio = setTimeout(() => setAviso(null), DURACAO_AVISO_MS[aviso.tom]);
    return () => clearTimeout(relogio);
  }, [aviso]);

  const valor = useMemo(() => avisar, [avisar]);

  return (
    <ContextoAviso.Provider value={valor}>
      {children}
      <div className={estilos.regiao} role="status" aria-live="polite" aria-atomic="true">
        {aviso && (
          <div key={aviso.id} className={`${estilos.aviso} ${aviso.tom !== "neutro" ? estilos[aviso.tom] : ""}`}>
            <span className={estilos.ponto} aria-hidden />
            <span>{aviso.texto}</span>
          </div>
        )}
      </div>
    </ContextoAviso.Provider>
  );
}
