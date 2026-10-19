/**
 * A decisão do proxy (`src/proxy.ts`) com o acesso por senha: dada a
 * requisição, a configuração e um jeito de conferir a sessão, o que fazer.
 *
 * Pura, para ser testada sem o Next rodando: o proxy só lê a requisição,
 * chama esta função e traduz a decisão em resposta. Toda regra fica aqui.
 *
 * A ordem das perguntas importa e é esta:
 *
 * 1. Módulo desligado → nada muda. Nem cabeçalho, nem reescrita: a
 *    existência do proxy não pode alterar resposta nenhuma de quem não ligou
 *    o módulo. A única exceção serve justamente a isso: nos caminhos do
 *    próprio módulo (`ehCaminhoDoModulo`) o proxy marca a requisição com
 *    `CABECALHO_DESLIGADO`, e a reescrita de configuração do
 *    `next.config.ts` a manda para uma pasta privada — o 404 de hoje,
 *    idêntico, em qualquer método. O porquê e a lista estão em
 *    `caminhos-modulo.ts`.
 * 2. Configuração incompleta → 503 em tudo (falha fechada). Cair para
 *    "desligado" publicaria o app aberto por um erro de digitação no `.env`.
 * 3. Origem, em todo método que altera dados — **antes** da lista pública,
 *    porque entrar (`POST /api/sessao`) também é protegido contra
 *    requisição forjada vinda de outro site.
 * 4. Rota pública (`ehRotaPublica`, por método **e** caminho) → segue.
 * 5. Sessão válida → segue.
 * 6. Sem sessão: API, RSC, prefetch ou método que não é leitura → 401 em
 *    JSON; página → 307 para o login, com o `volta`.
 *
 * O proxy é a primeira de três camadas (as outras: `exigirSessao` em cada
 * página e `comAcesso` em cada route handler). Se um desvio no Next fizer
 * uma requisição pular o proxy — já aconteceu em versões passadas, pelo
 * cabeçalho `x-middleware-subrequest` —, quem segura são as outras duas.
 */
import { CABECALHO_DESLIGADO, ehCaminhoDoModulo } from "./caminhos-modulo";
import type { ConfiguracaoAcesso } from "./configuracao";
import { origemPermitida } from "./origem";
import { ehRotaPublica, normalizarCaminho } from "./rotas-publicas";
import { sanitizarVolta } from "./volta";

/** Em toda resposta que passa pelo proxy com o módulo ligado, inclusive
 *  401, 403, 307, 503 e as rotas públicas. */
export const CABECALHOS_SEGURANCA: Readonly<Record<string, string>> = {
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "Referrer-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
};

/** Nas respostas autenticadas, no login, nas APIs e nas de erro. */
export const CACHE_PRIVADO = "private, no-store";

/**
 * Cabeçalhos que só o próprio Next escreve, para conversar com ele mesmo.
 * Vindos de fora, são tentativa de enganar o roteador — o
 * `x-middleware-subrequest` é o caso conhecido: em versões passadas ele
 * fazia o Next pular o middleware inteiro.
 *
 * - **Todo `x-middleware-*`.** Nenhum cliente do App Router manda um
 *   (o `x-middleware-prefetch` é do Pages Router, que este app não usa).
 * - **Todo `x-nextjs-*`, menos dois.** O cliente do Next, em
 *   desenvolvimento, manda `x-nextjs-request-id` e `x-nextjs-html-request-id`
 *   em cada navegação (conferido no 16.3: `fetch-server-response.js`);
 *   recusá-los derrubaria a navegação no `next dev`. Eles só etiquetam a
 *   depuração e não mudam rota nenhuma.
 * - **A lista fixa que o próprio Next apaga da requisição de fora**
 *   (`filterInternalHeaders`, em `server-ipc/utils.js`) e não começa com
 *   esses prefixos.
 * - **O marcador deste módulo, `CABECALHO_DESLIGADO`.** Só o proxy o põe,
 *   e só com o módulo desligado; vindo de fora com o módulo ligado, conta
 *   como sem sessão e é tirado das rotas públicas, então a reescrita do
 *   `next.config.ts` nunca o vê.
 *
 * Por prefixo, e não por uma lista do que existe hoje, para um cabeçalho
 * interno novo de uma versão futura cair do lado protegido. O pior caso de
 * um falso positivo é pedir login a quem já tem sessão.
 */
const PREFIXOS_INTERNOS = ["x-middleware-", "x-nextjs-"] as const;
const INTERNOS_PERMITIDOS: ReadonlySet<string> = new Set(["x-nextjs-request-id", "x-nextjs-html-request-id"]);
const INTERNOS_AVULSOS: ReadonlySet<string> = new Set([
  "x-now-route-matches",
  "x-matched-path",
  "x-next-resume-state-length",
  "next-resume",
  CABECALHO_DESLIGADO,
]);

/** Os nomes (em minúsculas, como o `Headers` guarda) dos cabeçalhos
 *  internos do Next presentes na requisição. */
