/**
 * `pnpm verificar:imagens-cdn` — descobre, carta a carta, quais arquivos
 * de imagem realmente existem em `assets.tcgdex.net`, e grava o resultado
 * em `carta_catalogo.imagem_cdn_existe`.
 *
 * ## O problema que isto resolve
 *
 * 15.467 linhas do catálogo têm `imagem_url` nulo mas `set_serie_id`
 * preenchido, o que permite DEDUZIR a URL do arquivo no CDN. Em parte
 * delas o arquivo existe mesmo assim (no japonês, ~52%; em inglês, 59 de
 * 915). O sistema aproveitava isso montando a URL e deixando o `<img>`
 * descobrir — a suposição era que o arquivo inexistente daria 404 e o
 * componente cairia no estado vazio.
 *
 * **A suposição era falsa.** Medido em 2026-08-29:
 *
 *     pt/xy/xy1/56/low.webp   -> 200 em  0,85 s   (existe)
 *     pt/me/mee/001/low.webp  -> 504 em 60,64 s   (não existe)
 *
 * O CDN não devolve 404: ele segura a conexão por 60 s e responde 504.
 * Como o navegador abre no máximo 6 conexões por host, cada palpite
 * errado ocupa um desses slots por um minuto inteiro — e as fotos que
 * EXISTEM ficam na fila atrás dele. Poucas cartas sem foto travavam a
 * grade inteira.
 *
 * Verificar uma vez e guardar o resultado tira o palpite do caminho do
 * usuário: quem paga os 60 s passa a ser este script, rodando sozinho, e
 * não ele com a carta na mão.
 *
 * ## Como distingue existe de não-existe
 *
 * Pelo TEMPO, não pelo código de status: o hit responde em ~0,85 s e o
 * miss não responde nada por 60 s. O timeout de 8 s é ~9x a latência
 * observada de um hit — margem larga o suficiente para não confundir CDN
 * lento com arquivo ausente, e curta o suficiente para a varredura
 * terminar. Timeout, 404 e 5xx contam como ausente; 200 conta como
 * existe. Qualquer outra falha não grava nada e a linha fica para a
 * próxima rodada.
 *
 * Usa `HEAD`: o corpo não interessa e não baixar dezenas de milhares de
 * imagens é a diferença entre ser um cliente educado e não ser.
 *
 * ## Retomável
 *
 * Só olha linha com `imagem_cdn_verificado_em` nulo, e grava de lote em
 * lote. Interromper com Ctrl+C e rodar de novo continua de onde parou.
 *
 * **Ritmo medido em 2026-08-29: ~43 linhas/min**, o que dá ~6 h para as
 * 15.307 linhas pendentes. É lento porque o custo é a ESPERA, não a
 * banda: cada arquivo ausente gasta os 8 s inteiros do timeout, e são a
 * maioria. Rodar de noite é o uso pretendido.
 *
 * Uso:
 *   docker compose exec -T app pnpm verificar:imagens-cdn
 *   docker compose exec -T app pnpm verificar:imagens-cdn --idioma jp
 *   docker compose exec -T app pnpm verificar:imagens-cdn --set SV2a
 *   docker compose exec -T app pnpm verificar:imagens-cdn --limite 200
 */
import "dotenv/config";

import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";

import { client, db } from "../src/lib/db/client";
import { cartaCatalogo } from "../src/lib/db/schema";
import { urlBaseImagemCartaCdn } from "../src/lib/dominio/imagem-carta";
import { urlImagemCarta } from "../src/lib/imagens";
import type { Idioma } from "../src/lib/dominio/enums";
import { criarLimitador } from "../src/lib/sync/limitador";

/** Teto global, o mesmo do sync. Vale para o CDN também. */
const REQUISICOES_POR_SEGUNDO = 6;
/**
 * Quantas verificações em voo. Aqui a concorrência é o que manda no
 * tempo total, e não o teto de taxa: o miss não consome banda, ele só
 * espera — 12 esperas simultâneas de 8 s dão ~1,5 req/s efetivas, bem
 * abaixo do teto.
 */
const CONCORRENCIA = 12;
/** ~9x a latência medida de um hit (0,85 s). Ver o cabeçalho. */
const TIMEOUT_MS = 8_000;
const USER_AGENT = "colecao-pokemon/1.0 (colecao pessoal; verificacao de imagem)";
const TAMANHO_LOTE = 500;

interface Opcoes {
  idioma?: Idioma;
  /** Restringe a um set — útil para conferir o resultado num set conhecido. */
  setId?: string;
  limite?: number;
}

