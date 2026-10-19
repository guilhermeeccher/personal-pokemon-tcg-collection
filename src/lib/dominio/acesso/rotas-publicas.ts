/**
 * O que o acesso por senha deixa passar sem sessão: uma lista fechada de
 * pares método + caminho. Tudo o mais é protegido — inclusive o que não
 * existe, o que vier malformado e o que vier escrito de um jeito estranho.
 *
 * Duas funções com papéis diferentes:
 *
 * - `normalizarCaminho` reduz variantes de escrita (`/API//copias/`,
 *   `%2F`, maiúsculas) a uma forma só. Serve para quem precisa *classificar*
 *   o caminho (é API ou página?) sem ser enganado por grafia, e devolve
 *   `null` para o que não tem leitura segura. `null` = protegido.
 * - `ehRotaPublica` é a decisão de liberar. Ela exige que o caminho **já
 *   chegue na forma canônica**: normalizar e comparar não basta. Motivo: o
 *   roteador do Next distingue maiúsculas (a expressão da rota não usa `i`)
 *   e não colapsa barras como nós; um `/LOGIN` que a normalização transforma
 *   em `/login` seria "público" para nós e outra coisa para o Next. Hoje
 *   essa outra coisa é um 404, mas a regra é nunca depender disso: o público
 *   é só a grafia exata que o próprio app usa, e qualquer variante cai no
 *   lado protegido, onde o pior caso é pedir login para quem já tem sessão.
 */

/** Ícones do PWA servidos por `/pwa/[arquivo]` (a rota é da onda do PWA). */
export const ICONES_PWA = ["icone-180.png", "icone-192.png", "icone-512.png", "icone-maskable-512.png"] as const;

/**
 * Os `route.ts` do próprio módulo, relativos a `src/app`. São os únicos que
 * podem usar `rotaDoModulo` (sem sessão); o teste estático dos handlers
 * recusa esse envoltório em qualquer outro arquivo.
 */
export const CAMINHOS_ROTAS_DO_MODULO = [
  "api/sessao/route.ts",
  "api/saude/route.ts",
  "robots.txt/route.ts",
  "manifest.webmanifest/route.ts",
  "pwa/[arquivo]/route.ts",
] as const;

const LEITURA = new Set(["GET", "HEAD"]);

const PUBLICOS_LEITURA: ReadonlySet<string> = new Set([
  "/login",
  "/api/saude",
  "/manifest.webmanifest",
  "/robots.txt",
  "/favicon.ico",
  ...ICONES_PWA.map((arquivo) => `/pwa/${arquivo}`),
]);

const PUBLICOS_POST: ReadonlySet<string> = new Set(["/api/sessao"]);

/** Controles C0, DEL e C1: nada disso tem lugar num caminho legítimo (e o
 *  navegador apaga tab e quebra de linha de URL, o que muda o significado
 *  do que sobra). Exportada para o `volta.ts` usar a mesma régua. */
export function temCaractereDeControle(texto: string): boolean {
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) return true;
  }
  return false;
}

/**
 * Forma canônica de um caminho, ou `null` quando ele não tem uma leitura
 * segura.
 *
 * Decodifica o percent-encoding **uma vez**. Se o resultado ainda tiver um
 * `%`, é `null`: um `%252e%252e` que decodifica para `%2e%2e` seria lido
 * como `..` por quem decodificasse de novo, e não há caminho legítimo deste
 * app com `%` literal. Como `null` só significa "exige sessão", ser estrito
 * aqui não tira acesso de ninguém que esteja logado.
 *
 * Depois: recusa `\`, controles e segmentos `.`/`..` (inclusive os que
 * vieram codificados), colapsa barras repetidas — também as que vieram de
 * um `%2F` —, tira a barra final (menos na raiz) e passa a minúsculas.
 */
export function normalizarCaminho(caminho: string): string | null {
  if (typeof caminho !== "string" || !caminho.startsWith("/")) return null;
  if (temCaractereDeControle(caminho) || caminho.includes("\\")) return null;

  let decodificado: string;
  try {
    decodificado = decodeURIComponent(caminho);
  } catch {
    return null; // `%` sem dois hexadecimais, ou UTF-8 inválido
  }
  if (decodificado.includes("%")) return null;
  if (temCaractereDeControle(decodificado) || decodificado.includes("\\")) return null;

  const segmentos = decodificado.split("/").filter((s) => s !== "");
  if (segmentos.some((s) => s === "." || s === "..")) return null;

  return ("/" + segmentos.join("/")).toLowerCase();
}

/**
 * Público só se o método e o caminho estiverem na lista **e** o caminho já
 * vier canônico (ver o comentário do topo). O método também é comparado
 * exato: o `Request` já põe os métodos padrão em maiúsculas, e qualquer
 * outra grafia fica do lado protegido.
 */
export function ehRotaPublica(metodo: string, caminho: string): boolean {
  const normalizado = normalizarCaminho(caminho);
  if (normalizado === null || normalizado !== caminho) return false;
  if (LEITURA.has(metodo)) return PUBLICOS_LEITURA.has(caminho);
  if (metodo === "POST") return PUBLICOS_POST.has(caminho);
  return false;
}
