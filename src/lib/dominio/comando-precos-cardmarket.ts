/**
 * O que é puro no comando `pnpm precos:cardmarket` (`scripts/precos-cardmarket.ts`):
 * ler os argumentos, montar a linha de JSON, o resumo legível e o código de
 * saída. A rodada em si é a do botão (`iniciarRodadaCardmarket` e
 * `executarRodadaCardmarket`, em `lib/cardmarket/precos.ts`); aqui não há
 * banco nem rede.
 *
 * ## Para quem o comando existe
 *
 * Para um agendador **de fora do app** — o `cron` do host, por exemplo —
 * chamar a atualização da fonte Cardmarket dentro do container
 * (`docker compose exec -T app pnpm precos:cardmarket --json`). Agendar é
 * permitido só nesta fonte: é uma API aberta, uma requisição por carta, uma
 * carta por vez, e um bloqueio aborta a rodada. Na Liga — raspagem de um site,
 * `Crawl-delay` de minutos, rodadas de horas — continua proibido (AGENTS.md).
 *
 * ## O contrato com o agendador
 *
 * Quem agenda lê duas coisas: o código de saída e, com `--json`, **uma linha**
 * de JSON no fim. Os dois existem para responder "preciso avisar alguém?":
 *
 * - `0` — a rodada rodou sem erro, **ou** foi recusada porque a rodada certa
 *   já rodou (`precosJaConsultados`), está rodando (`precosEmAndamento`) ou
 *   não tem o que consultar (`semCartasEspeciais`). Nada disso é falha: um
 *   clique no botão no mesmo dia, ou um inventário sem carta especial, não
 *   merece alarme toda semana.
 * - `1` — erro: cotação indisponível, bloqueio da TCGdex, exceção, ou rodada
 *   concluída com `erro` (bloqueio ou cartas que falharam).
 * - `2` — uso errado (argumento desconhecido, validade inválida) ou fonte
 *   errada: numa instalação Liga o comando gravaria tabelas que a tela não
 *   mostra, então ele recusa antes de tocar o banco.
 */

import type { CotacaoPtax } from "./cotacao-ptax";
import { VALIDADE_CONSULTA_HORAS } from "./frescor-consulta";
import type { PontoDaSerie } from "./historico-precos";
import type { Recusa } from "./recusa";

export const SAIDA_OK = 0;
export const SAIDA_ERRO = 1;
export const SAIDA_USO = 2;

export const USO_PRECOS_CARDMARKET = [
  "usage: pnpm precos:cardmarket [--json] [--simular] [--validade-horas N]",
  "",
  "  Runs one Cardmarket price round (PRECO_FONTE=cardmarket) and waits for it to finish.",
  "",
  "  --json               print one line of JSON at the end, for another program to read",
  "  --simular            no network, no writes: say how many cards would be looked up and skipped",
  `  --validade-horas N   skip cards looked up in the last N hours (default ${VALIDADE_CONSULTA_HORAS})`,
  "",
  "  exit codes: 0 ok (also: already looked up, a round already running, nothing to look up),",
  "              1 error, 2 wrong usage or wrong price source",
].join("\n");

export interface ArgumentosPrecosCardmarket {
  json: boolean;
  simular: boolean;
  ajuda: boolean;
  validadeHoras: number;
}

/**
 * Horas de validade, pela mesma regra do `POST` da rota: um número não
 * negativo. Só dígitos e um ponto — `Number("")` daria 0 e `Number("1e3")`
 * daria mil, e nenhum dos dois é o que alguém quis dizer num `crontab`.
 */
