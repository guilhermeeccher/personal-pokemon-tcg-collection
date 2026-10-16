/**
 * Living Dex — as caixas do HOME: em que caixa e em que posição cada vaga
 * fica, para o usuário arrumar o HOME igual. Módulo puro.
 *
 * ## O princípio: cada grupo só cresce no fim (decisão de 2026-10-16)
 *
 * O HOME não insere um Pokémon no meio de uma caixa: abrir lugar é mover à
 * mão tudo o que vem depois. Então o arranjo tem uma regra só — **uma vaga
 * nova nunca muda a posição de uma vaga que já existe**. Para isso as vagas
 * vão em grupos, cada grupo começa numa caixa fixa (`ANCORA_GRUPO`) com
 * caixas vazias de folga antes do seguinte, e dentro do grupo a ordem é uma
 * em que o novo cai no fim:
 *
 * | Grupo      | Conteúdo                                             | Caixas | Folga |
 * |------------|------------------------------------------------------|--------|-------|
 * | Nacional   | as bases, pelo número nacional, corridas             | 1–35   | 36–45 |
 * | Gênero     | as fêmeas, pelo número nacional                      | 46–49  | 50–51 |
 * | Regionais  | um bloco por região da forma, cada um em caixa nova  | 52–55  | 56–59 |
 * | Especiais  | por lançamento                                       | 60–61  | 62–64 |
 * | Cosméticas | por lançamento; último grupo, cresce sem teto        | 65–70  | —     |
 *
 * - **Nacional corrido, sem quebra de região**: a caixa N tem os números
 *   30N−29 a 30N. Espécie nova (#1026 em diante) entra no fim.
 * - **Regionais por região da forma, não da espécie** (o Raichu de Alola vai
 *   no bloco de Alola, não perto de Kanto), blocos na ordem de lançamento
 *   (`REGIOES_FORMA`); região nova é bloco novo no fim. A região sai do id
 *   (`regiaoDaForma`), nunca é chutada.
 * - **Fêmea de forma regional vai com a forma**, no bloco da região, logo
 *   depois dela (hoje só o Sneasel de Hisui).
 * - **Por lançamento** = `lancamento` (o `order` do grupo de versões da
 *   PokeAPI em que a forma foi introduzida), depois número nacional, depois
 *   a ordem do catálogo. Forma nova de jogo novo cai no fim do grupo. Vale
 *   para Especiais, Cosméticas e dentro de cada bloco regional. O lançamento
 *   é dado da PokeAPI: uma correção lá move posições, e o diff da coluna
 *   `lancamento` do seed mostra antes de chegar a alguém.
 * - **As âncoras são decisão, não consequência.** Um grupo que estourar a
 *   folga e invadir a âncora do seguinte faz um teste falhar: mover grupos
 *   é decisão de quem mantém, avisada, nunca efeito colateral de um seed.
 *
 * ## As duas trilhas têm o mesmo mapa
 *
 * Na shiny, a forma que nunca saiu em shiny **fica no lugar, como buraco
 * marcado** (`sem_shiny`), em vez de sumir: quando o shiny do Victini sair,
 * nada se mexe. O buraco não tem posição para guardar (`posicoesNasCaixas`
 * o deixa de fora), e a tela o mostra diferente de uma vaga em falta.
 *
 * ## Seção desligada esconde o grupo, sem renumerar os outros
 *
 * Desligar Gênero tira as caixas 46–49 da tela; a Regionais continua na 52.
 * A numeração na tela fica com lacunas, de propósito: é a do HOME. A fêmea
 * de forma regional, com Gênero desligado e Regionais ligada, vira buraco
 * (`secao_desligada`) no bloco dela, pelo mesmo motivo.
 *
 * ## O que este arranjo substituiu
 *
 * - **2026-10-12: cada região numa caixa nova, formas intercaladas na
 *   espécie, cosméticas corridas no fim** (a partir do "Fully Sorted by
 *   Regions" do SuperEffective). Com a forma ao lado da espécie, uma forma
 *   nova de espécie antiga (uma regional da geração 10 de um Pokémon de
 *   Kanto) empurrava todas as posições seguintes da região — e a última
 *   caixa de Kanto estava cheia (30/30), então abria uma caixa e renumerava
 *   todas as caixas depois dela. Uma cosmética nova empurrava as cosméticas
 *   seguintes.
 * - **2026-10-12: na shiny, forma sem shiny não ocupava lugar.** Cada shiny
 *   liberado deslocava todas as posições shiny depois dele.
 * - **2026-10-11: seção desligada saía e a região se reorganizava.** Ligar
 *   ou desligar uma seção mexia em posições que o usuário já tinha seguido.
 *
 * Caixa e posição continuam calculadas, não gravadas: dependem da trilha e
 * das seções ligadas. Mudar uma âncora, a ordem de um grupo ou o que vai em
 * cada grupo move Pokémon nas caixas de alguém — o teste fixa as posições.
 *
 * ## Caixas reservadas no início (D9, 2026-10-12)
 *
 * Quem usa a primeira caixa do HOME para outra coisa (a caixa de
 * "Recebidos", onde cai o que chega dos jogos) via o número da tela uma
 * atrás do real. `reservadas` desloca só o **número** das caixas: Nacional
 * 1 passa a ser a caixa `reservadas + 1`, e todas as âncoras andam junto.
 * Nome, índice, posição e quais vagas ficam em cada caixa não mudam. Vale
 * para as duas trilhas.
 */
