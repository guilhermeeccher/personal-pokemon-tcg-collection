/**
 * Hash da senha única do acesso opcional (`ACESSO_COM_SENHA`).
 *
 * Formato: `scrypt:<N>:<r>:<p>:<sal>:<hash>`, sal (16 bytes) e hash
 * (32 bytes) em base64url sem `=`. O separador é `:` e não o `$` dos
 * formatos de costume porque a linha vai para o `.env`, e o Compose
 * interpolaria um `$` como variável.
 *
 * `node:crypto` e nada mais: nenhuma dependência nova para guardar uma
 * senha. Os parâmetros aceitos são **só** N=32768, r=8, p=1. Um hash com
 * outros números é recusado em vez de obedecido: aceitar o custo que vem
 * escrito no próprio hash deixaria um `.env` adulterado (N=2, ou N=2^30)
 * baixar a resistência da senha ou derrubar o processo com um único login.
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const TAMANHO_MINIMO_SENHA = 16;
/** Teto de verificação, em caracteres depois da NFC (`tamanhoSenha`).
 *  Acima disso nem roda o scrypt: um corpo enorme não pode virar trabalho
 *  de CPU, e nenhum gerenciador de senhas produz isso. */
export const TAMANHO_MAXIMO_SENHA = 256;

const N = 32768;
const R = 8;
const P = 1;
const BYTES_SAL = 16;
const BYTES_HASH = 32;
/* 128 * N * r = 32 MiB exatos, e o padrão do Node (32 MiB) recusa por pouco
   esses parâmetros. 64 MiB dá folga sem abrir espaço para um custo maior —
   que, de todo modo, o parser já recusa. */
const MAXMEM = 64 * 1024 * 1024;

export interface HashSenha {
  readonly sal: Uint8Array;
  readonly hash: Uint8Array;
}

/** Base64url estrito: só o alfabeto, sem `=`, e na forma canônica (a
 *  recodificação tem que devolver o mesmo texto — isso recusa bits sobrando
 *  no último caractere, que o `Buffer` aceitaria em silêncio). */
function decodificar(texto: string, bytesEsperados: number): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(texto)) return null;
  const bytes = Buffer.from(texto, "base64url");
  if (bytes.length !== bytesEsperados) return null;
  if (bytes.toString("base64url") !== texto) return null;
  return new Uint8Array(bytes);
}

export function analisarHashSenha(texto: string): HashSenha | null {
  const partes = texto.split(":");
  if (partes.length !== 6) return null;
  const [esquema, n, r, p, sal, hash] = partes;
  /* Comparação de texto, não de número: `032768` ou `8.0` também ficam
     de fora — o hash que o `senha:gerar` escreve tem uma forma só. */
  if (esquema !== "scrypt" || n !== String(N) || r !== String(R) || p !== String(P)) return null;
  const salBytes = decodificar(sal, BYTES_SAL);
  const hashBytes = decodificar(hash, BYTES_HASH);
  if (!salBytes || !hashBytes) return null;
  return { sal: salBytes, hash: hashBytes };
}

/**
 * A forma da senha que vai para o scrypt e para os limites: NFC. A mesma
 * senha digitada no iPhone e no computador pode chegar com acentos
 * compostos de formas diferentes (`á` ou `a` + acento combinante), e o dono
 * não pode ficar trancado do lado de fora por isso.
 */
export function normalizarSenha(senha: string): string {
  return senha.normalize("NFC");
}

/**
 * Tamanho em caracteres de verdade (pontos de código), **depois** da NFC.
 * `length` conta unidades UTF-16: `"a\u0301".repeat(8)` teria 16 e viraria
 * oito `á` antes do scrypt, e oito emojis também teriam 16. Os limites de
 * 16 e 256 valem sobre esta contagem, na geração, na confirmação e na
 * verificação.
 */
export function tamanhoSenha(senha: string): number {
  return Array.from(normalizarSenha(senha)).length;
}

/* Trava barata antes da NFC, para um texto enorme não virar trabalho de
   normalização. Folga larga de propósito: um caractere composto vira no
   máximo uns poucos pontos de código na forma decomposta, cada um com até
   2 unidades UTF-16, e 16 por caractere fica muito acima disso — nenhuma
   senha dentro do teto é barrada aqui. O teto que vale é o de baixo. */
const TETO_UNIDADES_ANTES_DA_NFC = TAMANHO_MAXIMO_SENHA * 16;

function derivar(senha: string, sal: Uint8Array): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      Buffer.from(normalizarSenha(senha), "utf8"),
      sal,
      BYTES_HASH,
      { N, r: R, p: P, maxmem: MAXMEM },
      (erro, chave) => (erro ? reject(erro) : resolve(chave)),
    );
  });
}

/** Gera a linha guardada no `.env`, com sal aleatório. Recusa (exceção)
 *  senha fora dos limites: quem chama é o `senha:gerar`, que já avisou. */
export async function gerarHashSenha(senha: string): Promise<string> {
  const tamanho = tamanhoSenha(senha);
  if (tamanho < TAMANHO_MINIMO_SENHA || tamanho > TAMANHO_MAXIMO_SENHA) {
    throw new RangeError(
      `a senha precisa ter de ${TAMANHO_MINIMO_SENHA} a ${TAMANHO_MAXIMO_SENHA} caracteres`,
    );
  }
  const sal = randomBytes(BYTES_SAL);
  const hash = await derivar(senha, sal);
  return `scrypt:${N}:${R}:${P}:${sal.toString("base64url")}:${hash.toString("base64url")}`;
}

/** Nunca lança: qualquer falha do scrypt é "senha errada". */
export async function verificarSenha(senha: string, hash: HashSenha): Promise<boolean> {
  if (typeof senha !== "string" || senha.length > TETO_UNIDADES_ANTES_DA_NFC) return false;
  if (tamanhoSenha(senha) > TAMANHO_MAXIMO_SENHA) return false;
  try {
    const calculado = await derivar(senha, hash.sal);
    /* `timingSafeEqual` lança com comprimentos diferentes; conferir antes
       não vaza nada, porque o comprimento é fixo e público (32 bytes). */
    if (calculado.length !== hash.hash.length) return false;
    return timingSafeEqual(calculado, hash.hash);
  } catch {
    return false;
  }
}
