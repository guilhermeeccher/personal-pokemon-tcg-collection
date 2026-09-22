/**
 * De ONDE veio a imagem que está sendo exibida para uma carta.
 *
 * Até 2026-08-29 o sistema devolvia só a URL da imagem, e a tela tinha
 * que adivinhar a procedência pelo formato da string (ver
 * `ehImagemPropria`, em `imagem-local.ts`). Isso deixou de bastar quando
 * a cadeia ganhou duas fontes novas — a imagem do MESMO card em outro
 * idioma ocidental, e o scan de terceiro (mypcards) — porque as duas
 * mudam o que o usuário está vendo sem mudar a carta: a foto é da
 * carta certa, impressa em outro idioma ou digitalizada por outra gente.
 *
 * Regra de produto (decidida em 2026-08-29): **foto emprestada é marcada
 * na tela**. O sistema não pode deixar o usuário achar que tem a versão
 * inglesa quando a cópia dele é a portuguesa.
 */

import type { Idioma } from "./enums";

export type OrigemImagem =
  /** Foto que o próprio usuário enviou (upload ou link baixado). Vence tudo. */
  | "propria"
  /** `carta_catalogo.imagem_url` da linha do próprio idioma. O caso normal. */
  | "catalogo"
  /** Scan do mypcards baixado para o nosso volume — mesmo idioma, fonte não oficial. */
  | "mypcards"
  /** Emprestada do catálogo em português (a cópia é de uma linha em inglês). */
  | "catalogo-pt"
  /** Emprestada do catálogo em inglês (a cópia é de uma linha em português). */
  | "catalogo-en"
  /**
   * Palpite montado direto no CDN de assets da TCGdex. Só para `jp`, onde
   * a API não devolve `image` mas o arquivo existe em ~52% dos casos;
   * cortado em pt/en, onde quase sempre erra — e onde errar é caro, porque
   * o CDN não devolve 404: ele segura a conexão por 60 s e devolve 504
   * (medido em 2026-08-29).
   */
  | "cdn";

/**
 * A imagem é do próprio usuário — e portanto é dele para trocar ou
 * remover pela tela?
 *
 * Substitui a checagem por prefixo de URL no caso de uso da interface: o
 * mypcards também é servido por `/api/imagens-locais/`, então a forma da
 * URL deixou de distinguir "minha foto" de "foto que o sistema baixou".
 */
export function ehOrigemPropria(origem: OrigemImagem | null | undefined): boolean {
  return origem === "propria";
}

export interface SeloOrigemImagem {
  /** Texto curto, para caber sobre uma miniatura de 32px. */
  texto: string;
  /** Explicação completa, no `title`/`aria-label`. */
  titulo: string;
}

/**
 * O selo que vai sobre a miniatura, ou `null` quando a imagem é a
 * esperada e não há nada a avisar.
 *
 * Só origem *emprestada* recebe selo. Imagem própria e imagem do catálogo
 * no idioma certo são o caso normal — marcá-las seria ruído em cima de
 * praticamente todas as cartas da coleção.
 */
export function seloOrigemImagem(
  origem: OrigemImagem | null | undefined,
): SeloOrigemImagem | null {
  switch (origem) {
    case "catalogo-en":
      return {
        texto: "EN",
        titulo: "Foto da carta em inglês — o catálogo não tem foto da versão em português.",
      };
    case "catalogo-pt":
      return {
        texto: "PT",
        titulo: "Foto da carta em português — o catálogo não tem foto da versão em inglês.",
      };
    case "mypcards":
      return {
        texto: "MYP",
        titulo: "Foto do mypcards, não do catálogo oficial da TCGdex.",
      };
    case "propria":
    case "catalogo":
    case "cdn":
    case null:
    case undefined:
      return null;
  }
}

/**
 * O outro idioma ocidental — de onde a foto pode ser emprestada quando o
 * catálogo não tem a do idioma da linha.
 *
 * Só pt e en se emprestam. **O japonês fica de fora de propósito**, e
 * isso não é omissão: os sets japoneses não são os mesmos sets. Numeração
 * diferente, arte diferente, recortes diferentes — de 12.782 ids
 * japoneses, só 14 coincidem com ids ocidentais, e por acidente. O único
 * vínculo jp↔ocidental no sistema é o número da Pokédex, que é da
 * ESPÉCIE, não da carta. Emprestar por ali mostraria outro Ivysaur, de
 * outro set, com outra arte — uma foto que parece certa e está errada, o
 * que é pior que slot vazio, porque só se descobre com a carta na mão.
 */
export function idiomaDoEmprestimo(idioma: Idioma): Idioma | null {
  if (idioma === "pt") return "en";
  if (idioma === "en") return "pt";
  return null;
}
