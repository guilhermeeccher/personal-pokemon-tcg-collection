/**
 * Cliente HTTP da busca da LigaPokemon. Server-only (usa `fetch` contra
 * terceiro) — nunca importado por componente `"use client"`.
 *
 * ## Ritmo — quem manda é o robots.txt deles
 *
 * O intervalo entre duas requisições **não é constante neste arquivo**: sai de
 * `./ritmo.ts`, que lê o `robots.txt` deles ao vivo. Hoje isso significa
 * `Crawl-delay: 360`; se eles mudarem, muda com eles. O
 * `LIGA_INTERVALO_SEGUNDOS` sobrepõe, como escolha explícita de quem instalou.
 *
 * O que mudou, e por quê: até 2026-09-18 o valor era **uma requisição a cada
 * 3 segundos**, decisão consciente de quem rodava o projeto na própria
 * máquina, ciente da diferença. Publicado, o mesmo padrão viraria N
 * instalações fazendo o mesmo contra o site deles — risco que quem clona não
 * escolheu. O padrão passou a ser o que o arquivo pede; o valor antigo
 * continua disponível, mas agora tem dono.
 *
 * O `robots.txt` **permite** `cards/search` e `cards/card`; proíbe
 * `cards/pricehistory`, `bzr/`, `colecao/` e `ecom/`. Nada aqui toca nas
 * proibidas, e nada aqui deve passar a tocar — agora com checagem em tempo de
 * execução, antes de a requisição sair (`exigirRotaPermitida`).
 *
 * O jitter não é enfeite: requisição em intervalo exato é assinatura de robô e
 * é o que dispara regra de borda. O limitador garante o teto; o jitter tira a
 * regularidade.
 *
 * ## Bloqueio aborta, nunca insiste
 *
 * Mesma regra do sync da TCGdex, pelo mesmo motivo — este servidor já levou
 * bloqueio de IP em agosto por insistir. 403/429 e falha de socket param a
 * varredura inteira na hora, sem retry.
 */

import {
  classificarErro,
  classificarStatus,
} from "@/lib/dominio/bloqueio-upstream";
import {
  contarBlocosBusca,
  deveBuscarProximaPagina,
  parsearBuscaLiga,
  urlBuscaLiga,
  type LinhaBuscaLiga,
} from "@/lib/dominio/liga-busca";
import { deveBuscarProximaPaginaSet } from "@/lib/dominio/liga-set";
import { criarLimitador } from "@/lib/sync/limitador";
import { ritmoLigaPadrao, USER_AGENT_LIGA, type RitmoLiga } from "./ritmo";

/** Ruído somado ao intervalo, para a cadência não ser um metrônomo. */
const JITTER_MS = 1_500;
const TIMEOUT_MS = 30_000;

/**
 * Teto de páginas por espécie. Com `orderBy=7` as mais baratas vêm primeiro,
 * então passar disso significa que o teto de preço é alto o bastante para a
 * lista inteira — e aí a varredura vira um custo que ninguém pediu.
 */
const MAX_PAGINAS = 3;

export class ErroBloqueioLiga extends Error {
  constructor(readonly motivo: string) {
    super(
      `Acesso à LigaPokemon barrado (${motivo}). Varredura abortada de ` +
        `propósito: insistir renova o bloqueio. Ver o incidente de 2026-08-25 ` +
        `com a TCGdex em lib/dominio/bloqueio-upstream.ts.`,
    );
    this.name = "ErroBloqueioLiga";
  }
}

export interface OpcoesClienteLiga {
  fetchImpl?: typeof fetch;
  dormir?: (ms: number) => Promise<void>;
  aleatorio?: () => number;
  /** De onde sai o intervalo e a checagem de rota. Injetável para teste. */
  ritmo?: RitmoLiga;
}

export interface ResultadoBusca {
  linhas: LinhaBuscaLiga[];
  /** Requisições gastas — o número que diz se estamos pesando na porta deles. */
  requisicoes: number;
}

export interface ClienteLiga {
  /** Vaga de Pokédex: todas as cartas baratas da espécie servem como opção. */
  buscarEspecie(especie: string, tetoPreco: number | null): Promise<ResultadoBusca>;
  /**
   * Vaga de set: procura uma carta específica pelo nome e para na página em
   * que `achou` reconhecer a linha certa. O teto de preço **não** encerra a
   * paginação aqui — a ordenação é por preço crescente, e a carta do set pode
   * ser a mais cara do nome (ver `lib/dominio/liga-set.ts`).
   */
  buscarCarta(
    nome: string,
    achou: (linhas: readonly LinhaBuscaLiga[]) => boolean,
  ): Promise<ResultadoBusca>;
}

export function criarClienteLiga({
  fetchImpl = fetch,
  dormir = (ms) => new Promise((r) => setTimeout(r, ms)),
  aleatorio = Math.random,
  ritmo = ritmoLigaPadrao(),
}: OpcoesClienteLiga = {}): ClienteLiga {
  // Taxa em função, e não número: o `Crawl-delay` deles é relido durante a
  // rodada, e uma varredura de 16 horas precisa obedecer um aperto publicado
  // no meio dela.
  const limitador = criarLimitador({
    porSegundo: () => 1 / ritmo.atual().intervaloSegundos,
    dormir,
  });

  async function pegar(url: string): Promise<string> {
    // Antes de qualquer espera: relê o arquivo se o cache venceu e recusa a
    // requisição se a rota não pode. Barrar depois de esperar 6 minutos seria
    // a mesma recusa, só que tarde.
    await ritmo.atualizar();
    ritmo.exigirRotaPermitida(url);

    await limitador.aguardarVez();
    await dormir(aleatorio() * JITTER_MS);

    let resposta: Response;
    try {
      resposta = await fetchImpl(url, {
        headers: { "User-Agent": USER_AGENT_LIGA, "Accept-Language": "pt-BR,pt;q=0.9" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (classificarErro(err) === "bloqueio") {
        throw new ErroBloqueioLiga(`falha de socket: ${(err as Error).message}`);
      }
      throw err;
    }

    if (!resposta.ok) {
      const classe = classificarStatus(resposta.status);
      if (classe === "bloqueio") throw new ErroBloqueioLiga(`HTTP ${resposta.status}`);
      throw new Error(`Busca na LigaPokemon respondeu HTTP ${resposta.status}`);
    }

    return resposta.text();
  }

  return {
    async buscarEspecie(especie, tetoPreco) {
      const linhas: LinhaBuscaLiga[] = [];
      let requisicoes = 0;

      for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
        const html = await pegar(urlBuscaLiga(especie, pagina));
        requisicoes++;
        const daPagina = parsearBuscaLiga(html);
        linhas.push(...daPagina);
        if (!deveBuscarProximaPagina({ blocos: contarBlocosBusca(html), linhas: daPagina }, tetoPreco))
          break;
      }

      return { linhas, requisicoes };
    },

    async buscarCarta(nome, achou) {
      const linhas: LinhaBuscaLiga[] = [];
      let requisicoes = 0;

      for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
        const html = await pegar(urlBuscaLiga(nome, pagina));
        requisicoes++;
        const daPagina = parsearBuscaLiga(html);
        linhas.push(...daPagina);
        if (!deveBuscarProximaPaginaSet({ blocos: contarBlocosBusca(html), achou: achou(linhas) }))
          break;
      }

      return { linhas, requisicoes };
    },
  };
}
