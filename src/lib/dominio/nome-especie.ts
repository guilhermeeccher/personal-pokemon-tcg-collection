/**
 * Resolve o nome do Pokémon de um número da Pokédex a partir do catálogo
 * local, para que a vaga vazia de uma coleção Pokédex diga "25 —
 * Pikachu" e não só "25".
 *
 * Regra: entre as cartas com EXATAMENTE UM `dexId` igual àquele número
 * (regra 2 do AGENTS.md — elegibilidade da Pokédex), normaliza o nome de
 * cada carta (remove prefixo/sufixo de mecânica: "ex", "V", "VMAX",
 * "GX", "Mega ", forma regional etc — ver `SUFIXOS`/`PREFIXOS` abaixo) e
 * conta a frequência dos nomes JÁ normalizados — nunca a frequência dos
 * nomes crus. Vence o normalizado mais frequente; empate é resolvido
 * pelo mais curto (a espécie pura tende a ser o rótulo mais curto do
 * grupo — o nome de mecânica só acrescenta sufixo).
 *
 * Preferência de idioma: usa as linhas `pt` quando houver ao menos uma
 * elegível; cai para `en` quando não houver. Número sem nenhuma carta
 * elegível (nem em pt, nem em en) fica sem nome — nunca inventa um nome,
 * nunca chama API externa.
 *
 * Validado contra o catálogo real (2026-08-25): os 1025 números da
 * Pokédex Nacional têm ao menos uma carta elegível em pt E em en — o
 * caminho "sem nome" é defesa, não caso esperado em uso normal. Casos
 * conferidos manualmente: dex 6 → Charizard, dex 25 → Pikachu, dex 26 →
 * Raichu (mesmo com "Raichu de Alola" e "Raichu e Raichu de Alola GX" no
 * grupo — regra 3: forma não desdobra vaga), dex 905 → Enamorus.
 *
 * Módulo puro, sem I/O — a função recebe as linhas de catálogo por
 * argumento; quem lê o banco é `lib/db/consultas.ts`.
 */

export interface LinhaCatalogoParaNome {
  nome: string;
  idioma: "pt" | "en" | "jp";
  /** Array de dexIds da carta — só entra na contagem quem tem exatamente 1. */
  dexIds: readonly number[];
}

// Prefixos conhecidos de mecânica/forma, removidos antes da contagem.
// Ordem não importa para corretude (cada strip é um `startsWith` exato),
// mas mantém os mais específicos primeiro por clareza.
const PREFIXOS = [
  "Gigantamax ",
  "Mega ",
  "M-", // atalho pt de Mega em cartas antigas ("M-Charizard EX")
  "M ", // atalho en equivalente ("M Charizard EX")
  "Alolan ",
  "Galarian ",
  "Hisuian ",
  "Paldean ",
] as const;

// Sufixos conhecidos de mecânica/forma, removidos antes da contagem.
// Passe iterativo: alguns nomes empilham mais de um (ex.: "Mega
// Charizard X ex" precisa perder o prefixo "Mega ", o sufixo " ex" E o
// sufixo " X" do form-letter de Mega, em três passes).
const SUFIXOS = [
  " V-UNIÃO",
  " V-UNION",
  " V-ASTRO", // VSTAR em pt
  " VSTAR",
  " VMAX",
  " Radiante",
  " Radiant",
  " GX",
  "-GX",
  " EX",
  "-EX",
  " ex",
  " V",
  " de Alola",
  " de Galar",
  " de Hisui",
  " de Paldea",
  " X", // letra de forma Mega (Charizard X / Mewtwo X) — só resta após "Mega " ser removido
  " Y",
] as const;

/**
 * Normaliza um nome de carta para o candidato a nome de espécie,
 * removendo prefixos e sufixos de mecânica/forma conhecidos até não
 * haver mais nenhum aplicável. Não garante remover TUDO que não é
 * espécie (a lista é aberta — nomes como "Detective Pikachu" ou
 * "Charizard V do Lance" ficam como estão); o objetivo é só concentrar a
 * contagem no rótulo puro para os casos comuns.
 */
