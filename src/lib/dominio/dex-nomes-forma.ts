/**
 * Living Dex — nome da forma em português (`dex_forma.forma_pt`).
 *
 * O nome da espécie fica em inglês, como o Brasil usa. O que tem versão em
 * português é o rótulo da forma: "Polar Pattern" é "Padrão Polar".
 *
 * ## A regra: só nome oficial, nunca tradução nossa
 *
 * Decisão de 2026-10-12: o rótulo tem de ser o que a Pokémon escreve, de
 * preferência o do HOME. Nenhuma forma é traduzida aqui. Onde não há nome
 * oficial em português, `forma_pt` fica nulo e a tela mostra o inglês, que é
 * o que o HOME mostra.
 *
 * Situação das fontes, conferida em 2026-10-12:
 *
 * - **O HOME não tem português do Brasil** (até a 4.1.0, de 2026-10). A 4.0.0
 *   acrescentou o espanhol latino-americano. Legends: Z-A e Champions também
 *   saíram sem português; o primeiro jogo principal com ele é Ventos e Ondas,
 *   ainda sem data. Quando o HOME ganhar o idioma, os nomes dele substituem
 *   os desta tabela.
 * - **A PokeAPI tem o idioma `pt-br`, mas nenhum nome de forma nele.**
 * - **1ª fonte: o texto do Pokémon GO em português do Brasil**, o único jogo
 *   com nomes de forma oficiais no idioma. Arquivo `i18n_brazilianportuguese`
 *   extraído do app pelo PokeMiners (`github.com/PokeMiners/pogo_assets`,
 *   `Texts/Latest APK/`, commit `b0ab93f`, 2025-08-24 — o mais recente
 *   publicado em 2026-10-12). Cada entrada guarda a chave do texto, para
 *   conferir. O texto não entra no repositório.
 * - **2ª fonte: o nome da carta em português** no catálogo da TCGdex, quando
 *   o GO não tem a forma. É a Pokémon Company no Brasil, mas é carta, não
 *   jogo. A entrada guarda as cartas onde o nome aparece.
 *
 * Três casos pedem atenção, e estão marcados na entrada:
 * - **Formas regionais e o Tauros de Paldea.** O GO dá "Forma de Alola" no
 *   cabeçalho da Pokédex, não por espécie; vale para todas. O Tauros junta o
 *   cabeçalho e a raça, no mesmo formato do inglês da PokeAPI ("Paldean Form
 *   (Aqua Breed)" → "Forma de Paldea (Espécie Aquática)").
 * - **Super Size.** O GO escreve "Tamanha Extragrande" no Gourgeist e
 *   "Tamanho Extragrande" no Pumpkaboo e nos outros tamanhos dos dois. Vale
 *   o do Pumpkaboo: é erro de digitação, não nome.
 * - **Terapagos, "Normal Form".** O GO não tem o Terapagos; "Forma Normal" é
 *   como ele escreve a mesma expressão no Castform e no Deoxys.
 *
 * ## Como a tabela é usada
 *
 * A chave é o nome em inglês da PokeAPI (`dex_forma.forma`), que se repete
 * entre espécies com a mesma forma ("Therian Forme" em quatro). O
 * `gerar:seed-dex` resolve cada vaga por `nomeDaFormaPt`; **forma com nome e
 * sem regra falha o gerador**, como a classificação: quem decide é quem
 * mantém, olhando a fonte, nunca o script.
 */

export type NomeFormaPt =
  | { fonte: "go"; chave: string; pt: string }
  | { fonte: "carta"; cartas: string; pt: string };

const go = (chave: string, pt: string): NomeFormaPt => ({ fonte: "go", chave, pt });
const carta = (cartas: string, pt: string): NomeFormaPt => ({ fonte: "carta", cartas, pt });

