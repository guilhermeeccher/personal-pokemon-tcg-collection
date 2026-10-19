/**
 * Entrar (`POST /api/sessao`): ler o corpo com teto, extrair a senha e
 * passar pela trava de tentativas. Puro — o corpo entra como stream, a
 * verificação da senha e o limite entram por parâmetro —, para ser testado
 * sem o Next e sem o scrypt de verdade.
 *
 * A rota só emite o cookie no sucesso e traduz o resultado em resposta
 * (`respostaDaEntrada`), com o atraso fixo nos erros.
 */
import type { LimiteTentativas, ResultadoTentativa } from "./limite-tentativas";
import { TAMANHO_MAXIMO_SENHA, tamanhoSenha } from "./senha";

/** `{"senha":"..."}` com uma senha de 256 caracteres cabe com folga; nada
 *  maior que isso é um login. */
export const TETO_CORPO_BYTES = 1024;

/** Atraso de toda resposta de erro (menos o 429 de concorrência). Fixo e
 *  assíncrono: não ocupa CPU, e não deixa o tempo de resposta separar
 *  senha errada de corpo malformado. */
export const ATRASO_ERRO_MS = 700;

/**
 * O corpo como texto, ou `null` se passar do teto ou não for UTF-8 válido.
 *
 * O `Content-Length`, quando vem, é conferido antes de ler — recusa barata
 * de um corpo declarado grande —, mas não é a garantia: um cliente pode
 * mentir nele ou mandar em pedaços sem ele. A garantia é contar os bytes
 * de fato lidos e parar (cancelando a leitura) assim que passar do teto,
 * sem nunca guardar mais que `teto + um pedaço` na memória.
 */
export async function lerCorpoComTeto(
  corpo: ReadableStream<Uint8Array> | null,
  contentLength: string | null,
  teto: number = TETO_CORPO_BYTES,
): Promise<string | null> {
  if (contentLength !== null) {
    const declarado = contentLength.trim();
    if (!/^\d+$/.test(declarado) || Number(declarado) > teto) {
      await corpo?.cancel().catch(() => undefined);
      return null;
    }
  }
  if (corpo === null) return "";

  const leitor = corpo.getReader();
  const pedacos: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > teto) {
        await leitor.cancel().catch(() => undefined);
        return null;
      }
      pedacos.push(value);
    }
  } catch {
    return null;
  } finally {
    leitor.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let posicao = 0;
  for (const p of pedacos) {
    bytes.set(p, posicao);
    posicao += p.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * A senha de um corpo `{"senha": "<texto>"}` — exatamente essa forma: um
 * objeto com a chave `senha` e nenhuma outra, valor texto. Qualquer outra
 * coisa é `null`, e `null` vira o mesmo "senha inválida" de uma senha
 * errada (quem sonda não aprende nada com a mensagem).
 *
 * Vazia ou acima de `TAMANHO_MAXIMO_SENHA` caracteres também é `null`:
 * nenhuma senha aceita pelo `senha:gerar` tem esses tamanhos, então não há
 * por que gastar um scrypt — nem uma tentativa do IP — com elas.
 */
export function extrairSenha(texto: string): string | null {
  let dado: unknown;
  try {
    dado = JSON.parse(texto);
  } catch {
    return null;
  }
  if (typeof dado !== "object" || dado === null || Array.isArray(dado)) return null;
  const chaves = Object.keys(dado);
  if (chaves.length !== 1 || chaves[0] !== "senha") return null;
  const senha: unknown = (dado as Record<string, unknown>).senha;
  if (typeof senha !== "string" || senha.length === 0) return null;
  // Teto barato antes da contagem de verdade (que normaliza): o corpo já
  // é de no máximo 1 KB, mas a regra fica independente disso.
  if (senha.length > TAMANHO_MAXIMO_SENHA * 4) return null;
  if (tamanhoSenha(senha) > TAMANHO_MAXIMO_SENHA) return null;
  return senha;
}

export interface EntradaLogin {
  corpo: ReadableStream<Uint8Array> | null;
  contentLength: string | null;
  ip: string;
  limite: LimiteTentativas;
  verificar: (senha: string) => Promise<boolean>;
}

/**
 * O fluxo inteiro, até o resultado. Corpo ruim é `senha_invalida` **sem**
 * passar pelo limite: não custa scrypt, e contar contra o IP não protegeria
 * nada. Corpo bom vai para `limite.executar`, que reserva a tentativa antes
 * de verificar e devolve a vaga de concorrência sozinho.
 */
export async function processarEntrada({
  corpo,
  contentLength,
  ip,
  limite,
  verificar,
}: EntradaLogin): Promise<ResultadoTentativa> {
  const texto = await lerCorpoComTeto(corpo, contentLength);
  const senha = texto === null ? null : extrairSenha(texto);
  if (senha === null) return "senha_invalida";
  return limite.executar(ip, () => verificar(senha));
}

export interface RespostaEntrada {
  status: 200 | 401 | 429;
  corpo: { ok: true } | { erro: "senha_invalida" | "muitas_tentativas" };
  /** Se a resposta espera `ATRASO_ERRO_MS` antes de sair. */
  atrasar: boolean;
}

/**
 * - `ok` → 200, sem atraso;
 * - `senha_invalida` → 401, com atraso;
 * - `bloqueado` → 429, com atraso;
 * - `concorrencia` → 429 **na hora**: o atraso aqui seguraria uma conexão
 *   a mais justamente quando o servidor já está no teto de verificações.
 *   O corpo é o mesmo do bloqueado; a tela não precisa distinguir.
 */
export function respostaDaEntrada(resultado: ResultadoTentativa): RespostaEntrada {
  switch (resultado) {
    case "ok":
      return { status: 200, corpo: { ok: true }, atrasar: false };
    case "senha_invalida":
      return { status: 401, corpo: { erro: "senha_invalida" }, atrasar: true };
    case "bloqueado":
      return { status: 429, corpo: { erro: "muitas_tentativas" }, atrasar: true };
    case "concorrencia":
      return { status: 429, corpo: { erro: "muitas_tentativas" }, atrasar: false };
  }
}

export function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
