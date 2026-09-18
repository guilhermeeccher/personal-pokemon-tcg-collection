/**
 * Casamento de número de carta e parsing de "sigla + número" — usado no
 * filtro por número da grade do cadastro por set e na busca por sigla+
 * número do cadastro por busca (spec da tarefa: "achar a carta mais
 * rápido"). É onde mora o risco de erro sutil (zero à esquerda, sufixo de
 * letra de secreta, separador opcional entre sigla e número) — por isso
 * módulo puro e testado, sem depender de React nem de banco.
 */

/**
 * Remove zeros à esquerda mantendo pelo menos um caractere ("000" -> "0",
 * "004" -> "4", "4" -> "4"), e normaliza maiúsculas/minúsculas — é a
 * chave de comparação para tolerar zero à esquerda no número da carta.
 */
function chaveNumero(s: string): string {
  return s.replace(/^0+(?=.)/, "").toUpperCase();
}

/**
 * `localId` é o número impresso na carta (ex.: "004", "103a", "H01" —
 * ver `lib/dominio/ordenacao.ts`). `consulta` é o que o usuário digitou.
 * Casa tolerando zero à esquerda dos dois lados ("4", "04" e "004" casam
 * com a carta "004"), mas exige que o resto do número (sufixo de letra de
 * secreta, prefixo de série especial) seja igual — "4" não casa com
 * "004a". Consulta vazia sempre casa (sem filtro).
 */
export function casaNumeroCarta(localId: string, consulta: string): boolean {
  const consultaAparada = consulta.trim();
  if (consultaAparada === "") return true;
  return chaveNumero(localId) === chaveNumero(consultaAparada);
}

export interface SiglaNumero {
  sigla: string;
  numero: string;
}

/**
 * Parseia uma entrada única "sigla + número" (ex.: "MEW 151", "mew151",
 * "MEW-151", "mew 004") em `{ sigla, numero }`. `null` quando a entrada
 * não tem essa forma (sem letras no início, ou sem dígito depois) — quem
 * chama decide o que fazer (tipicamente: não é esse tipo de busca, cai
 * para outro fluxo). Nunca adivinha sigla nem número a partir de texto
 * ambíguo.
 */
export function parseSiglaNumero(consulta: string): SiglaNumero | null {
  const texto = consulta.trim();

  // Com separador explícito (espaço ou hífen), a sigla pode ter dígitos:
  // é o caso de TODO set japonês — "sv2a 002", "SM3H 009" — e também de
  // sets ocidentais com ponto, como "sv03.5 4". Sem isto, o atalho de
  // entrada única não reconhecia nenhuma carta japonesa, embora o usuário
  // digite exatamente o que está impresso na carta ("sv2a 002/165").
  const comSeparador = texto.match(/^([A-Za-z][A-Za-z0-9.]*)[\s-]+(\d+[A-Za-z]?)$/);
  if (comSeparador) {
    const [, sigla, numero] = comSeparador;
    return { sigla: sigla.toUpperCase(), numero };
  }

  // Sem separador, só o formato clássico "letras + dígitos" ("mew151").
  // Sigla alfanumérica colada ao número seria ambígua ("sv2a002": a sigla
  // acaba no "a" ou no "2"?) e adivinhar aqui daria erro silencioso de
  // cadastro — melhor devolver null e deixar o outro fluxo de busca agir.
  const colado = texto.match(/^([A-Za-z]+)(\d+[A-Za-z]?)$/);
  if (!colado) return null;
  const [, sigla, numero] = colado;
  return { sigla: sigla.toUpperCase(), numero };
}
