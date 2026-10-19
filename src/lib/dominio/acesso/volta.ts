/**
 * O `?volta=` do login: para onde mandar depois de entrar.
 *
 * Só aceita um caminho relativo do próprio site. Qualquer coisa que um
 * navegador possa ler como outro endereço vira `/`, porque um redirecionamento
 * aberto depois do login é o golpe clássico: o link parece do seu domínio e
 * termina num formulário falso.
 *
 * O que se recusa, e por quê:
 * - não começa com `/`, ou começa com `//` ou `/\`: o navegador lê como
 *   endereço de outro host (`//x` → `https://x`, e `\` vale `/` na barra
 *   de endereço);
 * - `\` em qualquer lugar e caracteres de controle: o navegador apaga tab e
 *   quebra de linha de URLs, então `/\t/x` vira `//x` do lado dele;
 * - as mesmas regras depois de decodificar uma vez (`/%2F%2Fx`, `/%5Cx`,
 *   `%0a`): quem recebe pode decodificar antes de usar;
 * - tamanho acima de `TAMANHO_MAXIMO_VOLTA`;
 * - o próprio `/login`, em qualquer grafia que normalize para ele — um
 *   laço de login não leva a lugar nenhum —, e o caminho que nem normaliza
 *   (`..`, `%` duplo).
 *
 * Devolve o texto original, não o decodificado: é ele que o navegador pediu.
 */
import { normalizarCaminho, temCaractereDeControle } from "./rotas-publicas";

export const TAMANHO_MAXIMO_VOLTA = 2048;

function formaSegura(texto: string): boolean {
  if (!texto.startsWith("/")) return false;
  if (texto.startsWith("//")) return false;
  if (texto.includes("\\")) return false;
  if (temCaractereDeControle(texto)) return false;
  return true;
}

export function sanitizarVolta(valor: string | null | undefined): string {
  if (typeof valor !== "string" || valor.length === 0 || valor.length > TAMANHO_MAXIMO_VOLTA) return "/";
  if (!formaSegura(valor)) return "/";

  let decodificado: string;
  try {
    decodificado = decodeURIComponent(valor);
  } catch {
    return "/";
  }
  if (!formaSegura(decodificado)) return "/";

  /* Segunda trava, independente das regras acima: resolvido contra uma base
     qualquer, o resultado tem que continuar na mesma origem. */
  try {
    const base = "http://base.invalid";
    if (new URL(valor, base).origin !== base || new URL(decodificado, base).origin !== base) return "/";
  } catch {
    return "/";
  }

  /* O caminho (sem query nem fragmento) tem que ter leitura segura e não
     ser o login. `null` aqui é um `..`, um `%` duplo ou algo assim: nenhuma
     tela do app tem endereço desses, e `/a/../login` seria o login de novo. */
  const normalizado = normalizarCaminho(valor.split(/[?#]/, 1)[0]);
  if (normalizado === null || normalizado === "/login") return "/";
  return valor;
}
