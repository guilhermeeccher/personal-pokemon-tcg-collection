/**
 * Acesso opcional por senha (`ACESSO_COM_SENHA=1`) — a parte que fala com o
 * servidor: lê o ambiente, os cookies e os cabeçalhos, e responde. As regras
 * moram nos módulos puros de `lib/dominio/acesso/`.
 *
 * Usado em três camadas, de propósito redundantes (o proxy sozinho já teve
 * falhas de desvio em versões passadas do Next):
 *
 * - o proxy (`src/proxy.ts`) barra toda requisição sem sessão;
 * - cada `page.tsx` e `generateMetadata`/`generateViewport` chama
 *   `exigirSessao()` antes de ler qualquer dado, e cada server action chama
 *   `exigirSessaoNaAcao()` (sessão **e** origem);
 * - cada handler de `route.ts` é envolvido por `comAcesso(...)`, ou, nas
 *   rotas do próprio módulo, por `rotaDoModulo(...)`.
 *
 * **Desligado, nada muda.** As guardas de página e de action só marcam a
 * requisição como dinâmica (`connection()`) e voltam, sem ler cookie nem
 * cabeçalho; `comAcesso` devolve a resposta do handler intocada. Só as
 * rotas do próprio módulo mudam: respondem 404, como se não existissem.
 *
 * A flag é lida **por requisição**, nunca no build: a imagem Docker é
 * construída sem o `.env`, e um valor capturado ali ficaria preso nela.
 */
import { isIP } from "node:net";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import {
  lerConfiguracaoAcesso,
  type AmbienteAcesso,
  type ConfiguracaoAcesso,
  type ConfiguracaoAcessoLigada,
} from "@/lib/dominio/acesso/configuracao";
import { criarLimiteTentativas, type LimiteTentativas } from "@/lib/dominio/acesso/limite-tentativas";
import { origemPermitida } from "@/lib/dominio/acesso/origem";
import { ehRotaPublica } from "@/lib/dominio/acesso/rotas-publicas";
import { NOME_COOKIE_SESSAO, verificarSessao } from "@/lib/dominio/acesso/sessao";

/* ---------- configuração ---------- */

const VARIAVEIS = ["ACESSO_COM_SENHA", "SENHA_ACESSO_HASH", "SEGREDO_SESSAO", "ORIGENS_PERMITIDAS"] as const;

let memo: { chave: string; config: ConfiguracaoAcesso } | null = null;

/**
 * A configuração vigente, relida do ambiente a cada chamada. Memoriza pelo
 * texto exato das quatro variáveis — validar e decodificar a cada requisição
 * seria trabalho à toa, e qualquer mudança nelas invalida a memória na hora.
 */
export function configuracaoAcessoAtual(ambiente: AmbienteAcesso = process.env): ConfiguracaoAcesso {
  const chave = JSON.stringify(VARIAVEIS.map((v) => ambiente[v] ?? null));
  if (memo?.chave !== chave) memo = { chave, config: lerConfiguracaoAcesso(ambiente) };
  return memo.config;
}

/* ---------- IP do cliente ---------- */

/** Os oito grupos de 16 bits de um IPv6 já validado por `isIP`, expandindo
 *  o `::` e um IPv4 escrito no fim. `null` se não der para expandir. */
function gruposIpv6(ip: string): number[] | null {
  let texto = ip.split("%")[0].toLowerCase(); // sem o identificador de zona
  const ipv4NoFim = texto.match(/^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4NoFim) {
    const [, cabeca, a, b, c, d] = ipv4NoFim;
    texto = `${cabeca}${((+a << 8) | +b).toString(16)}:${((+c << 8) | +d).toString(16)}`;
  }
  const partes = texto.split("::");
  if (partes.length > 2) return null;
  const inicio = partes[0] ? partes[0].split(":") : [];
  const fim = partes.length === 2 && partes[1] ? partes[1].split(":") : [];
  const faltam = 8 - inicio.length - fim.length;
  if (partes.length === 2 ? faltam < 1 : faltam !== 0) return null;
  const grupos = [...inicio, ...Array<string>(faltam).fill("0"), ...fim].map((g) => parseInt(g, 16));
  return grupos.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? grupos : null;
}

