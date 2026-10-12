/**
 * Living Dex — classificação das formas da PokeAPI em vagas do Pokémon HOME.
 *
 * Responde uma pergunta só: "esta forma ocupa uma caixa própria no HOME, e
 * em que seção ela entra?". O resultado vira `seed/dex-forma.csv` (pelo
 * `scripts/gerar-seed-dex.ts`) e, dali, a tabela `dex_forma`.
 *
 * Módulo puro: recebe as linhas já lidas dos CSVs da PokeAPI e devolve as
 * vagas. Quem lê arquivo é o script.
 *
 * ## Por que a classificação é curada, e não derivada
 *
 * A PokeAPI sabe o que é forma de batalha (`is_battle_only`) e Mega
 * (`is_mega`), mas não sabe o que o HOME guarda. Das 1.579 formas que ela
 * lista (dados de 2026-10-06), 1.422 não são de batalha, e ainda assim muitas
 * dessas não existem numa caixa do HOME: Totem, Pikachu cosplay do ORAS,
 * Pichu de orelha espetada, tipos de Arceus e Silvally (o item volta para a
 * bolsa e a forma volta para Normal), fusões de Kyurem, Necrozma e Calyrex,
 * padrões escondidos de Scatterbug e Spewpa, capas de Mothim (iguais na tela).
 *
 * Por isso toda forma que não é a padrão da espécie passa por uma lista
 * explícita abaixo. **Forma sem regra não é chutada**: `classificarFormasDex`
 * a devolve em `semClassificacao`, e o gerador do seed falha. Quando a PokeAPI
 * publicar uma forma nova, o gerador para e alguém decide.
 *
 * A lista foi fechada em 2026-10-11 cruzando duas listas curadas de living
 * dex no HOME, ambas consultadas e nenhuma copiada: o dataset do SuperEffective
 * (caixas do HOME "sorted by forms", MIT) e o homestretch-data (2026, já com
 * Legends Z-A). O resultado bate forma a forma com o SuperEffective, com duas
 * diferenças deliberadas: a Floette Eterna (que ele não tinha) e as espécies
 * do Indigo Disk (1018–1025), que o dataset dele, de 2023, ainda não tinha.
 * As divergências entre as duas fontes estão decididas, uma a uma, nos
 * comentários das regras.
 */

export const CATEGORIAS_FORMA_DEX = [
  "base",
  "regional",
  "genero",
  "cosmetica",
  "especial",
] as const;

export type CategoriaFormaDex = (typeof CATEGORIAS_FORMA_DEX)[number];

/**
 * As seções que o usuário liga e desliga. `base` conta sempre (spec §3.4).
 * `cosmetica` não é ligável desde 2026-10-11: as formas cosméticas (Alcremie,
 * Vivillon, Unown…) têm vista própria, com progresso próprio
 * (`dex-grade.ts`, `VistaDex`).
 */
export const SECOES_LIGAVEIS = ["regional", "genero", "especial"] as const;
export type SecaoLigavel = (typeof SECOES_LIGAVEIS)[number];

/** Uma linha de `pokemon_forms.csv`, já tipada. */
export interface FormaPokeapi {
  id: number;
  identificador: string;
  /** `form_identifier`: vazio na forma sem nome (Bulbasaur). */
  identificadorForma: string | null;
  pokemonId: number;
  /** `is_default`: a forma padrão DO POKÉMON (não da espécie). */
  padrao: boolean;
  soBatalha: boolean;
  mega: boolean;
  /** `order`: ordem global da PokeAPI, usada para ordenar formas da espécie. */
  ordem: number;
  /** Nome da forma em inglês (`pokemon_form_names`, idioma 9). */
  nomeForma: string | null;
}

/** Uma linha de `pokemon.csv`. */
export interface PokemonPokeapi {
  id: number;
  especieId: number;
  /** `is_default`: o Pokémon padrão da espécie. */
  padrao: boolean;
}

/** Uma linha de `pokemon_species.csv`, com o nome em inglês já resolvido. */
export interface EspeciePokeapi {
  id: number;
  identificador: string;
  nome: string;
  geracao: number;
  diferencaGenero: boolean;
  lendario: boolean;
  mitico: boolean;
}