export function cabecalhosInternos(cabecalhos: Headers): string[] {
  const achados: string[] = [];
  for (const nome of cabecalhos.keys()) {
    if (INTERNOS_PERMITIDOS.has(nome)) continue;
    if (INTERNOS_AVULSOS.has(nome) || PREFIXOS_INTERNOS.some((p) => nome.startsWith(p))) achados.push(nome);
  }
  return achados;
}

/** O caminho do otimizador de imagens do Next (`next/image`). */
export const CAMINHO_OTIMIZADOR = "/_next/image";

/**
 * Com o módulo ligado, o otimizador só pode receber uma URL remota
 * `https:` absoluta (a lista do `remotePatterns`, só a TCGdex, ele mesmo
 * confere depois). Qualquer outra coisa é recusada **antes** de ele ver a
 * requisição — com ou sem sessão:
 *
 * o cache do otimizador não sabe da flag. Uma imagem local
 * (`/api/imagens-locais/...`) otimizada enquanto o módulo estava desligado
 * fica no cache em disco, e um acerto ali entrega os bytes sem buscar a
 * origem de novo — ou seja, sem passar pelo 401 do `comAcesso` — e com
 * `Cache-Control: public`. Barrando a URL local na entrada, o cache nunca
 * é consultado para ela com o módulo ligado.
 *
 * Nenhuma tela usa `next/image` (as locais são `<img>` comum, em
 * `imagem-carta-zoom.tsx`; os sprites também), então nada legítimo é
 * barrado.
 *
 * Recusa: `url` ausente ou repetida; relativa (`/api/...`); sem esquema
 * (`//host`); `http:` ou outro esquema; com espaço ou caractere de controle em
 * qualquer ponto (o `new URL` os aceitaria no caminho, como `%20`, e o
 * otimizador leria de outro jeito); e o que nem é URL.
 */