/**
 * A chave do cliente para o limite de tentativas.
 *
 * **Suposição (escrita aqui de propósito):** o app só escuta no loopback
 * (`127.0.0.1`), onde chegam apenas o túnel do proxy reverso e processos do
 * próprio servidor. Por isso o `CF-Connecting-IP`, que o túnel preenche com
 * o IP de quem se conectou a ele, é aceito como verdade. Com a porta aberta
 * na rede, qualquer um forjaria esse cabeçalho e escolheria o próprio IP —
 * e o limite por IP deixaria de valer.
 *
 * Quem não vem pelo túnel (sem o cabeçalho, ou com algo que não é IP) é um
 * cliente local único, `"local"`.
 *
 * IPv6 vira o prefixo /64: uma conexão doméstica recebe uma /64 inteira, e
 * contar por endereço deixaria quem tem uma trocar de IP a cada tentativa.
 * IPv4 (inclusive o mapeado em IPv6) é o próprio endereço.
 */
export function ipDoCliente(headers: Headers): string {
  const bruto = headers.get("cf-connecting-ip")?.trim();
  if (!bruto) return "local";
  const versao = isIP(bruto);
  if (versao === 4) return bruto;
  if (versao === 6) {
    const g = gruposIpv6(bruto);
    if (!g) return "local";
    // IPv4 mapeado (`::ffff:a.b.c.d`): é o próprio IPv4.
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
      return [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff].join(".");
    }
    return `${g.slice(0, 4).map((x) => x.toString(16)).join(":")}::/64`;
  }
  return "local";
}

/* ---------- limite de tentativas do login ---------- */

const CHAVE_LIMITE = Symbol.for("colecao-pokemon.acesso.limite-login");
const globais = globalThis as typeof globalThis & { [CHAVE_LIMITE]?: LimiteTentativas };

/** Uma instância só por processo, guardada em `globalThis` para sobreviver
 *  ao recarregamento de módulos do `next dev` (senão cada edição zeraria os
 *  contadores e criaria um segundo teto de concorrência). */
export const limiteLogin: LimiteTentativas = (globais[CHAVE_LIMITE] ??= criarLimiteTentativas());

/* ---------- sessão ---------- */

export function sessaoValida(valorCookie: string | undefined, config: ConfiguracaoAcessoLigada): Promise<boolean> {
  return verificarSessao(valorCookie, {
    segredo: config.segredo,
    hashSenhaTexto: config.hashSenhaTexto,
    agoraMs: Date.now(),
  });
}

/**
 * Para `page.tsx` e `generateMetadata`/`generateViewport`, na primeira
 * linha. Sem sessão válida — ou com a configuração incompleta — manda para
 * o login.
 *
 * **Só autentica.** Não confere origem, porque página e metadados são
 * leitura. Server action altera dados e usa `exigirSessaoNaAcao`, que
 * confere as duas coisas; ali o `redirect` nem serviria de recusa.
 *
 * O `connection()` vem **antes** de ler a flag, e sempre, inclusive com o
 * módulo desligado. Sem ele, uma página que o build pré-renderizasse — a
 * imagem é construída sem o `.env`, logo com o módulo desligado — ficaria
 * estática, e ligar o módulo na mesma imagem não faria esta guarda rodar
 * nunca. Hoje toda página já é dinâmica porque o layout lê `cookies()` para
 * o idioma, mas a proteção não pode depender disso. Desligado, o único
 * efeito é esse: a requisição fica marcada como dinâmica.
 */
export async function exigirSessao(): Promise<void> {
  await connection();
  const config = configuracaoAcessoAtual();
  if (config.estado === "desligado") return;
  if (config.estado !== "ligada") redirect("/login");
  const valor = (await cookies()).get(NOME_COOKIE_SESSAO)?.value;
  if (!(await sessaoValida(valor, config))) redirect("/login");
}