/** Uma vaga do HOME — o formato de `dex_forma` sem as colunas de controle. */
export interface FormaDex {
  id: string;
  numero: number;
  especie: string;
  /** Nome da forma em inglês; `null` na forma base que não tem nome. */
  forma: string | null;
  categoria: CategoriaFormaDex;
  geracao: number;
  lendario: boolean;
  mitico: boolean;
  shinyObtenivel: boolean;
  /** Caminho do sprite no repositório PokeAPI/sprites, sem extensão. */
  sprite: string;
  ordem: number;
}

export interface EntradaClassificacao {
  formas: readonly FormaPokeapi[];
  pokemons: readonly PokemonPokeapi[];
  especies: readonly EspeciePokeapi[];
}

export interface ResultadoClassificacao {
  vagas: FormaDex[];
  /** Formas sem regra. Não vazio = o seed não pode ser gerado. */
  semClassificacao: string[];
  /** Formas incluídas sem nome e sem nome sobrescrito. Idem. */
  semNome: string[];
}

type Destino = CategoriaFormaDex | "fora";

interface Regra {
  padrao: RegExp;
  destino: Destino;
}

/*
 * As regras, na ordem em que são testadas — a primeira que casa decide.
 * A ordem importa num caso só: `pikachu-alola-cap` contém `-alola` e tem
 * que cair em `cosmetica` (boné) antes de chegar em `regional`.
 */
