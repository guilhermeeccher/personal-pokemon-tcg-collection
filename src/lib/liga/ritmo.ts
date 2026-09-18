/**
 * O ritmo do coletor da LigaPokemon — de onde sai o intervalo entre duas
 * requisições, e o que impede uma requisição de sair para rota proibida.
 *
 * Server-only (faz `fetch` contra terceiro): nunca importado por componente
 * `"use client"`. O parser do arquivo é puro e mora em `lib/dominio/robots.ts`.
 *
 * ## A decisão: o padrão obedece o robots.txt
 *
 * Até aqui o coletor usava **uma requisição a cada 3 segundos**, decisão
 * consciente de 2026-09-02, ciente de que o `robots.txt` deles pede
 * `Crawl-delay: 360`. Essa conta fecha para **uma** pessoa rodando na própria
 * máquina. O projeto passou a ser distribuído, e aí a mesma conta vira N
 * instalações fazendo o mesmo contra o site de terceiro — risco que ninguém
 * que clonou escolheu assumir.
 *
 * Então o padrão passou a ser o que o arquivo deles pede. E o número **não é
 * fixo no código**: é lido ao vivo. Se eles afrouxarem, todo mundo se
 * beneficia no mesmo dia; se apertarem, todo mundo obedece no mesmo dia.
 *
 * ## Três fontes, nesta ordem
 *
 * 1. **`LIGA_INTERVALO_SEGUNDOS`** — presente, vale. É escolha explícita de
 *    quem instalou, e o risco é de quem escolhe (o `.env.example` diz isso com
 *    todas as letras).
 * 2. **`Crawl-delay` do `robots.txt` deles**, lido ao vivo e cacheado.
 * 3. **O valor conservador**, quando não há leitura boa e recente.
 *
 * ## Falha de leitura nunca afrouxa
 *
 * Rede fora, 5xx, HTML de erro no lugar do arquivo, `Crawl-delay` ausente: tudo
 * cai no conservador, nunca no agressivo. É a assimetria que importa — errar
 * esperando demais custa tempo nosso; errar esperando de menos custa o IP de
 * quem instalou, e a reputação de um projeto que se diz educado.
 *
 * ## Rotas: a garantia é dupla, de propósito
 *
 * A lista fixa de rotas proibidas continua existindo e é checada sempre, mesmo
 * com o arquivo fora do ar. Por cima dela vale o que o arquivo lido disser — e
 * é isso que faz uma proibição nova deles valer sem release nosso. As duas
 * juntas: o arquivo pode **acrescentar** proibição, nunca **remover** a que já
 * está cravada aqui.
 */

import {
  caminhoDeUrl,
  caminhoPermitido,
  parsearRobots,
  type RegrasRobots,
} from "@/lib/dominio/robots";

export const URL_ROBOTS_LIGA = "https://www.ligapokemon.com.br/robots.txt";

/**
 * O intervalo que vale quando não há leitura boa e recente do arquivo.
 *
 * É o `Crawl-delay` que eles declaravam quando isto foi escrito. Não está aqui
 * como "o valor certo" — está como **piso de segurança**: sem saber o que eles
 * pedem hoje, o coletor se comporta como se pedissem o que pediam ontem.
 */
export const INTERVALO_CONSERVADOR_SEGUNDOS = 360;

/**
 * Piso quando o arquivo pede menos que isso.
 *
 * `Crawl-delay: 0` (ou um valor sub-segundo) é permissão para não esperar;
 * nós esperamos assim mesmo. Ser mais lento do que o arquivo pede nunca
 * desobedece o arquivo — e um cliente de raspagem sem nenhum intervalo é
 * exatamente o padrão que rendeu bloqueio de IP a este projeto em agosto.
 * O `LIGA_INTERVALO_SEGUNDOS` **não** passa por este piso: lá a escolha é
 * explícita e tem dono.
 */
export const INTERVALO_MINIMO_SEGUNDOS = 1;

