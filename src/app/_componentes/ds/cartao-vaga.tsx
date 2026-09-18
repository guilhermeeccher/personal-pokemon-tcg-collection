/**
 * CartaoVaga — uma vaga da coleção na grade. É o componente que mais
 * carrega regra de negócio no sistema, e três delas não estão escritas em
 * lugar nenhum do design system:
 *
 * **Regra 5 — a seleção é sempre do usuário.** O `SlotCard` do design
 * system expõe `onAllocate` como clique único, e quem implementar a partir
 * só do kit vai alocar direto. Não é assim: `onAlocar` tem que ABRIR A
 * LISTA DE CANDIDATOS elegíveis e deixar o usuário escolher. O sistema
 * sugere; nunca preenche vaga sozinho. Se algum dia este callback alocar
 * direto, a regra quebrou.
 *
 * **Regra 6 — vaga vazia é saída de primeira classe.** O botão de vaga sem
 * candidato continua VISÍVEL, cinza, nunca some: sumir faria a grade
 * parecer quebrada, e a lista do que falta é a razão de o sistema existir.
 * O `title` fica no <span> de fora, não no botão — `classesBotao` aplica
 * `disabled:pointer-events-none`, então botão desabilitado não recebe
 * hover e a tooltip nunca apareceria, justamente no caso em que ela é
 * necessária. Cinza sem explicação vira suspeita de bug.
 *
 * **Arte real, não moldura vazia.** O design system manda desenhar um
 * retângulo vazio no lugar da carta. Aqui não: a política dele é sobre o
 * que ele podia distribuir num pacote de design, e este site é privado e
 * já mostra a arte do catálogo e as fotos do usuário. Quem desenha a
 * imagem continua sendo `ImagemCartaComZoom` / `ImagemVagaVazia`.
 *
 * A prop `energia` fica pronta mas ainda não é usada por ninguém: é a
 * Fase G que liga a tintagem por tipo, depois da tradução EN→pt-BR dos
 * onze tipos. Sem ela, a vaga cai no neutro — degrada, não quebra.
 */

import type { ReactNode } from "react";

const TINTA_PREENCHIDA = 12;
const TINTA_VAZIA = 7;
const TINTA_MOLDURA_PREENCHIDA = 70;
const TINTA_MOLDURA_VAZIA = 40;

export function CartaoVaga({
  preenchida,
  imagem,
  titulo,
  meta,
  energia,
  acao,
}: {
  preenchida: boolean;
  /** A imagem já montada por quem chama — arte real, nunca placeholder. */
  imagem: ReactNode;
  titulo: ReactNode;
  /** Linha de metadados (`#025 · pt · normal`), só na vaga preenchida. */
  meta?: ReactNode;
  /** Tipo de energia, para a tintagem da Fase G. Ausente = neutro. */
  energia?: string;
  /** Alocar ou Desalocar — montado por quem chama, com a regra 5 acima. */
  acao: ReactNode;
}) {
  const tinta = energia ? `var(--energy-${energia})` : null;
  const fundoBase = preenchida ? "var(--slot-filled-bg)" : "var(--slot-empty-bg)";
  const molduraBase = preenchida ? "var(--slot-filled-border)" : "var(--slot-empty-border)";

  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-slot p-2 text-center [transition:var(--transition-surface)] ${
        preenchida
          ? "border-2 border-solid shadow-1 hover:-translate-y-[3px] hover:rotate-[-0.5deg] hover:shadow-3"
          : "border-2 border-dashed"
      }`}
      style={{
        background: tinta
          ? `color-mix(in oklab, ${tinta} ${preenchida ? TINTA_PREENCHIDA : TINTA_VAZIA}%, ${fundoBase})`
          : fundoBase,
        borderColor: tinta
          ? `color-mix(in oklab, ${tinta} ${
              preenchida ? TINTA_MOLDURA_PREENCHIDA : TINTA_MOLDURA_VAZIA
            }%, var(--paper-3))`
          : molduraBase,
      }}
    >
      {imagem}
      <div
        className={`text-xs leading-tight font-medium ${preenchida ? "text-strong" : "text-muted"}`}
      >
        {titulo}
      </div>
      {meta && <div className="font-mono text-[10px] tabular-nums text-subtle">{meta}</div>}
      {acao}
    </div>
  );
}