function lerHoras(texto: string | undefined): number | null {
  if (texto === undefined || !/^\d+(\.\d+)?$/.test(texto)) return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lê `process.argv.slice(2)`. Aceita `--validade-horas N` e
 * `--validade-horas=N`, e ignora um `--` solto (há gerenciador de pacotes que
 * o repassa ao script). Qualquer outra coisa é uso errado: um agendador com
 * um argumento digitado errado tem de falhar alto, não rodar com o padrão.
 */
export function lerArgumentosPrecosCardmarket(
  argv: readonly string[],
): { ok: true; args: ArgumentosPrecosCardmarket } | { ok: false; erro: string } {
  const args: ArgumentosPrecosCardmarket = {
    json: false,
    simular: false,
    ajuda: false,
    validadeHoras: VALIDADE_CONSULTA_HORAS,
  };
  let validadeDada = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--json") args.json = true;
    else if (a === "--simular") args.simular = true;
    else if (a === "--help" || a === "-h") args.ajuda = true;
    else if (a === "--validade-horas" || a.startsWith("--validade-horas=")) {
      const texto = a.includes("=") ? a.slice(a.indexOf("=") + 1) : argv[++i];
      const horas = lerHoras(texto);
      if (horas === null) {
        return {
          ok: false,
          erro: `--validade-horas needs a non-negative number of hours, got ${texto === undefined ? "nothing" : `"${texto}"`}.`,
        };
      }
      if (validadeDada) return { ok: false, erro: "--validade-horas given more than once." };
      validadeDada = true;
      args.validadeHoras = horas;
    } else {
      return { ok: false, erro: `unknown argument "${a}".` };
    }
  }
  return { ok: true, args };
}

/** O que a rodada relatou ao terminar (`ResumoRodadaCardmarket`, sem a lista de falhas). */
export interface ResumoDaRodadaNoComando {
  cartasConsultadas: number;
  cartasComFalha: number;
  achadas: number;
  naoAchadas: number;
  requisicoes: number;
  erro?: string;
}

/** Como o comando terminou. */
export type DesfechoPrecosCardmarket =
  | {
      tipo: "recusada";
      recusa: Recusa;
      /** Em `precosEmAndamento`: a rodada que já roda. */
      rodadaId?: string;
      /** Em `cotacaoIndisponivel`: o motivo técnico. */
      detalhe?: string;
    }
  | {
      tipo: "rodada";
      rodadaId: string;
      resumo: ResumoDaRodadaNoComando;
      cotacao: CotacaoPtax;
      /** A foto que esta rodada deixou; `null` se a gravação dela falhou. */
      foto: PontoDaSerie | null;
      /** A foto anterior desta fonte que entra no gráfico (`fotoAnteriorNoGrafico`). */
      anterior: PontoDaSerie | null;
    }
  | { tipo: "erro"; erro: string; rodadaId?: string };

/**
 * Recusas que não são falha: a rodada certa já rodou, está rodando, ou não há
 * carta especial para consultar. Qualquer outra recusa — hoje,
 * `cotacaoIndisponivel` — é erro, porque a atualização da semana não
 * aconteceu e não vai acontecer sozinha.
 */
const RECUSAS_SEM_FALHA: ReadonlySet<string> = new Set([
  "precosJaConsultados",
  "precosEmAndamento",
  "semCartasEspeciais",
]);

/** 0 ou 1 (o 2, de uso ou fonte errada, é decidido antes de existir desfecho). */
export function codigoDeSaidaPrecosCardmarket(d: DesfechoPrecosCardmarket): number {
  switch (d.tipo) {
    case "recusada":
      return RECUSAS_SEM_FALHA.has(d.recusa.chave) ? SAIDA_OK : SAIDA_ERRO;
    case "rodada":
      return d.resumo.erro === undefined ? SAIDA_OK : SAIDA_ERRO;
    case "erro":
      return SAIDA_ERRO;
  }
}

/**
 * A foto mais recente da série (já filtrada pelo gráfico e em ordem de
 * tempo, `listarSerieDePrecos`) tirada **antes** de `antesDe` — a "anterior"
 * que o comando compara com a desta rodada. A desta rodada, quando entra no
 * gráfico, também está na série, e o "antes" estrito a deixa de fora.
 */
export function fotoAnteriorNoGrafico(
  serie: readonly PontoDaSerie[],
  antesDe: Date,
): PontoDaSerie | null {
  let anterior: PontoDaSerie | null = null;
  for (const p of serie) {
    const em = new Date(p.tiradoEm).getTime();
    if (em < antesDe.getTime() && (anterior === null || em >= new Date(anterior.tiradoEm).getTime())) {
      anterior = p;
    }
  }
  return anterior;
}