/**
 * Validade do cache da leitura. Curta de propósito: uma varredura de 16 horas
 * precisa enxergar um aperto que eles publiquem no meio dela. São ~4 leituras
 * por hora contra um arquivo estático — custo irrelevante perto do que a
 * varredura já gasta, e `robots.txt` é o único caminho que nenhum `robots.txt`
 * proíbe.
 */
export const VALIDADE_CACHE_MS = 15 * 60_000;

const TIMEOUT_MS = 15_000;

export const USER_AGENT_LIGA =
  "colecao-pokemon/1.0 (colecao pessoal, uso nao comercial; consulta de preco)";

/**
 * As rotas que o `robots.txt` deles proíbe, cravadas aqui.
 *
 * Nada no código toca nelas e nada deve passar a tocar. Esta lista é a rede
 * que continua valendo quando o arquivo não pôde ser lido — o caso em que
 * derivar do arquivo sozinho diria "pode tudo".
 */
export const ROTAS_PROIBIDAS = ["cards/pricehistory", "bzr/", "colecao/", "ecom/"] as const;

export type OrigemIntervalo = "env" | "robots" | "conservador";

export interface EstadoRitmo {
  intervaloSegundos: number;
  origem: OrigemIntervalo;
  /** Última leitura bem-sucedida do arquivo, ou `null` se nunca houve uma. */
  regras: RegrasRobots | null;
  lidoEm: Date | null;
}

export interface RitmoLiga {
  /** O estado corrente, **sem I/O** — é o que a tela e o limitador consultam. */
  atual(): EstadoRitmo;
  /** Relê o `robots.txt` se o cache venceu, e devolve o estado resultante. */
  atualizar(): Promise<EstadoRitmo>;
  /** Estoura se a URL bate em rota proibida. Chamado antes de cada requisição. */
  exigirRotaPermitida(url: string): void;
}

/**
 * Requisição barrada antes de sair. Não é erro de rede: é o coletor se
 * recusando a pedir o que não pode pedir.
 */
export class ErroRotaProibidaLiga extends Error {
  constructor(
    readonly url: string,
    motivo: string,
  ) {
    super(
      `Requisição à LigaPokemon barrada por nós mesmos (${motivo}): ${url}. ` +
        `As rotas permitidas são cards/search e cards/card; ver lib/liga/ritmo.ts.`,
    );
    this.name = "ErroRotaProibidaLiga";
  }
}

export interface OpcoesRitmoLiga {
  fetchImpl?: typeof fetch;
  agora?: () => number;
  /** De onde sai o intervalo configurado. Injetável para o teste não mexer no ambiente. */
  lerIntervaloConfigurado?: () => string | undefined;
  validadeCacheMs?: number;
  /** Onde o aviso de leitura falha é registrado. */
  avisar?: (mensagem: string) => void;
}

/**
 * A checagem que não depende de leitura nenhuma. Vale sempre, inclusive com o
 * arquivo deles fora do ar.
 */
function exigirRotaNaoProibida(url: string): void {
  const caminho = caminhoDeUrl(url).toLowerCase();
  const proibida = ROTAS_PROIBIDAS.find((rota) => caminho.includes(rota));
  if (proibida !== undefined) {
    throw new ErroRotaProibidaLiga(url, `rota proibida: ${proibida}`);
  }
}

function intervaloConfigurado(bruto: string | undefined): number | null {
  if (bruto === undefined || bruto.trim() === "") return null;
  const numero = Number(bruto.trim().replace(",", "."));
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return numero;
}