import { REGIOES_FORMA, regiaoDaForma, type CategoriaFormaDex, type RegiaoForma } from "./dex-classificacao";
import type { FormaParaGrade, TrilhaDex } from "./dex-grade";
import { categoriaConta, type SecoesContadas } from "./dex-secoes";

export const VAGAS_POR_CAIXA = 30;
export const COLUNAS_CAIXA = 6;
/** Teto das caixas reservadas: folga para quem separa algumas, nunca 200 por engano de digitação. */
export const MAX_CAIXAS_RESERVADAS = 20;

export function ehCaixasReservadas(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_CAIXAS_RESERVADAS;
}

/** Os grupos, na ordem das caixas. */
export const GRUPOS_CAIXA = ["nacional", "genero", "regional", "especial", "cosmetica"] as const;
export type GrupoCaixa = (typeof GRUPOS_CAIXA)[number];

/**
 * Caixa onde cada grupo começa, antes das reservadas. A folga até a âncora
 * seguinte é o espaço para o grupo crescer sem mexer em ninguém (contagens
 * de 2026-10-16, todas as seções ligadas):
 *
 * - Nacional: 1.025 bases = 35 caixas, a última com 5. Dez caixas de folga
 *   são 300 espécies; a geração 9 trouxe 120.
 * - Gênero: 102 fêmeas = 4 caixas, a última com 12; duas de folga. Fêmea
 *   nova vem com espécie nova, e espécie nova tem número maior: cai no fim.
 * - Regionais: Alola 18, Galar 19, Hisui 17, Paldea 4 — um bloco por caixa,
 *   4 caixas; quatro de folga, para uma região nova e para um bloco crescer.
 * - Especiais: 39 = 2 caixas, a última com 9; três de folga.
 * - Cosméticas: 163 = 6 caixas, a última com 13. É o último grupo: cresce
 *   no fim sem invadir ninguém, por isso vai por último (é o que mais cresce).
 */
export const ANCORA_GRUPO: Readonly<Record<GrupoCaixa, number>> = {
  nacional: 1,
  genero: 46,
  regional: 52,
  especial: 60,
  cosmetica: 65,
};

export type FormaParaCaixa = Pick<FormaParaGrade, "numero" | "categoria" | "shinyObtenivel"> & {
  id: string;
  ordem: number;
  lancamento: number;
};

/**
 * Por que uma posição é buraco: a forma tem lugar no mapa, mas nada entra
 * nele nesta trilha e com estas seções. `sem_shiny`: na trilha shiny, forma
 * que nunca saiu em shiny. `secao_desligada`: a fêmea de forma regional com
 * Gênero desligado (o resto de uma seção desligada sai junto com o grupo).
 */
export type MotivoBuraco = "sem_shiny" | "secao_desligada";

export interface LugarNaCaixa<T extends FormaParaCaixa> {
  forma: T;
  /** `null` = vaga de verdade; senão, buraco marcado, que a tela mostra e onde nada se guarda. */
  buraco: MotivoBuraco | null;
}

export interface CaixaDex<T extends FormaParaCaixa> {
  /** 1, 2, 3… — a caixa no HOME, já com as reservadas. Pode ter lacunas: grupo escondido não renumera os outros. */
  numero: number;
  grupo: GrupoCaixa;
  /** Região do bloco, nas Regionais; nula nos outros grupos. */
  regiao: RegiaoForma | null;
  /** 1, 2… dentro do grupo, ou do bloco da região nas Regionais: "Nacional 2", "Hisui 1". */
  indice: number;
  /** Até 30; o índice + 1 é a posição. A última caixa de cada grupo (ou bloco) pode sobrar. */
  lugares: LugarNaCaixa<T>[];
}

export interface PosicaoNaCaixa {
  caixa: number;
  /** 1 a 30, da esquerda para a direita e de cima para baixo. */
  posicao: number;
}

/**
 * Grupo (e região, nas Regionais) de uma forma. A fêmea de forma regional
 * se reconhece pela marca de região no id (`sneasel-hisui-femea`); a fêmea
 * de base não tem marca. Forma regional sem região conhecida é recusada:
 * o gerador do seed já a barra, isto só pega o que escapar.
 */
