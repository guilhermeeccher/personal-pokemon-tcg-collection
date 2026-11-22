/**
 * `pnpm verificar:imagens-cdn` — descobre, carta a carta, quais arquivos
 * de imagem realmente existem em `assets.tcgdex.net`, e grava o resultado
 * em `carta_catalogo.imagem_cdn_existe`.
 *
 * Dois modos, que gravam nas mesmas colunas e nunca na mesma linha
 * (`lib/dominio/comando-verificar-imagens-cdn.ts`):
 *
 * - **padrão** — linhas SEM `imagem_url`: verifica a URL deduzida de
 *   idioma/série/set/número. É o problema descrito logo abaixo.
 * - **`--com-url`** (desde 2026-11-22) — linhas COM `imagem_url`: verifica
 *   a própria URL gravada. A cadeia de imagem confiava nela às cegas, e o
 *   catálogo pode trazer URL para um arquivo que o CDN não tem — a tela
 *   mostrava imagem quebrada em vez de emprestar a foto da outra língua.
 *   Com o veredito `false`, o degrau 2 da cadeia (`degrausImagem`, em
 *   `lib/db/consultas.ts`) é pulado.
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
 * **Histórico — a suposição era falsa em 2026-08-29:**
 *
 *     pt/xy/xy1/56/low.webp   -> 200 em  0,85 s   (existe)
 *     pt/me/mee/001/low.webp  -> 504 em 60,64 s   (não existe)
 *
 * Naquela data o CDN não devolvia 404: segurava a conexão por 60 s e
 * respondia 504. Como o navegador abre no máximo 6 conexões por host, cada
 * palpite errado ocupava um desses slots por um minuto inteiro — e as fotos
 * que EXISTEM ficavam na fila atrás dele. Poucas cartas sem foto travavam a
 * grade inteira.
 *
 * **Medido de novo em 2026-11-22, o comportamento mudou:** arquivo
 * inexistente responde 404 em ~0,4 s. O 504 e o timeout continuam contando
 * como ausente (abaixo): nada garante que o CDN não volte a segurar a
 * conexão, e o custo de mantê-los é zero quando ele responde rápido.
 *
 * Verificar uma vez e guardar o resultado tira o palpite do caminho do
 * usuário: quem paga a espera passa a ser este script, rodando sozinho, e
 * não ele com a carta na mão.
 *
 * ## Como distingue existe de não-existe
 *
 * Pelo status, desde o 404 rápido de 2026-11-22, com o tempo de reserva
 * (`vereditoDoStatus`, `vereditoDoErro`, testados): 2xx existe; 404, 504 e
 * o timeout de 8 s contam como ausente; 403, 429 e conexão recusada ou
 * derrubada são bloqueio e PARAM a varredura; o resto (outro 5xx, outro
 * 4xx, redirecionamento) não grava nada e a linha fica para a próxima
 * rodada. O timeout é ~9x a latência de um hit medida em 2026-08-29
 * (0,85 s): largo o bastante para não confundir CDN lento com arquivo
 * ausente. O redirecionamento não é seguido: a varredura só fala com o
 * host do CDN.
 *
 * Usa `HEAD`: o corpo não interessa e não baixar dezenas de milhares de
 * imagens é a diferença entre ser um cliente educado e não ser.
 *
 * ## Bloqueio para tudo
 *
 * Como no sync de catálogo (`ErroBloqueioUpstream`): diante de bloqueio,
 * insistir renova o bloqueio. Ao primeiro 403/429 ou conexão recusada,
 * nenhum trabalhador pega linha nova; só terminam as requisições que já
 * estavam no ar, e o script sai com o código 1.
 *
 * ## Retomável, e cada linha uma vez por rodada
 *
 * Só olha linha com `imagem_cdn_verificado_em` nulo, e grava linha a
 * linha. Interromper com Ctrl+C e rodar de novo continua de onde parou —
 * nos dois modos. A fila anda por cursor (`idioma`, `id`): a linha que deu
 * indefinido não volta no lote seguinte, então a rodada termina mesmo
 * quando o CDN responde indefinido para sempre a algumas linhas.
 *
 * A gravação só acontece se a linha ainda é a que foi lida — mesma URL
 * gravada, mesmas partes da URL deduzida, ainda sem veredito. Um sync que
 * troque a URL durante o `HEAD` zera o veredito (`lib/db/veredicto-imagem-cdn.ts`)
 * e não pode receber, por cima, a resposta sobre o arquivo antigo.
 *
 * Quando o sync, o seed, o importador ou o toque do set inalterado mudam a
 * URL efetiva de uma linha (a gravada, ou a deduzida quando não há
 * gravada), o veredito é zerado na mesma escrita e a linha volta para esta
 * fila.
 *
 * ## `--reverificar` — o veredito legado
 *
 * Antes de 2026-11-22 nenhuma escrita zerava o veredito quando a URL
 * mudava. Uma instalação antiga pode ter, numa linha que ganhou
 * `imagem_url` depois, um "ausente" medido contra a URL deduzida de antes:
 * o degrau 2 esconde a URL gravada, e o modo `--com-url` pula a linha por
 * já ter veredito. `--com-url --reverificar` verifica de novo as linhas que
 * já têm veredito (com `--set`/`--idioma` para estreitar), com o mesmo
 * cursor, a mesma parada no bloqueio e a mesma gravação condicional — aqui
 * condicionada também ao veredito lido, para não sobrescrever um mais novo.
 * Decisão de 2026-11-22: não zerar por migração, porque os "ausentes" com
 * URL gravada medidos numa instalação real eram 404 de verdade, e zerar
 * traria de volta a imagem quebrada. Sem retomada: interrompida, a rodada
 * recomeça do início.
 *
 * **Ritmo medido em 2026-08-29 (histórico): ~43 linhas/min**, ~6 h para as
 * 15.307 linhas pendentes de então: cada arquivo ausente gastava os 8 s
 * inteiros do timeout. Com o 404 rápido de 2026-11-22 o miss deixou de
 * esperar, e o ritmo deve ficar perto do teto do limitador; não foi medido
 * de novo.
 *
 * Uso:
 *   docker compose exec -T app pnpm verificar:imagens-cdn
 *   docker compose exec -T app pnpm verificar:imagens-cdn --idioma jp
 *   docker compose exec -T app pnpm verificar:imagens-cdn --set SV2a
 *   docker compose exec -T app pnpm verificar:imagens-cdn --limite 200
 *   docker compose exec -T app pnpm verificar:imagens-cdn --com-url --idioma pt --set SET_ID
 *   docker compose exec -T app pnpm verificar:imagens-cdn --com-url --reverificar
 *
 * Argumento desconhecido recusa a varredura com o código 2, antes de tocar
 * o banco; `--help` também não toca o banco.
 */