export function criarRitmoLiga({
  fetchImpl = fetch,
  agora = () => Date.now(),
  lerIntervaloConfigurado = () => process.env.LIGA_INTERVALO_SEGUNDOS,
  validadeCacheMs = VALIDADE_CACHE_MS,
  avisar = (mensagem) => console.warn(mensagem),
}: OpcoesRitmoLiga = {}): RitmoLiga {
  /** Última leitura bem-sucedida. Guardada mesmo depois de vencer — ver `atual`. */
  let regras: RegrasRobots | null = null;
  let lidoEm: number | null = null;
  /** Última tentativa, dê certo ou não: é o que impede marretar o arquivo deles. */
  let tentadoEm: number | null = null;
  let emVoo: Promise<void> | null = null;

  function atual(): EstadoRitmo {
    const instante = agora();
    const doEnv = intervaloConfigurado(lerIntervaloConfigurado());
    const carimbo = lidoEm === null ? null : new Date(lidoEm);

    if (doEnv !== null) {
      return { intervaloSegundos: doEnv, origem: "env", regras, lidoEm: carimbo };
    }

    // Leitura vencida vale zero para decidir ritmo: entre repetir um número que
    // pode ter mudado e esperar mais, esperamos mais.
    const fresca = lidoEm !== null && instante - lidoEm <= validadeCacheMs;
    const doArquivo = fresca ? regras?.crawlDelaySegundos ?? null : null;

    if (doArquivo !== null) {
      return {
        intervaloSegundos: Math.max(doArquivo, INTERVALO_MINIMO_SEGUNDOS),
        origem: "robots",
        regras,
        lidoEm: carimbo,
      };
    }

    return {
      intervaloSegundos: INTERVALO_CONSERVADOR_SEGUNDOS,
      origem: "conservador",
      regras,
      lidoEm: carimbo,
    };
  }

  async function buscar(): Promise<void> {
    tentadoEm = agora();
    try {
      const resposta = await fetchImpl(URL_ROBOTS_LIGA, {
        headers: { "User-Agent": USER_AGENT_LIGA },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

      const lidas = parsearRobots(await resposta.text(), USER_AGENT_LIGA);
      regras = lidas;
      lidoEm = agora();

      if (lidas.crawlDelaySegundos === null) {
        avisar(
          `[liga] robots.txt lido, mas sem Crawl-delay para o nosso agente: ` +
            `vale o intervalo conservador de ${INTERVALO_CONSERVADOR_SEGUNDOS}s.`,
        );
      }
    } catch (err) {
      // A leitura anterior é mantida para a checagem de rota (uma proibição
      // conhecida continua valendo), mas não serve mais para afrouxar o ritmo:
      // `atual()` só usa `regras` enquanto a leitura está fresca.
      avisar(
        `[liga] robots.txt não pôde ser lido (${
          err instanceof Error ? err.message : String(err)
        }): vale o intervalo conservador de ${INTERVALO_CONSERVADOR_SEGUNDOS}s.`,
      );
    }
  }

  async function atualizar(): Promise<EstadoRitmo> {
    if (tentadoEm !== null && agora() - tentadoEm < validadeCacheMs) return atual();

    // Uma leitura por vez: a varredura chama isto antes de cada requisição, e
    // duas leituras simultâneas do mesmo arquivo seriam gasto à toa na porta
    // deles.
    if (emVoo === null) {
      emVoo = buscar().finally(() => {
        emVoo = null;
      });
    }
    await emVoo;
    return atual();
  }

  function exigirRotaPermitida(url: string): void {
    exigirRotaNaoProibida(url);

    if (regras !== null && !caminhoPermitido(regras, caminhoDeUrl(url))) {
      throw new ErroRotaProibidaLiga(url, "o robots.txt deles não permite esta rota");
    }
  }

  return { atual, atualizar, exigirRotaPermitida };
}

/**
 * Ritmo de intervalo fixo, sem ler nada.
 *
 * Serve ao teste e a quem quiser cravar o valor em código. A checagem fixa de
 * rota continua valendo — ela não é negociável por configuração.
 */
export function criarRitmoFixo(intervaloSegundos: number): RitmoLiga {
  const estado = (): EstadoRitmo => ({
    intervaloSegundos,
    origem: "env",
    regras: null,
    lidoEm: null,
  });
  return {
    atual: estado,
    atualizar: async () => estado(),
    exigirRotaPermitida: exigirRotaNaoProibida,
  };
}

/**
 * A instância do processo. Compartilhada de propósito: o cache da leitura e a
 * decisão de ritmo valem para toda varredura deste processo, não por rodada.
 */
let padrao: RitmoLiga | null = null;

export function ritmoLigaPadrao(): RitmoLiga {
  return (padrao ??= criarRitmoLiga());
}
