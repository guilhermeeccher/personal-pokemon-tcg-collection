/**
 * Living Dex — o que dá para obter em cada jogo (o "catálogo do jogo").
 *
 * Para cada jogo do catálogo fixo (`dex-jogos.ts`) que já tem dado conferido:
 * quais espécies saem dele e **como**:
 *
 *  - `livre`: obtível jogando aquele jogo sozinho — captura, presente,
 *    estático, evolução, ovo;
 *  - `troca`: só com troca — exclusivo da outra versão, ou evolução por troca;
 *  - `evento`: só por evento ou bônus de outro jogo (ticket, dados salvos).
 *
 * E quais **formas** daquela espécie existem no jogo, e quais o HOME não
 * recebe dele (`transferivel = false`).
 *
 * Como o `conexaoHome` dos jogos, é **dado conferido, nunca preenchido de
 * memória**. Cada jogo diz de onde veio e quando. As listas estão em faixas
 * de número nacional ("1-26,29-36") para o diff de uma correção ser legível.
 *
 * Jogo sem entrada aqui não tem catálogo: o cadastro mostra todas as vagas.
 *
 * Módulo puro.
 */
import type { CategoriaFormaDex } from "./dex-classificacao";

export type ComoObter = "livre" | "troca" | "evento";

export interface FormaParaDisponibilidade {
  id: string;
  numero: number;
  categoria: CategoriaFormaDex;
  mitico: boolean;
}

export interface DisponibilidadeForma {
  como: ComoObter;
  /** `false`: existe no jogo, mas o HOME não o recebe de lá. */
  transferivel: boolean;
}

interface DadosJogo {
  /** Faixas de número nacional. Uma espécie em mais de uma lista é erro (teste). */
  livre: string;
  troca: string;
  evento: string;
  /** A vaga existe neste jogo? Recebe só formas de espécies já listadas. */
  forma: (f: FormaParaDisponibilidade) => boolean;
  /** Formas que existem no jogo e que o HOME não recebe dele. */
  naoTransferiveis?: readonly string[];
}

/** "1-3,7" → [1, 2, 3, 7]. */
export function lerFaixas(texto: string): number[] {
  if (!texto.trim()) return [];
  return texto.split(",").flatMap((parte) => {
    const [a, b] = parte.split("-").map(Number);
    if (!Number.isInteger(a) || (b !== undefined && !Number.isInteger(b))) {
      throw new Error(`Faixa inválida: "${parte}".`);
    }
    return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i);
  });
}

/*
 * Formas da Geração 3: base, a fêmea das espécies com diferença de gênero
 * (o jogo não desenha a diferença, mas o Pokémon tem sexo, e chega ao HOME
 * como fêmea) e os 28 Unown das Tanoby Chambers. Nenhuma outra forma existe
 * nesses jogos. A fêmea do Sneasel de Hisui é de forma regional, que não
 * existe aqui.
 */
const formaGeracao3 = (f: FormaParaDisponibilidade) =>
  f.categoria === "base" ||
  (f.categoria === "genero" && f.id !== "sneasel-hisui-femea") ||
  f.id.startsWith("unown-");

/*
 * Formas do BDSP: as da Geração 3 mais Burmy/Wormadam, Shellos/Gastrodon do
 * leste e os Rotom de eletrodoméstico. Origem de Giratina e tipos de Arceus
 * existem no jogo, mas não são vaga do HOME (ver `dex-classificacao.ts`).
 */
const FORMAS_BDSP = new Set([
  "burmy-sandy",
  "burmy-trash",
  "wormadam-sandy",
  "wormadam-trash",
  "shellos-east",
  "gastrodon-east",
  "rotom-heat",
  "rotom-wash",
  "rotom-frost",
  "rotom-fan",
  "rotom-mow",
]);
const formaBdsp = (f: FormaParaDisponibilidade) => formaGeracao3(f) || FORMAS_BDSP.has(f.id);

/*
 * GO, conferido em 2026-10-11 contra a Bulbapedia ("List of Pokémon by
 * availability in Pokémon GO", revisão de 2026-10-10): toda espécie e toda
 * forma lançada, menos as listadas como não lançadas. Os bonés de Pikachu
 * ficam fora: no GO eles são fantasia de evento, e Pokémon fantasiado não
 * passa pelo GO Transporter. O GO lança coisa nova quase todo mês — esta é
 * a lista que mais envelhece; atualizar é remover números daqui.
 */