import "dotenv/config";

import { and, asc, eq, isNull, isNotNull, like, sql, type SQL } from "drizzle-orm";

import { client, db } from "../src/lib/db/client";
import { cartaCatalogo } from "../src/lib/db/schema";
import {
  lerArgumentosVerificarImagens,
  PREFIXO_CDN_TCGDEX,
  SAIDA_USO_VERIFICAR_IMAGENS,
  urlBaseParaVerificar,
  USO_VERIFICAR_IMAGENS_CDN,
  vereditoDoErro,
  vereditoDoStatus,
  type ArgumentosVerificarImagens,
  type LinhaVerificavel,
  type VereditoHead,
} from "../src/lib/dominio/comando-verificar-imagens-cdn";
import { urlImagemCarta } from "../src/lib/imagens";
import { criarLimitador } from "../src/lib/sync/limitador";

/** Teto global, o mesmo do sync. Vale para o CDN também. */
const REQUISICOES_POR_SEGUNDO = 6;
/**
 * Quantas verificações em voo. Dimensionada em 2026-08-29, quando o miss
 * esperava o timeout inteiro: 12 esperas simultâneas de 8 s davam
 * ~1,5 req/s efetivas, bem abaixo do teto. Com o 404 rápido, quem segura o
 * ritmo é o limitador, não a concorrência.
 */