/** Recusa genérica de server action: sem dizer se faltou sessão, origem ou
 *  configuração — quem chama de fora não precisa saber qual. */
const RECUSA_ACAO = "acesso recusado";

/**
 * Para a primeira linha de cada server action (arquivo `"use server"`).
 *
 * Confere a sessão e a origem da requisição (`Origin`, ou o `Referer` na
 * falta dele; sem os dois, recusa), com a mesma régua dos route handlers
 * (`origem.ts`). A proteção própria do Next contra action forjada compara
 * só o host e deixa passar requisição sem `Origin`, o que não é a política
 * deste módulo. Uma action é sempre `POST`.
 *
 * Recusa **lançando** um `Error` sem detalhe: numa action o `redirect` vira
 * navegação do lado do cliente, não uma recusa da operação.
 *
 * `connection()` primeiro, pelo mesmo motivo de `exigirSessao`. Desligado,
 * volta sem ler cookie nem cabeçalho.
 */
export async function exigirSessaoNaAcao(): Promise<void> {
  await connection();
  const config = configuracaoAcessoAtual();
  if (config.estado === "desligado") return;
  if (config.estado !== "ligada") throw new Error(RECUSA_ACAO);
  const [jarra, cabecalhos] = await Promise.all([cookies(), headers()]);
  if (!(await sessaoValida(jarra.get(NOME_COOKIE_SESSAO)?.value, config))) throw new Error(RECUSA_ACAO);
  const origemOk = origemPermitida(
    { metodo: "POST", origin: cabecalhos.get("origin"), referer: cabecalhos.get("referer") },
    config.origens,
  );
  if (!origemOk) throw new Error(RECUSA_ACAO);
}

/* ---------- envoltórios dos route handlers ---------- */

export type CodigoErroAcesso = "nao_autenticado" | "origem_recusada" | "configuracao_incompleta";

/** `{ "erro": "<codigo>" }`, sem nada que ajude a sondar o motivo além do
 *  código, e fora de qualquer cache. */