const REGRAS: readonly Regra[] = [
  /*
   * Fora: não fica numa caixa do HOME, ou fica igual a outra vaga.
   *  - Totem: tamanho de Totem, não armazenável como vaga própria
   *    (o homestretch inclui; o SuperEffective não; decidido na spec §3.3).
   *  - Pikachu cosplay e parceiros do Let's Go: o cosplay não sai do ORAS; os
   *    parceiros entram no HOME mas nenhuma das duas listas os conta.
   *  - Pichu de orelha espetada: não passa do Poké Transfer.
   *  - Formas de item e de fusão (Arceus, Silvally, Genesect, Origem, Kyurem,
   *    Necrozma, Calyrex, máscaras de Ogerpon) e as de modo (Koraidon,
   *    Miraidon, Eternamax): voltam à forma padrão fora do jogo.
   *  - Mothim, Scatterbug e Spewpa: o padrão existe nos dados, mas a forma é
   *    idêntica na tela (o homestretch inclui; o SuperEffective não).
   *  - Minior: o HOME distingue as sete cores do núcleo, não o meteoro. As
   *    vagas são os núcleos; a base (meteoro vermelho) representa o vermelho,
   *    por isso o núcleo vermelho e os meteoros coloridos ficam de fora.
   */
  { padrao: /totem/, destino: "fora" },
  {
    padrao: /^pikachu-(rock-star|belle|pop-star|phd|libre|cosplay|starter)$|^eevee-starter$/,
    destino: "fora",
  },
  { padrao: /^pichu-spiky-eared$/, destino: "fora" },
  { padrao: /^(arceus|silvally|genesect)-/, destino: "fora" },
  { padrao: /^(giratina|dialga|palkia)-origin$/, destino: "fora" },
  { padrao: /^kyurem-(black|white)$|^necrozma-(dusk|dawn)$|^calyrex-(ice|shadow)$/, destino: "fora" },
  { padrao: /^ogerpon-.+-mask$/, destino: "fora" },
  { padrao: /^(koraidon|miraidon)-|^eternatus-eternamax$/, destino: "fora" },
  { padrao: /^(mothim|scatterbug|spewpa)-/, destino: "fora" },
  { padrao: /^minior-.+-meteor$|^minior-red$/, destino: "fora" },
  /*
   * Formas de habilidade (decisão de 2026-10-12, na D7): o Greninja com
   * Battle Bond, o Rockruff com Own Tempo e os Zygarde com Power Construct
   * são formas internas, mas o SuperEffective deixa todas fora de todos os
   * arranjos de caixa do HOME, e nenhuma fonte achada diz que o HOME as
   * separa. Como as posições das caixas (`dex-caixas.ts`) são o que o
   * usuário segue para arrumar o HOME, ficam fora e as caixas batem com a
   * referência nas nove regiões. Até então eram `especial`.
   */
  { padrao: /^greninja-battle-bond$|^rockruff-own-tempo$|^zygarde-(10|50)-power-construct$/, destino: "fora" },

  /* Gênero que a PokeAPI já modela como forma (as demais fêmeas são geradas). */
  {
    padrao: /^(meowstic|indeedee|basculegion|oinkologne|pyroar|frillish|jellicent)-female$/,
    destino: "genero",
  },

  /* Cosmética: muda só a aparência. */
  { padrao: /^unown-/, destino: "cosmetica" },
  { padrao: /^burmy-(sandy|trash)$/, destino: "cosmetica" },
  { padrao: /^(shellos|gastrodon)-east$/, destino: "cosmetica" },
  { padrao: /^(deerling|sawsbuck)-(summer|autumn|winter)$/, destino: "cosmetica" },
  { padrao: /^vivillon-/, destino: "cosmetica" },
  { padrao: /^(flabebe|floette|florges)-(yellow|orange|blue|white)$/, destino: "cosmetica" },
  { padrao: /^furfrou-/, destino: "cosmetica" },
  { padrao: /^(sinistea|polteageist)-antique$|^poltchageist-artisan$|^sinistcha-masterpiece$/, destino: "cosmetica" },
  { padrao: /^alcremie-/, destino: "cosmetica" },
  { padrao: /^maushold-family-of-three$|^tatsugiri-/, destino: "cosmetica" },
  { padrao: /^minior-(orange|yellow|green|blue|indigo|violet)$/, destino: "cosmetica" },
  /*
   * Movidas de `especial` em 2026-10-11, pelo próprio critério desta seção:
   * os bonés de Pikachu (o homestretch não os lista, o SuperEffective lista;
   * existem no HOME e vão e voltam de SwSh e SV), a Magearna Original Color,
   * o Zarude Dada e o Dudunsparce de três segmentos só mudam a aparência.
   * Estar em `especial` pela origem (evento) os punha na vista principal.
   */
  { padrao: /^pikachu-(original|hoenn|sinnoh|unova|kalos|alola|partner|world)-cap$/, destino: "cosmetica" },
  { padrao: /^magearna-original$|^zarude-dada$|^dudunsparce-three-segment$/, destino: "cosmetica" },

  /*
   * Especial: armazenável e com diferença de jogo (tipo, habilidade, golpe,
   *    status). Forma que só muda a aparência é cosmética, mesmo vinda de evento.
   *  - Floette Eterna: entrou com o Legends Z-A (o homestretch lista).
   */
  { padrao: /^(deoxys|wormadam|rotom|basculin|pumpkaboo|gourgeist|zygarde|oricorio|lycanroc|squawkabilly)-/, destino: "especial" },
  { padrao: /^shaymin-sky$|^hoopa-unbound$|^keldeo-resolute$|^floette-eternal$/, destino: "especial" },
  { padrao: /^(tornadus|thundurus|landorus|enamorus)-therian$/, destino: "especial" },
  { padrao: /^toxtricity-low-key$|^urshifu-rapid-strike$|^ursaluna-bloodmoon$/, destino: "especial" },
  { padrao: /^gimmighoul-roaming$/, destino: "especial" },

  /* Regional: Alola, Galar, Hisui, Paldea (Tauros de Paldea inclusive). */
  { padrao: /-(alola|galar|hisui|paldea)(-|$)/, destino: "regional" },
];

/**
 * Fêmeas que não saem de `has_gender_differences`, porque a diferença é de
 * uma forma regional e a flag da PokeAPI é da espécie. O sprite da fêmea do
 * Sneasel de Hisui existe (`female/10235`), e as duas listas curadas a contam.
 */
const FEMEAS_DE_FORMA: readonly { id: string; formaBase: string; nome: string; sprite: string }[] = [
  { id: "sneasel-hisui-femea", formaBase: "sneasel-hisui", nome: "Hisuian Form (Female)", sprite: "female/10235" },
];

/** Nome em inglês da fêmea gerada — mesmo idioma dos nomes da PokeAPI. */
const NOME_FEMEA = "Female";

/**
 * Nome que a PokeAPI não dá, ou dá errado para o papel da vaga. O meteoro
 * vermelho é a vaga do núcleo vermelho (ver regra do Minior).
 */