const CONCORRENCIA = 12;
/** ~9x a latência medida de um hit (0,85 s). Ver o cabeçalho. */
const TIMEOUT_MS = 8_000;
const USER_AGENT = "colecao-pokemon/1.0 (colecao pessoal; verificacao de imagem)";
const TAMANHO_LOTE = 500;

interface LinhaParaVerificar extends LinhaVerificavel {
  id: string;
  /**
   * `imagem_cdn_verificado_em` como texto do próprio Postgres: comparar o
   * `Date` do JS perderia os microssegundos e a linha nunca casaria.
   */
  verificadoEm: string | null;
}

async function verificar(linha: LinhaParaVerificar, comUrl: boolean): Promise<VereditoHead> {
  const url = urlImagemCarta(urlBaseParaVerificar(linha, comUrl), "low");
  if (!url) return "indefinido";

  try {
    const resposta = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Não segue: a varredura só fala com o host do CDN. 3xx é indefinido.
      redirect: "manual",
    });
    return vereditoDoStatus(resposta.status);
  } catch (erro) {
    return vereditoDoErro(erro);
  }
}

/**
 * Grava o veredito só se a linha ainda é a que foi lida: a mesma URL
 * gravada, as mesmas partes da URL deduzida e o mesmo veredito (nenhum, no
 * modo normal; o lido, com `--reverificar`). Devolve se gravou.
 */
async function gravar(linha: LinhaParaVerificar, existe: boolean): Promise<boolean> {
  const gravadas = await db
    .update(cartaCatalogo)
    .set({ imagemCdnExiste: existe, imagemCdnVerificadoEm: new Date() })
    .where(
      and(
        eq(cartaCatalogo.id, linha.id),
        eq(cartaCatalogo.idioma, linha.idioma),
        sql`${cartaCatalogo.imagemCdnVerificadoEm}::text is not distinct from ${linha.verificadoEm}::text`,
        sql`${cartaCatalogo.imagemUrl} is not distinct from ${linha.imagemUrl}::text`,
        sql`${cartaCatalogo.setSerieId} is not distinct from ${linha.setSerieId}::text`,
        eq(cartaCatalogo.setId, linha.setId),
        eq(cartaCatalogo.localId, linha.localId),
      ),
    )
    .returning({ id: cartaCatalogo.id });
  return gravadas.length > 0;
}

