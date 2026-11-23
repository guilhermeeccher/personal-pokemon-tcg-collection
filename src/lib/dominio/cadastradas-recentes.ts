/**
 * "Cadastradas nos últimos 7 dias", da página inicial da v2 (decisão de
 * 2026-11-22). Módulo puro: a janela, o dia de cada cópia e a montagem do
 * bloco. A consulta mora em `lib/db/inicio-v2.ts`.
 *
 * - **Conta pela data de cadastro da cópia** (`copia.criado_em`), não pela
 *   data de aquisição que o usuário digita (opcional, e quase sempre vazia) nem
 *   pela data em que entrou numa vaga. É a resposta para "o que entrou no
 *   inventário esta semana".
 * - **Sete dias de calendário no fuso de São Paulo**: hoje e os seis dias
 *   anteriores, de 00:00 do primeiro até agora. Não são 168 horas corridas: uma
 *   carta cadastrada às 23h de sete dias atrás não aparece às 22h de hoje e
 *   some às 23h — a fronteira é a virada do dia, que é como a pessoa conta. O
 *   fuso é fixo, e não o do servidor (o contêiner roda em UTC) nem o do
 *   navegador (a página vem pronta do servidor): o app é de uma pessoa, no
 *   Brasil. O deslocamento é lido do `Intl` a cada data, então o horário de
 *   verão que São Paulo teve até 2019 sai certo também.
 * - **O que a regra não alcança, e a tela declara:** unidades somadas no
 *   cadastro a uma cópia que já existia (a fusão do cadastro por set) contam
 *   pela data daquela cópia, ou seja, não aparecem como novas; e uma divisão de
 *   lote feita antes de a parte separada passar a guardar a data da original
 *   (`divisao-lote.ts`) deixou uma linha com a data da divisão. Nenhuma data
 *   antiga é corrigida por inferência.
 */

export const FUSO_CADASTRO = "America/Sao_Paulo";
export const DIAS_CADASTRADAS = 7;
/** Quantas cópias o bloco mostra; a contagem é de todas as da janela. */
export const LIMITE_CADASTRADAS = 12;

const formatadoresDia = new Map<string, Intl.DateTimeFormat>();
const formatadoresHora = new Map<string, Intl.DateTimeFormat>();

function formatadorDia(fuso: string): Intl.DateTimeFormat {
  let f = formatadoresDia.get(fuso);
  if (!f) {
    // `en-CA` escreve a data como AAAA-MM-DD.
    f = new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" });
    formatadoresDia.set(fuso, f);
  }
  return f;
}

function formatadorHora(fuso: string): Intl.DateTimeFormat {
  let f = formatadoresHora.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatadoresHora.set(fuso, f);
  }
  return f;
}

/** O dia de calendário (`AAAA-MM-DD`) daquele instante no fuso. */
export function diaNoFuso(instante: Date, fuso: string = FUSO_CADASTRO): string {
  return formatadorDia(fuso).format(instante);
}

/** Quantos minutos o fuso está à frente de UTC naquele instante (São Paulo hoje: −180). */
function deslocamentoMinutos(instante: Date, fuso: string): number {
  const partes = Object.fromEntries(formatadorHora(fuso).formatToParts(instante).map((p) => [p.type, p.value]));
  const comoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour),
    Number(partes.minute),
    Number(partes.second),
  );
  const semMilissegundos = Math.floor(instante.getTime() / 1000) * 1000;
  return Math.round((comoUtc - semMilissegundos) / 60_000);
}

/** Soma dias a um dia de calendário `AAAA-MM-DD`, sem fuso nenhum envolvido. */
export function somarDias(dia: string, dias: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/**
 * O instante em que o dia começa no fuso. Duas passadas: o deslocamento lido
 * no palpite pode ser o do outro lado de uma mudança de horário, e a segunda
 * leitura, já no instante certo, corrige. Num dia que começa com o relógio
 * pulando a meia-noite (o horário de verão brasileiro começava à 00:00), o
 * resultado é o primeiro instante que existe naquele dia.
 */
export function inicioDoDia(dia: string, fuso: string = FUSO_CADASTRO): Date {
  const [a, m, d] = dia.split("-").map(Number);
  const meiaNoiteUtc = Date.UTC(a, m - 1, d);
  let instante = meiaNoiteUtc - deslocamentoMinutos(new Date(meiaNoiteUtc), fuso) * 60_000;
  instante = meiaNoiteUtc - deslocamentoMinutos(new Date(instante), fuso) * 60_000;
  // Pulou a meia-noite: o instante calculado ainda cai no dia anterior.
  while (diaNoFuso(new Date(instante), fuso) < dia) instante += 60 * 60_000;
  return new Date(instante);
}

export interface JanelaCadastradas {
  /** Hoje, no fuso. */
  hoje: string;
  /** O primeiro dia da janela, no fuso. */
  desde: string;
  /** 00:00 do primeiro dia, no fuso: o limite da consulta (`criado_em >= inicio`). */
  inicio: Date;
}

/** A janela dos últimos `dias` dias de calendário, hoje incluído. */
export function janelaCadastradas(
  agora: Date,
  dias: number = DIAS_CADASTRADAS,
  fuso: string = FUSO_CADASTRO,
): JanelaCadastradas {
  if (!Number.isInteger(dias) || dias < 1) throw new Error(`dias inválido: ${dias}`);
  const hoje = diaNoFuso(agora, fuso);
  const desde = somarDias(hoje, -(dias - 1));
  return { hoje, desde, inicio: inicioDoDia(desde, fuso) };
}

export interface CopiaCadastrada {
  copiaId: string;
  cartaId: string;
  criadoEm: Date;
  quantidade: number;
}

/**
 * O que o bloco mostra das cópias da janela: as mais recentes primeiro (o
 * `id` desempata, para a ordem nunca mudar entre duas leituras), cada uma com
 * o dia em que entrou. Uma cópia fora da janela é descartada aqui também — a
 * consulta já filtra, e a regra não depende de ela ter filtrado certo.
 */
export function cadastradasNaJanela<C extends CopiaCadastrada>(
  copias: readonly C[],
  janela: JanelaCadastradas,
  fuso: string = FUSO_CADASTRO,
): (C & { dia: string })[] {
  return copias
    .filter((c) => c.criadoEm.getTime() >= janela.inicio.getTime())
    .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime() || (a.copiaId < b.copiaId ? 1 : a.copiaId > b.copiaId ? -1 : 0))
    .map((c) => ({ ...c, dia: diaNoFuso(c.criadoEm, fuso) }));
}

export type RotuloDia = { tipo: "hoje" } | { tipo: "ontem" } | { tipo: "data"; dia: string };

/** Como a tela escreve o dia de uma cópia: "hoje", "ontem" ou a data. */
export function rotuloDoDia(dia: string, hoje: string): RotuloDia {
  if (dia === hoje) return { tipo: "hoje" };
  if (dia === somarDias(hoje, -1)) return { tipo: "ontem" };
  return { tipo: "data", dia };
}