function lerOpcoes(argv: string[]): Opcoes {
  const iIdioma = argv.indexOf("--idioma");
  const iSet = argv.indexOf("--set");
  const iLimite = argv.indexOf("--limite");
  const idioma = iIdioma !== -1 ? argv[iIdioma + 1] : undefined;
  if (idioma && !["pt", "en", "jp"].includes(idioma)) {
    throw new Error(`Invalid language: ${idioma}`);
  }
  return {
    idioma: idioma as Idioma | undefined,
    setId: iSet !== -1 ? argv[iSet + 1] : undefined,
    limite: iLimite !== -1 ? Number(argv[iLimite + 1]) : undefined,
  };
}

interface LinhaParaVerificar {
  id: string;
  idioma: Idioma;
  setSerieId: string | null;
  setId: string;
  localId: string;
}

type Veredito = "existe" | "ausente" | "indefinido";

async function verificar(linha: LinhaParaVerificar): Promise<Veredito> {
  const base = urlBaseImagemCartaCdn({
    idioma: linha.idioma,
    setSerieId: linha.setSerieId,
    setId: linha.setId,
    localId: linha.localId,
  });
  const url = urlImagemCarta(base, "low");
  if (!url) return "indefinido";

  try {
    const resposta = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
    if (resposta.ok) return "existe";
    // 404 é o esperado quando o arquivo não existe; 504 é o que o CDN
    // devolve quando desiste sozinho, depois de 60 s.
    if (resposta.status === 404 || resposta.status === 504) return "ausente";
    // 403/429 é bloqueio — não é resposta sobre o arquivo. Não grava.
    return "indefinido";
  } catch (erro) {
    // Timeout é a via normal do "não existe": o miss não responde. Ver o
    // cabeçalho — é por tempo que se distingue, não por status.
    if (erro instanceof DOMException && erro.name === "TimeoutError") return "ausente";
    return "indefinido";
  }
}

async function principal(): Promise<void> {
  const opcoes = lerOpcoes(process.argv.slice(2));

  const condicoes = [
    isNull(cartaCatalogo.imagemUrl),
    isNotNull(cartaCatalogo.setSerieId),
    isNull(cartaCatalogo.imagemCdnVerificadoEm),
    ...(opcoes.idioma ? [eq(cartaCatalogo.idioma, opcoes.idioma)] : []),
    ...(opcoes.setId ? [eq(cartaCatalogo.setId, opcoes.setId)] : []),
  ];

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(cartaCatalogo)
    .where(and(...condicoes));

  console.log(`${total} row(s) left to check.`);
  if (total === 0) return;

  const contagem = { existe: 0, ausente: 0, indefinido: 0 };
  let processadas = 0;

  for (;;) {
    if (opcoes.limite && processadas >= opcoes.limite) break;

    const lote: LinhaParaVerificar[] = await db
      .select({
        id: cartaCatalogo.id,
        idioma: cartaCatalogo.idioma,
        setSerieId: cartaCatalogo.setSerieId,
        setId: cartaCatalogo.setId,
        localId: cartaCatalogo.localId,
      })
      .from(cartaCatalogo)
      .where(and(...condicoes))
      .limit(
        opcoes.limite
          ? Math.min(TAMANHO_LOTE, opcoes.limite - processadas)
          : TAMANHO_LOTE,
      );

    if (lote.length === 0) break;

    const limitador = criarLimitador({ porSegundo: REQUISICOES_POR_SEGUNDO });
    const fila = [...lote];

    async function trabalhador(): Promise<void> {
      for (;;) {
        const linha = fila.shift();
        if (!linha) return;
        await limitador.aguardarVez();
        const veredito = await verificar(linha);
        contagem[veredito] += 1;
        if (veredito === "indefinido") continue;

        await db
          .update(cartaCatalogo)
          .set({
            imagemCdnExiste: veredito === "existe",
            imagemCdnVerificadoEm: new Date(),
          })
          .where(
            and(eq(cartaCatalogo.id, linha.id), eq(cartaCatalogo.idioma, linha.idioma)),
          );
      }
    }

    await Promise.all(Array.from({ length: CONCORRENCIA }, () => trabalhador()));

    processadas += lote.length;
    console.log(
      `  ${processadas}/${opcoes.limite ?? total} — exists: ${contagem.existe} | missing: ${contagem.ausente} | inconclusive: ${contagem.indefinido}`,
    );

    // Linha "indefinido" não é gravada, então continuaria voltando no
    // próximo lote e o laço nunca terminaria. Se o lote inteiro deu
    // indefinido, é sinal de problema de rede ou bloqueio — para.
    if (contagem.indefinido >= processadas) {
      console.error(
        "No row in the batch gave a conclusive answer. Stopping — check the network, or whether the CDN has blocked us.",
      );
      process.exitCode = 1;
      return;
    }
  }

  console.log(
    `\nExist: ${contagem.existe} | missing: ${contagem.ausente} | inconclusive: ${contagem.indefinido}`,
  );
}

principal()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => client.end());
