/**
 * O que é puro no comando `pnpm verificar:imagens-cdn`
 * (`scripts/verificar-imagens-cdn.ts`): ler os argumentos e dizer qual URL
 * cada linha verifica. A varredura em si (banco, HEAD, lote) fica no
 * script; aqui não há banco nem rede.
 *
 * ## Os dois modos
 *
 * - **Padrão — linha SEM `imagem_url`.** A URL é deduzida de
 *   idioma/série/set/número (`urlBaseImagemCartaCdn`) e o veredito decide
 *   os degraus 4 e 6 da cadeia de imagem (`degrausImagem`, em
 *   `lib/db/consultas.ts`). É o modo de sempre, e não mudou.
 * - **`--com-url` — linha COM `imagem_url`.** Verifica a própria URL
 *   gravada. Existe porque a cadeia de imagem confiava nela às cegas, e o
 *   catálogo pode trazer URL para um arquivo que o CDN não tem: a tela
 *   mostrava imagem quebrada em vez de emprestar a foto da outra língua.
 *   Com o veredito `false`, o degrau 2 é pulado e a cadeia cai no mypcards
 *   ou no empréstimo da outra língua.
 *
 * Os dois modos gravam nas mesmas colunas (`imagem_cdn_existe`,
 * `imagem_cdn_verificado_em`), e sem conflito: um olha só linha sem URL, o
 * outro só linha com URL. Quando o sync, o seed, o importador ou o toque
 * do set inalterado mudam a URL efetiva de uma linha (a gravada, ou a
 * deduzida quando não há gravada), o veredito antigo é zerado na mesma
 * escrita (`lib/db/veredicto-imagem-cdn.ts`), e a linha volta para a fila
 * do modo que couber.
 *
 * ## Argumento desconhecido recusa a varredura
 *
 * Como no `sync:catalogo` (`comando-sync-catalogo.ts`): um `--com-ur`
 * digitado errado não pode cair no modo padrão em silêncio, nem um
 * `--idoma jp` virar uma varredura dos três idiomas. Sai com o código 2
 * antes de tocar o banco.
 */

import { classificarErro, classificarStatus } from "./bloqueio-upstream";
import { IDIOMAS, type Idioma } from "./enums";
import { urlBaseImagemCartaCdn } from "./imagem-carta";

export const SAIDA_USO_VERIFICAR_IMAGENS = 2;

/**
 * O único host que a verificação consulta. No modo `--com-url` a URL vem do
 * banco, e uma linha com URL de outro host (nenhuma hoje: o sync só grava o
 * `image` da TCGdex) fica de fora da seleção — o script não sai batendo em
 * host que ninguém escolheu.
 */
export const PREFIXO_CDN_TCGDEX = "https://assets.tcgdex.net/";

export const USO_VERIFICAR_IMAGENS_CDN = [
  "usage: pnpm verificar:imagens-cdn [--com-url] [--reverificar] [--idioma pt|en|jp] [--set SET_ID] [--limite N]",
  "",
  "  Checks, once per row, whether the card's image file exists on the TCGdex CDN,",
  "  and stores the answer in imagem_cdn_existe. Resumable: a checked row is skipped",
  "  (unless --reverificar).",
  "",
  "  --com-url        check rows that HAVE imagem_url (the stored URL itself);",
  "                   default: rows without imagem_url (the URL deduced from set and number)",
  "  --reverificar    also check rows that already have a verdict (e.g. a legacy \"missing\"",
  "                   recorded against an older URL); restarts from the top if interrupted",
  "  --idioma L       only this language (pt, en or jp)",
  "  --set SET_ID     only this set",
  "  --limite N       stop after N rows",
  "",
  "  exit codes: 0 ok, 1 error, a block (403/429/connection refused: it stops at once)",
  "              or no conclusive answer, 2 wrong usage",
].join("\n");

export interface ArgumentosVerificarImagens {
  /** `true` = linhas com `imagem_url`; `false` = o modo padrão, sem. */
  comUrl: boolean;
  /**
   * `true` = também as linhas que já têm veredito. Existe para o veredito
   * legado: antes de 2026-11-22 nenhuma escrita zerava o par quando a URL
   * mudava, então uma instalação antiga pode ter um "ausente" medido contra
   * a URL deduzida de antes, numa linha que depois ganhou `imagem_url` — e o
   * degrau 2 esconde essa URL sem que ninguém a tenha verificado. Zerar
   * todos por migração traria de volta imagens que estão mesmo quebradas
   * (as poucas medidas eram 404 de verdade); verificar de novo decide linha
   * a linha. Sem retomada: a rodada interrompida recomeça do início.
   */
  reverificar: boolean;
  idioma?: Idioma;
  /** Restringe a um set — útil para conferir o resultado num set conhecido. */
  setId?: string;
  limite?: number;
  ajuda: boolean;
}

type Lido = { ok: true; args: ArgumentosVerificarImagens } | { ok: false; erro: string };

/**
 * Lê `process.argv.slice(2)`. Aceita `--opcao valor` e `--opcao=valor`, e
 * ignora um `--` solto (há gerenciador de pacotes que o repassa ao script).
 * Opção repetida é erro, não "vale a última".
 */