/** Formas com nome oficial em português, pelo nome em inglês da PokeAPI. */
export const NOMES_FORMA_PT: Readonly<Record<string, NomeFormaPt>> = {
  // Regionais: cabeçalho da Pokédex do GO, o mesmo para todas as espécies.
  "Alolan Form": go("alola_pokedex_header", "Forma de Alola"),
  "Galarian Form": go("galarian_pokedex_header", "Forma de Galar"),
  // O GO escreve este em caixa alta nos dois idiomas ("HISUIAN FORM"); a caixa segue a dos outros.
  "Hisuian Form": go("hisuian_pokedex_header", "Forma de Hisui"),
  // Sneasel de Hisui fêmea: o "(Female)" vira o rótulo de gênero da interface.
  "Hisuian Form (Female)": go("hisuian_pokedex_header", "Forma de Hisui"),
  "Paldean Form": go("paldean_pokedex_header", "Forma de Paldea"),
  "Paldean Form (Combat Breed)": go("paldean_pokedex_header + form_paldea_combat", "Forma de Paldea (Espécie de Combate)"),
  "Paldean Form (Blaze Breed)": go("paldean_pokedex_header + form_paldea_blaze", "Forma de Paldea (Espécie Labareda)"),
  "Paldean Form (Aqua Breed)": go("paldean_pokedex_header + form_paldea_aqua", "Forma de Paldea (Espécie Aquática)"),

  // Castform: a PokeAPI diz "Normal", o GO diz "Normal Form".
  Normal: go("form_castform_normal", "Forma Normal"),
  "Normal Forme": go("form_deoxys_normal", "Forma Normal"),
  "Attack Forme": go("form_deoxys_attack", "Forma Ataque"),
  "Defense Forme": go("form_deoxys_defense", "Forma Defesa"),
  "Speed Forme": go("form_deoxys_speed", "Forma Velocidade"),
  "Plant Cloak": go("form_burmy_plant", "Manto Vegetal"),
  "Sandy Cloak": go("form_burmy_sandy", "Manto Arenoso"),
  "Trash Cloak": go("form_burmy_trash", "Manto de Lixo"),
  "Overcast Form": go("form_cherrim_overcast", "Forma Nublada"),
  "West Sea": go("form_west_sea", "Mar Ocidental"),
  "East Sea": go("form_east_sea", "Mar Leste"),
  Rotom: go("form_rotom_normal", "Rotom"),
  "Heat Rotom": go("form_rotom_heat", "Rotom Calor"),
  "Wash Rotom": go("form_rotom_wash", "Rotom Lavagem"),
  "Frost Rotom": go("form_rotom_frost", "Rotom Congelante"),
  "Fan Rotom": go("form_rotom_fan", "Rotom Ventilador"),
  "Mow Rotom": go("form_rotom_mow", "Rotom Corte"),
  "Altered Forme": go("form_giratina_altered", "Forma Alterada"),
  "Land Forme": go("form_shaymin_land", "Forma Terrestre"),
  "Sky Forme": go("form_shaymin_sky", "Forma Céu"),
  // Arceus: a PokeAPI diz "Normal Type", o GO diz "Normal-Type".
  "Normal Type": go("form_arceus_normal", "Tipo Normal"),
  // Basculin: o GO não tem o "Form" do fim ("Red-Striped").
  "Red-Striped Form": go("form_red_striped", "Listras Vermelhas"),
  "Blue-Striped Form": go("form_blue_striped", "Listras Azuis"),
  "White-Striped Form": go("form_white_striped", "Listras Brancas"),
  "Standard Mode": go("form_darmanitan_standard", "Modo Padrão"),
  "Spring Form": go("form_spring", "Forma Primavera"),
  "Summer Form": go("form_summer", "Forma Verão"),
  "Autumn Form": go("form_autumn", "Forma Outono"),
  "Winter Form": go("form_winter", "Forma Inverno"),
  "Incarnate Forme": go("form_incarnate", "Forma Materializada"),
  "Therian Forme": go("form_therian", "Forma Therian"),
  Kyurem: go("form_kyurem_normal", "Kyurem"),
  "Ordinary Form": go("form_ordinary", "Forma Comum"),
  "Resolute Form": go("form_resolute", "Forma Resoluta"),
  "Aria Forme": go("form_meloetta_aria", "Forma Ária"),
  "Meadow Pattern": go("form_vivillon_meadow", "Padrão Prado"),
  "Icy Snow Pattern": go("form_vivillon_icy_snow", "Padrão Neve Congelada"),
  "Polar Pattern": go("form_vivillon_polar", "Padrão Polar"),
  "Tundra Pattern": go("form_vivillon_tundra", "Padrão Tundra"),
  "Continental Pattern": go("form_vivillon_continental", "Padrão Continental"),
  "Garden Pattern": go("form_vivillon_garden", "Padrão Jardim"),
  "Elegant Pattern": go("form_vivillon_elegant", "Padrão Elegante"),
  "Modern Pattern": go("form_vivillon_modern", "Padrão Moderno"),
  "Marine Pattern": go("form_vivillon_marine", "Padrão Marinho"),
  "Archipelago Pattern": go("form_vivillon_archipelago", "Padrão Arquipélago"),
  "High Plains Pattern": go("form_vivillon_high_plains", "Padrão Planalto"),
  "Sandstorm Pattern": go("form_vivillon_sandstorm", "Padrão Deserto"),
  "River Pattern": go("form_vivillon_river", "Padrão Rio"),
  "Monsoon Pattern": go("form_vivillon_monsoon", "Padrão Monção"),
  "Savanna Pattern": go("form_vivillon_savanna", "Padrão Savana"),
  "Sun Pattern": go("form_vivillon_sun", "Padrão Solar"),
  "Ocean Pattern": go("form_vivillon_ocean", "Padrão Oceano"),
  "Jungle Pattern": go("form_vivillon_jungle", "Padrão Selva"),
  "Fancy Pattern": go("form_vivillon_fancy", "Padrão Chique"),
  "Poké Ball Pattern": go("form_vivillon_pokeball", "Padrão Poké Bola"),
  "Red Flower": go("form_flabebe_red", "Flor Vermelha"),
  "Yellow Flower": go("form_flabebe_yellow", "Flor Amarela"),
  "Orange Flower": go("form_flabebe_orange", "Flor Laranja"),
  "Blue Flower": go("form_flabebe_blue", "Flor Azul"),
  "White Flower": go("form_flabebe_white", "Flor Branca"),
  "Natural Form": go("form_furfrou_natural", "Forma Selvagem"),
  "Heart Trim": go("form_furfrou_heart", "Corte Coração"),
  "Star Trim": go("form_furfrou_star", "Corte Estrela"),
  "Diamond Trim": go("form_furfrou_diamond", "Corte Diamante"),
  "Debutante Trim": go("form_furfrou_debutante", "Corte Debutante"),
  "Matron Trim": go("form_furfrou_matron", "Corte Madame"),
  "Dandy Trim": go("form_furfrou_dandy", "Corte Cavalheiro"),
  "La Reine Trim": go("form_furfrou_la_reine", "Corte Aristocrático"),
  "Kabuki Trim": go("form_furfrou_kabuki", "Corte Kabuki"),
  "Pharaoh Trim": go("form_furfrou_pharaoh", "Corte Faraó"),
  "Shield Forme": go("form_aegislash_shield", "Forma Escudo"),
  "Average Size": go("form_pumpkaboo_average", "Tamanho Médio"),
  "Small Size": go("form_pumpkaboo_small", "Tamanho Pequeno"),
  "Large Size": go("form_pumpkaboo_large", "Tamanho Grande"),
  // `form_gourgeist_super` diz "Tamanha Extragrande" — erro de digitação; ver o topo.
  "Super Size": go("form_pumpkaboo_super", "Tamanho Extragrande"),
  "50% Forme": go("form_zygarde_fifty_percent", "Forma 50%"),
  "10% Forme": go("form_zygarde_ten_percent", "Forma 10%"),
  "Hoopa Confined": go("form_hoopa_confined", "Hoopa Contido"),
  "Hoopa Unbound": go("form_hoopa_unbound", "Hoopa Libertado"),
  "Baile Style": go("form_oricorio_baile", "Estilo Flamenco"),
  "Pom-Pom Style": go("form_oricorio_pompom", "Estilo Animado"),
  "Pa’u Style": go("form_oricorio_pau", "Estilo Hula"),
  "Sensu Style": go("form_oricorio_sensu", "Estilo Elegante"),
  "Midday Form": go("form_lycanroc_midday", "Forma Diurna"),
  "Midnight Form": go("form_lycanroc_midnight", "Forma Noturna"),
  "Dusk Form": go("form_lycanroc_dusk", "Forma Crepúsculo"),
  "Solo Form": go("form_wishiwashi_solo", "Forma Individual"),
  "Type: Normal": go("form_silvally_normal", "Tipo: Normal"),
  "Red Core": go("form_core_red", "Núcleo Vermelho"),
  "Orange Core": go("form_core_orange", "Núcleo Laranja"),
  "Yellow Core": go("form_core_yellow", "Núcleo Amarelo"),
  "Green Core": go("form_core_green", "Núcleo Verde"),
  "Blue Core": go("form_core_blue", "Núcleo Azul"),
  "Indigo Core": go("form_core_indigo", "Núcleo Anil"),
  "Violet Core": go("form_core_violet", "Núcleo Violeta"),
  "Disguised Form": go("form_mimikyu_disguised", "Forma Mascarada"),
  "Amped Form": go("form_amped", "Forma Aguda"),
  "Low Key Form": go("form_low_key", "Forma Grave"),
  "Phony Form": go("form_phony", "Forma Falsificada"),
  "Antique Form": go("form_antique", "Forma Autêntica"),
  "Ice Face": go("form_ice", "Cara de Gelo"),
  "Full Belly Mode": go("form_morpeko_full_belly", "Forma Saciada"),
  "Hero of Many Battles": go("form_zacian_hero", "Herói Veterano"),
  "Single Strike Style": go("form_single_strike", "Estilo Golpe Decisivo"),
  "Rapid Strike Style": go("form_rapid_strike", "Estilo Golpe Fluido"),
  "Family of Four": go("form_maushold_family_of_four", "Família Quádrupla"),
  "Family of Three": go("form_maushold_family_of_three", "Família Tripla"),
  "Green Plumage": go("form_green", "Plumagem Verde"),
  "Blue Plumage": go("form_blue", "Plumagem Azul"),
  "Yellow Plumage": go("form_yellow", "Plumagem Amarela"),
  "White Plumage": go("form_squakabilly_white", "Plumagem Branca"),
  "Zero Form": go("form_zero", "Forma Zero"),
  "Curly Form": go("form_curly", "Forma Curvada"),
  "Droopy Form": go("form_droopy", "Forma Pendular"),
  "Stretchy Form": go("form_stretchy", "Forma Estendida"),
  "Two-Segment Form": go("form_two", "Forma Bissegmentar"),
  "Three-Segment Form": go("form_three", "Forma Trissegmentar"),
  "Apex Build": go("form_apex", "Versão Plena"),
  "Ultimate Mode": go("form_ultimate", "Modo Supremo"),
  // Terapagos: o GO não tem a espécie; é a expressão do Castform. Ver o topo.
  "Normal Form": go("form_castform_normal", "Forma Normal"),

  // Sem a forma no GO; nome das cartas em português.
  "Teal Mask": carta("sv06-024, sv10-026, svp-123 (Ogerpon Máscara Turquesa)", "Máscara Turquesa"),
  Bloodmoon: carta("sv06.5-025, sv08.5-054 (Ursaluna Lua Sangrenta)", "Lua Sangrenta"),
};