/** A linha de JSON do fim — o contrato com quem agenda. */
export interface SaidaJsonPrecosCardmarket {
  status: "ok" | "recusada" | "erro";
  recusa?: string;
  rodadaId?: string;
  cartasConsultadas: number;
  cartasComFalha: number;
  encontradas: number;
  naoEncontradas: number;
  requisicoes: number;
  erro?: string;
  cotacao?: { valor: number; data: string };
  /** A soma da foto desta rodada (no Cardmarket, a soma dos valores guardados). */
  soma?: number;
  cartasComPreco?: number;
  somaAnterior?: number | null;
  cartasComPrecoAnterior?: number | null;
  /** ISO 8601. */
  anteriorEm?: string | null;
  duracaoSegundos: number;
}

/** Segundos com uma casa decimal: o agendador não precisa de milissegundo. */
export function duracaoEmSegundos(ms: number): number {
  return Math.round(ms / 100) / 10;
}

const SEM_CONSULTA = {
  cartasConsultadas: 0,
  cartasComFalha: 0,
  encontradas: 0,
  naoEncontradas: 0,
  requisicoes: 0,
};

/**
 * Monta a linha. Os campos opcionais só aparecem quando têm o que dizer: a
 * soma só existe se a rodada deixou foto, e a anterior só existe numa rodada
 * que rodou (ela é `null`, e não ausente, quando esta é a primeira foto da
 * fonte). Os contadores estão sempre lá — zerados numa recusa.
 */
export function saidaJsonPrecosCardmarket(
  d: DesfechoPrecosCardmarket,
  duracaoSegundos: number,
): SaidaJsonPrecosCardmarket {
  switch (d.tipo) {
    case "recusada":
      return {
        status: "recusada",
        recusa: d.recusa.chave,
        ...(d.rodadaId !== undefined ? { rodadaId: d.rodadaId } : {}),
        ...SEM_CONSULTA,
        ...(d.detalhe !== undefined ? { erro: d.detalhe } : {}),
        duracaoSegundos,
      };
    case "erro":
      return {
        status: "erro",
        ...(d.rodadaId !== undefined ? { rodadaId: d.rodadaId } : {}),
        ...SEM_CONSULTA,
        erro: d.erro,
        duracaoSegundos,
      };
    case "rodada": {
      const { resumo: r, foto, anterior } = d;
      return {
        status: r.erro === undefined ? "ok" : "erro",
        rodadaId: d.rodadaId,
        cartasConsultadas: r.cartasConsultadas,
        cartasComFalha: r.cartasComFalha,
        encontradas: r.achadas,
        naoEncontradas: r.naoAchadas,
        requisicoes: r.requisicoes,
        ...(r.erro !== undefined ? { erro: r.erro } : {}),
        cotacao: { valor: d.cotacao.cotacao, data: d.cotacao.data },
        ...(foto !== null ? { soma: foto.somaMedios, cartasComPreco: foto.cartasComPreco } : {}),
        somaAnterior: anterior?.somaMedios ?? null,
        cartasComPrecoAnterior: anterior?.cartasComPreco ?? null,
        anteriorEm: anterior?.tiradoEm ?? null,
        duracaoSegundos,
      };
    }
  }
}

/** O que uma simulação conta, sem rede e sem gravar. */
export interface SimulacaoPrecosCardmarket {
  cartasParaConsultar: number;
  cartasPuladas: number;
  /** Todas as cartas especiais do inventário (as consultadas e as puladas). */
  cartasEspeciais: number;
  /** A rodada desta fonte viva agora, se houver. */
  rodadaEmAndamento: string | null;
  validadeHoras: number;
}

/**
 * A recusa que a rodada de verdade daria agora, na ordem dela — sem a da
 * cotação, que pede rede e a simulação não faz.
 */
export function recusaPrevista(
  s: SimulacaoPrecosCardmarket,
): "precosEmAndamento" | "semCartasEspeciais" | "precosJaConsultados" | null {
  if (s.rodadaEmAndamento !== null) return "precosEmAndamento";
  if (s.cartasEspeciais === 0) return "semCartasEspeciais";
  if (s.cartasParaConsultar === 0) return "precosJaConsultados";
  return null;
}