export function respostaErroAcesso(status: number, codigo: CodigoErroAcesso): Response {
  return Response.json(
    { erro: codigo },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

/** Lê um cookie do cabeçalho `Cookie`. Na duplicata, vale o primeiro — e o
 *  prefixo `__Host-` impede que um subdomínio plante um segundo. */
export function lerCookie(headers: Headers, nome: string): string | undefined {
  const cabecalho = headers.get("cookie");
  if (!cabecalho) return undefined;
  for (const parte of cabecalho.split(";")) {
    const igual = parte.indexOf("=");
    if (igual === -1) continue;
    if (parte.slice(0, igual).trim() !== nome) continue;
    const valor = parte.slice(igual + 1).trim();
    try {
      return decodeURIComponent(valor);
    } catch {
      return valor;
    }
  }
  return undefined;
}

function origemDaRequisicao(req: Request, origens: ReadonlySet<string>): boolean {
  return origemPermitida(
    { metodo: req.method, origin: req.headers.get("origin"), referer: req.headers.get("referer") },
    origens,
  );
}

type Handler<R extends Request, C> = (req: R, ctx: C) => Response | Promise<Response>;

/**
 * Envolve um handler privado. Desligado: chama o handler e devolve a
 * resposta dele como veio. Ligado: configuração incompleta → 503; sem
 * sessão → 401; método que altera dados vindo de origem fora da lista → 403.
 *
 * O tipo do handler passa adiante intocado (`req` e `ctx` com os
 * `params` da rota), para o validador de rotas do Next continuar conferindo.
 */
export function comAcesso<R extends Request, C>(handler: Handler<R, C>): (req: R, ctx: C) => Promise<Response> {
  return async (req, ctx) => {
    const config = configuracaoAcessoAtual();
    if (config.estado === "desligado") return handler(req, ctx);
    if (config.estado === "invalida") return respostaErroAcesso(503, "configuracao_incompleta");
    if (!(await sessaoValida(lerCookie(req.headers, NOME_COOKIE_SESSAO), config))) {
      return respostaErroAcesso(401, "nao_autenticado");
    }
    if (!origemDaRequisicao(req, config.origens)) return respostaErroAcesso(403, "origem_recusada");
    return handler(req, ctx);
  };
}

/**
 * Um `GET` pode fazer a limpeza que hoje grava no banco? Existe para os dois
 * `GET` que encerram rodadas mortas (`inventario/precos` e
 * `colecoes/[id]/opcoes-compra`) — o `HEAD` derivado deles passa pelo
 * mesmo caminho.
 *
 * O desenho do acesso diz que nenhum `GET` altera dados, porque a origem só
 * é conferida nos métodos que alteram: o `SameSite=Lax` deixa o cookie ir
 * numa navegação `GET` vinda de outro site, e um link ali faria o app
 * gravar em nome do dono. Essa limpeza é idempotente e escolhida pelo
 * estado, o que limita o estrago — mas ainda é uma gravação disparada de
 * fora. Então, com o módulo ligado, ela só roda com a mesma régua dos
 * métodos que alteram dados: `Origin`, ou o `Referer` na falta dele, na
 * lista. O `fetch` da própria tela manda o `Referer` (a política do app é
 * `same-origin`); uma navegação vinda de outro site não manda origem da
 * lista. Sem poder gravar, o `GET` responde com o estado do banco como
 * está, e o `POST` continua limpando como sempre.
 *
 * Desligado: `true`, o comportamento de antes, intacto. Configuração
 * incompleta: `false` (o `comAcesso` já respondeu 503 antes de chegar
 * aqui; é só a falha fechada de sempre).
 */
export function leituraPodeGravar(req: Request): boolean {
  const config = configuracaoAcessoAtual();
  if (config.estado === "desligado") return true;
  if (config.estado !== "ligada") return false;
  return origemPermitida(
    { metodo: "POST", origin: req.headers.get("origin"), referer: req.headers.get("referer") },
    config.origens,
  );
}

/**
 * Envolve as rotas do próprio módulo (sessão, saúde, robots, manifesto,
 * ícones — a lista é `CAMINHOS_ROTAS_DO_MODULO`).
 *
 * - Desligado: 404 sem corpo. É a reserva, não o 404 que o usuário vê: o
 *   404 idêntico ao de hoje (o HTML do Next, com os mesmos cabeçalhos, em
 *   qualquer método) vem do proxy, que reescreve os caminhos do módulo
 *   para um endereço inexistente (`ehCaminhoDoModulo`, em
 *   `decisao-proxy.ts`). Este só responde se o proxy for pulado.
 * - Ligado: configuração incompleta → 503; método que altera dados com
 *   origem fora → 403.
 * - E a dispensa de sessão é **por método e caminho**, não por arquivo: só
 *   os pares de `ehRotaPublica` passam sem sessão. Um `DELETE /api/sessao`
 *   (sair) ou um `GET /pwa/<nome que não é ícone>` exigem sessão (401),
 *   como no `comAcesso`. Sem isso, envolver por engano um método privado
 *   com este envoltório o deixaria aberto — e o teste estático, que olha o
 *   arquivo, aceitaria.
 *
 * O caminho vai para `ehRotaPublica` **como chegou** (`new URL(req.url)`),
 * sem normalizar: é a forma exata que ela exige para liberar.
 */
export function rotaDoModulo<R extends Request, C>(handler: Handler<R, C>): (req: R, ctx: C) => Promise<Response> {
  return async (req, ctx) => {
    const config = configuracaoAcessoAtual();
    if (config.estado === "desligado") return new Response(null, { status: 404 });
    if (config.estado === "invalida") return respostaErroAcesso(503, "configuracao_incompleta");
    if (!origemDaRequisicao(req, config.origens)) return respostaErroAcesso(403, "origem_recusada");
    if (!ehRotaPublica(req.method, new URL(req.url).pathname)) {
      if (!(await sessaoValida(lerCookie(req.headers, NOME_COOKIE_SESSAO), config))) {
        return respostaErroAcesso(401, "nao_autenticado");
      }
    }
    return handler(req, ctx);
  };
}
