/**
 * Cliente HTTP fino para a TCGdex (spec §2, contrato do sync no AGENTS.md).
 * Base: https://api.tcgdex.net/v2/<idioma>/ — sem chave.
 * Confirmado ao vivo em 2026-08-24:
 *  - GET /sets                traz só id/name/cardCount (lista breve).
 *  - GET /sets/{id}            traz a lista de cartas do set — mas só com
 *                               id/localId/name/image (também breve).
 *  - GET /cards/{id}           é a ÚNICA forma de obter category, rarity,
 *                               dexId, variants e illustrator — os campos
 *                               que carta_catalogo precisa (spec §3.1).
 * Por isso o sync faz 1 request por set e mais 1 request por carta.
 *
 * **Educação de cliente (2026-08-25/26).** A API não declara rate limit, mas
 * tem firewall: rodamos ~35.000 requisições sem intervalo e o nosso IP foi
 * bloqueado (connection refused para nós, 200 para o resto do mundo). Daí as
 * três regras aplicadas aqui, que não devem ser afrouxadas sem motivo:
 *   1. Teto global de requisições por segundo (`criarLimitador`).
 *   2. User-Agent identificando quem somos — cliente anônimo em volume é o
 *      perfil que firewall bloqueia primeiro.
 *   3. Bloqueio aborta o sync na hora, em vez de virar retry.
 */

import {
  ErroBloqueioUpstream,
  classificarErro,
  classificarStatus,
} from "@/lib/dominio/bloqueio-upstream";

import { criarLimitador } from "./limitador";

export type Idioma = "pt" | "en" | "jp";

const BASE_URL = "https://api.tcgdex.net/v2";
const TENTATIVAS = 3;
const BACKOFF_MS = 300;

/**
 * Teto de requisições por segundo. Padrão conservador: o limite real deles é
 * desconhecido e o custo de errar para cima já foi pago uma vez.
 */
const TAXA_POR_SEGUNDO = Number(process.env.SYNC_REQ_POR_SEGUNDO) || 6;

const USER_AGENT =
  process.env.SYNC_USER_AGENT ??
  "colecao-pokemon/1.0 (uso pessoal, catalogo local)";

const limitador = criarLimitador({ porSegundo: TAXA_POR_SEGUNDO });

export interface SetBreve {
  id: string;
  name: string;
  cardCount: { total: number; official: number };
}

export interface CardBreve {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

export interface SetDetalhado {
  id: string;
  name: string;
  serie: { id: string; name: string };
  cardCount: { total: number; official: number };
  cards: CardBreve[];
  /**
   * Sigla impressa na carta (ex.: "MEW" no 151) e data de lançamento
   * (ISO "YYYY-MM-DD"). Confirmados ao vivo em 2026-08-25 em
   * GET /v2/en/sets/sv03.5 — existem mesmo em sets sem cards traduzidos
   * (metadado de SET, não de carta). Ambos opcionais: algum set antigo ou
   * promocional pode não ter abbreviation.official no upstream — nunca
   * inventamos um valor quando falta.
   */
  abbreviation?: { official?: string };
  releaseDate?: string;
}

export interface VariantesCarta {
  normal: boolean;
  reverse: boolean;
  holo: boolean;
  firstEdition: boolean;
  wPromo: boolean;
}

export interface CardDetalhado {
  id: string;
  localId: string;
  name: string;
  image?: string;
  category: string;
  rarity?: string;
  illustrator?: string;
  dexId?: number[];
  variants?: VariantesCarta;
}

/** Erro de item que o sync pode pular sem abortar (404 e afins). */
export class ErroItemUpstream extends Error {}

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function buscarJson<T>(url: string): Promise<T> {
  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    await limitador.aguardarVez();

    let resposta: Response;
    try {
      resposta = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    } catch (err) {
      // Falha de socket. Bloqueio aborta o sync inteiro na hora; oscilação
      // vale uma nova tentativa.
      if (classificarErro(err) === "bloqueio") {
        throw new ErroBloqueioUpstream(`falha de conexão em ${url}`);
      }
      ultimoErro = err;
      if (tentativa < TENTATIVAS) await esperar(BACKOFF_MS * tentativa);
      continue;
    }

    if (resposta.ok) {
      try {
        return (await resposta.json()) as T;
      } catch (err) {
        ultimoErro = err;
        if (tentativa < TENTATIVAS) await esperar(BACKOFF_MS * tentativa);
        continue;
      }
    }

    const classe = classificarStatus(resposta.status);
    if (classe === "bloqueio") {
      throw new ErroBloqueioUpstream(`HTTP ${resposta.status} em ${url}`);
    }
    if (classe === "permanente") {
      // 404 e afins: repetir não muda a resposta. O sync pula o item.
      throw new ErroItemUpstream(`HTTP ${resposta.status} em ${url}`);
    }
    ultimoErro = new Error(`HTTP ${resposta.status} em ${url}`);
    if (tentativa < TENTATIVAS) await esperar(BACKOFF_MS * tentativa);
  }
  throw ultimoErro instanceof Error
    ? ultimoErro
    : new Error(`Falha desconhecida ao buscar ${url}`);
}

/**
 * Código de idioma na URL da TCGdex. Nosso enum de banco usa `jp` (há dado
 * real gravado com ele), mas a API só aceita o ISO `ja` — `jp` responde
 * 404 `language-invalid`. Desempatado em 2026-08-26 por proxy externo, com a
 * API ainda bloqueada para o nosso IP. Traduza aqui, nunca renomeie o enum.
 */
export function codigoIdiomaUpstream(idioma: Idioma): string {
  return idioma === "jp" ? "ja" : idioma;
}

export function listarSets(idioma: Idioma): Promise<SetBreve[]> {
  return buscarJson<SetBreve[]>(
    `${BASE_URL}/${codigoIdiomaUpstream(idioma)}/sets`,
  );
}

export function obterSet(idioma: Idioma, setId: string): Promise<SetDetalhado> {
  return buscarJson<SetDetalhado>(
    `${BASE_URL}/${codigoIdiomaUpstream(idioma)}/sets/${setId}`,
  );
}

export function obterCarta(
  idioma: Idioma,
  cardId: string,
): Promise<CardDetalhado> {
  return buscarJson<CardDetalhado>(
    `${BASE_URL}/${codigoIdiomaUpstream(idioma)}/cards/${cardId}`,
  );
}