export function lerArgumentosVerificarImagens(argv: readonly string[]): Lido {
  const args: ArgumentosVerificarImagens = { comUrl: false, reverificar: false, ajuda: false };
  const vistas = new Set<string>();

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--help" || a === "-h") {
      args.ajuda = true;
      continue;
    }
    const nome = a.includes("=") ? a.slice(0, a.indexOf("=")) : a;
    if (!["--com-url", "--reverificar", "--idioma", "--set", "--limite"].includes(nome)) {
      return { ok: false, erro: `unknown argument "${a}".` };
    }
    if (vistas.has(nome)) return { ok: false, erro: `${nome} given more than once.` };
    vistas.add(nome);

    if (nome === "--com-url" || nome === "--reverificar") {
      if (a !== nome) return { ok: false, erro: `${nome} takes no value.` };
      if (nome === "--com-url") args.comUrl = true;
      else args.reverificar = true;
      continue;
    }

    const valor = a !== nome ? a.slice(a.indexOf("=") + 1) : argv[++i];
    if (valor === undefined || valor === "" || valor.startsWith("--")) {
      return { ok: false, erro: `${nome} needs a value.` };
    }
    if (nome === "--idioma") {
      // `ja` é recusado de propósito, mesmo sendo o código da URL: o comando
      // fala a língua do banco, onde o japonês é `jp` (AGENTS.md).
      if (!(IDIOMAS as readonly string[]).includes(valor)) {
        return { ok: false, erro: `unknown language "${valor}" in --idioma (use ${IDIOMAS.join(", ")}).` };
      }
      args.idioma = valor as Idioma;
    } else if (nome === "--set") {
      args.setId = valor;
    } else {
      // Antes, `Number(...)` sem conferir: `--limite abc` virava NaN e a
      // varredura rodava sem limite nenhum.
      if (!/^[1-9]\d*$/.test(valor)) {
        return { ok: false, erro: `--limite needs a positive whole number, got "${valor}".` };
      }
      args.limite = Number(valor);
    }
  }
  return { ok: true, args };
}

export interface LinhaVerificavel {
  idioma: Idioma;
  imagemUrl: string | null;
  setSerieId: string | null;
  setId: string;
  localId: string;
}

/**
 * A URL BASE (sem `/low.webp`) que esta linha verifica no modo dado, ou
 * `null` quando a linha não tem o que verificar nesse modo — o script
 * conta como inconclusivo e não grava nada.
 *
 * No modo `--com-url` é a própria `imagem_url`, e só no host do CDN. No
 * padrão, a URL deduzida, e só para linha sem `imagem_url`: o veredito do
 * modo padrão fala da URL deduzida, e gravá-lo numa linha com URL diria
 * algo sobre outro arquivo.
 */
export function urlBaseParaVerificar(linha: LinhaVerificavel, comUrl: boolean): string | null {
  if (comUrl) {
    if (!linha.imagemUrl || !linha.imagemUrl.startsWith(PREFIXO_CDN_TCGDEX)) return null;
    return linha.imagemUrl;
  }
  if (linha.imagemUrl) return null;
  return urlBaseImagemCartaCdn({
    idioma: linha.idioma,
    setSerieId: linha.setSerieId,
    setId: linha.setId,
    localId: linha.localId,
  });
}

/**
 * O que um `HEAD` disse sobre o arquivo. `bloqueio` não é resposta sobre o
 * arquivo: é o CDN barrando o cliente, e a varredura para de pedir na hora
 * — a mesma lição do catálogo (`ErroBloqueioUpstream`): diante de bloqueio,
 * insistir renova o bloqueio. `indefinido` não grava nada; a linha fica para
 * a próxima rodada.
 */
export type VereditoHead = "existe" | "ausente" | "bloqueio" | "indefinido";

/**
 * - 2xx: existe.
 * - 404: não existe — a resposta normal desde 2026-11-22 (404 rápido).
 * - 504: não existe. Histórico: em 2026-08-29 o CDN segurava a conexão do
 *   arquivo inexistente por 60 s e respondia 504; fica aceito porque nada
 *   garante que ele não volte a fazer isso.
 * - 403/429: bloqueio (`classificarStatus`).
 * - Qualquer outro, inclusive 3xx (o redirecionamento não é seguido, para
 *   a varredura nunca falar com outro host) e os demais 5xx: indefinido.
 */
export function vereditoDoStatus(status: number): VereditoHead {
  if (status >= 200 && status < 300) return "existe";
  if (status === 404 || status === 504) return "ausente";
  if (status >= 400 && classificarStatus(status) === "bloqueio") return "bloqueio";
  return "indefinido";
}

/**
 * Falha do `fetch`, sem resposta. O timeout é nosso e conta como ausente —
 * era a via normal do "não existe" quando o CDN segurava a conexão
 * (2026-08-29), e continua valendo se ele voltar a fazer isso. Conexão
 * recusada ou derrubada é bloqueio (`classificarErro`). O resto, indefinido.
 */
export function vereditoDoErro(erro: unknown): VereditoHead {
  if (typeof erro === "object" && erro !== null && (erro as { name?: unknown }).name === "TimeoutError") {
    return "ausente";
  }
  return classificarErro(erro) === "bloqueio" ? "bloqueio" : "indefinido";
}