export function grupoDaForma(f: { id: string; categoria: CategoriaFormaDex }): {
  grupo: GrupoCaixa;
  regiao: RegiaoForma | null;
} {
  switch (f.categoria) {
    case "base":
      return { grupo: "nacional", regiao: null };
    case "genero": {
      const regiao = regiaoDaForma(f.id);
      return regiao ? { grupo: "regional", regiao } : { grupo: "genero", regiao: null };
    }
    case "regional": {
      const regiao = regiaoDaForma(f.id);
      if (!regiao) throw new Error(`Forma regional ${f.id} sem região conhecida (regiaoDaForma).`);
      return { grupo: "regional", regiao };
    }
    case "especial":
      return { grupo: "especial", regiao: null };
    case "cosmetica":
      return { grupo: "cosmetica", regiao: null };
  }
}

/** O grupo aparece nas caixas? Nacional e Cosméticas sempre; os outros, com a seção ligada. */
export function grupoAparece(grupo: GrupoCaixa, secoes: SecoesContadas): boolean {
  return grupo === "nacional" || grupo === "cosmetica" || secoes[grupo];
}

type Comparador = (a: FormaParaCaixa, b: FormaParaCaixa) => number;
const porNumero: Comparador = (a, b) => a.numero - b.numero || a.ordem - b.ordem;
const porLancamento: Comparador = (a, b) => a.lancamento - b.lancamento || porNumero(a, b);

/*
 * Nacional e Gênero crescem pelo número (espécie nova tem número maior);
 * os outros, pelo lançamento (forma nova vem em jogo novo).
 */
const ORDEM_DO_GRUPO: Readonly<Record<GrupoCaixa, Comparador>> = {
  nacional: porNumero,
  genero: porNumero,
  regional: porLancamento,
  especial: porLancamento,
  cosmetica: porLancamento,
};

function buracoDa(f: FormaParaCaixa, trilha: TrilhaDex, secoes: SecoesContadas): MotivoBuraco | null {
  if (!categoriaConta(f.categoria, secoes)) return "secao_desligada";
  if (trilha === "shiny" && !f.shinyObtenivel) return "sem_shiny";
  return null;
}

export function montarCaixasDex<T extends FormaParaCaixa>(
  formas: readonly T[],
  trilha: TrilhaDex,
  secoes: SecoesContadas,
  /** Caixas do HOME antes da Nacional 1 (a de Recebidos, por exemplo). */
  reservadas = 0,
): CaixaDex<T>[] {
  /* Um bloco por grupo; nas Regionais, um por região. Chave: "nacional", "regional:hisui". */
  const blocos = new Map<string, T[]>();
  for (const f of formas) {
    const { grupo, regiao } = grupoDaForma(f);
    if (!grupoAparece(grupo, secoes)) continue;
    const chave = regiao ? `${grupo}:${regiao}` : grupo;
    const lista = blocos.get(chave);
    if (lista) lista.push(f);
    else blocos.set(chave, [f]);
  }

  const caixas: CaixaDex<T>[] = [];
  for (const grupo of GRUPOS_CAIXA) {
    if (!grupoAparece(grupo, secoes)) continue;
    const regioes: readonly (RegiaoForma | null)[] = grupo === "regional" ? REGIOES_FORMA : [null];
    /* Caixas já usadas no grupo: cada bloco regional começa numa caixa nova. */
    let usadas = 0;
    for (const regiao of regioes) {
      const vagas = [...(blocos.get(regiao ? `${grupo}:${regiao}` : grupo) ?? [])].sort(ORDEM_DO_GRUPO[grupo]);
      for (let i = 0; i < vagas.length; i += VAGAS_POR_CAIXA) {
        caixas.push({
          numero: reservadas + ANCORA_GRUPO[grupo] + usadas,
          grupo,
          regiao,
          indice: i / VAGAS_POR_CAIXA + 1,
          lugares: vagas.slice(i, i + VAGAS_POR_CAIXA).map((forma) => ({ forma, buraco: buracoDa(forma, trilha, secoes) })),
        });
        usadas++;
      }
    }
  }
  return caixas;
}

/**
 * Caixa e posição de cada vaga onde se guarda um Pokémon, pelo id da vaga.
 * Buraco não entra: não há o que guardar nele, e a tela não deve sugerir.
 */
export function posicoesNasCaixas(caixas: readonly CaixaDex<FormaParaCaixa>[]): Map<string, PosicaoNaCaixa> {
  const r = new Map<string, PosicaoNaCaixa>();
  for (const c of caixas) {
    c.lugares.forEach((l, i) => {
      if (l.buraco === null) r.set(l.forma.id, { caixa: c.numero, posicao: i + 1 });
    });
  }
  return r;
}

/** Quantas vagas de verdade (sem buraco) a caixa tem. */
export function vagasNaCaixa(caixa: CaixaDex<FormaParaCaixa>): number {
  return caixa.lugares.filter((l) => l.buraco === null).length;
}