export function normalizarNomeCarta(nomeOriginal: string): string {
  let nome = nomeOriginal.trim();
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const prefixo of PREFIXOS) {
      if (nome.startsWith(prefixo) && nome.length > prefixo.length) {
        nome = nome.slice(prefixo.length);
        mudou = true;
        break;
      }
    }
    for (const sufixo of SUFIXOS) {
      if (nome.endsWith(sufixo) && nome.length > sufixo.length) {
        nome = nome.slice(0, nome.length - sufixo.length);
        mudou = true;
        break;
      }
    }
  }
  return nome.trim();
}

/**
 * Resolve o nome de espécie do número `numero` a partir das linhas de
 * catálogo elegíveis (dexId único) já filtradas/buscadas por quem chama.
 * `null` quando não há nenhuma carta elegível para o número.
 */
export function resolverNomeEspecie(
  numero: number,
  linhas: readonly LinhaCatalogoParaNome[],
): string | null {
  const elegiveis = linhas.filter(
    (l) => l.dexIds.length === 1 && l.dexIds[0] === numero,
  );

  const doPt = elegiveis.filter((l) => l.idioma === "pt");
  const escolhidas = doPt.length > 0 ? doPt : elegiveis.filter((l) => l.idioma === "en");

  if (escolhidas.length === 0) return null;

  const contagem = new Map<string, number>();
  for (const linha of escolhidas) {
    const normalizado = normalizarNomeCarta(linha.nome);
    if (normalizado === "") continue;
    contagem.set(normalizado, (contagem.get(normalizado) ?? 0) + 1);
  }
  if (contagem.size === 0) return null;

  let vencedor: string | null = null;
  let melhorContagem = -1;
  for (const [nome, qtd] of contagem) {
    if (
      qtd > melhorContagem ||
      (qtd === melhorContagem && vencedor !== null && nome.length < vencedor.length)
    ) {
      vencedor = nome;
      melhorContagem = qtd;
    }
  }
  return vencedor;
}

/**
 * Caminho inverso de `resolverNomeEspecie`: dado o que o usuário digitou
 * ("Ivysaur"), quais números da Pokédex isso identifica?
 *
 * **Por que existe (2026-08-26).** Com o catálogo japonês no banco,
 * passaram a existir cartas cujo nome é `フシギソウ`. Buscar "Ivysaur"
 * não as encontrava, e quem não lê japonês não tem como digitar o nome
 * japonês. O número da Pokédex é o único vínculo entre as duas grafias
 * que já existe no dado — não precisamos de tabela de tradução nem de
 * API: `SV2a-002` tem `dexId: [2]`, e as cartas pt/en chamadas "Ivysaur"
 * também.
 *
 * Só conta carta com **exatamente um** `dexId` (regra 2 do AGENTS.md):
 * uma tag team chamada "Pikachu & Zekrom GX" não deve fazer uma busca
 * por "Zekrom" trazer todo Pikachu japonês do catálogo.
 *
 * Compara pelo nome **normalizado** (mesma normalização da resolução de
 * espécie, que tira "ex", "V", "Mega " e afins) contra o texto digitado,
 * também normalizado — assim "charizard" acha as cartas de "Charizard
 * ex" sem precisar que o usuário saiba a mecânica.
 *
 * Devolve os números ordenados, sem repetição. Lista vazia quando nada
 * casa — quem chama trata como "não expandir a busca".
 */
export function resolverDexIdsPorNome(
  consulta: string,
  linhas: readonly LinhaCatalogoParaNome[],
): number[] {
  const alvo = normalizarNomeCarta(consulta).trim().toLowerCase();
  if (alvo === "") return [];

  const numeros = new Set<number>();
  for (const linha of linhas) {
    if (linha.dexIds.length !== 1) continue;
    const nome = normalizarNomeCarta(linha.nome).toLowerCase();
    if (nome === "") continue;
    // `includes` nos dois sentidos: "ivysaur" acha "Ivysaur", e o nome
    // digitado inteiro ("mega charizard") acha a carta "Charizard".
    if (nome.includes(alvo) || alvo.includes(nome)) {
      numeros.add(linha.dexIds[0]);
    }
  }
  return [...numeros].sort((a, b) => a - b);
}
