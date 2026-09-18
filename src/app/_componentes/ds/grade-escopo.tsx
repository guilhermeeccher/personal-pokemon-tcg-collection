/**
 * GradeEscopo — o seletor de regiões da Pokédex.
 *
 * Envolve os checkboxes numa moldura de cartão com legenda, como o design
 * system desenhou. **Não** decide nada sobre alocação: quem chama continua
 * dono do `onAlternar`, e é lá que vive a proteção que impede remover uma
 * região que já tem vaga preenchida — regra de negócio, não de interface.
 * O componente só desenha; passe `travada` para a região que não pode sair,
 * com o motivo em `motivoTravada` (vira o `title`, então o cinza nunca fica
 * sem explicação).
 */

export interface OpcaoEscopo {
  id: string;
  rotulo: string;
  faixa?: string;
  travada?: boolean;
  motivoTravada?: string;
}

export function GradeEscopo({
  legenda,
  opcoes,
  selecionadas,
  onAlternar,
}: {
  legenda?: string;
  opcoes: readonly OpcaoEscopo[];
  selecionadas: readonly string[];
  onAlternar: (id: string) => void;
}) {
  return (
    <fieldset className="rounded-card border border-line bg-surface px-5 pt-4 pb-5">
      {legenda && (
        <legend className="px-2 text-[13px] font-bold text-strong">{legenda}</legend>
      )}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3">
        {opcoes.map((opcao) => (
          <label
            key={opcao.id}
            title={opcao.travada ? opcao.motivoTravada : undefined}
            className={`flex items-center gap-2 text-sm ${
              opcao.travada ? "text-subtle" : "cursor-pointer text-foreground"
            }`}
          >
            <input
              type="checkbox"
              checked={selecionadas.includes(opcao.id)}
              disabled={opcao.travada}
              onChange={() => onAlternar(opcao.id)}
            />
            {opcao.rotulo}
            {opcao.faixa && <span className="font-mono text-xs text-subtle">({opcao.faixa})</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
