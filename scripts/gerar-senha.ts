/**
 * `pnpm senha:gerar` — gera a linha `SENHA_ACESSO_HASH='scrypt:...'` do
 * acesso opcional por senha (`ACESSO_COM_SENHA=1`, ver `lib/acesso.ts`).
 *
 * Pede a senha duas vezes. Recusa se as duas forem diferentes, ou se tiverem
 * menos de 16 ou mais de 256 caracteres (contados depois da NFC, em pontos
 * de código, como na verificação). Recusa também a senha que não cabe no
 * corpo do login (1 KB, `senhaCabeNoLogin`): 256 caracteres podem passar
 * disso em bytes — emojis, acentos em NFD, aspas e barras que o JSON
 * escapa —, e uma senha assim seria gerada e nunca entraria. No terminal,
 * recusa ainda setas, Esc e afins: elas entrariam na senha sem a pessoa
 * ver.
 *
 * **stdout recebe só a linha do `.env`**, com aspas simples e uma quebra de
 * linha — nada de aviso, nada de eco — para dar para redirecionar direto:
 * `pnpm --silent senha:gerar >> .env`. Prompts, avisos e erros vão para o
 * stderr. A senha em texto não é escrita em lugar nenhum.
 *
 * Com stdin num terminal, lê sem eco. Com stdin redirecionado (um pipe ou
 * arquivo), lê as duas primeiras linhas dele: é assim que um teste
 * automatizado consegue conferir que a linha gerada chega inteira ao
 * container. Nesse modo a senha passa pelo pipe, então não use isso à mão
 * com `echo` — ela ficaria no histórico do shell.
 *
 * Não lê banco nem `.env` (por isso não importa `dotenv/config`): o hash
 * depende só da senha e de um sal aleatório.
 */
import { senhaCabeNoLogin } from "../src/lib/dominio/acesso/entrar";
import {
  gerarHashSenha,
  normalizarSenha,
  TAMANHO_MAXIMO_SENHA,
  TAMANHO_MINIMO_SENHA,
  tamanhoSenha,
} from "../src/lib/dominio/acesso/senha";

/** Lê uma linha do terminal em modo cru, sem mostrar o que se digita. */
function lerSemEco(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const entrada = process.stdin;
    process.stderr.write(prompt);
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding("utf8");
    let texto = "";

    const terminar = (erro: Error | null) => {
      entrada.setRawMode(false);
      entrada.pause();
      entrada.removeListener("data", aoReceber);
      process.stderr.write("\n");
      if (erro) reject(erro);
      else resolve(texto);
    };

    function aoReceber(pedaco: string) {
      for (const c of pedaco) {
        if (c === "\r" || c === "\n") return terminar(null);
        if (c === "\u0003") return terminar(new Error("cancelado")); // Ctrl+C
        if (c === "\u0004") return terminar(new Error("cancelado")); // Ctrl+D
        /* Seta, Esc, Home etc. chegam como `ESC` seguido de outros bytes
           (`ESC [ D`), às vezes em pedaços separados. Descartar só o `ESC`
           deixaria `[D` dentro da senha invisível, e a pessoa geraria o
           hash de uma senha diferente da que acha que digitou. Em vez de
           tentar reconhecer cada sequência, recusa: nada é gerado. */
        if (c === "\u001b") {
          return terminar(new Error("teclas especiais (setas, Esc) não são aceitas; rode de novo e digite só a senha"));
        }
        if (c === "\u007f" || c === "\b") {
          texto = Array.from(texto).slice(0, -1).join("");
          continue;
        }
        // Outros controles (Tab, Ctrl+letra) não fazem parte de senha.
        if (c < " ") continue;
        texto += c;
      }
    }

    entrada.on("data", aoReceber);
  });
}

/** Duas primeiras linhas do stdin redirecionado (aceita `\n` ou `\r\n`). */
async function lerDuasLinhasDoStdin(): Promise<[string, string]> {
  const pedacos: Buffer[] = [];
  for await (const pedaco of process.stdin) pedacos.push(Buffer.from(pedaco));
  const linhas = Buffer.concat(pedacos).toString("utf8").split(/\r?\n/);
  if (linhas.length < 2) throw new Error("esperadas duas linhas no stdin (a senha e a confirmação)");
  return [linhas[0], linhas[1]];
}

async function main() {
  process.stderr.write(
    "Use uma senha gerada pelo seu gerenciador de senhas " +
      `(${TAMANHO_MINIMO_SENHA} a ${TAMANHO_MAXIMO_SENHA} caracteres; 20 ou mais, aleatória, é o recomendado).\n`,
  );

  let senha: string;
  let confirmacao: string;
  if (process.stdin.isTTY) {
    senha = await lerSemEco("Senha: ");
    confirmacao = await lerSemEco("Repita a senha: ");
  } else {
    [senha, confirmacao] = await lerDuasLinhasDoStdin();
  }

  /* Comparação e limites sobre a forma NFC, em pontos de código — a mesma
     régua da verificação (`senha.ts`). */
  if (normalizarSenha(senha) !== normalizarSenha(confirmacao)) {
    console.error("senha:gerar — as duas senhas não são iguais. Nada foi gerado.");
    process.exitCode = 1;
    return;
  }
  const tamanho = tamanhoSenha(senha);
  if (tamanho < TAMANHO_MINIMO_SENHA || tamanho > TAMANHO_MAXIMO_SENHA) {
    console.error(
      `senha:gerar — a senha precisa ter de ${TAMANHO_MINIMO_SENHA} a ${TAMANHO_MAXIMO_SENHA} caracteres ` +
        `(tem ${tamanho}). Nada foi gerado.`,
    );
    process.exitCode = 1;
    return;
  }

  if (!senhaCabeNoLogin(senha)) {
    console.error(
      "senha:gerar — a senha é longa demais em bytes para o login (acentos e emojis ocupam mais); " +
        "use uma mais curta. Nada foi gerado.",
    );
    process.exitCode = 1;
    return;
  }

  const hash = await gerarHashSenha(senha);
  /* Aspas simples: o Compose lê o valor literal, sem interpolar nada. O
     formato não tem `$` nem `'`, então a linha não precisa de escape. */
  process.stdout.write(`SENHA_ACESSO_HASH='${hash}'\n`);
}

main().catch((err: unknown) => {
  console.error(`senha:gerar — ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