async function principal(opcoes: ArgumentosVerificarImagens): Promise<void> {
  // A seleção espelha `urlBaseParaVerificar`: linha que ela devolveria
  // `null` não entra.
  const condicoes: SQL[] = [
    ...(opcoes.comUrl
      ? [like(cartaCatalogo.imagemUrl, `${PREFIXO_CDN_TCGDEX}%`)]
      : [isNull(cartaCatalogo.imagemUrl), isNotNull(cartaCatalogo.setSerieId)]),
    ...(opcoes.reverificar ? [] : [isNull(cartaCatalogo.imagemCdnVerificadoEm)]),
    ...(opcoes.idioma ? [eq(cartaCatalogo.idioma, opcoes.idioma)] : []),
    ...(opcoes.setId ? [eq(cartaCatalogo.setId, opcoes.setId)] : []),
  ];

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(cartaCatalogo)
    .where(and(...condicoes));

  console.log(
    `${total} row(s) left to check (${opcoes.comUrl ? "stored imagem_url" : "deduced URL, rows without imagem_url"}${opcoes.reverificar ? ", including rows already checked" : ""}).`,
  );
  if (total === 0) return;

  const contagem = { existe: 0, ausente: 0, indefinido: 0, mudou: 0 };
  let processadas = 0;
  let cursor: { idioma: string; id: string } | null = null;
  let bloqueio: string | null = null;
  const limitador = criarLimitador({ porSegundo: REQUISICOES_POR_SEGUNDO });

  while (!bloqueio) {
    if (opcoes.limite && processadas >= opcoes.limite) break;

    const depoisDoCursor: SQL[] = cursor
      ? [sql`(${cartaCatalogo.idioma}, ${cartaCatalogo.id}) > (${cursor.idioma}::idioma, ${cursor.id}::text)`]
      : [];
    const lote: LinhaParaVerificar[] = await db
      .select({
        id: cartaCatalogo.id,
        idioma: cartaCatalogo.idioma,
        imagemUrl: cartaCatalogo.imagemUrl,
        setSerieId: cartaCatalogo.setSerieId,
        setId: cartaCatalogo.setId,
        localId: cartaCatalogo.localId,
        verificadoEm: sql<string | null>`${cartaCatalogo.imagemCdnVerificadoEm}::text`,
      })
      .from(cartaCatalogo)
      .where(and(...condicoes, ...depoisDoCursor))
      .orderBy(asc(cartaCatalogo.idioma), asc(cartaCatalogo.id))
      .limit(opcoes.limite ? Math.min(TAMANHO_LOTE, opcoes.limite - processadas) : TAMANHO_LOTE);

    if (lote.length === 0) break;
    const ultima = lote[lote.length - 1];
    cursor = { idioma: ultima.idioma, id: ultima.id };

    const fila = [...lote];
    async function trabalhador(): Promise<void> {
      // Bloqueio visto por qualquer trabalhador: ninguém pega linha nova.
      while (!bloqueio) {
        const linha = fila.shift();
        if (!linha) return;
        await limitador.aguardarVez();
        if (bloqueio) return;
        const veredito = await verificar(linha, opcoes.comUrl);
        processadas += 1;
        if (veredito === "bloqueio") {
          bloqueio ??= `${linha.idioma}/${linha.id}`;
          return;
        }
        if (veredito === "indefinido") {
          contagem.indefinido += 1;
          continue;
        }
        if (await gravar(linha, veredito === "existe")) contagem[veredito] += 1;
        else contagem.mudou += 1;
      }
    }
    await Promise.all(Array.from({ length: CONCORRENCIA }, () => trabalhador()));

    console.log(
      `  ${processadas}/${opcoes.limite ?? total} — exists: ${contagem.existe} | missing: ${contagem.ausente} | inconclusive: ${contagem.indefinido} | changed meanwhile: ${contagem.mudou}`,
    );
  }

  if (bloqueio) {
    console.error(
      `The CDN refused us (403/429 or connection refused, at ${bloqueio}). Stopped on purpose: insisting renews a block. Run again later.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `\nExist: ${contagem.existe} | missing: ${contagem.ausente} | inconclusive: ${contagem.indefinido} | changed meanwhile (not written): ${contagem.mudou}`,
  );
  if (contagem.indefinido > 0 && contagem.existe + contagem.ausente === 0) {
    console.error("No row gave a conclusive answer — check the network.");
    process.exitCode = 1;
  }
}

// Os argumentos são lidos antes de qualquer coisa tocar o banco: uso errado
// e `--help` saem sem abrir conexão (e sem exigir `DATABASE_URL`).
const lido = lerArgumentosVerificarImagens(process.argv.slice(2));
if (!lido.ok) {
  console.error(`${lido.erro}\n\n${USO_VERIFICAR_IMAGENS_CDN}`);
  process.exitCode = SAIDA_USO_VERIFICAR_IMAGENS;
} else if (lido.args.ajuda) {
  console.log(USO_VERIFICAR_IMAGENS_CDN);
} else {
  principal(lido.args)
    .catch((erro) => {
      console.error(erro);
      process.exitCode = 1;
    })
    .finally(() => client.end());
}