const NOME_SOBRESCRITO: Readonly<Record<string, string>> = {
  "minior-red-meteor": "Red Core",
};

/** Sprite do núcleo vermelho na vaga base do Minior, como as outras seis cores. */
const SPRITE_SOBRESCRITO: Readonly<Record<string, string>> = {
  "minior-red-meteor": "10136",
};

/*
 * Formas que nunca foram liberadas em shiny (spec §3.5). Fonte: a lista
 * "never released" do NationalDex (nationaldex.io/shiny-locked-pokemon),
 * dados de 2026-07-15 — as espécies da lista (Urshifu entra como espécie,
 * porque as duas formas dele estão lá) e as formas que existem como vaga aqui.
 *
 * Na dúvida, a forma fica com shiny obtenível: aparece como vaga a buscar em
 * vez de sumir do total. É por isso que o Marshadow NÃO está aqui — o
 * NationalDex o lista como nunca liberado, mas há relato de shiny no GO; com
 * fontes em conflito, vale o lado seguro.
 *
 * A lista muda quando a The Pokémon Company libera um shiny. Corrigir é
 * remover a linha e regenerar o seed.
 */
const ESPECIES_SEM_SHINY: ReadonlySet<number> = new Set([
  494, // Victini
  720, // Hoopa
  789, // Cosmog
  790, // Cosmoem
  801, // Magearna
  891, // Kubfu
  892, // Urshifu — as duas formas estão na lista; sem Kubfu shiny, não há Urshifu shiny
  893, // Zarude
  896, // Glastrier
  897, // Spectrier
  898, // Calyrex
  1009, // Walking Wake
  1010, // Iron Leaves
  1014, // Okidogi
  1015, // Munkidori
  1016, // Fezandipiti
  1017, // Ogerpon
  1020, // Gouging Fire
  1021, // Raging Bolt
  1022, // Iron Boulder
  1023, // Iron Crown
  1024, // Terapagos
  1025, // Pecharunt
]);

const FORMAS_SEM_SHINY: ReadonlySet<string> = new Set([
  "pikachu-original-cap",
  "pikachu-hoenn-cap",
  "pikachu-sinnoh-cap",
  "pikachu-unova-cap",
  "pikachu-kalos-cap",
  "pikachu-alola-cap",
  "pikachu-world-cap",
  "vivillon-poke-ball",
  "floette-eternal",
  "magearna-original",
  "zarude-dada",
  "ursaluna-bloodmoon",
]);

/** Destino de uma forma não padrão, ou `null` se nenhuma regra casa. */
export function destinoDaForma(identificador: string): Destino | null {
  for (const regra of REGRAS) {
    if (regra.padrao.test(identificador)) return regra.destino;
  }
  return null;
}

export function shinyObtenivel(numero: number, id: string): boolean {
  return !ESPECIES_SEM_SHINY.has(numero) && !FORMAS_SEM_SHINY.has(id);
}

/**
 * Sprite padrão de uma forma no repositório PokeAPI/sprites. Forma que é a
 * padrão do seu Pokémon usa o id dele (`10100`); forma cosmética que divide o
 * id com a padrão usa `<id>-<forma>` (`201-b`, `666-polar`). Os dois casos
 * foram conferidos contra a árvore do repositório em 2026-10-11, para as
 * pastas normal, `shiny/` e `female/`.
 */
function spriteDaForma(forma: FormaPokeapi): string {
  const sobrescrito = SPRITE_SOBRESCRITO[forma.identificador];
  if (sobrescrito) return sobrescrito;
  if (forma.padrao || !forma.identificadorForma) return String(forma.pokemonId);
  return `${forma.pokemonId}-${forma.identificadorForma}`;
}

/**
 * Classifica as formas da PokeAPI em vagas do HOME.
 *
 * A ordem das vagas segue a das caixas do HOME ordenadas por forma: número
 * nacional; dentro da espécie, a base, a fêmea da base, e depois cada forma
 * na ordem da PokeAPI, com a fêmea de forma logo depois dela.
 */