export function saidaJsonSimulacao(s: SimulacaoPrecosCardmarket, duracaoSegundos: number) {
  return {
    status: "simulacao" as const,
    cartasParaConsultar: s.cartasParaConsultar,
    cartasPuladas: s.cartasPuladas,
    validadeHoras: s.validadeHoras,
    rodadaEmAndamento: s.rodadaEmAndamento,
    recusaPrevista: recusaPrevista(s),
    duracaoSegundos,
  };
}

const reais = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "BRL" });

/** O texto em inglês de cada recusa, como o terminal mostra. */
function textoDaRecusa(r: Recusa, rodadaId: string | undefined): string {
  switch (r.chave) {
    case "precosEmAndamento":
      return `a Cardmarket round is already running${rodadaId ? ` (${rodadaId})` : ""}; nothing started.`;
    case "precosJaConsultados":
      return `all ${r.valores?.total ?? "the"} special cards were looked up in the last ${r.valores?.horas ?? "?"} h; nothing to do.`;
    case "semCartasEspeciais":
      return "no special card (anything but plain commons and uncommons) in the inventory; nothing to do.";
    case "cotacaoIndisponivel":
      return "could not get the euro exchange rate (Central Bank of Brazil PTAX); the round did not start.";
    default:
      return `refused: ${r.chave}.`;
  }
}

/** O resumo legível, sem `--json`. Linhas em inglês, como os outros comandos. */
export function resumoLegivelPrecosCardmarket(
  d: DesfechoPrecosCardmarket,
  duracaoSegundos: number,
): string[] {
  const duracao = `  duration: ${duracaoSegundos.toFixed(1)} s`;
  switch (d.tipo) {
    case "recusada":
      return [
        `precos:cardmarket — ${textoDaRecusa(d.recusa, d.rodadaId)}`,
        ...(d.detalhe !== undefined ? [`  reason: ${d.detalhe}`] : []),
        duracao,
      ];
    case "erro":
      return [
        `precos:cardmarket — failed${d.rodadaId ? ` (round ${d.rodadaId})` : ""}: ${d.erro}`,
        duracao,
      ];
    case "rodada": {
      const { resumo: r, foto, anterior } = d;
      const linhas = [
        r.erro === undefined
          ? `precos:cardmarket — round ${d.rodadaId} finished.`
          : `precos:cardmarket — round ${d.rodadaId} finished with errors.`,
        `  cards looked up: ${r.cartasConsultadas} (found ${r.achadas}, no Cardmarket price ${r.naoAchadas}), failed: ${r.cartasComFalha}, requests: ${r.requisicoes}`,
        `  exchange rate: EUR 1 = BRL ${d.cotacao.cotacao.toFixed(4)} (PTAX of ${d.cotacao.data})`,
      ];
      if (foto !== null) {
        linhas.push(`  total: ${reais(foto.somaMedios)} over ${foto.cartasComPreco} cards with a price`);
      }
      linhas.push(
        anterior === null
          ? "  previous: none (first point of the Cardmarket chart)"
          : `  previous: ${reais(anterior.somaMedios)} over ${anterior.cartasComPreco} cards, on ${anterior.tiradoEm}`,
      );
      if (r.erro !== undefined) linhas.push(`  error: ${r.erro}`);
      linhas.push(duracao);
      return linhas;
    }
  }
}

/** O resumo legível de uma simulação. */
export function resumoLegivelSimulacao(s: SimulacaoPrecosCardmarket): string[] {
  const prevista = recusaPrevista(s);
  return [
    "precos:cardmarket — SIMULATION, no network and nothing written:",
    `  would look up ${s.cartasParaConsultar} card(s) and skip ${s.cartasPuladas} looked up in the last ${s.validadeHoras} h`,
    ...(s.rodadaEmAndamento !== null ? [`  a round is running now: ${s.rodadaEmAndamento}`] : []),
    prevista === null
      ? "  a real run would fetch the PTAX and start a round"
      : `  a real run would be refused now: ${prevista}`,
  ];
}