const GO_ESPECIES_NAO_LANCADAS = "489-490,493,746,771-773,801,833-834,868-869,871,875,878-883,896-898,902,951-954,963-964,967,976,981,984-995,1001-1010,1014-1018,1020-1025";
const GO_FORMAS_NAO_LANCADAS = new Set([
  "vivillon-fancy",
  "vivillon-poke-ball",
  "floette-eternal",
  "greninja-battle-bond",
  "zarude-dada",
  // O GO só tem a forma Roaming; a vaga base é a forma Chest.
  "gimmighoul",
]);
const formaGo = (f: FormaParaDisponibilidade) =>
  !GO_FORMAS_NAO_LANCADAS.has(f.id) && !/^pikachu-.+-cap$/.test(f.id);

const goNaoLancadas = new Set(lerFaixas(GO_ESPECIES_NAO_LANCADAS));

/*
 * Míticos que o GO dá a qualquer jogador, a qualquer momento, conferido em
 * 2026-10-12 na Bulbapedia ("Special Research", as globais, gratuitas e sem
 * data de fim): Mew, Celebi, Jirachi, Victini, Keldeo, Meloetta, Shaymin,
 * Diancie e Marshadow; Meltan e Melmetal saem da Mystery Box, que se ganha
 * mandando um Pokémon ao HOME. Os outros míticos do GO vieram de evento.
 * Cada um destes é um troféu-checkpoint do GO (`seed/dex-trofeus.json`).
 */
const GO_MITICOS_PERMANENTES = new Set([151, 251, 385, 492, 494, 647, 648, 719, 802, 808, 809]);

export const DISPONIBILIDADE: Readonly<Record<string, DadosJogo>> = {
  /*
   * FireRed e LeafGreen, conferidos em 2026-10-11. Encontros por versão da
   * PokeAPI (caminhada, surf, pesca, Rock Smash, presentes, estáticos, trocas
   * com NPC), fechados por evolução e por ovo, restritos à Geração 1–3.
   * Fora: evoluções por horário (Espeon, Umbreon — o jogo não tem relógio) e
   * o Celebi do disco bônus japonês do Colosseum. Os exclusivos de versão
   * batem com a lista da Serebii; Wynaut (ovo de Wobbuffet com Lax Incense)
   * e Azurill (só no LeafGreen) conferidos na Bulbapedia.
   *
   * Corrigido em 2026-10-12, os dois pela Bulbapedia:
   *  - Lugia, Ho-Oh (Navel Rock) e Deoxys (Birth Island) são livres: na
   *    versão de Switch, o AuroraTicket e o MysticTicket chegam sozinhos
   *    depois do Hall da Fama ("Differences in the Nintendo Switch
   *    release"). No cartucho eram de evento.
   *  - Mareep, Aipom, Pineco, Shuckle, Teddiursa, Houndour, Stantler e
   *    Smeargle (e as evoluções) saíram: a PokeAPI os lista na Altering
   *    Cave, mas só por um Mystery Gift que nunca foi distribuído. Lá só há
   *    Zubat ("Altering Cave").
   *
   * Quando cada espécie fica acessível no save (Ilhas Sevii, Pokédex
   * Nacional…) não é dado daqui: são os troféus-checkpoint de
   * `seed/dex-trofeus.json`.
   */
  firered: {
    livre: "1-26,29-36,39-64,66-67,72-75,77-78,81-93,95-119,122-125,128-150,161-162,165-169,172-178,182,187-189,193-195,198,201-202,206,211,214,218-221,225,227,231-232,236-239,242-250,360,386",
    troca: "27-28,37-38,65,68-71,76,79-80,94,120-121,126-127,183-184,186,199-200,208,212,215,223-224,226,230,233,240,298",
    evento: "",
    forma: formaGeracao3,
  },
  leafgreen: {
    livre: "1-22,25-42,46-53,56-57,60-64,66-67,69-75,77-89,92-93,95-122,124,126-150,161-162,165-169,172-178,183-184,187-189,193,199-202,206,214-215,218-221,223-224,226,231-232,236-238,240,242-250,298,360,386",
    troca: "23-24,43-45,54-55,58-59,65,68,76,90-91,94,123,125,182,186,194-195,198,208,211-212,225,227,230,233,239",
    evento: "",
    forma: formaGeracao3,
  },
  /*
   * Brilliant Diamond e Shining Pearl, conferidos em 2026-10-11. Espécies do
   * dataset do SuperEffective (MIT); exclusivos de versão da Serebii;
   * evoluções por troca pela PokeAPI, menos Steelix e Milotic, obtíveis de
   * outro jeito no BDSP (conferido no homestretch-data). Míticos (Mew,
   * Jirachi, Darkrai, Arceus) por evento: pedem bônus de compra ou dados
   * salvos de outro jogo. O HOME não recebe Spinda do BDSP.
   */
  "brilliant-diamond": {
    livre: "1-12,16-26,29-36,39-64,66-67,69-75,77-78,81-93,95-125,128-143,147-150,152-185,187-198,201-211,213-215,218-229,231-232,235-239,241-248,250,252-269,273-301,303-335,338-366,369-370,374-384,387-409,412-428,430,433-463,465,468-473,475-476,478-483,485-488",
    troca: "13-15,27-28,37-38,65,68,76,79-80,94,126-127,144-146,186,199-200,212,216-217,230,233-234,240,249,270-272,302,336-337,367-368,371-373,410-411,429,431-432,464,466-467,474,477,484",
    evento: "151,385,491,493",
    forma: formaBdsp,
    naoTransferiveis: ["spinda"],
  },
  "shining-pearl": {
    livre: "1-9,13-22,25-57,60-64,66-67,69-75,77-85,88-93,95-122,124,126-150,152-185,187-197,200-206,208-211,213-229,231-232,234-238,240-242,249,252-272,276-302,304-334,336-337,339-351,353-366,369-384,387-407,410-429,431-433,436-463,465,468-471,473,475-476,478-482,484-488",
    troca: "10-12,23-24,58-59,65,68,76,86-87,94,123,125,186,198-199,207,212,230,233,239,243-248,250,273-275,303,335,338,352,367-368,408-409,430,434-435,464,466-467,472,474,477,483",
    evento: "151,385,491,493",
    forma: formaBdsp,
    naoTransferiveis: ["spinda"],
  },
  /*
   * GO: míticos por evento (pesquisas especiais). O GO Transporter não manda
   * Spinda, Zygarde, Eternatus nem o Keldeo Resoluto (Bulbapedia, "GO
   * Transporter", restrições).
   */
  go: {
    livre: "",
    troca: "",
    evento: "",
    forma: formaGo,
    naoTransferiveis: [
      "spinda",
      "zygarde",
      "zygarde-10",
      "zygarde-10-power-construct",
      "zygarde-50-power-construct",
      "eternatus",
      "keldeo-resolute",
    ],
  },
};