/**
 * Formas que ficam com o nome em inglês, uma a uma: nem o GO nem as cartas
 * em português têm o nome delas (conferido em 2026-10-12). Os bonés do
 * Pikachu não estão no GO; o Gimmighoul, a Poltchageist e a Sinistcha estão
 * no GO sem rótulo de forma; as cartas dessas espécies não trazem a forma no
 * nome. Kyogre e Groudon: o nome da forma é o da espécie.
 */
export const FORMAS_SEM_NOME_PT: ReadonlySet<string> = new Set([
  "Original Cap",
  "Hoenn Cap",
  "Sinnoh Cap",
  "Unova Cap",
  "Kalos Cap",
  "Alola Cap",
  "Partner Cap",
  "World Cap",
  "Kyogre",
  "Groudon",
  "Eternal Flower",
  "Neutral Mode",
  "Original Color",
  "Dada",
  "Chest Form",
  "Roaming Form",
  "Counterfeit Form",
  "Artisan Form",
  "Unremarkable Form",
  "Masterpiece Form",
]);

/**
 * Alcremie: 63 formas "<creme> <doce>". O GO tem só o creme ("Creme de
 * Baunilha"); o doce não aparece em texto oficial em português. Meio nome
 * oficial não vira rótulo: as 63 ficam em inglês.
 */
const ALCREMIE = / Sweet$/;

/** Unown: letra, "!" e "?" — iguais em qualquer idioma. */
const UNOWN = /^[A-Z!?]$/;

/** Macho e fêmea são rótulo da interface (`rotuloDaForma`), não da forma. */
const GENERO = new Set(["Male", "Female"]);

/**
 * O `forma_pt` de uma vaga: o nome oficial em português, `null` quando a
 * tela deve mostrar o inglês, ou `undefined` quando nenhuma regra conhece a
 * forma — o gerador falha nesse caso.
 */
export function nomeDaFormaPt(forma: string | null): string | null | undefined {
  if (forma === null || GENERO.has(forma) || UNOWN.test(forma) || ALCREMIE.test(forma)) return null;
  if (FORMAS_SEM_NOME_PT.has(forma)) return null;
  return NOMES_FORMA_PT[forma]?.pt;
}