export function urlDoOtimizadorAceita(busca: string): boolean {
  const valores = new URLSearchParams(busca).getAll("url");
  if (valores.length !== 1) return false;
  const [url] = valores;
  if (/[\s\u0000-\u001f\u007f]/.test(url) || !/^https:\/\//.test(url)) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export interface RequisicaoProxy {
  metodo: string;
  /** O caminho como o Next o entrega ao proxy (`request.nextUrl.pathname`). */
  caminho: string;
  /** A query, com o `?` (ou vazia). */
  busca: string;
  cabecalhos: Headers;
}

export type DecisaoProxy =
  /** Módulo desligado: `NextResponse.next()` puro. */
  | { tipo: "intocada" }
  /** Módulo desligado num caminho do módulo: seguir com
   *  `CABECALHO_DESLIGADO`, que a reescrita do `next.config.ts` transforma
   *  no 404 de hoje. */
  | { tipo: "inexistente" }
  | { tipo: "configuracao_invalida" }
  /** `/_next/image` com uma `url` que não é remota `https:`: 400. */
  | { tipo: "imagem_recusada" }
  | { tipo: "recusar"; status: 401; codigo: "nao_autenticado" }
  | { tipo: "recusar"; status: 403; codigo: "origem_recusada" }
  | { tipo: "redirecionar"; destino: string }
  | {
      tipo: "seguir";
      /** Leva `Cache-Control: private, no-store`. */
      privada: boolean;
      /** Cabeçalhos internos a tirar da requisição antes de seguir. */
      remover: string[];
    };

const LEITURA = new Set(["GET", "HEAD"]);

/**
 * Sem sessão, o que recebe 401 em JSON em vez do 307 para o login: tudo o
 * que não é uma navegação de página feita pelo usuário. Redirecionar uma
 * chamada de `fetch` para o HTML do login só produz um erro de leitura de
 * JSON no cliente; o 401 é a resposta que o código da tela entende.
 *
 * - método fora de `GET`/`HEAD`: inclui a server action, que é um `POST`;
 * - API: o caminho normalizado é `/api` ou começa com `/api/`, ou nem
 *   normaliza (`null` = sem leitura segura; não há página com endereço
 *   desses);
 * - RSC e prefetch do roteador do Next (`RSC`, `Next-Router-State-Tree`,
 *   `Next-Router-Prefetch`, `Next-Router-Segment-Prefetch`, `?_rsc=`) e
 *   prefetch do navegador (`Purpose`/`Sec-Purpose` com `prefetch`).
 *   **Atenção:** no 16.3 o Next tira esses cabeçalhos e o `_rsc` da
 *   requisição **antes** de entregá-la ao proxy (`FLIGHT_HEADERS` e
 *   `stripInternalSearchParams`, em `server/web/adapter.js`), então na
 *   prática o proxy não os vê. Ficam aqui porque são a definição certa e
 *   porque uma versão futura pode deixar de tirá-los;
 * - por isso o sinal que de fato separa navegação de `fetch` é o
 *   `Sec-Fetch-Mode`, que todo navegador atual manda e o Next não tira:
 *   uma navegação de página é `navigate`; o `fetch` do roteador (RSC e
 *   prefetch) é `cors` ou `same-origin`, e uma `<img>` é `no-cors`. Sem o
 *   cabeçalho (`curl`, navegador antigo), vale o caminho e o método.
 */
export function esperaJson({ metodo, caminho, busca, cabecalhos }: RequisicaoProxy): boolean {
  if (!LEITURA.has(metodo)) return true;

  const normalizado = normalizarCaminho(caminho);
  if (normalizado === null || normalizado === "/api" || normalizado.startsWith("/api/")) return true;

  for (const nome of ["rsc", "next-router-state-tree", "next-router-prefetch", "next-router-segment-prefetch"]) {
    if (cabecalhos.has(nome)) return true;
  }
  if (new URLSearchParams(busca).has("_rsc")) return true;
  for (const nome of ["purpose", "sec-purpose"]) {
    if (cabecalhos.get(nome)?.toLowerCase().includes("prefetch")) return true;
  }

  const modo = cabecalhos.get("sec-fetch-mode");
  return modo !== null && modo.toLowerCase() !== "navigate";
}

/**
 * O destino do 307. O `volta` é o caminho com a query, como o usuário
 * pediu, depois de `sanitizarVolta`; quando ela devolve `/` (o padrão do
 * login), o parâmetro nem vai — `/login` sozinho é o mesmo destino.
 */
export function destinoLogin({ caminho, busca }: Pick<RequisicaoProxy, "caminho" | "busca">): string {
  const volta = sanitizarVolta(caminho + busca);
  return volta === "/" ? "/login" : `/login?volta=${encodeURIComponent(volta)}`;
}

/** As rotas públicas que ainda assim não entram em cache: o login (a
 *  resposta muda com a sessão) e as APIs. Ícones, manifesto e `robots.txt`
 *  podem ser guardados pelo navegador. */
function publicaPrivada(caminho: string): boolean {
  return caminho === "/login" || caminho.startsWith("/api/");
}

export async function decidirProxy(
  req: RequisicaoProxy,
  config: ConfiguracaoAcesso,
  verificarSessao: () => Promise<boolean>,
): Promise<DecisaoProxy> {
  if (config.estado === "desligado") {
    return ehCaminhoDoModulo(req.caminho) ? { tipo: "inexistente" } : { tipo: "intocada" };
  }
  if (config.estado === "invalida") return { tipo: "configuracao_invalida" };

  const origemOk = origemPermitida(
    {
      metodo: req.metodo,
      origin: req.cabecalhos.get("origin"),
      referer: req.cabecalhos.get("referer"),
    },
    config.origens,
  );
  if (!origemOk) return { tipo: "recusar", status: 403, codigo: "origem_recusada" };

  // Antes da sessão, de propósito: com sessão também (ver
  // `urlDoOtimizadorAceita`).
  if (req.caminho === CAMINHO_OTIMIZADOR && !urlDoOtimizadorAceita(req.busca)) {
    return { tipo: "imagem_recusada" };
  }

  const internos = cabecalhosInternos(req.cabecalhos);

  /* Pública segue mesmo com cabeçalho interno — ela não depende de sessão
     —, mas sem ele: o que vem de fora não chega ao roteador. */
  if (ehRotaPublica(req.metodo, req.caminho)) {
    return { tipo: "seguir", privada: publicaPrivada(req.caminho), remover: internos };
  }

  /* Com cabeçalho interno, a requisição conta como sem sessão, mesmo com
     um cookie válido: ninguém legítimo manda isso, e seguir com ele seria
     confiar que o Next o ignora. */
  if (internos.length === 0 && (await verificarSessao())) {
    return { tipo: "seguir", privada: true, remover: [] };
  }

  if (esperaJson(req)) return { tipo: "recusar", status: 401, codigo: "nao_autenticado" };
  return { tipo: "redirecionar", destino: destinoLogin(req) };
}

/** Põe os cabeçalhos de segurança (e o cache privado, quando for o caso)
 *  numa resposta já montada. `set`, não `append`: o valor é o nosso. */
export function aplicarCabecalhosSeguranca(cabecalhos: Headers, privada: boolean): void {
  for (const [nome, valor] of Object.entries(CABECALHOS_SEGURANCA)) cabecalhos.set(nome, valor);
  if (privada) cabecalhos.set("Cache-Control", CACHE_PRIVADO);
}

/**
 * A página do 503 da configuração incompleta: estática, nas duas línguas,
 * sem dizer qual variável falhou (isso vai para o log do servidor) e sem
 * passar pelo `next-intl`, que dependeria do app que justamente não deve
 * abrir.
 */
export const HTML_CONFIGURACAO_INCOMPLETA = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Configuração incompleta · Incomplete configuration</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5}</style>
</head>
<body>
<h1>Configuração incompleta</h1>
<p>O acesso por senha está ligado, mas a configuração do servidor está incompleta. Quem administra a instalação encontra o motivo no log do servidor.</p>
<h1 lang="en">Incomplete configuration</h1>
<p lang="en">Password access is turned on, but the server configuration is incomplete. Whoever runs this installation will find the reason in the server log.</p>
</body>
</html>
`;
