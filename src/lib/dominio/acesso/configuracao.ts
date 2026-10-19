/**
 * Configuração do acesso opcional por senha, lida do ambiente.
 *
 * Quatro variáveis, todas do `.env` de quem instala:
 *
 * - `ACESSO_COM_SENHA` — liga o módulo. **Só o valor `1` liga**, como o
 *   `MODULO_LIVING_DEX`: um `=0` ou `=false` escrito para desligar não pode
 *   acabar ligando.
 * - `SENHA_ACESSO_HASH` — saída do `pnpm senha:gerar` (`senha.ts`).
 * - `SEGREDO_SESSAO` — chave do HMAC do cookie, base64url, 32+ bytes.
 * - `ORIGENS_PERMITIDAS` — origens completas aceitas nos métodos que
 *   alteram dados (`origem.ts`), separadas por vírgula.
 *
 * **Falha fechada.** Com o módulo ligado, qualquer uma das outras três
 * ausente ou malformada dá `estado: "invalida"`, e quem lê isso responde 503
 * em vez de abrir o app. A alternativa — cair para "desligado" — publicaria
 * o app aberto por causa de um erro de digitação no `.env`.
 *
 * Os `motivos` dizem qual variável falhou e o que se esperava dela, **nunca
 * o valor**: eles podem acabar num log ou na tela de configuração incompleta.
 *
 * Puro: o ambiente entra por parâmetro. A leitura de `process.env` por
 * requisição fica em `lib/acesso.ts`.
 */
import { analisarHashSenha, type HashSenha } from "./senha";
import { decodificarBase64Url } from "./sessao";

export type AmbienteAcesso = Readonly<Record<string, string | undefined>>;

export const BYTES_MINIMOS_SEGREDO = 32;

export type ConfiguracaoAcesso =
  | { estado: "desligado" }
  | { estado: "invalida"; motivos: string[] }
  | {
      estado: "ligada";
      hashSenha: HashSenha;
      /** O texto exato da variável: é dele que sai a impressão na sessão. */
      hashSenhaTexto: string;
      segredo: Uint8Array;
      origens: ReadonlySet<string>;
    };

export type ConfiguracaoAcessoLigada = Extract<ConfiguracaoAcesso, { estado: "ligada" }>;

export function moduloAcessoLigado(ambiente: AmbienteAcesso): boolean {
  return ambiente.ACESSO_COM_SENHA === "1";
}

/**
 * Cada item tem que ser uma origem `http:` ou `https:` já na forma que o
 * navegador manda no `Origin`: `new URL(item).origin === item`. Isso recusa
 * caminho, barra final, credenciais, query, fragmento, host em maiúsculas e
 * a porta padrão escrita (`https://x:443`). Espaços em volta de cada item
 * são aceitos, porque `a, b` é como as pessoas escrevem listas.
 */
function lerOrigens(texto: string | undefined, motivos: string[]): Set<string> | null {
  if (texto === undefined || texto.trim() === "") {
    motivos.push("ORIGENS_PERMITIDAS ausente (lista de origens separadas por vírgula)");
    return null;
  }
  const origens = new Set<string>();
  const itens = texto.split(",").map((s) => s.trim());
  let ok = true;
  itens.forEach((item, i) => {
    let valida = false;
    try {
      const url = new URL(item);
      valida = (url.protocol === "http:" || url.protocol === "https:") && url.origin === item;
    } catch {
      valida = false;
    }
    if (valida) {
      origens.add(item);
    } else {
      ok = false;
      motivos.push(
        `ORIGENS_PERMITIDAS: o item ${i + 1} não é uma origem http(s) completa ` +
          "(esquema://host[:porta], minúsculas, sem barra final nem caminho)",
      );
    }
  });
  return ok ? origens : null;
}

export function lerConfiguracaoAcesso(ambiente: AmbienteAcesso): ConfiguracaoAcesso {
  if (!moduloAcessoLigado(ambiente)) return { estado: "desligado" };

  const motivos: string[] = [];

  const hashSenhaTexto = ambiente.SENHA_ACESSO_HASH;
  let hashSenha: HashSenha | null = null;
  if (hashSenhaTexto === undefined || hashSenhaTexto === "") {
    motivos.push("SENHA_ACESSO_HASH ausente (gere com pnpm senha:gerar)");
  } else {
    hashSenha = analisarHashSenha(hashSenhaTexto);
    if (!hashSenha) {
      motivos.push("SENHA_ACESSO_HASH inválida (esperado scrypt:32768:8:1:<sal>:<hash>, gerado por pnpm senha:gerar)");
    }
  }

  const segredoTexto = ambiente.SEGREDO_SESSAO;
  let segredo: Uint8Array | null = null;
  if (segredoTexto === undefined || segredoTexto === "") {
    motivos.push(`SEGREDO_SESSAO ausente (${BYTES_MINIMOS_SEGREDO}+ bytes aleatórios em base64url)`);
  } else {
    segredo = decodificarBase64Url(segredoTexto);
    if (!segredo || segredo.length < BYTES_MINIMOS_SEGREDO) {
      segredo = null;
      motivos.push(
        `SEGREDO_SESSAO inválido (base64url sem "=", decodificando para ${BYTES_MINIMOS_SEGREDO}+ bytes)`,
      );
    }
  }

  const origens = lerOrigens(ambiente.ORIGENS_PERMITIDAS, motivos);

  if (motivos.length > 0 || !hashSenha || hashSenhaTexto === undefined || !segredo || !origens) {
    return { estado: "invalida", motivos };
  }
  return { estado: "ligada", hashSenha, hashSenhaTexto, segredo, origens };
}
