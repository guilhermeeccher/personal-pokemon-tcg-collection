/**
 * Nome da carta, com o nome ocidental entre parênteses quando o nome
 * original está em japonês: `フシギソウ (Ivysaur)`.
 *
 * Existe porque o catálogo japonês guarda o nome em japonês — sem isso, a
 * tela de cadastro de um set japonês é uma lista de cartas que quem não lê
 * japonês não consegue identificar. Não há nome ocidental
 * na fonte de dados (o repositório traz nome latino em ~3% das cartas
 * japonesas, e nenhum nome em inglês para os sets); o que existe é o
 * número da Pokédex, e é dele que `nomeEspecie` sai, no servidor.
 *
 * Carta japonesa **sem** nome ocidental resolvível — Treinador, Energia,
 * tag team com mais de um número — aparece só com o nome japonês. Nunca
 * inventamos uma tradução.
 *
 * Componente em vez de função de string para as duas partes terem peso
 * visual diferente: o nome ocidental é apoio para reconhecer a carta, não
 * o nome dela.
 */
export function NomeCarta({
  nome,
  nomeEspecie,
  className = "",
}: {
  nome: string;
  nomeEspecie?: string | null;
  className?: string;
}) {
  if (!nomeEspecie || nomeEspecie === nome) {
    return <span className={className}>{nome}</span>;
  }
  return (
    <span className={className}>
      {nome} <span className="text-muted">({nomeEspecie})</span>
    </span>
  );
}