export function classificarFormasDex(entrada: EntradaClassificacao): ResultadoClassificacao {
  const pokemonPorId = new Map(entrada.pokemons.map((p) => [p.id, p]));
  const especiePorId = new Map(entrada.especies.map((e) => [e.id, e]));

  const semClassificacao: string[] = [];
  const semNome: string[] = [];

  /** Vagas por espécie, com uma chave de ordenação local. */
  const porEspecie = new Map<number, { chave: number; vaga: Omit<FormaDex, "ordem"> }[]>();
  const adicionar = (numero: number, chave: number, vaga: Omit<FormaDex, "ordem">) => {
    const lista = porEspecie.get(numero) ?? [];
    lista.push({ chave, vaga });
    porEspecie.set(numero, lista);
  };

  /* Espécie que já tem a fêmea modelada como forma não ganha a gerada. */
  const especiesComFemeaExplicita = new Set<number>();

  for (const forma of entrada.formas) {
    if (forma.soBatalha || forma.mega) continue;

    const pokemon = pokemonPorId.get(forma.pokemonId);
    if (!pokemon) throw new Error(`Forma ${forma.identificador} aponta para o Pokémon ${forma.pokemonId}, que não existe.`);
    const especie = especiePorId.get(pokemon.especieId);
    if (!especie) throw new Error(`Pokémon ${pokemon.id} aponta para a espécie ${pokemon.especieId}, que não existe.`);

    const ehBase = pokemon.padrao && forma.padrao;
    let categoria: CategoriaFormaDex;
    if (ehBase) {
      categoria = "base";
    } else {
      const destino = destinoDaForma(forma.identificador);
      if (destino === null) {
        semClassificacao.push(forma.identificador);
        continue;
      }
      if (destino === "fora") continue;
      categoria = destino;
    }

    const nome = NOME_SOBRESCRITO[forma.identificador] ?? forma.nomeForma;
    if (!ehBase && !nome) semNome.push(forma.identificador);
    if (categoria === "genero") especiesComFemeaExplicita.add(especie.id);

    const id = ehBase ? especie.identificador : forma.identificador;
    adicionar(especie.id, ehBase ? 0 : forma.ordem * 10, {
      id,
      numero: especie.id,
      especie: especie.nome,
      forma: nome || null,
      categoria,
      geracao: especie.geracao,
      lendario: especie.lendario,
      mitico: especie.mitico,
      shinyObtenivel: shinyObtenivel(especie.id, id),
      sprite: spriteDaForma(forma),
    });

    for (const femea of FEMEAS_DE_FORMA) {
      if (femea.formaBase !== forma.identificador) continue;
      adicionar(especie.id, forma.ordem * 10 + 1, {
        id: femea.id,
        numero: especie.id,
        especie: especie.nome,
        forma: femea.nome,
        categoria: "genero",
        geracao: especie.geracao,
        lendario: especie.lendario,
        mitico: especie.mitico,
        shinyObtenivel: shinyObtenivel(especie.id, femea.id),
        sprite: femea.sprite,
      });
    }
  }

  /* Fêmea da base, para as espécies com diferença de gênero sem forma própria. */
  for (const especie of entrada.especies) {
    if (!especie.diferencaGenero || especiesComFemeaExplicita.has(especie.id)) continue;
    const base = entrada.pokemons.find((p) => p.especieId === especie.id && p.padrao);
    if (!base) throw new Error(`Espécie ${especie.identificador} sem Pokémon padrão.`);
    const id = `${especie.identificador}-femea`;
    adicionar(especie.id, 1, {
      id,
      numero: especie.id,
      especie: especie.nome,
      forma: NOME_FEMEA,
      categoria: "genero",
      geracao: especie.geracao,
      lendario: especie.lendario,
      mitico: especie.mitico,
      shinyObtenivel: shinyObtenivel(especie.id, id),
      sprite: `female/${base.id}`,
    });
  }

  const vagas: FormaDex[] = [];
  for (const numero of [...porEspecie.keys()].sort((a, b) => a - b)) {
    const lista = porEspecie.get(numero)!;
    lista.sort((a, b) => a.chave - b.chave);
    for (const { vaga } of lista) vagas.push({ ...vaga, ordem: vagas.length + 1 });
  }

  const ids = new Set<string>();
  for (const vaga of vagas) {
    if (ids.has(vaga.id)) throw new Error(`Vaga duplicada: ${vaga.id}.`);
    ids.add(vaga.id);
  }

  return { vagas, semClassificacao, semNome };
}