/** Jogos com catálogo conferido. */
export function temDisponibilidade(jogoId: string): boolean {
  return jogoId in DISPONIBILIDADE;
}

/**
 * O catálogo do jogo: vaga → como obter e se o HOME recebe. Vaga ausente do
 * mapa não existe no jogo. `null` = jogo sem dado conferido.
 */
export function catalogoDoJogo(
  jogoId: string,
  formas: readonly FormaParaDisponibilidade[],
): Map<string, DisponibilidadeForma> | null {
  const dados = DISPONIBILIDADE[jogoId];
  if (!dados) return null;

  const como = new Map<number, ComoObter>();
  if (jogoId === "go") {
    // O GO lista o que NÃO saiu; o resto é livre, e míticos são por evento,
    // menos os de pesquisa gratuita permanente.
    for (const f of formas) {
      if (goNaoLancadas.has(f.numero)) continue;
      como.set(f.numero, f.mitico && !GO_MITICOS_PERMANENTES.has(f.numero) ? "evento" : "livre");
    }
  } else {
    for (const tipo of ["livre", "troca", "evento"] as const) {
      for (const n of lerFaixas(dados[tipo])) como.set(n, tipo);
    }
  }

  const bloqueadas = new Set(dados.naoTransferiveis ?? []);
  const catalogo = new Map<string, DisponibilidadeForma>();
  for (const f of formas) {
    const c = como.get(f.numero);
    if (c === undefined || !dados.forma(f)) continue;
    catalogo.set(f.id, { como: c, transferivel: !bloqueadas.has(f.id) });
  }
  return catalogo;
}

/** `jogo:forma` que o HOME não recebe daquele jogo — para a regra de movimento. */
export function naoTransferiveis(): Set<string> {
  const r = new Set<string>();
  for (const [jogoId, dados] of Object.entries(DISPONIBILIDADE)) {
    for (const formaId of dados.naoTransferiveis ?? []) r.add(`${jogoId}:${formaId}`);
  }
  return r;
}
