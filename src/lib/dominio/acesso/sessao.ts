/**
 * Cookie de sessão do acesso opcional por senha.
 *
 * Sem tabela no banco: o cookie se prova sozinho, assinado com HMAC-SHA256
 * pelo `SEGREDO_SESSAO`. Web Crypto (`crypto.subtle`) e não `node:crypto`,
 * para o mesmo código servir no proxy, nas rotas e nas páginas.
 *
 * Conteúdo, em binário e depois base64url (57 bytes → 76 caracteres):
 *
 *   versão (1) | emissão (4) | expiração (4) | impressão (16) | MAC (32)
 *
 * Emissão e expiração em segundos Unix, inteiros sem sinal big-endian (dão
 * até 2106). A **impressão** são 16 bytes de HMAC(segredo, hash da senha):
 * trocar a senha derruba todas as sessões, sem precisar guardar lista
 * nenhuma. Trocar o segredo também derruba, porque o MAC deixa de bater —
 * é esse o procedimento "sair de todos os aparelhos".
 *
 * **Sem renovação**, de propósito: a duração é absoluta (180 dias) contada
 * da emissão. Um cookie roubado não se estende para sempre; depois do
 * prazo, novo login.
 */

export const NOME_COOKIE_SESSAO = "__Host-sessao";
export const DURACAO_SESSAO_SEGUNDOS = 15_552_000; // 180 dias

/** Folga para uma emissão "no futuro". Quem emite e quem confere é o mesmo
 *  processo, então o relógio é um só; a folga só cobre arredondamento e um
 *  ajuste de NTP no meio. Um cookie emitido mais à frente que isso é
 *  recusado — ninguém além de nós assina, mas a regra fica estrita. */
export const TOLERANCIA_EMISSAO_FUTURA_SEGUNDOS = 60;

const VERSAO = 1;
const BYTES_IMPRESSAO = 16;
const BYTES_MAC = 32;
const BYTES_CORPO = 1 + 4 + 4 + BYTES_IMPRESSAO;
const BYTES_TOTAL = BYTES_CORPO + BYTES_MAC;
/** 57 bytes sem `=` em base64url. Conferido antes de decodificar, para um
 *  cookie gigante não virar trabalho. */
const TAMANHO_TEXTO = Math.ceil((BYTES_TOTAL * 4) / 3);

/* ---------- base64url estrito (sem Buffer: roda em qualquer runtime) ---------- */

export function codificarBase64Url(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Só o alfabeto base64url, sem `=`, e na forma canônica: a recodificação
 *  tem que devolver o mesmo texto, o que recusa bits sobrando no último
 *  caractere (duas grafias para os mesmos bytes). `null` em qualquer falha. */
export function decodificarBase64Url(texto: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(texto) || texto.length % 4 === 1) return null;
  const base64 = texto.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (texto.length % 4)) % 4);
  let binario: string;
  try {
    binario = atob(base64);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return codificarBase64Url(bytes) === texto ? bytes : null;
}

/* ---------- HMAC ---------- */

async function chaveHmac(segredo: Uint8Array): Promise<CryptoKey> {
  // Cópia: garante um `ArrayBuffer` próprio, que é o que a Web Crypto aceita.
  return crypto.subtle.importKey("raw", new Uint8Array(segredo), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

async function impressaoDoHash(chave: CryptoKey, hashSenhaTexto: string): Promise<Uint8Array> {
  const mac = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(hashSenhaTexto));
  return new Uint8Array(mac).slice(0, BYTES_IMPRESSAO);
}

function escreverU32(destino: Uint8Array, posicao: number, valor: number): void {
  new DataView(destino.buffer, destino.byteOffset, destino.byteLength).setUint32(posicao, valor, false);
}

function lerU32(origem: Uint8Array, posicao: number): number {
  return new DataView(origem.buffer, origem.byteOffset, origem.byteLength).getUint32(posicao, false);
}

/** Compara sem sair no primeiro byte diferente. A impressão só é comparada
 *  depois do MAC conferido, então não é segredo; fica assim por hábito. */
function iguais(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a[i] ^ b[i];
  return diferenca === 0;
}

/* ---------- emitir e verificar ---------- */

export interface ParametrosSessao {
  segredo: Uint8Array;
  hashSenhaTexto: string;
  agoraMs: number;
}

/**
 * `duracaoSegundos` existe para a verificação de produção emitir um cookie
 * curto (10 min). Padrão e teto: 180 dias. Fora disso é erro de quem chama
 * (exceção), não algo a corrigir em silêncio.
 */
export async function emitirSessao({
  segredo,
  hashSenhaTexto,
  agoraMs,
  duracaoSegundos = DURACAO_SESSAO_SEGUNDOS,
}: ParametrosSessao & { duracaoSegundos?: number }): Promise<string> {
  if (!Number.isInteger(duracaoSegundos) || duracaoSegundos <= 0 || duracaoSegundos > DURACAO_SESSAO_SEGUNDOS) {
    throw new RangeError(`duração de sessão fora de 1..${DURACAO_SESSAO_SEGUNDOS} segundos`);
  }
  const emissao = Math.floor(agoraMs / 1000);
  const chave = await chaveHmac(segredo);
  const corpo = new Uint8Array(BYTES_CORPO);
  corpo[0] = VERSAO;
  escreverU32(corpo, 1, emissao);
  escreverU32(corpo, 5, emissao + duracaoSegundos);
  corpo.set(await impressaoDoHash(chave, hashSenhaTexto), 9);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", chave, corpo));
  const total = new Uint8Array(BYTES_TOTAL);
  total.set(corpo, 0);
  total.set(mac, BYTES_CORPO);
  return codificarBase64Url(total);
}

/** Estrita, e nunca lança: qualquer coisa fora do formato é `false`. */
export async function verificarSessao(
  valor: string | undefined,
  { segredo, hashSenhaTexto, agoraMs }: ParametrosSessao,
): Promise<boolean> {
  try {
    if (typeof valor !== "string" || valor.length !== TAMANHO_TEXTO) return false;
    const bytes = decodificarBase64Url(valor);
    if (!bytes || bytes.length !== BYTES_TOTAL) return false;
    const corpo = bytes.slice(0, BYTES_CORPO);
    const mac = bytes.slice(BYTES_CORPO);
    if (corpo[0] !== VERSAO) return false;

    const chave = await chaveHmac(segredo);
    // Tempo constante por conta da própria Web Crypto.
    if (!(await crypto.subtle.verify("HMAC", chave, mac, corpo))) return false;

    const agora = Math.floor(agoraMs / 1000);
    const emissao = lerU32(corpo, 1);
    const expiracao = lerU32(corpo, 5);
    if (emissao > agora + TOLERANCIA_EMISSAO_FUTURA_SEGUNDOS) return false;
    if (!(agora < expiracao)) return false;
    if (expiracao <= emissao || expiracao - emissao > DURACAO_SESSAO_SEGUNDOS) return false;

    return iguais(corpo.slice(9, 9 + BYTES_IMPRESSAO), await impressaoDoHash(chave, hashSenhaTexto));
  } catch {
    return false;
  }
}

/**
 * `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=…`, no formato de
 * `cookies().set` e `NextResponse.cookies.set`. O prefixo `__Host-` do nome
 * já obriga `Secure`, `Path=/` e nenhum `Domain` — um subdomínio não
 * consegue plantar um cookie com esse nome.
 */
export function atributosCookieSessao(maxAgeSegundos: number) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSegundos,
  };
}
